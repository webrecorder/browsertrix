"""Operator handler for CollIndexes"""

from btrixcloud.utils import str_to_date, dt_now
from pydantic import BaseModel, Field
from typing import Literal, get_args

from .models import MCSyncData
from .baseoperator import BaseOperator


TYPE_INDEX_STATES = Literal["initing", "updating", "ready"]
INDEX_STATES = get_args(TYPE_INDEX_STATES)


# ============================================================================
class CollIndexStatus(BaseModel):
    state: TYPE_INDEX_STATES = "initing"

    lastCollUpdated: str


# ============================================================================
class CollIndexOperator(BaseOperator):
    """CollIndex Operation"""

    def init_routes(self, app):
        """init routes for this operator"""

        @app.post("/op/collindexes/sync")
        async def mc_sync_index(data: MCSyncData):
            return await self.sync_index(data)

        @app.post("/op/collindexes/finalize")
        async def mc_finalize_index(data: MCSyncData):
            return await self.finalize_index(data)


    def sync_index(data: MCSyncData):
        return {}
