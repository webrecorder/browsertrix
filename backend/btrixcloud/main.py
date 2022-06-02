"""
main file for browsertrix-api system
supports docker and kubernetes based deployments of multiple browsertrix-crawlers
"""

import os
import signal
import sys
import asyncio

from fastapi import FastAPI
from fastapi.routing import APIRouter
from fastapi.responses import JSONResponse

from .db import init_db

from .emailsender import EmailSender
from .invites import init_invites
from .users import init_users_api, init_user_manager, JWT_TOKEN_LIFETIME
from .archives import init_archives_api

from .profiles import init_profiles_api

from .storages import init_storages_api
from .crawlconfigs import init_crawl_config_api
from .colls import init_collections_api
from .crawls import init_crawls_api


API_PREFIX = "/api"
app_root = FastAPI(
    docs_url=API_PREFIX + "/docs",
    redoc_url=API_PREFIX + "/redoc",
    openapi_url=API_PREFIX + "/openapi.json",
)


# ============================================================================
# pylint: disable=too-many-locals
def main():
    """ init browsertrix cloud api """

    app = APIRouter()

    email = EmailSender()
    crawl_manager = None

    dbclient, mdb = init_db()

    settings = {
        "registrationEnabled": os.environ.get("REGISTRATION_ENABLED") == "1",
        "jwtTokenLifetime": JWT_TOKEN_LIFETIME,
    }

    invites = init_invites(mdb, email)

    user_manager = init_user_manager(mdb, email, invites)

    fastapi_users = init_users_api(app, user_manager)

    current_active_user = fastapi_users.current_user(active=True)

    archive_ops = init_archives_api(
        app, mdb, user_manager, invites, current_active_user
    )

    user_manager.set_archive_ops(archive_ops)

    # pylint: disable=import-outside-toplevel
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        from .k8s.k8sman import K8SManager

        crawl_manager = K8SManager()
    else:
        # from .docker.dockerman import DockerManager
        # crawl_manager = DockerManager(archive_ops)
        from .swarm.swarmmanager import SwarmManager

        crawl_manager = SwarmManager()

    init_storages_api(archive_ops, crawl_manager, current_active_user)

    profiles = init_profiles_api(mdb, crawl_manager, archive_ops, current_active_user)

    crawl_config_ops = init_crawl_config_api(
        dbclient,
        mdb,
        current_active_user,
        user_manager,
        archive_ops,
        crawl_manager,
        profiles,
    )

    crawls = init_crawls_api(
        app,
        mdb,
        user_manager,
        crawl_manager,
        crawl_config_ops,
        archive_ops,
        current_active_user,
    )

    coll_ops = init_collections_api(mdb, crawls, archive_ops, crawl_manager)

    crawl_config_ops.set_coll_ops(coll_ops)

    app.include_router(archive_ops.router)

    @app.get("/settings")
    async def get_settings():
        return settings

    # internal routes

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi() -> JSONResponse:
        return JSONResponse(app_root.openapi())

    @app_root.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}

    app_root.include_router(app, prefix=API_PREFIX)


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, exit_handler)

    main()


def exit_handler():
    """ sigterm handler """
    print("SIGTERM received, exiting")
    sys.exit(1)
