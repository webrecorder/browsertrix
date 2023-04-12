""" btrixjob operator (working for metacontroller) """

import os

# import pprint
from typing import Optional

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
CMAP = "ConfigMap.v1"


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

    id: str
    cid: str
    oid: str
    scale: int
    storage_path: str
    storage_name: str
    started: str


# ============================================================================
class Status(BaseModel):
    """Crawl Status"""

    state: str = "waiting"
    pagesFound: int = 0
    pagesDone: int = 0
    scale: int = 1
    filesAdded: int = 0
    # started: datetime = dt_now()
    # finished: Optional[datetime] = None
    finished: Optional[str] = None


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
        status = Status(**data.parent.get("status", {}))
        if status.finished:
            return {"status": status.dict(), "children": []}

        spec = data.parent.get("spec", {})

        crawl_id = spec["id"]
        cid = spec["cid"]

        configmap = data.related[CMAP][f"crawl-config-{cid}"]["data"]

        crawl = CrawlInfo(
            id=crawl_id,
            cid=cid,
            oid=spec["oid"],
            storage_name=configmap["STORAGE_NAME"],
            storage_path=configmap["STORE_PATH"],
            scale=spec.get("scale", 1),
            started=data.parent["metadata"]["creationTimestamp"],
        )

        crawl_sts = f"crawl-{crawl_id}"
        redis_id = f"redis-{crawl_id}"

        redis_url = (
            f"redis://{redis_id}-0.{redis_id}.{self.namespace}.svc.cluster.local/0"
        )

        if STS in data.children and crawl_sts in data.children[STS]:
            status = await self.sync_crawl_state(redis_url, crawl, status)
        else:
            status.state = "starting"

        if status.finished:
            return {"status": status.dict(), "children": []}

        params = {}
        params.update(self.shared_params)
        params["id"] = crawl_id
        params["cid"] = cid
        params["userid"] = spec.get("userid", "")

        params["storage_name"] = configmap["STORAGE_NAME"]
        params["store_path"] = configmap["STORE_PATH"]
        params["store_filename"] = configmap["STORE_FILENAME"]
        params["profile_filename"] = configmap["PROFILE_FILENAME"]
        params["scale"] = spec.get("scale", 1)

        params["redis_url"] = redis_url

        crawler_yaml = self.templates.env.get_template("crawler.yaml").render(params)

        children = list(yaml.safe_load_all(crawler_yaml))

        return {"status": status.dict(), "children": children}

    def get_related(self, data: MCBaseRequest):
        """return configmap related to crawl"""
        spec = data.parent.get("spec", {})
        cid = spec.get("cid")
        return {
            "relatedResources": [
                {
                    "apiVersion": "v1",
                    "resource": "configmaps",
                    # "namespace": self.namespace,
                    "labelSelector": {"matchLabels": {"btrix.crawlconfig": cid}},
                }
            ]
        }

    async def sync_crawl_state(self, redis_url, crawl, status):
        """sync crawl state for running crawl"""
        # init redis
        redis = None
        try:
            redis = await aioredis.from_url(
                redis_url, encoding="utf-8", decode_responses=True
            )
            # test conn
            await redis.ping()

        # pylint: disable=bare-except
        except:
            return status

        # if not prev_start_time:
        #    await redis.set("start_time", str(self.started))

        try:
            file_done = await redis.lpop(self.crawls_done_key)

            while file_done:
                msg = json.loads(file_done)
                # add completed file
                if msg.get("filename"):
                    await self.add_file_to_crawl(msg, crawl)
                    status.filesAdded += 1

                # get next file done
                file_done = await redis.lpop(self.crawls_done_key)

            # update stats and get status
            return await self.update_crawl_state(redis, crawl, status)

        # pylint: disable=broad-except
        except Exception as exc:
            import traceback
            traceback.print_exc()
            print(f"Crawl get failed: {exc}, will try again")
            return status

    async def add_file_to_crawl(self, cc_data, crawl):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        inx = None
        filename = None
        if crawl.storage_path:
            inx = filecomplete.filename.index(crawl.storage_path)
            filename = filecomplete.filename[inx:] if inx > 0 else filecomplete.filename

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

    async def update_crawl_state(self, redis, crawl, status):
        """update crawl state and check if crawl is now done"""
        pages_done = await redis.llen(f"{crawl.id}:d")
        pages_found = await redis.scard(f"{crawl.id}:s")
        results = await redis.hvals(f"{crawl.id}:status")

        # no change in pages found / done, no further checks / updates needed
        # return current status
        # if status.pagesDone == pages_done and status.pagesFound == pages_found:
        #    return status

        stats = {"found": pages_found, "done": pages_done}

        await self.update_crawl(crawl.id, state="running", stats=stats)

        # update status
        status.state = "running"
        status.pagesDone = pages_done
        status.pagesFound = pages_found

        # check if done / failed
        done = 0
        failed = 0
        for res in results:
            if res == "done":
                done += 1
            elif res == "failed":
                failed += 1

        # check if all crawlers are done
        if done >= crawl.scale:
            # check if one-page crawls actually succeeded
            # if only one page found, and no files, assume failed
            if status.pagesFound == 1 and not status.filesAdded:
                return await self.mark_finished(crawl, status, state="failed")

            completed = status.pagesDone and status.pagesDone >= status.pagesFound

            state = "complete" if completed else "partial_complete"

            status = await self.mark_finished(crawl, status, state, inc_stats=True)

        # check if all crawlers failed
        if failed >= crawl.scale:
            status = await self.mark_finished(crawl, status, state="failed")

        # check crawl expiry
        # if self.crawl_expire_time and datetime.utcnow() > self.crawl_expire_time:
        #    res = await self.graceful_shutdown()
        #    if res.get("success"):
        #        print(
        #            "Job duration expired at {self.crawl_expire_time}, "
        #            + "gracefully stopping crawl"
        #        )

        return status

    async def mark_finished(self, crawl, status, state, inc_stats=False):
        """mark crawl as finished, set finished timestamp and final state"""
        finished = dt_now()

        await self.update_crawl(crawl.id, state=state, finished=finished)

        status.state = state
        status.finished = finished.isoformat() + "Z"

        if inc_stats:
            await self.inc_crawl_complete_stats(crawl, finished)

        return status

    async def update_crawl(self, crawl_id, **kwargs):
        """update crawl state in db"""
        await self.crawls.find_one_and_update({"_id": crawl_id}, {"$set": kwargs})

    async def inc_crawl_complete_stats(self, crawl, finished):
        """Increment Crawl Stats"""

        # strip of 'Z' at end
        started = datetime.fromisoformat(crawl.started[:-1])

        duration = int((finished - started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        # init org crawl stats
        yymm = datetime.utcnow().strftime("%Y-%m")
        await self.orgs.find_one_and_update(
            {"_id": crawl.oid}, {"$inc": {f"usage.{yymm}": duration}}
        )


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
