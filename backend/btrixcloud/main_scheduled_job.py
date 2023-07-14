""" entrypoint for cron crawl job"""

import asyncio
import os
import uuid

from .k8sapi import K8sAPI
from .db import init_db
from .crawlconfigs import (
    get_crawl_config,
    inc_crawl_count,
    set_config_current_crawl_info,
)
from .crawls import add_new_crawl
from .utils import register_exit_handler


# ============================================================================
class ScheduledJob(K8sAPI):
    """Schedulued Job APIs for starting CrawlJobs on schedule"""

    def __init__(self):
        super().__init__()
        self.cid = os.environ["CID"]

        _, mdb = init_db()
        self.crawls = mdb["crawls"]
        self.crawlconfigs = mdb["crawl_configs"]

    async def run(self):
        """run crawl!"""
        register_exit_handler()

        config_map = await self.core_api.read_namespaced_config_map(
            name=f"crawl-config-{self.cid}", namespace=self.namespace
        )
        data = config_map.data

        userid = data["USER_ID"]
        scale = int(data.get("INITIAL_SCALE", 0))
        try:
            crawl_timeout = int(data.get("CRAWL_TIMEOUT", 0))
        # pylint: disable=bare-except
        except:
            crawl_timeout = 0

        oid = data["ORG_ID"]

        crawlconfig = await get_crawl_config(self.crawlconfigs, uuid.UUID(self.cid))

        # k8s create
        crawl_id = await self.new_crawl_job(
            self.cid, userid, oid, scale, crawl_timeout, manual=False
        )

        # db create
        await inc_crawl_count(self.crawlconfigs, crawlconfig.id)
        new_crawl = await add_new_crawl(
            self.crawls, crawl_id, crawlconfig, uuid.UUID(userid), manual=False
        )
        # pylint: disable=duplicate-code
        await set_config_current_crawl_info(
            self.crawlconfigs.crawl_configs,
            crawlconfig.id,
            new_crawl["id"],
            new_crawl["started"],
        )

        print("Crawl Created: " + crawl_id)


# ============================================================================
def main():
    """main entrypoint"""
    job = ScheduledJob()
    loop = asyncio.get_event_loop()
    loop.run_until_complete(job.run())


if __name__ == "__main__":
    main()
