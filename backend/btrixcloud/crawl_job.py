""" entry point for K8s crawl job which manages the stateful crawl """

import asyncio
import sys
import signal
import os

from abc import ABC, abstractmethod

from .crawl_updater import CrawlUpdater


# =============================================================================
# pylint: disable=too-many-instance-attributes,bare-except,broad-except
class CrawlJob(ABC):
    """ Crawl Job State """

    job_id = None

    def __init__(self):
        super().__init__()

        self.crawl_updater = CrawlUpdater(self.job_id, self)
        self._cached_params = {}

        params = {
            "cid": self.crawl_updater.cid,
            "storage_name": self.crawl_updater.storage_name or "default",
            "storage_path": self.crawl_updater.storage_path or "",
            "redis_url": self.redis_url,
            "profile_filename": os.environ.get("PROFILE_FILENAME"),
        }

        self._add_extra_crawl_template_params(params)

        self.shutdown_pending = False

        asyncio.create_task(self.async_init("crawler.yaml", params))

    async def async_init(self, template, params):
        """ async init for k8s job """
        scale = None
        crawl = await self._get_crawl()

        # if doesn't exist, create, using scale from config
        if not crawl:
            scale = await self.crawl_updater.load_initial_scale()

            params["scale"] = scale
            await self.init_job_objects(template, params)
        else:
            # if already running, get actual scale (which may be different from the one in config)
            scale = self._get_scale(crawl)

        await self.crawl_updater.init_crawl_updater(self.redis_url, scale)

    async def delete_crawl(self):
        """ delete crawl stateful sets, services and pvcs """
        self.shutdown_pending = True

        await self.delete_job_objects(f"crawl={self.job_id}")

    async def scale_to(self, scale):
        """ scale to 'scale' """
        if not await self._do_scale(scale):
            return False

        await self.crawl_updater.update_scale(scale)

        return True

    async def shutdown(self, graceful=False):
        """ shutdown crawling, either graceful or immediately"""
        if self.shutdown_pending:
            return False

        self.shutdown_pending = True

        print("Stopping crawl" if graceful else "Canceling crawl", flush=True)

        await self._send_shutdown_signal(graceful=graceful)

        await self.crawl_updater.stop_crawl(graceful=graceful)

        if not graceful:
            await self.delete_crawl()

        return True

    def register_handlers(self, app):
        """ register signal and app handlers """

        def sig_handler():
            if self.shutdown_pending:
                return

            print("got SIGTERM, job not complete, but shutting down", flush=True)
            sys.exit(3)

        loop = asyncio.get_running_loop()
        loop.add_signal_handler(signal.SIGTERM, sig_handler)

        @app.post("/scale/{size}")
        async def scale(size: int):
            return {"success": await self.scale_to(size)}

        @app.post("/stop")
        async def stop():
            return {"success": await self.shutdown(graceful=True)}

        @app.post("/cancel")
        async def cancel():
            return {"success": await self.shutdown(graceful=False)}

        @app.get("/healthz")
        async def healthz():
            return {}

    def _add_extra_crawl_template_params(self, params):
        """ add extra params, if any, for crawl template """

    @abstractmethod
    async def init_job_objects(self, template, params):
        """ base for creating objects """

    @abstractmethod
    async def delete_job_objects(self, job_id):
        """ base for deleting objects """

    @abstractmethod
    async def _get_crawl(self):
        """ get runnable object represnting this crawl """

    @abstractmethod
    def _get_scale(self, crawl):
        """ return current scale """

    @abstractmethod
    async def _do_scale(self, new_scale):
        """ set number of replicas """

    @abstractmethod
    async def _send_shutdown_signal(self, graceful=True):
        """ shutdown crawl """

    @property
    @abstractmethod
    def redis_url(self):
        """ get redis url """
