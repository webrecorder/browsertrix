"""
Docker crawl manager
"""

import tarfile
import os
import json
import asyncio

from datetime import datetime
from io import BytesIO
from tempfile import NamedTemporaryFile

import aiodocker

from crawls import Crawl


# ============================================================================
class DockerManager:
    """ Docker Crawl Manager Interface"""

    # pylint: disable=too-many-instance-attributes
    def __init__(self, archive_ops, extra_crawl_params=None):
        self.client = aiodocker.Docker()

        self.crawler_image = os.environ["CRAWLER_IMAGE"]
        self.default_network = "crawlercloud_default"

        self.archive_ops = archive_ops
        self.crawl_ops = None

        self.loop = asyncio.get_running_loop()
        self.loop.create_task(self.run_event_loop())

        self.extra_crawl_params = extra_crawl_params or []

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

        # Create Config Volume
        volume = await self._create_volume(crawlconfig, labels)

        if crawlconfig.schedule:
            print("Scheduling...", flush=True)

            await self._send_sched_msg(
                {"type": "add", "id": crawlconfig.id, "schedule": crawlconfig.schedule}
            )

        if crawlconfig.runNow:
            await self._run_crawl_now(
                storage,
                labels,
                volume,
            )

    async def update_crawl_config(self, crawlconfig):
        """ Only updating the schedule + run now """

        if crawlconfig.schedule:
            print("Updating Schedule..", flush=True)

            await self._send_sched_msg(
                {"type": "add", "id": crawlconfig.id, "schedule": crawlconfig.schedule}
            )
        else:
            await self._send_sched_msg(
                {"type": "remove", "id": crawlconfig.id}
            )

        if crawlconfig.runNow:
            await self.run_crawl_config(crawlconfig.id)

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
        container = await self.client.containers.get(crawl_id)

        if container["Config"]["Labels"]["btrix.archive"] != aid:
            return None

        if not graceful:
            await container.kill(signal="SIGUSR1")
            result = self._make_crawl_for_container(container, "canceled", True)
        else:
            result = True

        await container.kill(signal="SIGTERM")

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

    async def delete_crawl_config_by_id(self, cid):
        """ Delete Crawl Config by Crawl Config Id"""
        await self._delete_volume_by_labels(
            filters={"label": [f"btrix.crawlconfig={cid}"]}
        )

    async def delete_crawl_configs_for_archive(self, aid):
        """ Delete Crawl Config by Archive Id"""
        await self._delete_volume_by_labels(filters={"label": [f"btrix.archive={aid}"]})

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

    async def _delete_volume_by_labels(self, filters):
        """ Delete Crawl Configs by specified filter """

        # pylint: disable=protected-access
        resp = await self.client._query_json(
            "volumes", method="GET", params={"filters": json.dumps(filters)}
        )

        for volume in resp["Volumes"]:
            vol_obj = aiodocker.docker.DockerVolume(self.client, volume["Name"])

            await self._send_sched_msg(
                {"type": "remove", "id": volume["Labels"]["btrix.crawlconfig"]}
            )

            try:
                await vol_obj.delete()
            # pylint: disable=bare-except
            except:
                print("Warning: Volume Delete Failed, Container in Use", flush=True)

    async def _send_sched_msg(self, msg):
        reader, writer = await asyncio.open_connection("scheduler", 9017)
        writer.write(json.dumps(msg).encode("utf-8") + b"\n")
        await writer.drain()
        await reader.readline()
        writer.close()
        await writer.wait_closed()

    # pylint: disable=too-many-arguments
    async def _run_crawl_now(self, storage, labels, volume, schedule="", manual=True):
        # Set Run Config
        command = ["crawl", "--config", "/tmp/crawlconfig/crawl-config.json"]

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
            "WEBHOOK_URL=http://backend:8000/crawls/done",
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
