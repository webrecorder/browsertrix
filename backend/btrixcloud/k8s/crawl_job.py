""" entry point for K8s crawl job which manages the stateful crawl """

import asyncio
import sys
import signal
import os

from fastapi import FastAPI

from ..crawl_updater import CrawlUpdater
from .utils import send_signal_to_pods
from .base_job import K8SBaseJob

app = FastAPI()


# =============================================================================
# pylint: disable=too-many-instance-attributes,bare-except,broad-except
class K8SCrawlJob(K8SBaseJob):
    """ Crawl Job State """

    def __init__(self):
        super().__init__()

        self.crawl_id = self.job_id

        self.crawl_updater = CrawlUpdater(self.crawl_id, self)

        # pylint: disable=line-too-long
        self.redis_url = f"redis://redis-{self.crawl_id}-0.redis-{self.crawl_id}.{self.namespace}.svc.cluster.local/0"

        params = {
            "cid": self.crawl_updater.cid,
            "storage_name": self.crawl_updater.storage_name or "default",
            "storage_path": self.crawl_updater.storage_path or "",
            "scale": self.crawl_updater.scale,
            "redis_url": self.redis_url,
            "profile_filename": os.environ.get("PROFILE_FILENAME"),
        }

        self.shutdown_pending = False

        asyncio.create_task(self.async_init("crawler.yaml", params))

    async def async_init(self, template, params):
        """ async init for k8s job """
        statefulset = await self._get_crawl_stateful()
        scale = None

        # if doesn't exist, create
        if not statefulset:
            await self.init_k8s_objects(template, params)
        else:
            scale = statefulset.spec.replicas

        await self.crawl_updater.init_crawl_updater(self.redis_url, scale)

    async def delete_crawl_objects(self):
        """ delete crawl stateful sets, services and pvcs """
        await self.delete_k8s_objects(f"crawl={self.crawl_id}")

    async def scale_to(self, scale):
        """ scale to 'scale' replicas """
        statefulset = await self._get_crawl_stateful()

        if not statefulset:
            print("no stateful")
            return False

        # if making scale smaller, ensure existing crawlers saved their data
        pods = []
        for inx in range(scale, statefulset.spec.replicas):
            pods.append(
                await self.core_api.read_namespaced_pod(
                    name=f"crawl-{self.crawl_id}-{inx}",
                    namespace=self.namespace,
                )
            )

        if pods:
            await send_signal_to_pods(self.core_api_ws, self.namespace, pods, "SIGUSR1")

        statefulset.spec.replicas = scale

        await self.apps_api.patch_namespaced_stateful_set(
            name=statefulset.metadata.name, namespace=self.namespace, body=statefulset
        )

        await self.crawl_updater.update_crawl(scale=scale)

        return True

    async def _get_crawl_stateful(self):
        try:
            return await self.apps_api.read_namespaced_stateful_set(
                name=f"crawl-{self.crawl_id}",
                namespace=self.namespace,
            )
        except:
            return None

    async def shutdown(self, graceful=False):
        """ shutdown crawling, either graceful or immediately"""
        if self.shutdown_pending:
            return False

        self.shutdown_pending = True

        print("Stopping crawl" if graceful else "Canceling crawl", flush=True)

        pods = await self.core_api.list_namespaced_pod(
            namespace=self.namespace,
            label_selector=f"crawl={self.crawl_id},role=crawler",
        )

        await send_signal_to_pods(
            self.core_api_ws,
            self.namespace,
            pods.items,
            "SIGABRT" if not graceful else "SIGINT",
        )

        await self.crawl_updater.stop_crawl(graceful=graceful)

        if not graceful:
            await self.delete_crawl_objects()

        return True


# ============================================================================
@app.on_event("startup")
async def startup():
    """init on startup"""
    job = K8SCrawlJob()

    def sig_handler(sig, *_args):
        if sig == signal.SIGTERM:
            print("got SIGTERM, job not complete, but shutting down", flush=True)
            if not job.shutdown_pending:
                sys.exit(3)

    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, sig_handler)

    @app.post("/scale/{size}")
    async def scale(size: int):
        return {"success": await job.scale_to(size)}

    @app.post("/stop")
    async def stop():
        return {"success": await job.shutdown(graceful=True)}

    @app.post("/cancel")
    async def cancel():
        return {"success": await job.shutdown(graceful=False)}

    @app.get("/healthz")
    async def healthz():
        return {}
