"""Operator handler for BackgroundJobs"""

from uuid import UUID

import structlog

from btrixcloud.utils import (
    dt_now,
    str_to_date,
)

from .baseoperator import BaseOperator
from .models import MCDecoratorSyncData

logger = structlog.get_logger(__name__)


# ============================================================================
class BgJobOperator(BaseOperator):
    """BgJobOperator"""

    def init_routes(self, app):
        """init routes for this operator"""

        # nop, but needed for metacontroller
        @app.post("/op/backgroundjob/sync")
        async def mc_sync_background_jobs():
            return {"attachments": []}

        @app.post("/op/backgroundjob/finalize")
        async def mc_finalize_background_jobs(data: MCDecoratorSyncData):
            return await self.finalize_background_job(data)

    # pylint: disable=too-many-locals
    async def finalize_background_job(self, data: MCDecoratorSyncData) -> dict:
        """handle finished background job"""

        metadata = data.object["metadata"]
        labels: dict[str, str] = metadata.get("labels", {})
        oid: str = labels.get("btrix.org") or ""
        job_type: str = labels.get("job_type") or ""
        job_id: str = labels.get("job_id") or metadata.get("name")

        status = data.object["status"]
        spec = data.object["spec"]
        success = status.get("succeeded") == spec.get("parallelism")
        if not success:
            logger.warning(
                "background_job_not_successful",
                succeeded=status.get("succeeded"),
                parallelism=spec.get("parallelism"),
                unstructured_message=(
                    f"Succeeded: {status.get('succeeded')}, Num Pods: {spec.get('parallelism')}"
                ),
            )
        start_time = status.get("startTime")
        completion_time = status.get("completionTime")

        finalized = True

        started = None
        finished = None

        if start_time:
            started = str_to_date(start_time)
        if completion_time:
            finished = str_to_date(completion_time)
        if not finished:
            finished = dt_now()

        try:
            org_id = UUID(oid)
        # pylint: disable=broad-except
        except Exception:
            org_id = None

        try:
            await self.background_job_ops.job_finished(
                job_id,
                job_type,
                success=success,
                started=started,
                finished=finished,
                oid=org_id,
            )

        # pylint: disable=broad-except
        except Exception:
            logger.exception(
                "background_job_update_failed",
                unstructured_message="Update Background Job Error",
            )

        return {"attachments": [], "finalized": finalized}
