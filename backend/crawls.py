""" Crawl API """

import asyncio

from typing import Optional, List, Dict
from datetime import datetime

from fastapi import Depends, HTTPException
from pydantic import BaseModel
import pymongo
import aioredis

from db import BaseMongoModel
from archives import Archive


# ============================================================================
class DeleteCrawlList(BaseModel):
    """ delete crawl list POST body """

    crawl_ids: List[str]


# ============================================================================
class CrawlScale(BaseModel):
    """ scale the crawl to N parallel containers """

    scale: int = 1


# ============================================================================
class CrawlFile(BaseModel):
    """ output of a crawl """

    filename: str
    hash: str
    size: int


# ============================================================================
class Crawl(BaseMongoModel):
    """ Store State of a Crawl (Finished or Running) """

    user: str
    aid: str
    cid: str

    schedule: Optional[str]
    manual: Optional[bool]

    started: datetime
    finished: Optional[datetime]

    state: str

    scale: int = 1
    completions: Optional[int] = 0

    stats: Optional[Dict[str, str]]

    files: Optional[List[CrawlFile]]

    tags: Optional[Dict[str, str]]


# ============================================================================
class CrawlCompleteIn(BaseModel):
    """ Completed Crawl Webhook POST message  """

    id: str

    user: str

    filename: str
    size: int
    hash: str

    completed: Optional[bool] = True


# ============================================================================
class CrawlOps:
    """ Crawl Ops """

    # pylint: disable=too-many-arguments
    def __init__(self, mdb, redis_url, crawl_manager, crawl_configs, archives):
        self.crawls = mdb["crawls"]
        self.crawl_manager = crawl_manager
        self.crawl_configs = crawl_configs
        self.archives = archives

        self.redis = None
        asyncio.create_task(self.init_redis(redis_url))

        self.crawl_manager.set_crawl_ops(self)

    async def init_redis(self, redis_url):
        """ init redis async """
        self.redis = await aioredis.from_url(redis_url)

    async def on_handle_crawl_complete(self, msg: CrawlCompleteIn):
        """ Handle completed crawl, add to crawls db collection, also update archive usage """
        crawl, crawl_file = await self.crawl_manager.process_crawl_complete(msg)
        if not crawl:
            print("Not a valid crawl complete msg!", flush=True)
            return

        await self.store_crawl(crawl, crawl_file)

    async def store_crawl(self, crawl: Crawl, crawl_file: CrawlFile = None):
        """Add finished crawl to db, increment archive usage.
        If crawl file provided, update and add file"""
        if crawl_file:
            crawl_update = {
                "$set": crawl.to_dict(exclude={"files", "completions"}),
                "$push": {"files": crawl_file.dict()},
            }

            if crawl.state == "complete":
                crawl_update["$inc"] = {"completions": 1}

            await self.crawls.find_one_and_update(
                {"_id": crawl.id},
                crawl_update,
                upsert=True,
            )

        else:
            try:
                await self.crawls.insert_one(crawl.to_dict())
            except pymongo.errors.DuplicateKeyError:
                # print(f"Crawl Already Added: {crawl.id} - {crawl.state}")
                return False

        dura = int((crawl.finished - crawl.started).total_seconds())

        print(f"Duration: {dura}", flush=True)

        await self.archives.inc_usage(crawl.aid, dura)

        await self.crawl_configs.inc_crawls(crawl.cid)

        return True

    async def list_db_crawls(self, aid: str, cid: str = None):
        """List all finished crawls from the db """
        query = {"aid": aid}
        if cid:
            query["cid"] = cid

        cursor = self.crawls.find(query)
        results = await cursor.to_list(length=1000)
        return [Crawl.from_dict(res) for res in results]

    async def list_crawls(self, aid: str):
        """ list finished and running crawl data """
        running_crawls = await self.crawl_manager.list_running_crawls(aid=aid)

        await self.get_redis_stats(running_crawls)

        finished_crawls = await self.list_db_crawls(aid)

        return {
            "running": [
                crawl.dict(exclude_none=True, exclude_unset=True)
                for crawl in running_crawls
            ],
            "finished": finished_crawls,
        }

    # pylint: disable=too-many-arguments
    async def get_redis_stats(self, crawl_list):
        """ Add additional live crawl stats from redis """
        results = None

        def pairwise(iterable):
            val = iter(iterable)
            return zip(val, val)

        async with self.redis.pipeline(transaction=True) as pipe:
            for crawl in crawl_list:
                key = crawl.id
                pipe.llen(f"{key}:d")
                pipe.scard(f"{key}:s")

            results = await pipe.execute()

        for crawl, (done, total) in zip(crawl_list, pairwise(results)):
            crawl.stats = {"done": done, "found": total}

    async def delete_crawls(self, aid: str, delete_list: DeleteCrawlList):
        """ Delete a list of crawls by id for given archive """
        res = await self.crawls.delete_many(
            {"_id": {"$in": delete_list.crawl_ids}, "aid": aid}
        )
        return res.deleted_count


# ============================================================================
# pylint: disable=too-many-arguments
def init_crawls_api(app, mdb, redis_url, crawl_manager, crawl_config_ops, archives):
    """ API for crawl management, including crawl done callback"""

    ops = CrawlOps(mdb, redis_url, crawl_manager, crawl_config_ops, archives)

    archive_crawl_dep = archives.archive_crawl_dep

    @app.post("/_crawls/done", tags=["_internal"])
    async def crawl_done(msg: CrawlCompleteIn):
        loop = asyncio.get_running_loop()
        loop.create_task(ops.on_handle_crawl_complete(msg))

        return {"success": True}

    @app.get("/archives/{aid}/crawls", tags=["crawls"])
    async def list_crawls(archive: Archive = Depends(archive_crawl_dep)):
        return await ops.list_crawls(archive.id)

    @app.post(
        "/archives/{aid}/crawls/{crawl_id}/cancel",
        tags=["crawls"],
    )
    async def crawl_cancel_immediately(
        crawl_id, archive: Archive = Depends(archive_crawl_dep)
    ):
        crawl = None
        try:
            crawl = await crawl_manager.stop_crawl(crawl_id, archive.id, graceful=False)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Canceling Crawl: {exc}")

        if not crawl:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawl_id}")

        await ops.store_crawl(crawl)

        return {"canceled": True}

    @app.post(
        "/archives/{aid}/crawls/{crawl_id}/stop",
        tags=["crawls"],
    )
    async def crawl_graceful_stop(
        crawl_id, archive: Archive = Depends(archive_crawl_dep)
    ):
        canceled = False
        try:
            canceled = await crawl_manager.stop_crawl(
                crawl_id, archive.id, graceful=True
            )

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Stopping Crawl: {exc}")

        if not canceled:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawl_id}")

        return {"stopped_gracefully": True}

    @app.post("/archives/{aid}/crawls/delete", tags=["crawls"])
    async def delete_crawls(
        delete_list: DeleteCrawlList, archive: Archive = Depends(archive_crawl_dep)
    ):
        try:
            for crawl_id in delete_list:
                await crawl_manager.stop_crawl(crawl_id, archive.id, graceful=False)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Stopping Crawl: {exc}")

        res = await ops.delete_crawls(archive.id, delete_list)

        return {"deleted": res}

    @app.post(
        "/archives/{aid}/crawls/{crawl_id}/scale",
        tags=["crawls"],
    )
    async def scale_crawl(
        scale: CrawlScale, crawl_id, archive: Archive = Depends(archive_crawl_dep)
    ):

        error = await crawl_manager.scale_crawl(crawl_id, archive.id, scale.scale)
        if error:
            raise HTTPException(status_code=400, detail=error)

        return {"scaled": scale.scale}
