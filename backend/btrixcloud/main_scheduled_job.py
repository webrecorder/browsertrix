""" entrypoint for cron crawl job"""

import asyncio
import os
import uuid

from .k8sapi import K8sAPI
from .db import init_db
from .crawlconfigs import (
    get_crawl_config,
    inc_crawl_count,
)
from .crawls import add_new_crawl
from .emailsender import EmailSender
from .invites import InviteOps
from .users import init_user_manager
from .orgs import OrgOps
from .colls import CollectionOps
from .crawlconfigs import CrawlConfigOps
from .crawls import CrawlOps
from .profiles import ProfileOps
from .webhooks import EventWebhookOps
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

        invite_ops = InviteOps(mdb, email)

        user_manager = init_user_manager(mdb, email, invite_ops)

        org_ops = OrgOps(mdb, invite_ops)

        event_webhook_ops = EventWebhookOps(mdb, org_ops)

        user_manager.set_org_ops(org_ops)

        crawl_manager = CrawlManager()

        profile_ops = ProfileOps(mdb, crawl_manager)

        crawl_config_ops = CrawlConfigOps(
            dbclient,
            mdb,
            user_manager,
            org_ops,
            crawl_manager,
            profile_ops,
            event_webhook_ops,
        )

        coll_ops = CollectionOps(mdb, crawl_manager, org_ops, event_webhook_ops)

        CrawlOps(
            mdb,
            user_manager,
            crawl_manager,
            crawl_config_ops,
            org_ops,
            coll_ops,
            event_webhook_ops,
        )

        self.event_webhook_ops = EventWebhookOps(mdb, org_ops)

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

        asyncio.create_task(
            self.event_webhook_ops.create_crawl_started_notification(
                crawl_id, crawlconfig.oid, scheduled=True
            )
        )

        # db create
        await inc_crawl_count(self.crawlconfigs, crawlconfig.id)
        await add_new_crawl(
            self.crawls,
            self.crawlconfigs,
            crawl_id,
            crawlconfig,
            uuid.UUID(userid),
            manual=False,
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
