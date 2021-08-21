""" Crawl API """

import asyncio

from typing import Optional
from datetime import datetime

from pydantic import BaseModel


# ============================================================================
class CrawlComplete(BaseModel):
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
def init_crawls_api(app, crawl_manager, users, archives):
    """ API for crawl management, including crawl done callback"""

    async def on_handle_crawl_complete(msg: CrawlComplete):
        if not await crawl_manager.validate_crawl_complete(msg):
            print("Not a valid crawl complete msg!", flush=True)
            return

        print(msg, flush=True)

        dura = int((msg.finished - msg.started).total_seconds())

        print(f"Duration: {dura}", flush=True)
        await users.inc_usage(msg.user, dura)
        await archives.inc_usage(msg.aid, dura)

    @app.post("/crawls/done")
    async def webhook(msg: CrawlComplete):
        # background_tasks.add_task(on_handle_crawl_complete, msg)
        # asyncio.ensure_future(on_handle_crawl_complete(msg))

        loop = asyncio.get_running_loop()
        loop.create_task(on_handle_crawl_complete(msg))

        # await on_handle_crawl_complete(msg)
        return {"message": "webhook received"}
