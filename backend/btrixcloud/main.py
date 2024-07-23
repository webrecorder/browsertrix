"""
main file for browsertrix-api system
supports docker and kubernetes based deployments of multiple browsertrix-crawlers
"""

import os
import asyncio
import sys

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.routing import APIRouter

from fastapi.openapi.utils import get_openapi
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from pydantic import BaseModel

from .db import init_db, await_db_and_migrations, update_and_prepare_db

from .emailsender import EmailSender
from .invites import init_invites
from .auth import JWT_TOKEN_LIFETIME
from .users import init_users_api, init_user_manager
from .orgs import init_orgs_api

from .profiles import init_profiles_api

from .storages import init_storages_api
from .uploads import init_uploads_api
from .crawlconfigs import init_crawl_config_api
from .colls import init_collections_api
from .crawls import init_crawls_api
from .basecrawls import init_base_crawls_api
from .webhooks import init_event_webhooks_api
from .background_jobs import init_background_jobs_api
from .pages import init_pages_api
from .subs import init_subs_api

from .crawlmanager import CrawlManager
from .utils import run_once_lock, register_exit_handler, is_bool
from .version import __version__

API_PREFIX = "/api"

OPENAPI_URL = API_PREFIX + "/openapi.json"

app_root = FastAPI(docs_url=None, redoc_url=None, OPENAPI_URL=OPENAPI_URL)

db_inited = {"inited": False}


tags = [
    "crawlconfigs",
    "crawls",
    "settings",
    "auth",
    "users",
    "organizations",
    "profiles",
    "uploads",
    "all-crawls",
    "qa",
    "pages",
    "collections",
    "webhooks",
    "jobs",
    "invites",
    "subscriptions",
]


# ============================================================================
def make_schema():
    """make custom openapi schema"""
    schema = get_openapi(
        title="Browsertrix",
        description="""\
The Browsertrix API provides access to all aspects of the Browsertrix app.

See [https://docs.browsertrix.com/](https://docs.browsertrix.com/) for more info on deploying Browsertrix\
        """,
        summary="Browsertrix Crawling System API",
        version=__version__,
        terms_of_service="http://browsertrix.com/terms",
        contact={
            "name": "Browsertrix",
            "url": "https://browsertrix.com/",
            "email": "info@webrecorder.net",
        },
        license_info={
            "name": "AGPL v3",
            "url": "https://www.gnu.org/licenses/agpl-3.0.en.html",
        },
        routes=app_root.routes,
        webhooks=app_root.webhooks.routes,
        tags=[{"name": tag} for tag in tags],
    )
    schema["info"]["x-logo"] = {"url": "/docs-logo.svg"}
    return schema


# ============================================================================
class SettingsResponse(BaseModel):
    """/api/settings response model"""

    registrationEnabled: bool

    jwtTokenLifetime: int

    defaultBehaviorTimeSeconds: int
    defaultPageLoadTimeSeconds: int

    maxPagesPerCrawl: int
    maxScale: int

    billingEnabled: bool

    salesEmail: str = ""
    supportEmail: str = ""


# ============================================================================
# pylint: disable=too-many-locals, duplicate-code
def main() -> None:
    """init browsertrix api"""

    app = APIRouter()

    email = EmailSender()
    crawl_manager = None

    dbclient, mdb = init_db()

    settings = SettingsResponse(
        registrationEnabled=is_bool(os.environ.get("REGISTRATION_ENABLED")),
        jwtTokenLifetime=JWT_TOKEN_LIFETIME,
        defaultBehaviorTimeSeconds=int(
            os.environ.get("DEFAULT_BEHAVIOR_TIME_SECONDS", 300)
        ),
        defaultPageLoadTimeSeconds=int(
            os.environ.get("DEFAULT_PAGE_LOAD_TIME_SECONDS", 120)
        ),
        maxPagesPerCrawl=int(os.environ.get("MAX_PAGES_PER_CRAWL", 0)),
        maxScale=int(os.environ.get("MAX_CRAWL_SCALE", 3)),
        billingEnabled=is_bool(os.environ.get("BILLING_ENABLED")),
        salesEmail=os.environ.get("SALES_EMAIL", ""),
        supportEmail=os.environ.get("EMAIL_SUPPORT", ""),
    )

    invites = init_invites(mdb, email)

    user_manager = init_user_manager(mdb, email, invites)

    current_active_user, shared_secret_or_active_user = init_users_api(
        app, user_manager
    )

    org_ops = init_orgs_api(
        app,
        mdb,
        user_manager,
        invites,
        current_active_user,
    )

    init_subs_api(app, mdb, org_ops, user_manager, shared_secret_or_active_user)

    event_webhook_ops = init_event_webhooks_api(mdb, org_ops, app_root)

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        print(
            "Sorry, the Browsertrix Backend must be run inside a Kubernetes environment.\
             Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
        )
        sys.exit(1)

    crawl_manager = CrawlManager()

    storage_ops = init_storages_api(org_ops, crawl_manager)

    background_job_ops = init_background_jobs_api(
        app,
        mdb,
        email,
        user_manager,
        org_ops,
        crawl_manager,
        storage_ops,
        current_active_user,
    )

    profiles = init_profiles_api(
        mdb,
        org_ops,
        crawl_manager,
        storage_ops,
        background_job_ops,
        current_active_user,
    )

    crawl_config_ops = init_crawl_config_api(
        dbclient,
        mdb,
        current_active_user,
        user_manager,
        org_ops,
        crawl_manager,
        profiles,
    )

    coll_ops = init_collections_api(app, mdb, org_ops, storage_ops, event_webhook_ops)

    base_crawl_init = (
        app,
        current_active_user,
        # to basecrawls
        mdb,
        user_manager,
        org_ops,
        crawl_config_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
    )

    base_crawl_ops = init_base_crawls_api(*base_crawl_init)

    crawls = init_crawls_api(crawl_manager, *base_crawl_init)

    page_ops = init_pages_api(
        app, mdb, crawls, org_ops, storage_ops, current_active_user
    )

    base_crawl_ops.set_page_ops(page_ops)
    crawls.set_page_ops(page_ops)

    init_uploads_api(*base_crawl_init)

    org_ops.set_ops(base_crawl_ops, profiles, coll_ops)

    user_manager.set_ops(org_ops, crawl_config_ops, base_crawl_ops)

    background_job_ops.set_ops(base_crawl_ops, profiles)

    crawl_config_ops.set_coll_ops(coll_ops)

    # run only in first worker
    if run_once_lock("btrix-init-db"):
        asyncio.create_task(
            update_and_prepare_db(
                mdb,
                user_manager,
                org_ops,
                crawls,
                crawl_config_ops,
                coll_ops,
                invites,
                storage_ops,
                page_ops,
                db_inited,
            )
        )
    else:
        asyncio.create_task(await_db_and_migrations(mdb, db_inited))

    app.include_router(org_ops.router)

    @app.get("/settings", tags=["settings"], response_model=SettingsResponse)
    async def get_settings() -> SettingsResponse:
        if not db_inited.get("inited"):
            raise HTTPException(status_code=503, detail="not_ready_yet")
        return settings

    # internal routes
    @app.get("/openapi.json", include_in_schema=False)
    async def openapi() -> JSONResponse:
        return JSONResponse(app_root.openapi())

    # Used for startup
    # Returns 200 only when db is available + migrations are done
    @app_root.get("/healthzStartup", include_in_schema=False)
    async def healthz_startup():
        if not db_inited.get("inited"):
            raise HTTPException(status_code=503, detail="not_ready_yet")
        return {}

    # Used for readiness + liveness
    # Always returns 200 while running
    @app_root.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}

    app_root.include_router(app, prefix=API_PREFIX)

    # API Configurations -- needed to provide custom favicon
    @app_root.get(API_PREFIX + "/docs", include_in_schema=False)
    def overridden_swagger():
        return get_swagger_ui_html(
            openapi_url=OPENAPI_URL,
            title="Browsertrix API",
            swagger_favicon_url="/favicon.ico",
        )

    @app_root.get(API_PREFIX + "/redoc", include_in_schema=False)
    def overridden_redoc():
        return get_redoc_html(
            openapi_url=OPENAPI_URL,
            title="Browsertrix API",
            redoc_favicon_url="/favicon.ico",
        )

    def get_api_schema():
        if not app_root.openapi_schema:
            app_root.openapi_schema = make_schema()

        return app_root.openapi_schema

    app_root.openapi = get_api_schema  # type: ignore


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    register_exit_handler()
    main()
