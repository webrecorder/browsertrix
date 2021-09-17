"""
Docker crawl manager
"""

import tarfile
import os
import json
import time
import asyncio

from datetime import datetime
from io import BytesIO
from tempfile import NamedTemporaryFile

import aiodocker
import aioprocessing

from scheduler import run_scheduler

from crawls import Crawl


# ============================================================================
class DockerManager:
    """ Docker Crawl Manager Interface"""

    # pylint: disable=too-many-instance-attributes
    def __init__(self, archive_ops, extra_crawl_params=None):
        self.client = aiodocker.Docker()

        self.crawler_image = os.environ["CRAWLER_IMAGE"]
        self.default_network = os.environ.get("CRAWLER_NETWORK", "btrix-cloud-net")

        self.archive_ops = archive_ops
        self.crawl_ops = None

        self.extra_crawl_params = extra_crawl_params or []
        self._event_q = None

        self.loop = asyncio.get_running_loop()

        self.loop.create_task(self.run_event_loop())
        self.loop.create_task(self.init_trigger_queue())
        self.loop.create_task(self.cleanup_loop())

    # pylint: disable=no-member
    async def init_trigger_queue(self):
        """ Crawl trigger queue from separate scheduling process """
        self._event_q = aioprocessing.AioQueue()
        _trigger_q = aioprocessing.AioQueue()

        self.sched = aioprocessing.AioProcess(
            target=run_scheduler, args=(self._event_q, _trigger_q)
        )
        self.sched.start()

        while True:
            try:
                result = await _trigger_q.coro_get()
                self.loop.create_task(self.run_crawl_config(manual=False, **result))
            # pylint: disable=broad-except
            except Exception as exc:
                print(f"Error trigger crawl: {exc}")

    async def run_event_loop(self):
        """ Run Docker event loop"""
        subscriber = self.client.events.subscribe(
            filters=json.dumps({"type": ["container"], "label": ["btrix.archive"]})
        )

        while True:
            event = await subscriber.get()
            if event is None:
                break

            if event["Action"] == "die":
                self.loop.create_task(self._handle_container_die(event["Actor"]))

    async def cleanup_loop(self):
        """Clean-up any orphaned crawler images that are not running.
        Stop containers whose crawlTimeout has been exceeded"""

        while True:
            # cleanup orphaned
            results = await self.client.containers.list(
                filters=json.dumps(
                    {
                        "label": ["btrix.crawlconfig"],
                        "status": ["exited"],
                        "exited": ["1"],
                    }
                )
            )

            for container in results:
                print(f"Cleaning Up Orphan Container {container['Id']}", flush=True)
                await container.delete()

            results = await self.client.containers.list(
                filters=json.dumps(
                    {
                        "label": ["btrix.timeout"],
                        "status": ["running"],
                    }
                )
            )

            for container in results:
                timeout = int(container["Labels"]["btrix.timeout"])
                actual = int(time.time()) - int(container["Created"])
                if actual >= timeout:
                    # pylint: disable=line-too-long
                    print(
                        f"Crawl {container['Id']} running for {actual} seconds, exceeded timeout {timeout}, stopping..."
                    )
                    await container.kill(signal="SIGTERM")

            await asyncio.sleep(30)

    def set_crawl_ops(self, ops):
        """ set crawl ops """
        self.crawl_ops = ops

    async def add_crawl_config(
        self,
        crawlconfig,
        storage,
    ):
        """ Add new crawl config """
        cid = str(crawlconfig.id)
        userid = crawlconfig.user
        aid = crawlconfig.archive

        labels = {
            "btrix.user": userid,
            "btrix.archive": aid,
            "btrix.crawlconfig": cid,
            "btrix.coll": crawlconfig.config.collection,
        }

        if crawlconfig.crawlTimeout:
            labels["btrix.timeout"] = str(crawlconfig.crawlTimeout)

        # Create Config Volume
        volume = await self._create_volume(crawlconfig, labels)

        if crawlconfig.schedule:
            print("Scheduling...", flush=True)

            await self._schedule_update(
                cid=crawlconfig.id, schedule=crawlconfig.schedule
            )

        if crawlconfig.runNow:
            await self._run_crawl_now(
                storage,
                labels,
                volume,
            )

    async def update_crawl_schedule(self, cid, schedule):
        """ Update the schedule for existing crawl config """

        if schedule:
            print("Updating Schedule..", flush=True)

            await self._schedule_update(cid=cid, schedule=schedule)
        else:
            await self._schedule_update(cid=cid, schedule="")

    async def list_running_crawls(self, aid):
        """ List running containers for this archive """
        containers = await self._list_running_containers([f"btrix.archive={aid}"])

        running = []

        for container in containers:
            full_container = await self.client.containers.get(container["Id"])
            running.append(self._make_crawl_for_container(full_container, "running"))

        return running

    async def stop_crawl(self, crawl_id, aid, graceful=True):
        """ Stop crawl, if not graceful, issue SIGUSR1 to indicate cancelation """

        result = None

        try:
            container = await self.client.containers.get(crawl_id)

            if container["Config"]["Labels"]["btrix.archive"] != aid:
                return None

            if not graceful:
                await container.kill(signal="SIGUSR1")
                result = self._make_crawl_for_container(container, "canceled", True)
            else:
                result = True

            await container.kill(signal="SIGTERM")
        except aiodocker.exceptions.DockerError as exc:
            if exc.status == 404:
                return None

            raise exc

        return result

    async def run_crawl_config(self, cid, manual=True, schedule=""):
        """ Run crawl job for cron job based on specified crawlconfig id (cid) """

        if not manual:
            if await self._is_scheduled_crawl_for_config_running(cid):
                print(
                    f"Crawl for {cid} already running, not starting new crawl",
                    flush=True,
                )
                return None

        volume_name = f"crawl-config-{cid}"
        volume_obj = aiodocker.docker.DockerVolume(self.client, volume_name)

        volume_data = await volume_obj.show()

        labels = volume_data["Labels"]

        archive = None

        try:
            archive = await self.archive_ops.get_archive_by_id(labels["btrix.archive"])
            storage = archive.storage

        # pylint: disable=broad-except
        except Exception as exc:
            print(exc, flush=True)
            return None

        container = await self._run_crawl_now(
            storage, labels, volume_name, schedule, manual
        )
        return container["id"][:12]

    async def validate_crawl_complete(self, crawlcomplete):
        """Validate that crawl is valid by checking that container exists and label matches
        Return completed crawl object from container"""

        container = await self.client.containers.get(crawlcomplete.id)

        if container["Config"]["Labels"]["btrix.user"] != crawlcomplete.user:
            return None

        crawl = self._make_crawl_for_container(
            container,
            "complete" if crawlcomplete.completed else "partial_complete",
            finish_now=True,
            filename=crawlcomplete.filename,
            size=crawlcomplete.size,
            hashstr=crawlcomplete.hash,
        )

        return crawl

    async def scale_crawl(self): # job_name, aid, parallelism=1):
        """ Scale running crawl, currently only supported in k8s"""
        return "Not Supported"

    async def delete_crawl_config_by_id(self, cid):
        """ Delete Crawl Config by Crawl Config Id"""
        await self._delete_volume_by_labels([f"btrix.crawlconfig={cid}"])

    async def delete_crawl_configs_for_archive(self, aid):
        """ Delete Crawl Config by Archive Id"""
        await self._delete_volume_by_labels([f"btrix.archive={aid}"])

    # ========================================================================
    async def _create_volume(self, crawlconfig, labels):
        """ Create new volume to store the crawl config json """

        name = f"crawl-config-{crawlconfig.id}"

        await self.client.volumes.create({"Name": name, "Labels": labels})

        await self._add_config_to_volume(
            name, "crawl-config.json", crawlconfig.config.dict()
        )

        return name

    async def _add_config_to_volume(self, volume, path, data):
        """Add crawl config to volume, requires tar'ing the data,
        creating a dummy container and then deleting"""

        data = json.dumps(data).encode("utf-8")

        container = await self.client.containers.create(
            {
                "Image": "tianon/true",
                "Volumes": {volume: {}},
                "HostConfig": {"Binds": [f"{volume}:/tmp/volume"]},
            }
        )

        # make tarball
        tarbuff = BytesIO()

        # note: this does not seem to work with in memory buff! (tar is corrupt...)
        with NamedTemporaryFile("w+b") as tempbuff:
            tempbuff.write(data)
            tempbuff.seek(0)

            with tarfile.open(mode="w", fileobj=tarbuff) as tf_fh:
                tf_fh.add(name=tempbuff.name, arcname=path, recursive=False)

        tarbuff.seek(0)

        await container.put_archive("/tmp/volume", tarbuff.read())

        await container.delete()

    async def _delete_volume_by_labels(self, labels):
        """ Delete Crawl Configs by specified filter """

        containers = await self._list_running_containers(labels)
        if len(containers):
            raise Exception("Cannot delete crawl config, in use for running crawl")

        # pylint: disable=protected-access
        resp = await self.client._query_json(
            "volumes",
            method="GET",
            params={"filters": json.dumps({"label": labels})},
        )

        for volume in resp["Volumes"]:
            vol_obj = aiodocker.docker.DockerVolume(self.client, volume["Name"])

            await self._schedule_update(
                cid=volume["Labels"]["btrix.crawlconfig"], schedule=""
            )

            try:
                await vol_obj.delete()
            # pylint: disable=bare-except
            except:
                print("Warning: Volume Delete Failed, Container in Use", flush=True)

    async def _schedule_update(self, cid, schedule=""):
        await self._event_q.coro_put({"cid": cid, "schedule": schedule})

    # pylint: disable=too-many-arguments
    async def _run_crawl_now(self, storage, labels, volume, schedule="", manual=True):
        # Set Run Config
        command = [
            "crawl",
            "--config",
            "/tmp/crawlconfig/crawl-config.json",
            "--redisStoreUrl",
            "redis://redis:6379/0",
        ]

        if self.extra_crawl_params:
            command += self.extra_crawl_params

        endpoint_with_coll_url = os.path.join(
            storage.endpoint_url, "collections", labels["btrix.coll"] + "/"
        )

        env_vars = [
            f"STORE_USER={labels['btrix.user']}",
            f"STORE_ARCHIVE={labels['btrix.archive']}",
            f"STORE_ENDPOINT_URL={endpoint_with_coll_url}",
            f"STORE_ACCESS_KEY={storage.access_key}",
            f"STORE_SECRET_KEY={storage.secret_key}",
            "WEBHOOK_URL=http://backend:8000/_crawls/done",
        ]

        labels["btrix.run.schedule"] = schedule
        labels["btrix.run.manual"] = "1" if manual else "0"

        run_config = {
            "Image": self.crawler_image,
            "Volumes": {volume: {}},
            "Labels": labels,
            "Cmd": command,
            "Env": env_vars,
            "HostConfig": {
                "Binds": [f"{volume}:/tmp/crawlconfig"],
                "NetworkMode": self.default_network,
            },
        }

        return await self.client.containers.run(run_config)

    async def _list_running_containers(self, labels):
        results = await self.client.containers.list(
            filters=json.dumps({"status": ["running"], "label": labels})
        )
        return results

    async def _is_scheduled_crawl_for_config_running(self, cid):
        results = await self._list_running_containers(
            [f"btrix.crawlconfig={cid}", "btrix.run.manual=0"]
        )
        return len(results) > 0

    async def _handle_container_die(self, actor):
        """ Handle crawl container shutdown """
        container = await self.client.containers.get(actor["ID"])

        if actor["Attributes"]["exitCode"] != 0:
            crawl = self._make_crawl_for_container(container, "failed", True)
            await self.crawl_ops.store_crawl(crawl)

        await container.delete()

    # pylint: disable=no-self-use,too-many-arguments
    def _make_crawl_for_container(
        self, container, state, finish_now=False, filename=None, size=None, hashstr=None
    ):
        """ Make a crawl object from a container data"""
        labels = container["Config"]["Labels"]

        return Crawl(
            id=container["Id"],
            state=state,
            user=labels["btrix.user"],
            aid=labels["btrix.archive"],
            cid=labels["btrix.crawlconfig"],
            schedule=labels["btrix.run.schedule"],
            manual=labels["btrix.run.manual"] == "1",
            started=datetime.fromisoformat(container["State"]["StartedAt"][:19]),
            finished=datetime.utcnow().replace(microsecond=0, tzinfo=None)
            if finish_now
            else None,
            filename=filename,
            size=size,
            hash=hashstr,
        )
