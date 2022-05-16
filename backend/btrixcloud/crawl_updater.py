""" Create and Update Running Crawl within Crawl Job """

import os
import json
from datetime import datetime

import asyncio
from redis import asyncio as aioredis

import pymongo

from .db import init_db
from .crawls import Crawl, CrawlFile, CrawlCompleteIn, ts_now


# =============================================================================
# pylint: disable=too-many-instance-attributes,bare-except
class CrawlUpdater:
    """ Crawl Update """

    def __init__(self, id_, job):
        _, mdb = init_db()
        self.archives = mdb["archives"]
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]

        self.crawl_id = id_
        self.crawls_done_key = "crawls-done"

        self.aid = os.environ.get("ARCHIVE_ID")
        self.cid = os.environ.get("CRAWL_CONFIG_ID")
        self.userid = os.environ.get("USER_ID")
        self.is_manual = os.environ.get("RUN_MANUAL") == "1"

        self.scale = int(os.environ.get("INITIAL_SCALE") or "1")

        self.storage_path = os.environ.get("STORE_PATH")
        self.storage_name = os.environ.get("STORE_NAME")

        self.last_done = None
        self.last_found = None
        self.redis = None
        self.job = job

        self.started = ts_now()
        self.finished = None

    async def init_crawl_updater(self, redis_url, scale=None):
        """ init crawl, then init redis, wait for valid connection """

        if scale:
            self.scale = scale

        await self.init_crawl()
        prev_start_time = None

        retry = 3

        # init redis
        while True:
            try:
                self.redis = await aioredis.from_url(
                    redis_url, encoding="utf-8", decode_responses=True
                )
                prev_start_time = await self.redis.get("start_time")
                print("Redis Connected!", flush=True)
                break
            except:
                print(f"Retrying redis connection in {retry}", flush=True)
                await asyncio.sleep(retry)

        if prev_start_time:
            self.started = prev_start_time
        else:
            await self.redis.set("start_time", self.started)

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
                await self.update_running_crawl_stats(self.crawl_id)

                # check crawl status
                await self.check_crawl_status()

            # pylint: disable=broad-except
            except Exception as exc:
                print(f"Retrying crawls done loop: {exc}")
                await asyncio.sleep(10)

    async def check_crawl_status(self):
        """ check if crawl is done if all crawl workers have set their done state """
        results = await self.redis.hvals(f"{self.crawl_id}:status")

        # check if done
        done = 0
        for res in results:
            if res == "done":
                done += 1
            else:
                return

        # check if done
        if done >= self.scale:
            await self.finish_crawl()

            await self.job.delete_crawl_objects()

    async def finish_crawl(self):
        """ finish crawl """
        if self.finished:
            return

        self.finished = ts_now()

        completed = self.last_done and self.last_done == self.last_found

        state = "complete" if completed else "partial_complete"
        print("marking crawl as: " + state, flush=True)

        await self.update_crawl(state=state, finished=self.finished)

        if completed:
            await self.inc_crawl_complete_stats(state)

    async def inc_crawl_complete_stats(self, state):
        """ Increment Crawl Stats """

        duration = int((self.finished - self.started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        # init crawl config stats
        await self.crawl_configs.find_one_and_update(
            {"_id": self.cid, "inactive": False},
            {
                "$inc": {"crawlCount": 1},
                "$set": {
                    "lastCrawlId": self.crawl_id,
                    "lastCrawlTime": self.finished,
                    "lastCrawlState": state,
                },
            },
        )

        # init archive crawl stats
        yymm = datetime.utcnow().strftime("%Y-%m")
        await self.archives.find_one_and_update(
            {"_id": self.aid}, {"$inc": {f"usage.{yymm}": duration}}
        )

    async def update_running_crawl_stats(self, crawl_id):
        """ update stats for running crawl """
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
        """ update crawl state, and optionally mark as finished """
        await self.crawls.find_one_and_update({"_id": self.crawl_id}, {"$set": kwargs})

    async def init_crawl(self):
        """ create crawl, doesn't exist, mark as starting """
        try:
            crawl = self._make_crawl("starting", self.scale)
            await self.crawls.insert_one(crawl.to_dict())
        except pymongo.errors.DuplicateKeyError:
            await self.update_crawl(state="starting", scale=self.scale)

    async def add_file_to_crawl(self, cc_data):
        """ Handle finished CrawlFile to db """

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
            {"_id": self.crawl_id},
            {
                "$push": {"files": crawl_file.dict()},
            },
        )

        return True

    async def stop_crawl(self, graceful=True):
        """ mark crawl as stopped or canceled """
        if graceful:
            await self.update_crawl(state="stopping")
        else:
            self.finished = ts_now()
            await self.update_crawl(state="canceled", finished=self.finished)

    async def _get_running_stats(self, crawl_id):
        """ get stats from redis for running or finished crawl """

    def _make_crawl(self, state, scale):
        """ Create crawl object for partial or fully complete crawl """
        return Crawl(
            id=self.crawl_id,
            state=state,
            userid=self.userid,
            aid=self.aid,
            cid=self.cid,
            manual=self.is_manual,
            scale=scale,
            started=self.started,
            # colls=json.loads(job.metadata.annotations.get("btrix.colls", [])),
        )
