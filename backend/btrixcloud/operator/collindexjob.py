"""Operator handler for Dedupe Index Import Job"""

from uuid import UUID

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

        # keep configmap if already exists, or add if index is ready
        if configmap or index_ready:
            attachments = await self.load_import_configmap(
                coll_id, name, oid, configmap
            )

        # delete succeeded job
        if data.object.get("status", {}).get("succeeded", 0) >= 1:
            self.run_task(self.k8s.delete_job(name))
            attachments = []

        return MCDecoratorSyncResponse(attachments=attachments)

    async def load_import_configmap(self, coll_id: str, name: str, oid: str, configmap):
        """create configmap for import job, lookup resources only on first init"""
        # pylint: disable=duplicate-code
        if configmap and not self.is_configmap_update_needed("config.json", configmap):
            metadata = configmap["metadata"]
            configmap["metadata"] = {
                "name": metadata["name"],
                "namespace": metadata["namespace"],
                "labels": metadata["labels"],
            }
            return [configmap]

        replay_list = await self.coll_ops.get_internal_replay_list(
            UUID(coll_id), UUID(oid)
        )

        params = {}
        params["name"] = name
        params["namespace"] = self.k8s.shared_params["namespace"]
        params["id"] = coll_id
        params["config"] = replay_list.json()

        return self.load_from_yaml("index-import-configmap.yaml", params)
