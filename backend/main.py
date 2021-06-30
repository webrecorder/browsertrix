"""
main file for browsertrix-api system
supports docker and kubernetes based deployments of multiple browsertrix-crawlers
"""

#import logging
import os
#import sys
#import json
#import asyncio

from fastapi import FastAPI, Request
#from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates



from users import init_users_api, UserDB
from db import init_db
from storages import init_storages_api
from crawls import init_crawl_config_api


# ============================================================================
class BrowsertrixAPI:
    """
    Main class for BrowsertrixAPI
    """
    # pylint: disable=too-many-instance-attributes
    def __init__(self):
        self.default_storage = os.environ.get(
            "DEFAULT_STORAGE", "http://localhost:8010/store-bucket/"
        )

        self.app = FastAPI()

        #self.app.mount("/static", StaticFiles(directory="static"), name="static")

        #self.templates = Jinja2Templates(directory="templates")
        self.mdb = init_db()

        self.fastapi_users = init_users_api(
            self.app,
            self.mdb,
            self.on_after_register,
            self.on_after_forgot_password,
            self.on_after_verification_request,
        )

        current_active_user = self.fastapi_users.current_user(active=True)

        self.storage_ops = init_storages_api(self.app, self.mdb, current_active_user)

        self.crawl_config_ops = init_crawl_config_api(
            self.app, self.mdb, current_active_user
        )
        self.crawler_image = os.environ.get("CRAWLER_IMAGE")

        # self.crawl_manager = CrawlManager()

        # @app.get("/")
        # async def root():
        #    return {"message": "Hello World"}

    # pylint: disable=no-self-use, unused-argument
    async def on_after_register(self, user: UserDB, request):
        """ callback after registeration"""
        await self.storage_ops.create_storage_for_user(self.default_storage, user)
        print(f"User {user.id} has registered.")

    # pylint: disable=no-self-use, unused-argument
    def on_after_forgot_password(self, user: UserDB, token: str, request: Request):
        """ callback after password forgot"""
        print(f"User {user.id} has forgot their password. Reset token: {token}")

    # pylint: disable=no-self-use, unused-argument
    def on_after_verification_request(self, user: UserDB, token: str, request: Request):
        """ callback after verification request"""
        print(f"Verification requested for user {user.id}. Verification token: {token}")


# ============================================================================
app = BrowsertrixAPI().app
