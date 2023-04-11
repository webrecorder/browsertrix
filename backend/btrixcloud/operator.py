""" btrixjob operator (working for metacontroller) """

import os

import pprint

from datetime import datetime
import json
import yaml

# from fastapi import Request, HTTPException
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from redis import asyncio as aioredis  # , exceptions

from .k8s.utils import get_templates_dir

from .db import init_db
from .crawls import CrawlFile, CrawlCompleteIn, dt_now

# from .crawlconfigs import CrawlConfig

# pylint:disable=duplicate-code

STS = "StatefulSet.apps/v1"


# ============================================================================
class DeleteCrawlException(Exception):
    """throw to force deletion of crawl objects"""


# ============================================================================
class MCBaseRequest(BaseModel):
    """base metacontroller model, used for customize hook"""

    parent: dict
    controller: dict


# ============================================================================
class MCSyncData(MCBaseRequest):
    """sync / finalize metacontroller model"""

    children: dict
    related: dict
    finalizing: bool = False


# ============================================================================
class CrawlInfo(BaseModel):
    """Crawl Info"""

    crawl_id: str
    cid: str
    store_path: str
    storage_name: str


# ============================================================================
class BtrixOperator:
    """BtrixOperator Handler"""

    # pylint: disable=too-many-instance-attributes

    def __init__(self):
        self.namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        self.config_file = "/config/config.yaml"

        _, mdb = init_db()
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]
        self.orgs = mdb["organizations"]

        self.crawls_done_key = "crawls-done"

        self.templates = Jinja2Templates(directory=get_templates_dir())
        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

    async def sync_crawls(self, data: MCSyncData):
        """sync crawls"""
        spec = data.parent.get("spec", {})
        pprint.pprint(f"related: {len(data.related['ConfigMap.v1'])}")

        cid = spec["configId"]
        crawl_id = spec["configId"]

        configmap = data.related["ConfigMap.v1"][f"crawl-config-{cid}"]["data"]

        crawl = CrawlInfo(
            id=crawl_id,
            cid=cid,
            storage_name=configmap["STORAGE_NAME"],
            store_path=configmap["STORE_PATH"],
            scale=spec.get("scale", 1),
        )

        crawl_sts = f"crawl-{crawl_id}"
        redis_id = f"redis-{crawl_id}"

        redis_url = (
            f"redis://{redis_id}-0.{redis_id}.{self.namespace}.svc.cluster.local/0"
        )

        status = {
            # "jobs": len(jobs),
            # "startTime": start_time,
            "active": False,
            # "ready": ready,
            "message": "Test",
        }

        try:
            if STS in data.children and crawl_sts in data.children[STS]:
                await self.sync_crawl_state(redis_url, crawl)
        except DeleteCrawlException:
            return {"status": status, "children": []}

        params = {}
        params.update(self.shared_params)
        params["id"] = crawl_id
        params["cid"] = cid
        params["userid"] = spec.get("userId", "")

        params["storage_name"] = configmap["STORAGE_NAME"]
        params["store_path"] = configmap["STORE_PATH"]
        params["store_filename"] = configmap["STORE_FILENAME"]
        params["profile_filename"] = configmap["PROFILE_FILENAME"]

        params["redis_url"] = redis_url

        crawler_yaml = self.templates.env.get_template("crawler.yaml").render(params)

        children = list(yaml.safe_load_all(crawler_yaml))

        return {"status": status, "children": children}

    def get_related(self, data: MCBaseRequest):
        """return configmap related to crawl"""
        spec = data.parent.get("spec", {})
        cid = spec.get("configId")
        return {
            "relatedResources": [
                {
                    "apiVersion": "v1",
                    "resource": "configmaps",
                    "namespace": self.namespace,
                    "name": f"crawl-config-{cid}",
                }
            ]
        }

    async def sync_crawl_state(self, redis_url, crawl):
        """sync crawl state for running crawl"""
        # init redis
        redis = None
        try:
            redis = await aioredis.from_url(
                redis_url, encoding="utf-8", decode_responses=True
            )
            # prev_start_time = await redis.get("start_time")

            print("Redis Connected!", flush=True)
        # pylint: disable=bare-except
        except:
            print("Redis not available, trying again later")
            return False

        # if not prev_start_time:
        #    await redis.set("start_time", str(self.started))

        result = await redis.lpop(self.crawls_done_key)

        # run redis loop
        while result:
            try:
                msg = json.loads(result[1])
                # add completed file
                if msg.get("filename"):
                    await self.add_file_to_crawl(msg, crawl)

                # update stats
                await self.update_running_crawl_stats(redis, crawl.id)

                # check crawl status
                await self.check_crawl_status(crawl.id, redis, crawl.scale)

                # get next crawl done
                result = await redis.lpop(self.crawls_done_key)

                # pylint: disable=broad-except
            except Exception as exc:
                print(f"Crawl get failed: {exc}, trying next time")
                return False

        return True

    async def add_file_to_crawl(self, cc_data, crawl):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        inx = None
        filename = None
        if crawl.storage_path:
            inx = filecomplete.filename.index(crawl.storage_path)
            filename = filecomplete.filename[inx:] if inx > 0 else filecomplete.filename
            # storage_name = job.metadata.annotations.get("btrix.storage_name")

        def_storage_name = crawl.storage_name if inx else None

        crawl_file = CrawlFile(
            def_storage_name=def_storage_name,
            filename=filename or filecomplete.filename,
            size=filecomplete.size,
            hash=filecomplete.hash,
        )

        await self.crawls.find_one_and_update(
            {"_id": crawl.id},
            {
                "$push": {"files": crawl_file.dict()},
            },
        )
        # self._files_added = True

        return True

    async def inc_crawl_complete_stats(self, org_id):
        """Increment Crawl Stats"""

        duration = 0  # int((self.finished - self.started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        # init org crawl stats
        yymm = datetime.utcnow().strftime("%Y-%m")
        await self.orgs.find_one_and_update(
            {"_id": org_id}, {"$inc": {f"usage.{yymm}": duration}}
        )

    async def update_running_crawl_stats(self, redis, crawl_id):
        """update stats for running crawl"""
        done = await redis.llen(f"{crawl_id}:d")
        found = await redis.scard(f"{crawl_id}:s")

        # if self.last_done == done and self.last_found == found:
        #    return

        stats = {"found": found, "done": done}
        if found:
            stats["state"] = "running"

        # if not self.last_found and found:
        #    await self.update_crawl(state="running", stats=stats)
        # else:
        await self.update_crawl(crawl_id, stats=stats)

        # self.last_found = found
        # self.last_done = done

    async def update_crawl(self, crawl_id, **kwargs):
        """update crawl state, and optionally mark as finished"""
        await self.crawls.find_one_and_update({"_id": crawl_id}, {"$set": kwargs})

    async def check_crawl_status(self, crawl_id, redis, scale):
        """check if crawl is done if all crawl workers have set their done state"""
        results = await redis.hvals(f"{crawl_id}:status")

        # check if done / failed
        done = 0
        failed = 0
        for res in results:
            if res == "done":
                done += 1
            elif res == "failed":
                failed += 1

        # check if all crawlers are done
        if done >= scale:
            print("crawl done!", flush=True)
            await self.finish_crawl(crawl_id)

            raise DeleteCrawlException()

        # check if all crawlers failed
        if failed >= scale:
            print("crawl failed!", flush=True)

            await self.fail_crawl(crawl_id)

            raise DeleteCrawlException()

        # check crawl expiry
        # if self.crawl_expire_time and datetime.utcnow() > self.crawl_expire_time:
        #    res = await self.graceful_shutdown()
        #    if res.get("success"):
        #        print(
        #            "Job duration expired at {self.crawl_expire_time}, "
        #            + "gracefully stopping crawl"
        #        )

    async def fail_crawl(self, crawl_id):
        """mark crawl as failed"""
        # if self.finished:
        #    return

        finished = dt_now()

        await self.update_crawl(crawl_id, state="failed", finished=finished)

    async def finish_crawl(self, crawl_id):
        """finish crawl"""
        # if finished:
        #    return

        # check if one-page crawls actually succeeded
        # if only one page found, and no files, assume failed
        # if self.last_found == 1 and not self._files_added:
        #    await self.fail_crawl()
        #    return

        finished = dt_now()

        # completed = self.last_done and self.last_done >= self.last_found
        completed = True

        state = "complete" if completed else "partial_complete"
        print("marking crawl as: " + state, flush=True)

        await self.update_crawl(crawl_id, state=state, finished=finished)

        # if completed:
        #   await self.inc_crawl_complete_stats()


# ============================================================================
def init_operator_webhook(app):
    """regsiters webhook handlers for metacontroller"""

    oper = BtrixOperator()

    @app.post("/operator/sync")
    async def mc_sync(data: MCSyncData):
        return await oper.sync_crawls(data)

    @app.post("/operator/customize")
    async def mc_related(data: MCBaseRequest):
        return oper.get_related(data)
