"""Operator handler for CollIndexes"""

from typing import Literal, get_args
from uuid import UUID
from pydantic import BaseModel

from btrixcloud.utils import str_to_date

from .models import MCSyncData, POD
from .baseoperator import BaseOperator


TYPE_INDEX_STATES = Literal["initing", "updating", "ready"]
INDEX_STATES = get_args(TYPE_INDEX_STATES)


# ============================================================================
class CollIndexStatus(BaseModel):
    """CollIndex Status"""

    state: TYPE_INDEX_STATES = "initing"

    lastCollUpdated: str


# ============================================================================
class CollIndexSpec(BaseModel):
    """CollIndex Spec"""

    id: UUID
    oid: UUID

    collItemsUpdatedAt: str


# ============================================================================
class CollIndexOperator(BaseOperator):
    """CollIndex Operation"""

    shared_params = {}

    def __init__(self, *args):
        super().__init__(*args)
        self.shared_params.update(self.k8s.shared_params)
        self.shared_params["redis_storage"] = self.shared_params[
            "redis_coll_index_storage"
        ]
        self.shared_params["memory"] = "3Gi"
        self.shared_params["cpu"] = self.shared_params["redis_cpu"]
        self.shared_params["init_redis"] = True

    def init_routes(self, app):
        """init routes for this operator"""

        @app.post("/op/collindexes/sync")
        async def mc_sync_index(data: MCSyncData):
            return await self.sync_index(data)

        @app.post("/op/collindexes/finalize")
        async def mc_finalize_index(data: MCSyncData):
            return await self.sync_index(data)

    async def sync_index(self, data: MCSyncData):
        """sync CollIndex object with existing state"""
        spec = CollIndexSpec(**data.parent.get("spec", {}))
        status = CollIndexStatus(**data.parent.get("status", {}))

        index_id = str(spec.id)
        redis_name = "coll-redis-" + index_id
        new_children = self._load_redis(index_id, redis_name)

        redis_exists = redis_name in data.children[POD]
        if not redis_exists:
            status.state = "initing"
        # elif self.is_import_needed(spec, status):
        #    import_job_name "coll-import-job-" + index_id
        #    new_children.extend(self._load_import_job(index_id, import_job_name))

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
        }

    def is_import_needed(self, spec: CollIndexSpec, status: CollIndexStatus):
        """returnt rue if a reimport is needed based on last import date"""
        coll_update_date = str_to_date(spec.collItemsUpdatedAt)
        last_import_date = str_to_date(status.lastCollUpdated)
        if not coll_update_date or not last_import_date:
            return True

        return coll_update_date >= last_import_date

    def _load_redis(self, index_id: str, name: str):
        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = index_id

        return self.load_from_yaml("redis.yaml", params)
