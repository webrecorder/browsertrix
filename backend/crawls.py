""" Crawl API """

import asyncio

from typing import Optional
from datetime import datetime

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from db import BaseMongoModel
from archives import Archive


# ============================================================================
class CrawlFinished(BaseMongoModel):
    """ Store State of Finished Crawls """

    user: str
    aid: str
    cid: str

    started: datetime
    finished: datetime

    state: str

    filename: Optional[str]
    size: Optional[int]
    hash: Optional[str]


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

    def __init__(self, mdb, crawl_manager, archives):
        self.crawls = mdb["crawls"]
        self.crawl_manager = crawl_manager
        self.archives = archives

    async def on_handle_crawl_complete(self, msg: CrawlCompleteIn):
        """ Handle completed crawl, add to crawls db collection, also update archive usage """
        crawl_finished = await self.crawl_manager.validate_crawl_complete(msg)
        if not crawl_finished:
            print("Not a valid crawl complete msg!", flush=True)
            return

        await self.handle_finished(crawl_finished)

    async def handle_finished(self, crawl_finished: CrawlFinished):
        """ Add finished crawl to db, increment archive usage """
        await self.crawls.insert_one(crawl_finished.to_dict())

        print(crawl_finished)

        dura = int((crawl_finished.finished - crawl_finished.started).total_seconds())

        print(f"Duration: {dura}", flush=True)
        await self.archives.inc_usage(crawl_finished.aid, dura)

    async def delete_crawl(self, cid: str, aid: str):
        """ Delete crawl by id """
        return await self.crawls.delete_one({"_id": cid, "aid": aid})


# ============================================================================
def init_crawls_api(app, mdb, crawl_manager, archives):
    """ API for crawl management, including crawl done callback"""

    ops = CrawlOps(mdb, crawl_manager, archives)

    archive_crawl_dep = archives.archive_crawl_dep

    @app.post("/crawls/done", tags=["crawls"])
    async def crawl_done(msg: CrawlCompleteIn):
        loop = asyncio.get_running_loop()
        loop.create_task(ops.on_handle_crawl_complete(msg))

        return {"success": True}

    @app.delete(
        "/archives/{aid}/crawls/{crawl_id}",
        tags=["crawls"],
    )
    async def crawl_delete_stop(crawl_id, archive: Archive = Depends(archive_crawl_dep)):
        try:
            crawl_finished = await crawl_manager.stop_crawl(
                crawl_id, str(archive.id)
            )
            if not crawl_finished:
                raise HTTPException(
                    status_code=404, detail=f"Crawl not found: {crawl_id}"
                )

            await ops.handle_finished(crawl_finished)
        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Canceling Crawl: {exc}")

        return {"canceled": True}

    @app.post(
        "/archives/{aid}/crawls/{crawl_id}/stop",
        tags=["crawls"],
    )
    async def crawl_graceful_stop(
        crawl_id, archive: Archive = Depends(archive_crawl_dep)
    ):
        try:
            canceled = await crawl_manager.stop_crawl_graceful(
                crawl_id, str(archive.id)
            )
            if not canceled:
                raise HTTPException(
                    status_code=404, detail=f"Crawl not found: {crawl_id}"
                )

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Canceling Crawl: {exc}")

        return {"stopped_gracefully": True}
