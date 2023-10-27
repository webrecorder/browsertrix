"""k8s background jobs"""
from datetime import datetime
from typing import Optional, Tuple, Union, List, Dict, TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from .storages import StorageOps
from .crawlmanager import CrawlManager

from .models import (
    BaseFile,
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
else:
    OrgOps = CrawlManager = object


# ============================================================================
class BackgroundJobOps:
    """k8s background job management"""

    org_ops: OrgOps
    crawl_manager: CrawlManager
    storage_ops: StorageOps

    # pylint: disable=too-many-locals, too-many-arguments, invalid-name

    def __init__(self, mdb, org_ops, crawl_manager, storage_ops):
        self.jobs = mdb["jobs"]

        self.org_ops = org_ops
        self.crawl_manager = crawl_manager
        self.storage_ops = storage_ops

        self.router = APIRouter(
            prefix="/jobs",
            tags=["jobs"],
            responses={404: {"description": "Not found"}},
        )

    def strip_bucket(self, endpoint_url: str) -> tuple[str, str]:
        """strip the last path segment (bucket) and return rest of endpoint"""
        inx = endpoint_url.rfind("/", 0, -1) + 1
        return endpoint_url[0:inx], endpoint_url[inx:]

    async def create_replicate_job(self, oid: UUID, file: BaseFile) -> Dict:
        """Create k8s background job to replicate a file to another storage location."""

        org = await self.org_ops.get_org_by_id(oid)

        primary_storage = self.storage_ops.get_org_storage_by_ref(org, file.storage)
        primary_endpoint, bucket_suffix = self.strip_bucket(
            primary_storage.endpoint_url
        )

        replica_refs = self.storage_ops.get_org_replicas_storage_refs(org)

        primary_file_path = bucket_suffix + file.filename

        ids = []

        for replica_ref in replica_refs:
            replica_storage = self.storage_ops.get_org_storage_by_ref(org, replica_ref)
            replica_endpoint, bucket_suffix = self.strip_bucket(
                replica_storage.endpoint_url
            )
            replica_file_path = bucket_suffix + file.filename

            print(f"primary: {file.storage.get_storage_secret_name(str(oid))}")
            print(f"  endpoint: {primary_endpoint}")
            print(f"  path: {primary_file_path}")
            print(f"replica: {replica_ref.get_storage_secret_name(str(oid))}")
            print(f"  endpoint: {replica_endpoint}")
            print(f"  path: {replica_file_path}")

            job_id = await self.crawl_manager.run_replicate_job(
                oid,
                primary_secret_name=file.storage.get_storage_secret_name(str(oid)),
                replica_secret_name=replica_ref.get_storage_secret_name(str(oid)),
                primary_file_path=primary_file_path,
                replica_file_path=replica_file_path,
                primary_endpoint=primary_endpoint,
                replica_endpoint=replica_endpoint,
            )
            replication_job = ReplicateJob(
                id=job_id, started=datetime.now(), file_path=file.filename
            )
            await self.jobs.find_one_and_update(
                {"_id": job_id}, {"$set": replication_job.to_dict()}, upsert=True
            )
            ids.append(job_id)

        return {"added": True, "ids": ids}

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
def init_background_jobs_api(mdb, org_ops, crawl_manager, storage_ops):
    """init background jobs system"""
    # pylint: disable=invalid-name

    ops = BackgroundJobOps(mdb, org_ops, crawl_manager, storage_ops)

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
