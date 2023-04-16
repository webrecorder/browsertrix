""" btrixjob operator (working for metacontroller) """

import asyncio
import traceback
from typing import Optional

from datetime import datetime
import json

import yaml

# from fastapi import Request, HTTPException
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from redis import asyncio as aioredis  # , exceptions

from .utils import get_templates_dir, from_k8s_date, to_k8s_date, dt_now
from .k8sapi import K8sAPI

from .db import init_db
from .crawls import CrawlFile, CrawlCompleteIn

# from .crawlconfigs import CrawlConfig

# pylint:disable=duplicate-code

STS = "StatefulSet.apps/v1"
CMAP = "ConfigMap.v1"

DEFAULT_TTL = 30


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
    stopping: bool = False
    expire_time: Optional[datetime] = None


# ============================================================================
class CrawlStatus(BaseModel):
    """Crawl Status"""

    state: str = "waiting"
    pagesFound: int = 0
    pagesDone: int = 0
    scale: int = 1
    filesAdded: int = 0
    finished: Optional[str] = None


# ============================================================================
class BtrixOperator(K8sAPI):
    """BtrixOperator Handler"""

    # pylint: disable=too-many-instance-attributes

    def __init__(self):
        super().__init__()
        self.config_file = "/config/config.yaml"

        _, mdb = init_db()
        self.crawls = mdb["crawls"]
        self.orgs = mdb["organizations"]

        self.crawls_done_key = "crawls-done"

        self.templates = Jinja2Templates(directory=get_templates_dir())
        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

    async def sync_profile_browsers(self, data: MCSyncData):
        """sync profile browsers"""
        spec = data.parent.get("spec", {})

        expire_time = from_k8s_date(spec.get("expireTime"))
        browserid = spec.get("id")

        if dt_now() >= expire_time:
            asyncio.create_task(self.delete_profile_browser(browserid))
            return {"status": {}, "children": []}

        params = {}
        params.update(self.shared_params)
        params["id"] = browserid
        params["userid"] = spec.get("userid", "")

        params["storage_name"] = spec.get("storageName", "")
        params["storage_path"] = spec.get("storagePath", "")
        params["profile_filename"] = spec.get("profileFilename", "")
        params["url"] = spec.get("startUrl", "about:blank")
        params["vnc_password"] = spec.get("vncPassword")

        browser_yaml = self.templates.env.get_template("profilebrowser.yaml").render(
            params
        )

        children = list(yaml.safe_load_all(browser_yaml))

        return {"status": {}, "children": children}

    async def sync_crawls(self, data: MCSyncData):
        """sync crawls"""

        status = CrawlStatus(**data.parent.get("status", {}))

        spec = data.parent.get("spec", {})
        crawl_id = spec["id"]

        scale = spec.get("scale", 1)
        status.scale = scale

        if status.finished:
            return await self.handle_finished_delete_if_needed(crawl_id, status, spec)

        cid = spec["cid"]

        try:
            configmap = data.related[CMAP][f"crawl-config-{cid}"]["data"]
        # pylint: disable=bare-except, broad-except
        except:
            return await self.cancel_crawl(crawl_id, status, "failed")

        crawl = CrawlInfo(
            id=crawl_id,
            cid=cid,
            oid=spec["oid"],
            storage_name=configmap.get("STORAGE_NAME", ""),
            storage_path=configmap.get("STORE_PATH", ""),
            scale=scale,
            started=data.parent["metadata"]["creationTimestamp"],
            stopping=spec.get("stopping", False),
            expire_time=from_k8s_date(spec.get("expireTime")),
        )

        # if finalizing and not finished, job is being deleted, so assume crawl has been canceled
        if data.finalizing:
            return await self.cancel_crawl(crawl_id, status, "canceled")

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
            return await self.handle_finished_delete_if_needed(crawl.id, status, spec)

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
        params["force_restart"] = spec.get("forceRestart")

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
                    "labelSelector": {"matchLabels": {"btrix.crawlconfig": cid}},
                }
            ]
        }

    async def handle_finished_delete_if_needed(self, crawl_id, status, spec):
        """return status for finished job (no children)
        also check if deletion is necessary
        """

        ttl = spec.get("ttlSecondsAfterFinished", DEFAULT_TTL)
        finished = from_k8s_date(status.finished)
        if (dt_now() - finished).total_seconds() > ttl:
            print("Job expired, deleting: " + crawl_id)

            asyncio.create_task(self.delete_crawl_job(crawl_id))

        return self._done_response(status)

    async def delete_crawl_job(self, crawl_id):
        # delete the crawljob itself
        await super().delete_crawl_job(crawl_id)

        # until delete policy is supported in StatefulSet
        # now, delete pvcs explicitly
        # (don't want to make them children as already owned by sts)
        try:
            await self.core_api.delete_collection_namespaced_persistent_volume_claim(
                namespace=self.namespace, label_selector=f"crawl={crawl_id}"
            )
        # pylint: disable=bare-except, broad-except
        except Exception as exc:
            print("PVC Delete failed", exc, flush=True)

    async def cancel_crawl(self, crawl_id, status, state):
        """immediately cancel crawl with specified state"""
        await self.mark_finished(crawl_id, status, state)
        return self._done_response(status)

    def _done_response(self, status):
        """response for when crawl job is done/to be deleted"""
        return {"status": status.dict(), "children": [], "finalized": True}

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
                    await redis.incr("filesAdded")

                # get next file done
                file_done = await redis.lpop(self.crawls_done_key)

            # ensure filesAdded always set
            status.filesAdded = int(await redis.get("filesAdded") or 0)

            # update stats and get status
            return await self.update_crawl_state(redis, crawl, status)

        # pylint: disable=broad-except
        except Exception as exc:
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

        # check crawl expiry
        if crawl.expire_time and datetime.utcnow() > crawl.expire_time:
            crawl.stopping = True
            print(
                "Job duration expired at {crawl.expire_time}, "
                + "gracefully stopping crawl"
            )

        if crawl.stopping:
            await redis.set(f"{crawl.id}:stopping", "1")

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
                return await self.mark_finished(crawl.id, status, state="failed")

            completed = status.pagesDone and status.pagesDone >= status.pagesFound

            state = "complete" if completed else "partial_complete"

            status = await self.mark_finished(crawl.id, status, state, crawl)

        # check if all crawlers failed
        if failed >= crawl.scale:
            status = await self.mark_finished(crawl.id, status, state="failed")

        return status

    async def mark_finished(self, crawl_id, status, state, crawl=None):
        """mark crawl as finished, set finished timestamp and final state"""
        finished = dt_now()

        await self.update_crawl(crawl_id, state=state, finished=finished)

        status.state = state
        status.finished = to_k8s_date(finished)

        if crawl:
            await self.inc_crawl_complete_stats(crawl, finished)

        return status

    async def update_crawl(self, crawl_id, **kwargs):
        """update crawl state in db"""
        await self.crawls.find_one_and_update({"_id": crawl_id}, {"$set": kwargs})

    async def inc_crawl_complete_stats(self, crawl, finished):
        """Increment Crawl Stats"""

        started = from_k8s_date(crawl.started)

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

    @app.post("/operator/syncCrawls")
    async def mc_sync_crawls(data: MCSyncData):
        return await oper.sync_crawls(data)

    @app.post("/operator/syncProfileBrowsers")
    async def mc_sync_profile_browsers(data: MCSyncData):
        return await oper.sync_profile_browsers(data)

    @app.post("/operator/customize")
    async def mc_related(data: MCBaseRequest):
        return oper.get_related(data)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}
