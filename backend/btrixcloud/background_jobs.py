"""k8s background jobs"""
from datetime import datetime
from typing import Optional, Tuple, Union, List, Dict, TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from .models import (
    Organization,
    ReplicateJob,
    BackgroundJobOut,
    DeleteReplicaJob,
    UpdateBackgroundJob,
    PaginatedResponse,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .crawlmanager import CrawlManager
else:
    OrgOps = CrawlManager = object


# ============================================================================
class BackgroundJobOps:
    """k8s background job management"""

    org_ops: OrgOps
    crawl_manager: CrawlManager

    # pylint: disable=too-many-locals, too-many-arguments, invalid-name

    def __init__(self, mdb, org_ops, crawl_manager):
        self.jobs = mdb["jobs"]

        self.org_ops = org_ops
        self.crawl_manager = crawl_manager

        self.router = APIRouter(
            prefix="/jobs",
            tags=["jobs"],
            responses={404: {"description": "Not found"}},
        )

    async def create_replica_job(
        self, oid: UUID, file_path: str
    ) -> Dict[str, Union[str, bool]]:
        """Create k8s background job to replicate a file to another storage location.

        TODO:
        - Remove false early exit
        - Support additional replica and primary locations beyond hardcoded defaults
        - Return without starting job if no relica locations are configured
        """
        print("Replication not yet supported", flush=True)
        # pylint: disable=unreachable
        return {}

        primary_storage_name = "default"
        replica_storage_name = "backup"

        job_id = await self.crawl_manager.run_replicate_job(
            oid,
            primary_storage_name=f"storage-{primary_storage_name}",
            replica_storage_name=f"storage-{replica_storage_name}",
            primary_file_path=f"primary:{file_path}",
            replica_file_path=f"replica:{file_path}",
        )
        replication_job = ReplicateJob(
            id=job_id, started=datetime.now(), file_path=file_path
        )
        await self.jobs.find_one_and_update(
            {"_id": job_id}, {"$set": replication_job.to_dict()}, upsert=True
        )
        return {
            "added": True,
            "id": job_id,
        }

    async def create_delete_replica_job(
        self, oid: UUID, file_path: str
    ) -> Dict[str, Union[str, bool]]:
        """Create k8s background job to delete a file from a replication bucket.

        TODO:
        - Remove false early exit
        - Support additional replica and primary locations beyond hardcoded defaults
        - Return without starting job if no replica locations are configured
        """
        print("Replication not yet supported", flush=True)
        # pylint: disable=unreachable
        return {}

        replica_storage_name = "backup"

        job_id = await self.crawl_manager.run_delete_replica_job(
            oid,
            replica_storage_name=f"storage-{replica_storage_name}",
            replica_file_path=f"replica:{file_path}",
        )
        replication_job = DeleteReplicaJob(
            id=job_id, started=datetime.now(), file_path=file_path
        )
        await self.jobs.find_one_and_update(
            {"_id": job_id}, {"$set": replication_job.to_dict()}, upsert=True
        )
        return {
            "added": True,
            "id": job_id,
        }

    async def get_background_job(
        self, job_id: str, org: Optional[Organization] = None
    ) -> BackgroundJobOut:
        """Get background job"""
        query: dict[str, object] = {"_id": job_id}
        if org:
            query["oid"] = org.id
        res = await self.jobs.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="job_not_found")

        return BackgroundJobOut.from_dict(res)

    async def update_background_job(
        self,
        job_id: str,
        oid: UUID,
        update: UpdateBackgroundJob,
        type_: Optional[str] = None,
    ) -> Dict[str, bool]:
        """Update background job after job completes"""
        update_values = update.dict(exclude_unset=True)
        if len(update_values) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        query = {"_id": job_id, "oid": oid}
        if type_:
            query["type"] = type_

        result = await self.jobs.find_one_and_update(
            query,
            {"$set": update_values},
        )

        if not result:
            raise HTTPException(status_code=404, detail="job_not_found")

        return {"updated": True}

    async def list_background_jobs(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        success: Optional[bool] = None,
        job_type: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
    ) -> Tuple[List[BackgroundJobOut], int]:
        """List all background jobs"""
        # pylint: disable=duplicate-code
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query: dict[str, object] = {"oid": org.id}

        if success in (True, False):
            query["success"] = success

        if job_type:
            query["type"] = job_type

        aggregate = [{"$match": query}]

        if sort_by:
            SORT_FIELDS = ("success", "type", "started", "finished")
            if sort_by not in SORT_FIELDS:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        aggregate.extend(
            [
                {
                    "$facet": {
                        "items": [
                            {"$skip": skip},
                            {"$limit": page_size},
                        ],
                        "total": [{"$count": "count"}],
                    }
                },
            ]
        )

        # Get total
        cursor = self.jobs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        jobs = [BackgroundJobOut.from_dict(res) for res in items]

        return jobs, total


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, invalid-name, fixme
def init_background_jobs_api(mdb, org_ops, crawl_manager):
    """init background jobs system"""
    # pylint: disable=invalid-name

    ops = BackgroundJobOps(mdb, org_ops, crawl_manager)

    router = ops.router

    # org_owner_dep = org_ops.org_owner_dep
    org_crawl_dep = org_ops.org_crawl_dep

    @router.get("/{job_id}", tags=["backgroundjobs"], response_model=BackgroundJobOut)
    async def get_background_job(
        job_id: str,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Retrieve information for background job"""
        return await ops.get_background_job(job_id, org)

    @router.get("", tags=["backgroundjobs"], response_model=PaginatedResponse)
    async def list_background_jobs(
        org: Organization = Depends(org_crawl_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        success: Optional[bool] = None,
        jobType: Optional[str] = None,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of background jobs"""
        jobs, total = await ops.list_background_jobs(
            org,
            page_size=pageSize,
            page=page,
            success=success,
            job_type=jobType,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(jobs, total, page, pageSize)

    org_ops.router.include_router(router)

    return ops
