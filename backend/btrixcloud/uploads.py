"""handle user uploads into browsertrix"""

import uuid
from urllib.parse import unquote
from uuid import UUID

import asyncio
from io import BufferedReader
from typing import Optional, List, Any
from fastapi import Depends, UploadFile, File
from fastapi import HTTPException
from starlette.requests import Request

from .basecrawls import BaseCrawlOps
from .storages import CHUNK_SIZE
from .models import (
    CrawlOut,
    CrawlOutWithResources,
    CrawlFile,
    DeleteCrawlList,
    UploadedCrawl,
    UpdateUpload,
    Organization,
    PaginatedCrawlOutResponse,
    User,
    UpdatedResponse,
    DeletedResponseQuota,
    AddedResponseIdQuota,
    FilePreparer,
    MIN_UPLOAD_PART_SIZE,
)
from .pagination import paginated_format, DEFAULT_PAGE_SIZE
from .utils import dt_now


# ============================================================================
class UploadOps(BaseCrawlOps):
    """upload ops"""

    async def get_upload(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
    ) -> UploadedCrawl:
        """Get crawl data for internal use"""
        res = await self.get_crawl_raw(crawlid, org, "upload")
        return UploadedCrawl.from_dict(res)

    # pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods, too-many-function-args
    # pylint: disable=too-many-arguments, too-many-locals, duplicate-code, invalid-name
    async def upload_stream(
        self,
        stream,
        filename: str,
        name: Optional[str],
        description: Optional[str],
        collections: Optional[List[str]],
        tags: Optional[List[str]],
        org: Organization,
        user: User,
        replaceId: Optional[str],
    ) -> dict[str, Any]:
        """Upload streaming file, length unknown"""
        self.orgs.can_write_data(org, include_time=False)

        prev_upload = None
        if replaceId:
            try:
                prev_upload = await self.get_upload(replaceId, org)
            except HTTPException:
                # not found
                replaceId = None

        id_ = "upload-" + str(uuid.uuid4()) if not replaceId else replaceId

        prefix = org.storage.get_storage_extra_path(str(org.id)) + f"uploads/{id_}"

        file_prep = FilePreparer(prefix, filename)

        async def stream_iter():
            """iterate over each chunk and compute and digest + total size"""
            async for chunk in stream:
                file_prep.add_chunk(chunk)
                yield chunk

        print("Stream Upload Start", flush=True)

        if not await self.storage_ops.do_upload_multipart(
            org,
            file_prep.upload_name,
            stream_iter(),
            MIN_UPLOAD_PART_SIZE,
        ):
            print("Stream Upload Failed", flush=True)
            raise HTTPException(status_code=400, detail="upload_failed")

        files = [file_prep.get_crawl_file(org.storage)]

        if prev_upload:
            try:
                await self._delete_crawl_files(prev_upload, org)
                await self.page_ops.delete_crawl_pages(prev_upload.id, org.id)
            # pylint: disable=broad-exception-caught
            except Exception as exc:
                print(f"Error handling previous upload: {exc}", flush=True)

        return await self._create_upload(
            files, name, description, collections, tags, id_, org, user
        )

    # pylint: disable=too-many-arguments, too-many-locals
    async def upload_formdata(
        self,
        uploads: List[UploadFile],
        name: Optional[str],
        description: Optional[str],
        collections: Optional[List[str]],
        tags: Optional[List[str]],
        org: Organization,
        user: User,
    ) -> dict[str, Any]:
        """handle uploading content to uploads subdir + request subdir"""
        self.orgs.can_write_data(org, include_time=False)

        id_ = uuid.uuid4()
        files: List[CrawlFile] = []

        prefix = org.storage.get_storage_extra_path(str(org.id)) + f"uploads/{id_}"

        for upload in uploads:
            file_prep = FilePreparer(prefix, upload.filename)
            file_reader = UploadFileReader(upload, file_prep)

            await self.storage_ops.do_upload_single(
                org, file_reader.file_prep.upload_name, file_reader
            )
            files.append(file_reader.file_prep.get_crawl_file(org.storage))

        return await self._create_upload(
            files, name, description, collections, tags, str(id_), org, user
        )

    async def _create_upload(
        self,
        files: List[CrawlFile],
        name: Optional[str],
        description: Optional[str],
        collections: Optional[List[str]],
        tags: Optional[List[str]],
        crawl_id: str,
        org: Organization,
        user: User,
    ) -> dict[str, Any]:
        now = dt_now()
        file_size = sum(file_.size or 0 for file_ in files)

        collection_uuids: List[UUID] = []
        if collections:
            try:
                for coll in collections:
                    collection_uuids.append(UUID(coll))
            # pylint: disable=raise-missing-from
            except:
                raise HTTPException(status_code=400, detail="invalid_collection_id")

        uploaded = UploadedCrawl(
            id=crawl_id,
            name=name or "New Upload @ " + str(now),
            description=description,
            collectionIds=collection_uuids,
            tags=tags,
            userid=user.id,
            userName=user.name,
            oid=org.id,
            files=files,
            state="complete",
            fileCount=len(files),
            fileSize=file_size,
            started=now,
            finished=now,
        )

        # result = await self.crawls.insert_one(uploaded.to_dict())
        # return {"id": str(result.inserted_id), "added": True}
        await self.crawls.find_one_and_update(
            {"_id": crawl_id}, {"$set": uploaded.to_dict()}, upsert=True
        )

        asyncio.create_task(
            self.event_webhook_ops.create_upload_finished_notification(crawl_id, org.id)
        )

        asyncio.create_task(
            self._add_pages_and_update_collections(crawl_id, collections)
        )

        await self.orgs.inc_org_bytes_stored(org.id, file_size, "upload")

        quota_reached = self.orgs.storage_quota_reached(org)

        if uploaded.files:
            for file in uploaded.files:
                await self.background_job_ops.create_replica_jobs(
                    org.id, file, crawl_id, "upload"
                )

        return {"id": crawl_id, "added": True, "storageQuotaReached": quota_reached}

    async def _add_pages_and_update_collections(
        self, crawl_id: str, collections: Optional[List[str]] = None
    ):
        await self.page_ops.add_crawl_pages_to_db_from_wacz(crawl_id)
        if collections:
            await self.colls.update_crawl_collections(crawl_id)

    async def delete_uploads(
        self,
        delete_list: DeleteCrawlList,
        org: Organization,
        user: Optional[User] = None,
    ):
        """Delete uploaded crawls"""
        deleted_count, _, quota_reached = await self.delete_crawls(
            org, delete_list, "upload", user
        )

        if deleted_count < 1:
            raise HTTPException(status_code=404, detail="uploaded_crawl_not_found")

        return {"deleted": True, "storageQuotaReached": quota_reached}


# ============================================================================
class UploadFileReader(BufferedReader):
    """Compute digest on file upload"""

    def __init__(self, upload, file_prep: FilePreparer):
        super().__init__(upload.file._file)
        self.file_prep = file_prep

    def read(self, size: Optional[int] = CHUNK_SIZE) -> bytes:
        """read and digest file chunk"""
        chunk = super().read(size)
        self.file_prep.add_chunk(chunk)
        return chunk


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, invalid-name
def init_uploads_api(app, user_dep, *args):
    """uploads api"""

    ops = UploadOps(*args)

    org_viewer_dep = ops.orgs.org_viewer_dep
    org_crawl_dep = ops.orgs.org_crawl_dep

    @app.put(
        "/orgs/{oid}/uploads/formdata",
        tags=["uploads"],
        response_model=AddedResponseIdQuota,
    )
    async def upload_formdata(
        uploads: List[UploadFile] = File(...),
        name: str = "",
        description: str = "",
        collections: Optional[str] = "",
        tags: Optional[str] = "",
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ) -> dict[str, Any]:
        name = unquote(name)
        description = unquote(description)
        colls_list = []
        if collections:
            colls_list = unquote(collections).split(",")

        tags_list = []
        if tags:
            tags_list = unquote(tags).split(",")

        return await ops.upload_formdata(
            uploads, name, description, colls_list, tags_list, org, user
        )

    @app.put(
        "/orgs/{oid}/uploads/stream",
        tags=["uploads"],
        response_model=AddedResponseIdQuota,
    )
    async def upload_stream(
        request: Request,
        filename: str,
        name: str = "",
        description: str = "",
        collections: Optional[str] = "",
        tags: Optional[str] = "",
        replaceId: Optional[str] = "",
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ) -> dict[str, Any]:
        name = unquote(name)
        description = unquote(description)
        colls_list = []
        if collections:
            colls_list = unquote(collections).split(",")

        tags_list = []
        if tags:
            tags_list = unquote(tags).split(",")

        return await ops.upload_stream(
            request.stream(),
            filename,
            name,
            description,
            colls_list,
            tags_list,
            org,
            user,
            replaceId,
        )

    @app.get(
        "/orgs/{oid}/uploads",
        tags=["uploads"],
        response_model=PaginatedCrawlOutResponse,
    )
    async def list_uploads(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        state: Optional[str] = None,
        userid: Optional[UUID] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collectionId: Optional[UUID] = None,
        sortBy: str = "finished",
        sortDirection: int = -1,
    ):
        states = state.split(",") if state else None

        if name:
            name = unquote(name)

        if description:
            description = unquote(description)

        uploads, total = await ops.list_all_base_crawls(
            org,
            userid=userid,
            states=states,
            name=name,
            description=description,
            page_size=pageSize,
            page=page,
            collection_id=collectionId,
            sort_by=sortBy,
            sort_direction=sortDirection,
            type_="upload",
        )
        return paginated_format(uploads, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/uploads/{crawlid}",
        tags=["uploads"],
        response_model=CrawlOut,
    )
    async def get_upload(crawlid: str, org: Organization = Depends(org_crawl_dep)):
        return await ops.get_crawl_out(crawlid, org, "upload")

    @app.get(
        "/orgs/all/uploads/{crawl_id}/replay.json",
        tags=["uploads"],
        response_model=CrawlOutWithResources,
    )
    async def get_upload_replay_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl_out(crawl_id, None, "upload")

    @app.get(
        "/orgs/{oid}/uploads/{crawl_id}/replay.json",
        tags=["uploads"],
        response_model=CrawlOutWithResources,
    )
    async def get_upload_replay(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl_out(crawl_id, org, "upload")

    @app.get(
        "/orgs/{oid}/uploads/{crawl_id}/download",
        tags=["uploads"],
        response_model=bytes,
    )
    async def download_upload_as_single_wacz(
        crawl_id: str, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.download_crawl_as_single_wacz(crawl_id, org)

    @app.patch(
        "/orgs/{oid}/uploads/{crawl_id}",
        tags=["uploads"],
        response_model=UpdatedResponse,
    )
    async def update_uploads_api(
        update: UpdateUpload, crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.update_crawl(crawl_id, org, update, "upload")

    @app.post(
        "/orgs/{oid}/uploads/delete",
        tags=["uploads"],
        response_model=DeletedResponseQuota,
    )
    async def delete_uploads(
        delete_list: DeleteCrawlList,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_uploads(delete_list, org, user)

    return ops
