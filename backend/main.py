"""
main file for browsertrix-api system
supports docker and kubernetes based deployments of multiple browsertrix-crawlers
"""

import os

from fastapi import FastAPI

from db import init_db

from emailsender import EmailSender
from users import init_users_api, init_user_manager
from archives import init_archives_api

from storages import init_storages_api
from crawlconfigs import init_crawl_config_api
from colls import init_collections_api
from crawls import init_crawls_api

app = FastAPI()


# ============================================================================
def main():
    """ init browsertrix cloud api """

    email = EmailSender()
    crawl_manager = None

    mdb = init_db()

    user_manager = init_user_manager(mdb, email)

    fastapi_users = init_users_api(app, user_manager)

    current_active_user = fastapi_users.current_user(active=True)

    archive_ops = init_archives_api(app, mdb, user_manager, email, current_active_user)

    user_manager.set_archive_ops(archive_ops)

    # pylint: disable=import-outside-toplevel
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        from k8sman import K8SManager

        crawl_manager = K8SManager()
    else:
        from dockerman import DockerManager

        crawl_manager = DockerManager(archive_ops)

    init_storages_api(archive_ops, crawl_manager, current_active_user)

    crawl_config_ops = init_crawl_config_api(
        mdb,
        current_active_user,
        archive_ops,
        crawl_manager,
    )

    crawls = init_crawls_api(
        app,
        mdb,
        os.environ.get("REDIS_URL"),
        crawl_manager,
        crawl_config_ops,
        archive_ops,
    )

    coll_ops = init_collections_api(mdb, crawls, archive_ops, crawl_manager)

    crawl_config_ops.set_coll_ops(coll_ops)

    app.include_router(archive_ops.router)

    @app.get("/healthz")
    async def healthz():
        return {}


# ============================================================================
@app.on_event("startup")
async def startup():
    """init on startup"""
    main()
