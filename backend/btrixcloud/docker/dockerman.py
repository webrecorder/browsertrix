"""
Docker crawl manager
"""

import tarfile
import os
import json
import time
import asyncio
import uuid

from datetime import datetime
from io import BytesIO
from tempfile import NamedTemporaryFile

import aiodocker
import aioprocessing
from redis import asyncio as aioredis


from .scheduler import run_scheduler

from ..archives import S3Storage

from ..crawls import Crawl, CrawlOut, CrawlFile


# ============================================================================
class DockerManager:
    """ Docker Crawl Manager Interface"""

    # pylint: disable=too-many-instance-attributes,too-many-public-methods
    def __init__(self, archive_ops, extra_crawl_params=None):
        self.client = aiodocker.Docker()

        self.crawler_image = os.environ["CRAWLER_IMAGE"]
        self.default_network = os.environ.get("CRAWLER_NETWORK", "btrix-cloud-net")

        self.redis_url = os.environ["REDIS_URL"]
        self.crawls_done_key = "crawls-done"

        self.crawl_args = os.environ["CRAWL_ARGS"]

        self.wacz_sign_url = os.environ.get("WACZ_SIGN_URL", "")
        self.wacz_sign_token = os.environ.get("WACZ_SIGN_TOKEN", "")

        self.archive_ops = archive_ops
        self.crawl_ops = None

        self.extra_crawl_params = extra_crawl_params or []
        self._event_q = None

        self.no_delete_on_fail = os.environ.get("NO_DELETE_ON_FAIL", "")

        self.storages = {
            "default": S3Storage(
                name="default",
                access_key=os.environ["STORE_ACCESS_KEY"],
                secret_key=os.environ["STORE_SECRET_KEY"],
                endpoint_url=os.environ["STORE_ENDPOINT_URL"],
                access_endpoint_url=os.environ["STORE_ACCESS_ENDPOINT_URL"],
            )
        }

        self.loop = asyncio.get_running_loop()

        self.loop.create_task(self.run_event_loop())
        self.loop.create_task(self.init_trigger_queue())
        self.loop.create_task(self.cleanup_loop())
        self.loop.create_task(self.init_redis(self.redis_url))

    async def init_redis(self, redis_url):
        """ init redis async """
        self.redis = await aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        )

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
                if not self.no_delete_on_fail:
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

    async def check_storage(self, storage_name, is_default=False):
        """ check if storage_name is valid storage """
        # if not default, don't validate
        if not is_default:
            return True

        # if default, ensure name is in default storages list
        return self.storages[storage_name]

    async def get_default_storage(self, name):
        """ return default storage by name """
        return self.storages[name]

    async def update_archive_storage(self, aid, userid, storage):
        """ No storage kept for docker manager """

    # pylint: disable=too-many-arguments
    async def add_crawl_config(
        self, crawlconfig, storage, run_now, out_filename, profile_filename
    ):
        """ Add new crawl config """
        cid = str(crawlconfig.id)
        userid = str(crawlconfig.userid)
        aid = str(crawlconfig.aid)

        labels = {
            "btrix.user": userid,
            "btrix.archive": aid,
            "btrix.crawlconfig": cid,
            "btrix.colls": json.dumps(crawlconfig.colls),
            "btrix.storage_name": storage.name,
            "btrix.out_filename": out_filename,
        }

        if profile_filename:
            labels["btrix.profilepath"] = profile_filename

        if storage.type == "default":
            labels["btrix.def_storage_path"] = storage.path

        storage, storage_path = await self._get_storage_and_path(storage)

        if crawlconfig.crawlTimeout:
            labels["btrix.timeout"] = str(crawlconfig.crawlTimeout)

        # Create Config Volume
        volume = await self._create_volume(crawlconfig, labels)

        if crawlconfig.schedule:
            print("Scheduling...", flush=True)

            await self._schedule_update(
                cid=crawlconfig.id, schedule=crawlconfig.schedule
            )

        if run_now:
            return await self._run_crawl_now(
                storage,
                storage_path,
                labels,
                volume,
            )

        return ""

    async def update_crawl_schedule_or_scale(self, cid, schedule=None, scale=None):
        """ Update the schedule for existing crawl config """

        # pylint: disable=unused-argument
        if schedule:
            print("Updating Schedule..", flush=True)

            await self._schedule_update(cid=cid, schedule=schedule)
        else:
            await self._schedule_update(cid=cid, schedule="")

    async def list_running_crawls(self, cid=None, aid=None, userid=None):
        """ List running containers for this archive """

        labels = []

        if cid:
            labels.append(f"btrix.crawlconfig={cid}")
        else:
            labels.append("btrix.crawlconfig")

        if aid:
            labels.append(f"btrix.archive={aid}")

        if userid:
            labels.append(f"btrix.user={userid}")

        containers = await self._list_running_containers(labels)

        running = []

        for container in containers:
            crawl = await self.get_running_crawl(container["Id"][:12], aid)
            if crawl:
                running.append(crawl)

        return running

    async def stop_crawl(self, crawl_id, aid, graceful=True):
        """Stop crawl, if not graceful, issue SIGABRT to indicate immediate
        cancelation on next SIGTERM"""

        result = None

        try:
            container = await self.client.containers.get(crawl_id)

            if container["Config"]["Labels"]["btrix.archive"] != aid:
                return None

            if not graceful:
                await container.kill(signal="SIGABRT")
                result = self._make_crawl_for_container(container, "canceled", True)
                await self._mark_is_stopping(crawl_id, "canceled")
            else:
                result = True
                await self._mark_is_stopping(crawl_id, "stopping")

            await container.kill(signal="SIGTERM")
        except aiodocker.exceptions.DockerError as exc:
            if exc.status == 404:
                return None

            raise exc

        return result

    async def run_crawl_config(self, cid, manual=True, schedule="", userid=None):
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
        if userid:
            labels["btrix.user"] = userid

        archive = None
        storage = None
        storage_path = None

        try:
            archive = await self.archive_ops.get_archive_by_id(
                uuid.UUID(labels["btrix.archive"])
            )
            storage, storage_path = await self._get_storage_and_path(archive.storage)

        # pylint: disable=broad-except
        except Exception as exc:
            print("Run Now Failed")
            print(exc, flush=True)
            return None

        return await self._run_crawl_now(
            storage, storage_path, labels, volume_name, schedule, manual
        )

    async def process_crawl_complete(self, crawlcomplete):
        """Validate that crawl is valid by checking that container exists and label matches
        Return completed crawl object from container"""

        container = await self.client.containers.get(crawlcomplete.id)

        labels = container["Config"]["Labels"]

        if labels["btrix.user"] != crawlcomplete.user:
            return None

        crawl = self._make_crawl_for_container(
            container,
            "complete" if crawlcomplete.completed else "partial_complete",
            finish_now=True,
        )

        def_storage_name, filename = self.resolve_storage_path(
            labels, crawlcomplete.filename
        )

        crawl_file = CrawlFile(
            def_storage_name=def_storage_name,
            filename=filename,
            size=crawlcomplete.size,
            hash=crawlcomplete.hash,
        )

        return crawl, crawl_file

    async def get_default_storage_access_endpoint(self, name):
        """ Return the access endpoint url for default storage """
        return self.storages[name].access_endpoint_url

    async def get_running_crawl(self, crawl_id, aid=None):
        """ Return a single running crawl as CrawlOut """
        # pylint: disable=broad-except,bare-except
        try:
            container = await self.client.containers.get(crawl_id)

            if container["State"]["Status"] != "running":
                return None

            if aid and container["Config"]["Labels"]["btrix.archive"] != aid:
                return None

            stop_type = await self._get_is_stopping(crawl_id)
            if stop_type == "canceled":
                return None

            crawl = self._make_crawl_for_container(
                container, "stopping" if stop_type else "running", False, CrawlOut
            )

            crawl_ip = self._get_container_ip(container)
            crawl.watchIPs = [crawl_ip] if crawl_ip else []

            return crawl

        except Exception as exc:
            print(exc, flush=True)
            return None

    async def scale_crawl(self):  # job_name, aid, parallelism=1):
        """ Scale running crawl, currently only supported in k8s"""
        return "Not Supported"

    async def delete_crawl_config_by_id(self, cid):
        """ Delete Crawl Config by Crawl Config Id"""
        await self._delete_volume_by_labels([f"btrix.crawlconfig={cid}"])

    async def delete_crawl_configs_for_archive(self, aid):
        """ Delete Crawl Config by Archive Id"""
        await self._delete_volume_by_labels([f"btrix.archive={aid}"])

    # pylint: disable=no-self-use
    def resolve_storage_path(self, labels, filename):
        """resolve relative filename and storage name based on
        labels and full s3 filename"""
        storage_path = labels.get("btrix.def_storage_path")
        inx = None
        storage_name = None
        if storage_path:
            inx = filename.index(storage_path)
            filename = filename[inx:] if inx > 0 else filename
            storage_name = labels.get("btrix.storage_name")

        def_storage_name = storage_name if inx else None
        return def_storage_name, filename

    # pylint: disable=too-many-arguments
    async def run_profile_browser(
        self,
        userid,
        aid,
        command,
        storage=None,
        storage_name=None,
        baseprofile=None,
    ):
        """ Run browser for profile creation """
        if storage_name:
            storage = self.storages[storage_name]
            storage_path = storage.path
        else:
            storage_name = storage.name
            storage, storage_path = await self._get_storage_and_path(storage)

        env_vars = [
            f"STORE_USER={userid}",
            f"STORE_ARCHIVE={aid}",
            f"STORE_ENDPOINT_URL={storage.endpoint_url}",
            f"STORE_ACCESS_KEY={storage.access_key}",
            f"STORE_SECRET_KEY={storage.secret_key}",
            f"STORE_PATH={storage_path}",
        ]

        labels = {
            "btrix.user": userid,
            "btrix.archive": aid,
            "btrix.storage_name": storage_name,
            "btrix.profile": "1",
        }

        if storage.type == "default":
            labels["btrix.def_storage_path"] = storage.path

        if baseprofile:
            labels["btrix.baseprofile"] = baseprofile

        run_config = {
            "Image": self.crawler_image,
            "Labels": labels,
            "Cmd": command,
            "Env": env_vars,
            "HostConfig": {"NetworkMode": self.default_network, "AutoRemove": True},
        }

        container = await self.client.containers.run(run_config)
        return container["id"][:12]

    async def get_profile_browser_data(self, profile_id):
        """ Get IP of profile browser ip """
        container = await self.client.containers.get(profile_id)
        if not container["Config"]["Labels"].get("btrix.profile"):
            return None

        labels = container["Config"]["Labels"]
        labels["browser_ip"] = self._get_container_ip(container)
        return labels

    async def delete_profile_browser(self, browserid):
        """ delete profile browser container, if any """
        container = await self.client.containers.get(browserid)

        if not container:
            return False

        if not container["Config"]["Labels"].get("btrix.profile"):
            return False

        await container.kill()
        return True

    # ========================================================================
    async def _create_volume(self, crawlconfig, labels):
        """ Create new volume to store the crawl config json """

        name = f"crawl-config-{crawlconfig.id}"

        await self.client.volumes.create({"Name": name, "Labels": labels})

        await self._add_config_to_volume(
            name, "crawl-config.json", crawlconfig.get_raw_config()
        )

        return name

    async def _get_storage_and_path(self, storage):
        """get storage from existing storage object or reference
        return storage and storage_path (for default storage)
        """

        # pylint: disable=no-else-return
        if storage.type == "default":
            return self.storages[storage.name], storage.path
        else:
            return storage, ""

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
    async def _run_crawl_now(
        self, storage, storage_path, labels, volume, schedule="", manual=True
    ):
        # Set Run Config
        command = [
            "crawl",
            "--config",
            "/tmp/crawlconfig/crawl-config.json",
            "--redisStoreUrl",
            self.redis_url,
        ]

        profile_filename = labels.get("btrix.profilepath")
        if profile_filename:
            command.append("--profile")
            command.append(f"@{profile_filename}")

        if self.extra_crawl_params:
            command += self.extra_crawl_params

        # endpoint_with_coll_url = os.path.join(
        #    storage.endpoint_url, "collections", labels["btrix.coll"] + "/"
        # )

        env_vars = [
            f"STORE_USER={labels['btrix.user']}",
            f"STORE_ARCHIVE={labels['btrix.archive']}",
            f"STORE_ENDPOINT_URL={storage.endpoint_url}",
            f"STORE_ACCESS_KEY={storage.access_key}",
            f"STORE_SECRET_KEY={storage.secret_key}",
            f"STORE_PATH={storage_path}",
            f"STORE_FILENAME={labels['btrix.out_filename']}",
            f"WEBHOOK_URL={self.redis_url}/{self.crawls_done_key}",
            f"CRAWL_ARGS={self.crawl_args}",
            f"WACZ_SIGN_URL={self.wacz_sign_url}",
            f"WACZ_SIGN_TOKEN={self.wacz_sign_token}",
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

        container = await self.client.containers.run(run_config)
        return container["id"][:12]

    def _get_container_ip(self, container):
        try:
            return container["NetworkSettings"]["Networks"][self.default_network][
                "IPAddress"
            ]
        # pylint: disable=broad-except,bare-except
        except:
            return None

    async def _list_running_containers(self, labels):
        results = await self.client.containers.list(
            filters=json.dumps({"status": ["running"], "label": labels})
        )
        return results

    async def _mark_is_stopping(self, crawl_id, stop_type):
        """ mark crawl as stopping in redis """
        await self.redis.setex(f"{crawl_id}:stop", 600, stop_type)

    async def _get_is_stopping(self, crawl_id):
        """ check redis if crawl is marked for stopping """
        return await self.redis.get(f"{crawl_id}:stop")

    async def _is_scheduled_crawl_for_config_running(self, cid):
        results = await self._list_running_containers(
            [f"btrix.crawlconfig={cid}", "btrix.run.manual=0"]
        )
        return len(results) > 0

    async def _handle_container_die(self, actor):
        """ Handle crawl container shutdown """
        container = await self.client.containers.get(actor["ID"])

        if not container["Config"]["Labels"].get("btrix.crawlconfig"):
            return

        if actor["Attributes"]["exitCode"] != 0:
            crawl = self._make_crawl_for_container(container, "failed", True)
            await self.crawl_ops.store_crawl(crawl)
            if not self.no_delete_on_fail:
                await container.delete()
        else:
            await container.delete()

    # pylint: disable=no-self-use,too-many-arguments
    def _make_crawl_for_container(
        self, container, state, finish_now=False, crawl_cls=Crawl
    ):
        """ Make a crawl object from a container data"""
        labels = container["Config"]["Labels"]

        return crawl_cls(
            id=container["Id"][:12],
            state=state,
            userid=labels["btrix.user"],
            aid=labels["btrix.archive"],
            cid=labels["btrix.crawlconfig"],
            schedule=labels["btrix.run.schedule"],
            manual=labels["btrix.run.manual"] == "1",
            started=datetime.fromisoformat(container["State"]["StartedAt"][:19]),
            finished=datetime.utcnow().replace(microsecond=0, tzinfo=None)
            if finish_now
            else None,
            colls=json.loads(labels.get("btrix.colls", [])),
        )
