"""k8s background jobs"""
from datetime import datetime
from typing import Optional, Tuple, Union, List, Dict, TYPE_CHECKING, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from .storages import StorageOps
from .crawlmanager import CrawlManager

from .models import (
    BaseFile,
    Organization,
    BackgroundJob,
    BgJobType,
    CreateReplicaJob,
    DeleteReplicaJob,
    PaginatedResponse,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .basecrawls import BaseCrawlOps
    from .profiles import ProfileOps
else:
    OrgOps = CrawlManager = BaseCrawlOps = ProfileOps = object


# ============================================================================
class BackgroundJobOps:
    """k8s background job management"""

    org_ops: OrgOps
    crawl_manager: CrawlManager
    storage_ops: StorageOps

    base_crawl_ops: BaseCrawlOps
    profile_ops: ProfileOps

    # pylint: disable=too-many-locals, too-many-arguments, invalid-name

    def __init__(self, mdb, org_ops, crawl_manager, storage_ops):
        self.jobs = mdb["jobs"]

        self.org_ops = org_ops
        self.crawl_manager = crawl_manager
        self.storage_ops = storage_ops

        self.base_crawl_ops = cast(BaseCrawlOps, None)
        self.profile_ops = cast(ProfileOps, None)

        self.router = APIRouter(
            prefix="/jobs",
            tags=["jobs"],
            responses={404: {"description": "Not found"}},
        )

    def set_ops(self, base_crawl_ops: BaseCrawlOps, profile_ops: ProfileOps) -> None:
        """basecrawlops and profileops for updating files"""
        self.base_crawl_ops = base_crawl_ops
        self.profile_ops = profile_ops

    def strip_bucket(self, endpoint_url: str) -> tuple[str, str]:
        """strip the last path segment (bucket) and return rest of endpoint"""
        inx = endpoint_url.rfind("/", 0, -1) + 1
        return endpoint_url[0:inx], endpoint_url[inx:]

    async def handle_replica_job_finished(self, job: CreateReplicaJob) -> None:
        """Update replicas in corresponding file objects, based on type"""
        res = None
        if job.object_type in ("crawl", "upload"):
            res = await self.base_crawl_ops.add_crawl_file_replica(
                job.object_id, job.file_path, job.replica_storage
            )
        elif job.object_type == "profile":
            res = await self.profile_ops.add_profile_file_replica(
                UUID(job.object_id), job.file_path, job.replica_storage
            )
        if not res:
            raise HTTPException(status_code=404, detail="missing_file_for_replica")

    async def create_replica_jobs(
        self, oid: UUID, file: BaseFile, object_id: str, object_type: str
    ) -> Dict:
        """Create k8s background job to replicate a file to another storage location."""

        org = await self.org_ops.get_org_by_id(oid)

        primary_storage = self.storage_ops.get_org_storage_by_ref(org, file.storage)
        primary_endpoint, bucket_suffix = self.strip_bucket(
            primary_storage.endpoint_url
        )

        primary_file_path = bucket_suffix + file.filename

        ids = []

        for replica_ref in self.storage_ops.get_org_replicas_storage_refs(org):
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

            job_id = await self.crawl_manager.run_replica_job(
                str(oid),
                job_type=BgJobType.CREATE_REPLICA.value,
                primary_storage=file.storage,
                primary_file_path=primary_file_path,
                primary_endpoint=primary_endpoint,
                replica_storage=replica_ref,
                replica_file_path=replica_file_path,
                replica_endpoint=replica_endpoint,
            )
            replication_job = CreateReplicaJob(
                id=job_id,
                oid=oid,
                started=datetime.now(),
                file_path=file.filename,
                object_type=object_type,
                object_id=object_id,
                primary=file.storage,
                replica_storage=replica_ref,
            )
            await self.jobs.find_one_and_update(
                {"_id": job_id}, {"$set": replication_job.to_dict()}, upsert=True
            )
            ids.append(job_id)

        return {"added": True, "ids": ids}

    async def create_delete_replica_jobs(
        self, org: Organization, file: BaseFile, object_id: str, object_type: str
    ) -> Dict[str, Union[bool, List[str]]]:
        """Create a job to delete each replica for the given file"""

        ids = []
        oid = str(org.id)

        for replica_ref in file.replicas or []:
            replica_storage = self.storage_ops.get_org_storage_by_ref(org, replica_ref)
            replica_endpoint, bucket_suffix = self.strip_bucket(
                replica_storage.endpoint_url
            )
            replica_file_path = bucket_suffix + file.filename

            print(f"replica: {replica_ref.get_storage_secret_name(oid)}")
            print(f"  endpoint: {replica_endpoint}")
            print(f"  path: {replica_file_path}")

            job_id = await self.crawl_manager.run_replica_job(
                oid=oid,
                job_type=BgJobType.DELETE_REPLICA.value,
                replica_storage=replica_ref,
                replica_file_path=replica_file_path,
                replica_endpoint=replica_endpoint,
            )

            delete_replica_job = DeleteReplicaJob(
                id=job_id,
                oid=oid,
                started=datetime.now(),
                file_path=replica_file_path,
                object_id=object_id,
                object_type=object_type,
                replica_storage=replica_ref,
            )

            await self.jobs.find_one_and_update(
                {"_id": job_id}, {"$set": delete_replica_job.to_dict()}, upsert=True
            )

            ids.append(job_id)

        return {"added": True, "ids": ids}

    async def job_finished(
        self,
        job_id: str,
        job_type: str,
        oid: UUID,
        success: bool,
        finished: datetime,
    ) -> None:
        """Update job as finished, including
        job-specific task handling"""

        job_data = await self.get_background_job(job_id, oid)
        # return if already finished
        if job_data.get("finished"):
            return

        if job_data.get("type") != job_type:
            raise HTTPException(status_code=400, detail="invalid_job_type")

        if success:
            if job_type == BgJobType.CREATE_REPLICA:
                await self.handle_replica_job_finished(
                    CreateReplicaJob.from_dict(job_data)
                )

        await self.jobs.find_one_and_update(
            {"_id": job_id, "oid": oid},
            {"$set": {"success": success, "finished": finished}},
        )

    async def get_background_job(self, job_id: str, oid: UUID) -> Dict[str, object]:
        """Get background job"""
        query: dict[str, object] = {"_id": job_id, "oid": oid}
        res = await self.jobs.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="job_not_found")
        return res

    async def list_background_jobs(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        success: Optional[bool] = None,
        job_type: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
    ) -> Tuple[List[BackgroundJob], int]:
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

        jobs = [BackgroundJob.from_dict(res) for res in items]

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

    @router.get("/{job_id}", tags=["backgroundjobs"], response_model=BackgroundJob)
    async def get_background_job(
        job_id: str,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Retrieve information for background job"""
        res = await ops.get_background_job(job_id, org.id)
        if res["type"] == "create-replica":
            return CreateReplicaJob.from_dict(res)
        if res["type"] == "delete-replica":
            return DeleteReplicaJob.from_dict(res)
        return BackgroundJob.from_dict(res)

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
