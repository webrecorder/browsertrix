""" entry point for K8s crawl job which manages the stateful crawl """

from fastapi import FastAPI

from .utils import send_signal_to_pods
from .base_job import K8SJobMixin

from ..crawl_job import CrawlJob

app = FastAPI()


# =============================================================================
class K8SCrawlJob(K8SJobMixin, CrawlJob):
    """Crawl Job State"""

    async def _do_scale(self, new_scale):
        crawl = await self._get_crawl()
        if not crawl:
            raise RuntimeError("crawl_not_found")

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
            await send_signal_to_pods(self.core_api_ws, self.namespace, pods, "SIGUSR2")

        crawl.spec.replicas = new_scale

        await self.apps_api.patch_namespaced_stateful_set(
            name=crawl.metadata.name, namespace=self.namespace, body=crawl
        )

    async def load_initial_scale(self, crawl=None):
        """load scale from crawl, if available"""
        if crawl:
            return crawl.spec.replicas

        return await super().load_initial_scale()

    async def _change_crawl_config(self, cid):
        """patch existing crawl statefulset to use new crawlconfig id
        this will cause the crawl to restart with new config"""
        patch_config = {
            "spec": {
                "template": {
                    "spec": {
                        "volumes": [
                            {
                                "name": "crawl-config",
                                "configMap": {"name": f"crawl-config-{cid}"},
                            }
                        ]
                    }
                }
            }
        }

        await self.apps_api.patch_namespaced_stateful_set(
            name=f"crawl-{self.job_id}", namespace=self.namespace, body=patch_config
        )

        return {"success": True}

    async def _get_crawl(self):
        try:
            return await self.apps_api.read_namespaced_stateful_set(
                name=f"crawl-{self.job_id}",
                namespace=self.namespace,
            )
        # pylint: disable=bare-except
        except:
            return None

    async def _send_shutdown_signal(self, signame):
        pods = await self.core_api.list_namespaced_pod(
            namespace=self.namespace,
            label_selector=f"crawl={self.job_id},role=crawler",
        )

        return await send_signal_to_pods(
            self.core_api_ws, self.namespace, pods.items, signame
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
