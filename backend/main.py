"""
main file for browsertrix-api system
supports docker and kubernetes based deployments of multiple browsertrix-crawlers
"""

import os

from fastapi import FastAPI, Request, HTTPException

from db import init_db

from emailsender import EmailSender
from users import init_users_api, UserDB
from archives import init_archives_api

from storages import init_storages_api
from crawlconfigs import init_crawl_config_api
from colls import init_collections_api
from crawls import init_crawls_api

app = FastAPI()


# ============================================================================
class BrowsertrixAPI:
    """
    Main class for BrowsertrixAPI
    """

    # pylint: disable=too-many-instance-attributes
    def __init__(self, _app):
        self.app = _app

        self.email = EmailSender()
        self.crawl_manager = None

        self.mdb = init_db()

        self.fastapi_users = init_users_api(
            self.app,
            self.mdb,
            self.email,
        )

        current_active_user = self.fastapi_users.current_user(active=True)

        self.archive_ops = init_archives_api(
            self.app, self.mdb, self.fastapi_users, self.email, current_active_user
        )

        # pylint: disable=import-outside-toplevel
        if os.environ.get("KUBERNETES_SERVICE_HOST"):
            from k8sman import K8SManager

            self.crawl_manager = K8SManager()
        else:
            from dockerman import DockerManager

            self.crawl_manager = DockerManager(self.archive_ops)

        init_storages_api(self.archive_ops, self.crawl_manager, current_active_user)

        self.crawl_config_ops = init_crawl_config_api(
            self.mdb,
            current_active_user,
            self.archive_ops,
            self.crawl_manager,
        )

        self.crawls = init_crawls_api(
            self.app,
            self.mdb,
            os.environ.get("REDIS_URL"),
            self.crawl_manager,
            self.crawl_config_ops,
            self.archive_ops,
        )

        self.coll_ops = init_collections_api(
            self.mdb, self.crawls, self.archive_ops, self.crawl_manager
        )

        self.crawl_config_ops.set_coll_ops(self.coll_ops)

        self.app.include_router(self.archive_ops.router)

        @app.get("/healthz")
        async def healthz():
            return {}


# ============================================================================
@app.on_event("startup")
async def startup():
    """init on startup"""
    BrowsertrixAPI(app)
