""" entrypoint module for operator """

import os
import sys

from fastapi import FastAPI

from .crawlmanager import CrawlManager
from .db import init_db
from .emailsender import EmailSender
from .operator import init_operator_api
from .utils import register_exit_handler

from .invites import InviteOps
from .users import init_user_manager
from .orgs import OrgOps
from .colls import CollectionOps
from .crawlconfigs import CrawlConfigOps
from .crawls import CrawlOps
from .profiles import ProfileOps
from .webhooks import EventWebhookOps

app_root = FastAPI()


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code
def main():
    """main init"""
    email = EmailSender()
    crawl_manager = None

    dbclient, mdb = init_db()

    invite_ops = InviteOps(mdb, email)

    user_manager = init_user_manager(mdb, email, invite_ops)

    org_ops = OrgOps(mdb, invite_ops)

    event_webhook_ops = EventWebhookOps(mdb, org_ops)

    user_manager.set_org_ops(org_ops)

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        print(
            "Sorry, the Browsertrix Cloud Backend must be run inside a Kubernetes environment.\
             Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
        )
        sys.exit(1)

    crawl_manager = CrawlManager()

    profile_ops = ProfileOps(mdb, crawl_manager)

    crawl_config_ops = CrawlConfigOps(
        dbclient,
        mdb,
        user_manager,
        org_ops,
        crawl_manager,
        profile_ops,
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

    init_operator_api(app_root, mdb, crawl_config_ops, event_webhook_ops)


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    register_exit_handler()
    main()
