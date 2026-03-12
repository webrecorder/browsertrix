"""Operator handler for Dedupe Index Import Job"""

from .models import (
    MCBaseRequest,
    MCDecoratorSyncData,
    MCDecoratorSyncResponse,
    BTRIX_API,
    CMAP,
)
from .baseoperator import BaseOperator


# ============================================================================
class CollIndexImportJobOperator(BaseOperator):
    """Index Import Job Operator"""

    def init_routes(self, app):
        """init routes for this operator"""

        # nop, but needed for metacontroller
        @app.post("/op/dedupe-import-job/sync")
        async def mc_sync_job(data: MCDecoratorSyncData):
            return await self.sync_job(data)

        @app.post("/op/dedupe-import-job/customize")
        async def mc_customize_job(data: MCBaseRequest):
            return await self.customize_job(data)

    # pylint: disable=duplicate-code
    async def customize_job(self, data: MCBaseRequest):
        """get related resources"""
        labels = data.parent["metadata"]["labels"]
        oid = labels.get("oid")
        coll_id = labels.get("coll")

        related_resources = [
            {
                "apiVersion": BTRIX_API,
                "resource": "collindexes",
                "labelSelector": {
                    "matchLabels": {
                        "oid": oid,
                        "role": "collindex",
                        "coll": coll_id,
                    }
                },
            }
        ]
        return {"relatedResources": related_resources}

    async def sync_job(self, data: MCDecoratorSyncData):
        """sync api"""
        labels = data.object["metadata"]["labels"]
        oid = labels.get("oid")
        coll_id = labels.get("coll")
        name = data.object["metadata"]["name"]

        if name.startswith("purge-"):
            allowed_states: tuple[str, ...] = ("ready", "purging")
        else:
            allowed_states = ("ready", "importing", "crawling")

        attachments = []

        configmap = data.attachments[CMAP].get(name)

        index_ready = await self.ensure_coll_index_ready(
            data, coll_id, oid, allowed_states
        )

        # keep configmap if exists or add only if index is ready
        if configmap or index_ready:
            attachments = self.create_configmap(coll_id, name)

        # delete succeeded job
        if data.object.get("status", {}).get("succeeded", 0) >= 1:
            self.run_task(self.k8s.delete_job(name))
            attachments = []

        return MCDecoratorSyncResponse(attachments=attachments)

    def create_configmap(self, coll_id: str, name: str) -> list[str]:
        """create configmap as a semaphore for when job is ready. no actual data"""
        params = {}
        params["name"] = name
        params["namespace"] = self.k8s.shared_params["namespace"]
        params["id"] = coll_id

        return self.load_from_yaml("index-import-configmap.yaml", params)
