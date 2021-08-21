""" Crawl API """

import asyncio

from typing import Optional
from datetime import datetime

from db import BaseMongoModel

# ============================================================================
class CrawlComplete(BaseMongoModel):
    """ Store State of Completed Crawls """

    id: str

    user: str
    aid: Optional[str]
    cid: Optional[str]

    filename: str
    size: int
    hash: str

    started: Optional[datetime]
    finished: Optional[datetime]


# ============================================================================
class CrawlOps:
    """ Crawl Ops """

    def __init__(self, mdb, crawl_manager, users, archives):
        self.crawls = mdb["crawls"]
        self.crawl_manager = crawl_manager
        self.users = users
        self.archives = archives

    async def on_handle_crawl_complete(self, msg: CrawlComplete):
        """ Handle completed crawl, add to crawls db collection, also update archive usage """
        if not await self.crawl_manager.validate_crawl_complete(msg):
            print("Not a valid crawl complete msg!", flush=True)
            return

        print(msg, flush=True)
        await self.crawls.insert_one(msg.to_dict())

        dura = int((msg.finished - msg.started).total_seconds())

        print(f"Duration: {dura}", flush=True)
        await self.archives.inc_usage(msg.aid, dura)

    async def delete_crawl(self, cid: str, aid: str):
        """ Delete crawl by id """
        return await self.crawls.delete_one({"_id": cid, "aid": aid})


# ============================================================================
def init_crawls_api(app, mdb, crawl_manager, users, archives):
    """ API for crawl management, including crawl done callback"""

    ops = CrawlOps(mdb, crawl_manager, users, archives)

    @app.post("/crawls/done")
    async def webhook(msg: CrawlComplete):
        loop = asyncio.get_running_loop()
        loop.create_task(ops.on_handle_crawl_complete(msg))

        return {"message": "webhook received"}
