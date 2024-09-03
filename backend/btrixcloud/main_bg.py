""" entrypoint module for background jobs """

import asyncio
import os
import sys
import traceback
from uuid import UUID

from .crawlmanager import CrawlManager
from .db import init_db
from .emailsender import EmailSender

# from .utils import register_exit_handler
from .models import BgJobType

from .basecrawls import BaseCrawlOps
from .invites import InviteOps
from .users import init_user_manager
from .orgs import OrgOps
from .colls import CollectionOps
from .crawlconfigs import CrawlConfigOps
from .crawls import CrawlOps
from .profiles import ProfileOps
from .storages import StorageOps
from .webhooks import EventWebhookOps
from .background_jobs import BackgroundJobOps
from .pages import PageOps

job_type = os.environ.get("BG_JOB_TYPE")
oid = os.environ.get("OID")


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code, too-many-locals
async def main():
    """main init"""
    email = EmailSender()
    crawl_manager = None

    dbclient, mdb = init_db()

    invite_ops = InviteOps(mdb, email)

    user_manager = init_user_manager(mdb, email, invite_ops)

    org_ops = OrgOps(mdb, invite_ops, user_manager)

    event_webhook_ops = EventWebhookOps(mdb, org_ops)

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        print(
            "Sorry, the Browsertrix Backend must be run inside a Kubernetes environment.\
             Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
        )
        sys.exit(1)

    crawl_manager = CrawlManager()

    storage_ops = StorageOps(org_ops, crawl_manager)

    background_job_ops = BackgroundJobOps(
        mdb, email, user_manager, org_ops, crawl_manager, storage_ops
    )

    profile_ops = ProfileOps(
        mdb, org_ops, crawl_manager, storage_ops, background_job_ops
    )

    crawl_config_ops = CrawlConfigOps(
        dbclient,
        mdb,
        user_manager,
        org_ops,
        crawl_manager,
        profile_ops,
    )

    user_manager.set_ops(org_ops, crawl_config_ops, None)

    coll_ops = CollectionOps(mdb, crawl_manager, org_ops, event_webhook_ops)

    base_crawl_ops = BaseCrawlOps(
        mdb,
        user_manager,
        org_ops,
        crawl_config_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
    )

    crawl_ops = CrawlOps(
        crawl_manager,
        mdb,
        user_manager,
        org_ops,
        crawl_config_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
    )

    page_ops = PageOps(mdb, crawl_ops, org_ops, storage_ops)

    crawl_ops.set_page_ops(page_ops)

    background_job_ops.set_ops(crawl_ops, profile_ops)

    org_ops.set_ops(base_crawl_ops, profile_ops, coll_ops, background_job_ops)

    # Refactor, improve error handling
    if job_type == BgJobType.DELETE_REPLICA:
        if not oid:
            return
        org = await org_ops.get_org_by_id(UUID(oid))
        if not org:
            return

        try:
            await org_ops.delete_org_and_data(org, user_manager)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            traceback.print_exc()
            return 1

    print(f"Provided job type {job_type} not currently supported")
    return 1


# # ============================================================================
if __name__ == "__main__":
    asyncio.run(main())
