""" Crawl Job Management """

import asyncio
import sys
import signal
import os
import json
import uuid
import time

from datetime import datetime
from abc import ABC, abstractmethod

from redis import asyncio as aioredis

import pymongo

from .db import init_db
from .crawls import Crawl, CrawlFile, CrawlCompleteIn, dt_now


# Seconds before allowing another shutdown attempt
SHUTDOWN_ATTEMPT_WAIT = 60


# =============================================================================
# pylint: disable=too-many-instance-attributes,bare-except
class CrawlJob(ABC):
    """Crawl Job"""

    started: datetime
    finished: datetime
    job_id: str

    def __init__(self):
        super().__init__()

        _, mdb = init_db()
        self.orgs = mdb["organizations"]
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]

        self.crawls_done_key = "crawls-done"

        self.oid = uuid.UUID(os.environ["ORG_ID"])
        self.cid = uuid.UUID(os.environ["CRAWL_CONFIG_ID"])
        self.userid = uuid.UUID(os.environ["USER_ID"])

        self.is_manual = os.environ.get("RUN_MANUAL") == "1"
        self.tags = os.environ.get("TAGS", "").split(",")

        self.scale = int(os.environ.get("INITIAL_SCALE") or 0)

        self.storage_path = os.environ.get("STORE_PATH")
        self.storage_name = os.environ.get("STORAGE_NAME")

        self.last_done = None
        self.last_found = None
        self.redis = None

        self.started = dt_now()
        self.finished = None

        self._cached_params = {}
        self._files_added = False
        self._graceful_shutdown_pending = 0
        self._delete_pending = False

        params = {
            "cid": self.cid,
            "storage_name": self.storage_name or "default",
            "storage_path": self.storage_path or "",
            "redis_url": self.redis_url,
            "env": os.environ,
        }

        asyncio.create_task(self.async_init("crawler.yaml", params))

    async def async_init(self, template, params):
        """async init for k8s job"""
        crawl = await self._get_crawl()

        self.scale = await self.load_initial_scale(crawl)

        # if doesn't exist, create, using scale from config
        if not crawl:
            params["scale"] = self.scale
            await self.init_job_objects(template, params)

        await self.init_crawl()
        prev_start_time = None

        retry = 3

        # init redis
        while True:
            try:
                self.redis = await aioredis.from_url(
                    self.redis_url, encoding="utf-8", decode_responses=True
                )
                prev_start_time = await self.redis.get("start_time")

                print("Redis Connected!", flush=True)
                break
            except:
                print(f"Retrying redis connection in {retry}", flush=True)
                await asyncio.sleep(retry)

        if prev_start_time:
            try:
                self.started = datetime.fromisoformat(prev_start_time)
            except:
                pass
        else:
            await self.redis.set("start_time", str(self.started))

        # run redis loop
        while True:
            try:
                result = await self.redis.blpop(self.crawls_done_key, timeout=5)
                if result:
                    msg = json.loads(result[1])
                    # add completed file
                    if msg.get("filename"):
                        await self.add_file_to_crawl(msg)

                # update stats
                await self.update_running_crawl_stats(self.job_id)

                # check crawl status
                await self.check_crawl_status()

            # pylint: disable=broad-except
            except Exception as exc:
                print(f"Retrying crawls done loop: {exc}")
                await asyncio.sleep(10)

    async def check_crawl_status(self):
        """check if crawl is done if all crawl workers have set their done state"""
        results = await self.redis.hvals(f"{self.job_id}:status")

        # check if done / failed
        done = 0
        failed = 0
        for res in results:
            if res == "done":
                done += 1
            elif res == "failed":
                failed += 1

        # check if all crawlers are done
        if done >= self.scale:
            print("crawl done!", flush=True)
            await self.finish_crawl()

            await self.delete_crawl()

        # check if all crawlers failed
        elif failed >= self.scale:
            print("crawl failed!", flush=True)

            await self.fail_crawl()

            await self.delete_crawl()

    async def delete_crawl(self):
        """delete crawl stateful sets, services and pvcs"""
        self._delete_pending = True

        await self.delete_job_objects(f"crawl={self.job_id}")

    async def scale_to(self, scale):
        """scale to 'scale'"""
        try:
            await self._do_scale(scale)
        # pylint: disable=broad-except
        except Exception as exc:
            return {"success": False, "error": str(exc)}

        self.scale = scale
        await self.update_crawl(scale=scale)

        return {"success": True}

    async def fail_crawl(self):
        """mark crawl as failed"""
        if self.finished:
            return

        self.finished = dt_now()

        await self.update_crawl(state="failed", finished=self.finished)

    async def finish_crawl(self):
        """finish crawl"""
        if self.finished:
            return

        # check if one-page crawls actually succeeded
        # if only one page found, and no files, assume failed
        if self.last_found == 1 and not self._files_added:
            await self.fail_crawl()
            return

        self.finished = dt_now()

        completed = self.last_done and self.last_done >= self.last_found

        state = "complete" if completed else "partial_complete"
        print("marking crawl as: " + state, flush=True)

        await self.update_crawl(state=state, finished=self.finished)

        if completed:
            await self.inc_crawl_complete_stats()

    async def inc_crawl_complete_stats(self):
        """Increment Crawl Stats"""

        duration = int((self.finished - self.started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        # init org crawl stats
        yymm = datetime.utcnow().strftime("%Y-%m")
        await self.orgs.find_one_and_update(
            {"_id": self.oid}, {"$inc": {f"usage.{yymm}": duration}}
        )

    async def update_running_crawl_stats(self, crawl_id):
        """update stats for running crawl"""
        done = await self.redis.llen(f"{crawl_id}:d")
        found = await self.redis.scard(f"{crawl_id}:s")

        if self.last_done == done and self.last_found == found:
            return

        stats = {"found": found, "done": done}

        if not self.last_found and found:
            await self.update_crawl(state="running", stats=stats)
        else:
            await self.update_crawl(stats=stats)

        self.last_found = found
        self.last_done = done

    async def update_crawl(self, **kwargs):
        """update crawl state, and optionally mark as finished"""
        await self.crawls.find_one_and_update({"_id": self.job_id}, {"$set": kwargs})

    async def init_crawl(self):
        """create crawl, doesn't exist, mark as starting"""
        try:
            crawl = self._make_crawl("starting", self.scale)
            await self.crawls.insert_one(crawl.to_dict())
        except pymongo.errors.DuplicateKeyError:
            await self.update_crawl(state="starting", scale=self.scale)

    async def add_file_to_crawl(self, cc_data):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        inx = None
        filename = None
        if self.storage_path:
            inx = filecomplete.filename.index(self.storage_path)
            filename = filecomplete.filename[inx:] if inx > 0 else filecomplete.filename
            # storage_name = job.metadata.annotations.get("btrix.storage_name")

        def_storage_name = self.storage_name if inx else None

        crawl_file = CrawlFile(
            def_storage_name=def_storage_name,
            filename=filename or filecomplete.filename,
            size=filecomplete.size,
            hash=filecomplete.hash,
        )

        await self.crawls.find_one_and_update(
            {"_id": self.job_id},
            {
                "$push": {"files": crawl_file.dict()},
            },
        )
        self._files_added = True

        return True

    async def graceful_shutdown(self):
        """attempt to graceful stop the crawl, all data should be uploaded"""
        if (
            self._graceful_shutdown_pending
            and (time.time() - self._graceful_shutdown_pending) < SHUTDOWN_ATTEMPT_WAIT
        ):
            print("Already trying to stop crawl gracefully", flush=True)
            return {"success": False, "error": "already_stopping"}

        print("Stopping crawl", flush=True)

        if not await self._send_shutdown_signal("SIGUSR1"):
            return {"success": False, "error": "unreachable"}

        await self._send_shutdown_signal("SIGTERM")

        self._graceful_shutdown_pending = time.time()

        await self.update_crawl(state="stopping")

        return {"success": True}

    async def cancel(self):
        """cancel the crawl immediately"""
        print("Canceling crawl", flush=True)

        self.finished = dt_now()
        await self.update_crawl(state="canceled", finished=self.finished)

        await self.delete_crawl()

        return {"success": True}

    # pylint: disable=unused-argument
    async def load_initial_scale(self, crawl=None):
        """load scale from config or crawl object if not set"""
        if self.scale:
            return self.scale

        try:
            result = await self.crawl_configs.find_one(
                {"_id": self.cid}, {"scale": True}
            )
            return result["scale"]
        # pylint: disable=broad-except
        except Exception as exc:
            print(exc)
            return 1

    def _make_crawl(self, state, scale):
        """Create crawl object for partial or fully complete crawl"""
        return Crawl(
            id=self.job_id,
            state=state,
            userid=self.userid,
            oid=self.oid,
            cid=self.cid,
            manual=self.is_manual,
            scale=scale,
            started=self.started,
            tags=self.tags,
            # colls=json.loads(job.metadata.annotations.get("btrix.colls", [])),
        )

    def register_handlers(self, app):
        """register signal and app handlers"""

        def sig_handler():
            if self._delete_pending:
                print("got SIGTERM/SIGINT, already deleting", flush=True)
                return

            print("got SIGTERM/SIGINT, exiting job", flush=True)
            sys.exit(3)

        loop = asyncio.get_running_loop()
        loop.add_signal_handler(signal.SIGTERM, sig_handler)
        loop.add_signal_handler(signal.SIGINT, sig_handler)

        @app.post("/scale/{size}")
        async def scale(size: int):
            return await self.scale_to(size)

        @app.post("/stop")
        async def stop():
            return await self.graceful_shutdown()

        @app.post("/cancel")
        async def cancel():
            return await self.cancel()

        @app.get("/healthz")
        async def healthz():
            return {}

        @app.post("/change_config/{cid}")
        async def change_config(cid: str):
            return await self._change_crawl_config(cid)

    @abstractmethod
    async def init_job_objects(self, template, params):
        """base for creating objects"""

    @abstractmethod
    async def delete_job_objects(self, job_id):
        """base for deleting objects"""

    @abstractmethod
    async def _get_crawl(self):
        """get runnable object represnting this crawl"""

    @abstractmethod
    async def _do_scale(self, new_scale):
        """set number of replicas"""

    @abstractmethod
    async def _send_shutdown_signal(self, signame):
        """gracefully shutdown crawl"""

    @abstractmethod
    async def _change_crawl_config(self, cid):
        """change crawl config for this crawl"""

    @property
    @abstractmethod
    def redis_url(self):
        """get redis url"""
