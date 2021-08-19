"""
main file for browsertrix-api system
supports docker and kubernetes based deployments of multiple browsertrix-crawlers
"""

import os

from fastapi import FastAPI, Request

from db import init_db

from users import init_users_api, UserDB
from archives import init_archives_api
from crawls import init_crawl_config_api


app = FastAPI()


# ============================================================================
class BrowsertrixAPI:
    """
    Main class for BrowsertrixAPI
    """

    # pylint: disable=too-many-instance-attributes
    def __init__(self, _app):
        self.app = _app

        self.default_storage_endpoint_url = os.environ.get(
            "STORE_ENDPOINT_URL", "http://localhost:8010/store-bucket/"
        )

        self.default_storage_access_key = os.environ.get("STORE_ACCESS_KEY", "access")
        self.default_storage_secret_key = os.environ.get("STORE_SECRET_KEY", "secret")

        # pylint: disable=import-outside-toplevel
        if os.environ.get("KUBERNETES_SERVICE_HOST"):
            from k8sman import K8SManager

            self.crawl_manager = K8SManager()
        else:
            from dockerman import DockerManager

            self.crawl_manager = DockerManager()
            # raise Exception("Currently, only running in Kubernetes is supported")

        self.mdb = init_db()

        self.fastapi_users = init_users_api(
            self.app,
            self.mdb,
            self.on_after_register,
            self.on_after_forgot_password,
            self.on_after_verification_request,
        )

        current_active_user = self.fastapi_users.current_user(active=True)

        self.archive_ops = init_archives_api(
            self.app, self.mdb, self.fastapi_users, current_active_user
        )

        self.crawl_config_ops = init_crawl_config_api(
            self.mdb,
            current_active_user,
            self.archive_ops,
            self.crawl_manager,
        )

        self.app.include_router(self.archive_ops.router)

        # @app.get("/")
        # async def root():
        #    return {"message": "Hello World"}

    # pylint: disable=no-self-use, unused-argument
    async def on_after_register(self, user: UserDB, request):
        """callback after registeration"""

        await self.archive_ops.create_new_archive_for_user(
            archive_name="default",
            base_endpoint_url=self.default_storage_endpoint_url,
            access_key=self.default_storage_access_key,
            secret_key=self.default_storage_secret_key,
            user=user,
        )

        print(f"User {user.id} has registered.")

    # pylint: disable=no-self-use, unused-argument
    def on_after_forgot_password(self, user: UserDB, token: str, request: Request):
        """callback after password forgot"""
        print(f"User {user.id} has forgot their password. Reset token: {token}")

    # pylint: disable=no-self-use, unused-argument
    def on_after_verification_request(self, user: UserDB, token: str, request: Request):
        """callback after verification request"""
        print(f"Verification requested for user {user.id}. Verification token: {token}")


# ============================================================================
# app = BrowsertrixAPI().app


@app.on_event("startup")
async def startup():
    """init on startup"""
    BrowsertrixAPI(app)
