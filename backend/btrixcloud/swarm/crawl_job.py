""" entry point for K8s crawl job which manages the stateful crawl """

import asyncio
import os

from fastapi import FastAPI

from .utils import (
    ping_containers,
    get_service,
    delete_swarm_stack,
    run_swarm_stack,
)

from .base_job import SwarmJobMixin
from ..crawl_job import CrawlJob


app = FastAPI()


# =============================================================================
class SwarmCrawlJob(SwarmJobMixin, CrawlJob):
    """ Crawl Job """

    def _add_extra_crawl_template_params(self, params):
        """ add extra params, if any, for crawl template """
        params["userid"] = os.environ.get("USER_ID")
        params["storage_filename"] = os.environ.get("STORE_FILENAME")
        params["storage_path"] = os.environ.get("STORE_PATH")

    async def _do_scale(self, new_scale):
        loop = asyncio.get_running_loop()

        scale = self._get_scale()

        # if making scale smaller, ensure existing crawlers saved their data
        if new_scale < scale:
            # ping for final exit
            for num in range(scale, new_scale, -1):
                num = num - 1
                service_id = f"crawl-{self.job_id}-{num}_crawler"
                await loop.run_in_executor(None, ping_containers, service_id, "SIGUSR1")

            # delete
            await self._do_delete_replicas(loop, new_scale, scale)

        if new_scale > scale:
            # create new stacks
            params = {}
            params.update(self._cached_params)

            for num in range(scale, new_scale):
                stack_id = f"{self.prefix}{self.job_id}-{num}"
                params["index"] = num
                data = self.templates.env.get_template("crawler.yaml").render(params)
                await loop.run_in_executor(None, run_swarm_stack, stack_id, data)

        return True

    @property
    def redis(self):
        """ get redis service id """
        return f"crawl-{self.job_id}-0_redis"

    def _get_scale(self, crawl=None):
        # return crawl.spec.mode["Replicated"]["Replicas"]
        return self.crawl_updater.scale

    async def _get_crawl(self):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, get_service, f"crawl-{self.job_id}-0_crawler"
        )

    async def _send_shutdown_signal(self, graceful=True):
        loop = asyncio.get_running_loop()

        for num in range(0, self._get_scale()):
            name = f"crawl-{self.job_id}-{num}_crawler"
            sig = "SIGABRT" if not graceful else "SIGINT"
            print(f"Sending {sig} to {name}", flush=True)
            await loop.run_in_executor(None, ping_containers, name, sig)

    # pylint: disable=line-too-long
    @property
    def redis_url(self):
        return f"redis://{self.redis}/0"

    async def _do_create(self, loop, template, params):
        scale = params.get("scale", 1)

        self._cached_params = params

        for num in range(0, scale):
            stack_id = f"{self.prefix}{self.job_id}-{num}"
            params["index"] = num
            data = self.templates.env.get_template(template).render(params)
            await loop.run_in_executor(None, run_swarm_stack, stack_id, data)

    async def _do_delete(self, loop):
        scale = self._get_scale()
        await self._do_delete_replicas(loop, 0, scale)

    async def _do_delete_replicas(self, loop, start, end):
        # volumes = []

        for num in range(end, start, -1):
            num = num - 1
            stack_id = f"{self.prefix}{self.job_id}-{num}"
            await loop.run_in_executor(None, delete_swarm_stack, stack_id)

            # volumes.append(f"crawl-{self.job_id}-{num}")

        # likely fails as containers still shutting down
        # await loop.run_in_executor(None, delete_volumes, volumes)


# ============================================================================
@app.on_event("startup")
async def startup():
    """init on startup"""
    job = SwarmCrawlJob()
    job.register_handlers(app)
