""" entry point for K8s crawl job which manages the stateful crawl """

import asyncio

from fastapi import FastAPI

from .utils import get_runner

from .base_job import SwarmJobMixin
from ..crawl_job import CrawlJob


app = FastAPI()

runner = get_runner()


# =============================================================================
class SwarmCrawlJob(SwarmJobMixin, CrawlJob):
    """ Crawl Job """

    async def _do_scale(self, new_scale):
        loop = asyncio.get_running_loop()

        # if making scale smaller, ensure existing crawlers saved their data
        if new_scale < self.scale:
            # ping for final exit
            for num in range(self.scale, new_scale, -1):
                num = num - 1
                service_id = f"crawl-{self.job_id}-{num}_crawler"
                await loop.run_in_executor(
                    None, runner.ping_containers, service_id, "SIGUSR1"
                )

            # delete
            await self._do_delete_replicas(loop, new_scale, self.scale)

        if new_scale > self.scale:
            # create new stacks
            params = {}
            params.update(self._cached_params)

            for num in range(self.scale, new_scale):
                stack_id = f"{self.prefix}{self.job_id}-{num}"
                params["index"] = num
                data = self.templates.env.get_template("crawler.yaml").render(params)
                await loop.run_in_executor(
                    None, runner.run_service_stack, stack_id, data
                )

    async def _get_crawl(self):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, runner.get_service, f"crawl-{self.job_id}-0_crawler"
        )

    async def _send_shutdown_signal(self, signame):
        loop = asyncio.get_running_loop()
        count = 0

        for num in range(0, self.scale):
            name = f"crawl-{self.job_id}-{num}_crawler"
            print(f"Sending {signame} to {name}", flush=True)
            count += await loop.run_in_executor(
                None, runner.ping_containers, name, signame
            )

        # for now, assume success if at least 1 container is signaled
        # count may not equal scale as not all containers may have launched yet
        return count >= 1

    # pylint: disable=line-too-long
    @property
    def redis_url(self):
        return f"redis://crawl-{self.job_id}-0_redis/0"

    async def _do_create(self, loop, template, params):
        scale = params.get("scale", 1)

        self._cached_params = params

        for num in range(0, scale):
            stack_id = f"{self.prefix}{self.job_id}-{num}"
            params["index"] = num
            data = self.templates.env.get_template(template).render(params)
            await loop.run_in_executor(None, runner.run_service_stack, stack_id, data)

    async def _do_delete(self, loop):
        await self._do_delete_replicas(loop, 0, self.scale)

    async def _do_delete_replicas(self, loop, start, end):
        # volumes = []

        for num in range(end, start, -1):
            num = num - 1
            stack_id = f"{self.prefix}{self.job_id}-{num}"
            await loop.run_in_executor(None, runner.delete_service_stack, stack_id)

            # volumes.append(f"crawl-{self.job_id}-{num}")

        # likely fails as containers still shutting down
        # await loop.run_in_executor(None, delete_volumes, volumes)


# ============================================================================
@app.on_event("startup")
async def startup():
    """init on startup"""
    job = SwarmCrawlJob()
    job.register_handlers(app)
