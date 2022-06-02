""" entry point for K8s crawl job which manages the stateful crawl """

from fastapi import FastAPI

from .utils import send_signal_to_pods
from .base_job import K8SJobMixin

from ..crawl_job import CrawlJob

app = FastAPI()


# =============================================================================
class K8SCrawlJob(K8SJobMixin, CrawlJob):
    """ Crawl Job State """

    async def _do_scale(self, new_scale):
        crawl = await self._get_crawl()
        if not crawl:
            return False

        # if making scale smaller, ensure existing crawlers saved their data
        pods = []
        for inx in range(new_scale, crawl.spec.replicas):
            pods.append(
                await self.core_api.read_namespaced_pod(
                    name=f"crawl-{self.job_id}-{inx}",
                    namespace=self.namespace,
                )
            )

        if pods:
            await send_signal_to_pods(self.core_api_ws, self.namespace, pods, "SIGUSR1")

        crawl.spec.replicas = new_scale

        await self.apps_api.patch_namespaced_stateful_set(
            name=crawl.metadata.name, namespace=self.namespace, body=crawl
        )

        return True

    def _get_scale(self, crawl):
        return crawl.spec.replicas

    async def _get_crawl(self):
        try:
            return await self.apps_api.read_namespaced_stateful_set(
                name=f"crawl-{self.job_id}",
                namespace=self.namespace,
            )
        # pylint: disable=bare-except
        except:
            return None

    async def _send_shutdown_signal(self, graceful=True):
        pods = await self.core_api.list_namespaced_pod(
            namespace=self.namespace,
            label_selector=f"crawl={self.job_id},role=crawler",
        )

        await send_signal_to_pods(
            self.core_api_ws,
            self.namespace,
            pods.items,
            "SIGABRT" if not graceful else "SIGINT",
        )

    # pylint: disable=line-too-long
    @property
    def redis_url(self):
        return f"redis://redis-{self.job_id}-0.redis-{self.job_id}.{self.namespace}.svc.cluster.local/0"


# ============================================================================
@app.on_event("startup")
async def startup():
    """init on startup"""
    job = K8SCrawlJob()
    job.register_handlers(app)
