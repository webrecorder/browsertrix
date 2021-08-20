""" Crawl API """

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

    created: Optional[datetime]
    finished: Optional[datetime]


# ============================================================================
def init_crawls_api(app, crawl_manager):
    """ API for crawl management, including crawl done callback"""

    async def on_handle_crawl_complete(msg: CrawlComplete):
        data = await crawl_manager.validate_crawl_data(msg)
        if data:
            print(msg)
        else:
            print("Not a valid crawl complete msg!")

    @app.post("/crawls/done")
    async def webhook(msg: CrawlComplete):
        #background_tasks.add_task(on_handle_crawl_complete, msg)
        #asyncio.ensure_future(on_handle_crawl_complete(msg))
        await on_handle_crawl_complete(msg)
        return {"message": "webhook received"}
