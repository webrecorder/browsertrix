"""shared helper to initialize ops classes"""

from typing import Tuple

from .crawlmanager import CrawlManager
from .db import init_db
from .emailsender import EmailSender

from .background_jobs import BackgroundJobOps
from .basecrawls import BaseCrawlOps
from .colls import CollectionOps
from .crawls import CrawlOps
from .crawlconfigs import CrawlConfigOps
from .invites import InviteOps
from .orgs import OrgOps
from .pages import PageOps
from .profiles import ProfileOps
from .storages import StorageOps
from .uploads import UploadOps
from .users import UserManager
from .webhooks import EventWebhookOps


# pylint: disable=too-many-locals
def init_ops() -> Tuple[
    OrgOps,
    CrawlConfigOps,
    BaseCrawlOps,
    CrawlOps,
    UploadOps,
    PageOps,
    CollectionOps,
    ProfileOps,
    StorageOps,
    BackgroundJobOps,
    EventWebhookOps,
    UserManager,
]:
    """Initialize and return ops classes"""
    email = EmailSender()

    dbclient, mdb = init_db()

    invite_ops = InviteOps(mdb, email)

    user_manager = UserManager(mdb, email, invite_ops)

    org_ops = OrgOps(mdb, invite_ops, user_manager)

    event_webhook_ops = EventWebhookOps(mdb, org_ops)

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

    coll_ops = CollectionOps(mdb, storage_ops, org_ops, event_webhook_ops)

    base_crawl_init = (
        mdb,
        user_manager,
        org_ops,
        crawl_config_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
    )

    base_crawl_ops = BaseCrawlOps(*base_crawl_init)

    crawl_ops = CrawlOps(crawl_manager, *base_crawl_init)

    upload_ops = UploadOps(*base_crawl_init)

    page_ops = PageOps(
        mdb, crawl_ops, org_ops, storage_ops, background_job_ops, coll_ops
    )

    base_crawl_ops.set_page_ops(page_ops)
    crawl_ops.set_page_ops(page_ops)
    upload_ops.set_page_ops(page_ops)

    background_job_ops.set_ops(crawl_ops, profile_ops)

    org_ops.set_ops(base_crawl_ops, profile_ops, coll_ops, background_job_ops, page_ops)

    user_manager.set_ops(org_ops, crawl_config_ops, base_crawl_ops)

    background_job_ops.set_ops(base_crawl_ops, profile_ops)

    crawl_config_ops.set_coll_ops(coll_ops)

    coll_ops.set_page_ops(page_ops)

    return (
        org_ops,
        crawl_config_ops,
        base_crawl_ops,
        crawl_ops,
        upload_ops,
        page_ops,
        coll_ops,
        profile_ops,
        storage_ops,
        background_job_ops,
        event_webhook_ops,
        user_manager,
    )
