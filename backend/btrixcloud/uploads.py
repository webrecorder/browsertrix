"""handle user uploads into browsertrix"""

import asyncio
import os
import time
import uuid
from collections.abc import AsyncGenerator, Callable
from typing import Any
from urllib.parse import unquote
from uuid import UUID
from zipfile import ZipInfo

import structlog
from fastapi import Depends, File, HTTPException, UploadFile
from remotezip import RemoteZip
from starlette.requests import Request

from .basecrawls import BaseCrawlOps
from .models import (
    MIN_UPLOAD_PART_SIZE,
    AddedResponseIdQuota,
    CrawlFile,
    CrawlOut,
    CrawlOutWithResources,
    DeleteCrawlList,
    DeletedResponseQuota,
    FilePreparer,
    Organization,
    PaginatedCrawlOutResponse,
    TagsResponse,
    UpdatedResponse,
    UpdateUpload,
    UploadedCrawl,
    UploadFileReader,
    User,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .storages import CHUNK_SIZE
from .utils import buffered_async_iter, dt_now, run_async_task, to_async_iterable

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

MAX_SYNC_UPLOAD_SIZE = int(
    os.environ.get("UPLOAD_BG_THRESHOLD_BYTES", 50 * 1024 * 1024)
)

MAX_UPLOAD_RETRIES = 3

MAX_WACZ_FILE_SIZE = int(
    os.environ.get(
        "MAX_WACZ_FILE_SIZE_BYTES", 50 * 1000 * 1000 * 1000 * 1000
    )  # 50 TiB - high default limit, meant to just stop zip bombs & the like
)

MAX_CONCURRENT_SPLITS = int(
    os.environ.get("MAX_CONCURRENT_SPLITS", 4)
)  # max number of multi-WACZ files to split simultaneously


# ============================================================================
class UploadOps(BaseCrawlOps):
    """upload ops"""

    async def get_upload(
        self,
        crawlid: str,
        org: Organization | None = None,
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
        name: str | None,
        description: str | None,
        collections: list[str] | None,
        tags: list[str] | None,
        org: Organization,
        user: User,
        replaceId: str | None,
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

        upload_logger = logger.bind(crawl_id=id_)

        prefix = org.storage.get_storage_extra_path(str(org.id)) + f"uploads/{id_}"

        file_prep = FilePreparer(prefix, filename)

        async def stream_iter():
            """iterate over each chunk and compute and digest + total size"""
            async for chunk in buffered_async_iter(
                stream, CHUNK_SIZE, log_name="stream_upload"
            ):
                file_prep.add_chunk(chunk)
                yield chunk

        upload_start = time.monotonic()
        upload_logger.debug(
            "stream_upload_start",
            unstructured_message="Stream Upload Start",
        )

        if not await self.storage_ops.do_upload_multipart(
            org,
            file_prep.upload_name,
            stream_iter(),
            MIN_UPLOAD_PART_SIZE,
        ):
            upload_logger.error(
                "stream_upload_failed",
                unstructured_message="Stream Upload Failed",
            )
            raise HTTPException(status_code=400, detail="upload_failed")

        files = [file_prep.get_crawl_file(org.storage)]

        if prev_upload:
            try:
                await self._delete_crawl_files(prev_upload, org)
                await self.page_ops.delete_crawl_pages(prev_upload.id, org.id)
            # pylint: disable=broad-exception-caught
            except Exception:
                upload_logger.exception(
                    "previous_upload_cleanup_error",
                    unstructured_message="Error handling previous upload",
                )

        upload_duration = time.monotonic() - upload_start
        upload_logger.info(
            "stream_upload_complete",
            filename=filename,
            upload_size=file_prep.upload_size,
            upload_duration=upload_duration,
            throughput_mbps=(
                (file_prep.upload_size / upload_duration) / 1_000_000
                if upload_duration
                else 0
            ),
            unstructured_message="Stream Upload Complete",
        )

        return await self._create_upload(
            files, name, description, collections, tags, id_, org, user
        )

    # pylint: disable=too-many-arguments, too-many-locals
    async def upload_formdata(
        self,
        uploads: list[UploadFile],
        name: str | None,
        description: str | None,
        collections: list[str] | None,
        tags: list[str] | None,
        org: Organization,
        user: User,
    ) -> dict[str, Any]:
        """handle uploading content to uploads subdir + request subdir"""
        self.orgs.can_write_data(org, include_time=False)

        id_ = uuid.uuid4()
        files: list[CrawlFile] = []

        prefix = org.storage.get_storage_extra_path(str(org.id)) + f"uploads/{id_}"

        for upload in uploads:
            file_prep = FilePreparer(prefix, upload.filename or "")
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
        files: list[CrawlFile],
        name: str | None,
        description: str | None,
        collections: list[str] | None,
        tags: list[str] | None,
        crawl_id: str,
        org: Organization,
        user: User,
    ) -> dict[str, Any]:
        now = dt_now()
        file_size = sum(file_.size or 0 for file_ in files)

        upload_logger = logger.bind(
            files=files, name=name, collections=collections, crawl_id=crawl_id
        )

        collection_uuids: list[UUID] = []
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
            state="processing-upload",
            fileCount=len(files),
            fileSize=file_size,
            started=now,
            finished=now,
            version=2,
        )

        upload_logger = upload_logger.bind(file_count=len(files), file_size=file_size)

        upload_logger.debug("upload_create", state="processing_upload")

        await self.crawls.find_one_and_update(
            {"_id": crawl_id}, {"$set": uploaded.to_dict()}, upsert=True
        )

        # Post-processing: sync for small files, background job for large files
        if file_size > MAX_SYNC_UPLOAD_SIZE:
            upload_logger.debug(
                "upload_create",
                state="large_file_dispatching_bg_job",
                file_size=file_size,
                max_sync_upload_size=MAX_SYNC_UPLOAD_SIZE,
            )

            max_attempts = 3
            attempt = 0
            job_id = None

            while attempt < max_attempts:
                job_id = await self.background_job_ops.create_postprocess_upload_job(
                    org.id, crawl_id
                )
                if job_id:
                    break

                upload_logger.warning(
                    "upload_create",
                    state="large_file_dispatching_bg_job_failed",
                    attempt=attempt + 1,
                    max_attempts=max_attempts,
                )
                attempt += 1

            if not job_id:
                upload_logger.warning(
                    "upload_create",
                    state="large_file_dispatching_bg_job_failed",
                    detail="running post_process_upload synchronously instead",
                )
                await self.post_process_upload(crawl_id, org)
        else:
            upload_logger.debug(
                "upload_create",
                state="small_file_dispatching_sync_job",
                file_size=file_size,
                max_sync_upload_size=MAX_SYNC_UPLOAD_SIZE,
            )
            await self.post_process_upload(crawl_id, org)

        await self.orgs.inc_org_bytes_stored(org.id, file_size, "upload")
        quota_reached = self.orgs.storage_quota_reached(org)

        upload_logger.debug(
            "upload_create", state="completed", quota_reached=quota_reached
        )
        return {"id": crawl_id, "added": True, "storageQuotaReached": quota_reached}

    async def post_process_upload(
        self,
        crawl_id: str,
        org: Organization,
        # In a bg job, await the webhook instead of running it in a separate async task
        await_webhook: bool = False,
    ):
        """
        Perform upload post-processing: counts pages, updates collections,
        replicates files, sends an upload complete webhook.

        If called from a background job, set `await_webhook` to `True`.
        """
        pp_logger = logger.bind(crawl_id=crawl_id)
        pp_logger.debug("post_process_upload", state="processing_upload_started")
        try:
            upload = await self.get_upload(crawl_id, org)

            if upload.deleted:
                pp_logger.info("post_process_upload", state="upload_deleted_aborting")
                return

            # Check each file for multi-WACZ content and split if needed.
            # This handles both single-file stream uploads and multi-file
            # formdata uploads where multiple files may be multi-WACZs.
            # Files are checked and split concurrently with a max concurrency.
            if upload.files:
                pp_logger.debug(
                    "post_process_upload",
                    state="multi_wacz_check",
                    file_count=len(upload.files),
                )
                resources = await self.resolve_signed_urls(upload.files, org, crawl_id)

                # bulk_presigned_files doesn't preserve input order, so
                # match resources back to files by name. FilePreparer adds
                # a random suffix to each stored filename, so names are
                # unique even for duplicate files.
                resources_by_name = {r.name: r for r in resources}

                sem = asyncio.Semaphore(MAX_CONCURRENT_SPLITS)

                async def _check_and_maybe_split(file: CrawlFile) -> None:
                    upload = await self.get_upload(crawl_id, org)
                    if upload.deleted:
                        pp_logger.info(
                            "post_process_upload",
                            state="upload_deleted_aborting",
                        )
                        return
                    name = os.path.basename(file.filename)
                    resource = resources_by_name.get(name)
                    if not resource:
                        return

                    wacz_url = self.storage_ops.resolve_internal_access_path(
                        resource.path
                    )

                    child_waczs = await self._get_child_wacz_files(crawl_id, wacz_url)
                    if child_waczs:
                        pp_logger.debug(
                            "post_process_upload",
                            state="multi_wacz_split",
                            filename=name,
                            child_wacz_count=len(child_waczs),
                        )
                        async with sem:
                            await self._split_multiwacz(
                                crawl_id, org, wacz_url, child_waczs, file
                            )
                    else:
                        pp_logger.debug(
                            "post_process_upload",
                            state="single_wacz",
                            filename=name,
                        )

                # return_exceptions=True ensures all tasks finish (and run
                # their cleanup) even if one fails, rather than cancelling
                # in-flight tasks mid-upload.
                results = await asyncio.gather(
                    *(_check_and_maybe_split(f) for f in upload.files),
                    return_exceptions=True,
                )

                # Re-raise the first exception (if any) so the upload is
                # marked as failed and the bg job can be retried
                for result in results:
                    if isinstance(result, Exception):
                        raise result
            else:
                pp_logger.debug(
                    "post_process_upload",
                    state="multi_wacz_skip",
                    file_count=0,
                )

            pp_logger.debug("post_process_upload", state="add_crawl_pages")
            await self.page_ops.add_crawl_pages_to_db_from_wacz(crawl_id)
            pp_logger.debug("post_process_upload", state="update_crawl_collections")
            await self.colls.update_crawl_collections(crawl_id, org.id)

            pp_logger.debug("post_process_upload", state="set_state_complete")
            await self.crawls.find_one_and_update(
                {"_id": crawl_id}, {"$set": {"state": "complete"}}
            )

            pp_logger.debug("post_process_upload", state="replicate_crawl_files")
            await self.replicate_crawl_files(crawl_id, org, "upload")

            pp_logger.debug(
                "post_process_upload", state="finished_processing_dispatching_webhook"
            )

            if await_webhook:
                await self.event_webhook_ops.create_upload_finished_notification(
                    crawl_id, org.id
                )
            else:
                run_async_task(
                    self.event_webhook_ops.create_upload_finished_notification(
                        crawl_id, org.id
                    )
                )

            pp_logger.debug("post_process_upload", state="complete")
        except Exception:
            pp_logger.exception("post_process_upload", state="failed")
            await self.crawls.find_one_and_update(
                {"_id": crawl_id}, {"$set": {"state": "failed"}}
            )
            raise

    async def _get_child_wacz_files(
        self, crawl_id: str, wacz_url: str
    ) -> list[ZipInfo]:
        cwf_logger = logger.bind(crawl_id=crawl_id, wacz_url=wacz_url)
        cwf_logger.debug("multi_wacz", state="list_child_waczs")
        with RemoteZip(wacz_url) as remote_zip:
            wacz_files: list[ZipInfo] = [
                f
                for f in remote_zip.infolist()
                if f.filename.endswith(".wacz") and not f.is_dir()
            ]
            cwf_logger.debug(
                "multi_wacz", state="found_child_waczs", count=len(wacz_files)
            )
            return wacz_files

    # pylint: disable=too-many-branches,too-many-statements
    async def _split_multiwacz(
        self,
        crawl_id: str,
        org: Organization,
        wacz_url: str,
        child_waczs: list[ZipInfo],
        original_file: CrawlFile,
    ) -> None:
        """Split a multi-WACZ file into its child WACZ files.

        Uploads each child WACZ to storage, atomically replaces original_file
        in the upload's file list with the new child files (via $pull/$push),
        adjusts org bytes stored, and deletes the original multi-WACZ from storage.
        """
        cwf_logger = logger.bind(
            crawl_id=crawl_id,
            wacz_url=wacz_url,
        )
        cwf_logger.debug(
            "multi_wacz", state="split_child_waczs", count=len(child_waczs)
        )
        prefix = org.storage.get_storage_extra_path(str(org.id)) + f"uploads/{crawl_id}"

        new_upload_files: list[CrawlFile] = []

        try:
            for idx, child_wacz in enumerate(child_waczs):
                cwf_logger.debug(
                    "multi_wacz",
                    state="process_child_wacz",
                    idx=idx + 1,
                    count=len(child_waczs),
                    filename=child_wacz.filename,
                )

                max_size = MAX_WACZ_FILE_SIZE
                if org.quotas.storageQuota:
                    remaining = org.quotas.storageQuota - org.bytesStored
                    max_size = min(remaining, max_size)

                if child_wacz.file_size > max_size:
                    cwf_logger.error(
                        "multi_wacz_file_too_large",
                        filename=child_wacz.filename,
                        file_size=child_wacz.file_size,
                        max_size=max_size,
                        storage_quota=org.quotas.storageQuota,
                        bytes_stored=org.bytesStored,
                        detail="Extracted file exceeds available org size or hard limit. ",
                    )
                    # it's a little odd to raise an HTTPException from inside here because
                    # it's not always going to be called from an HTTP request handler,
                    # but it'll propagate correctly when it is, and when it's not it'll still
                    # cause the background job to fail
                    raise HTTPException(
                        status_code=400,
                        detail=f"WACZ file '{child_wacz.filename}' inside item id "
                        f"{crawl_id} exceeds max size",
                    )

                # it's worth retrying these uploads because they may be run in a background
                # job, we can't count on being able to give the user immediate feedback
                for attempt in range(1, MAX_UPLOAD_RETRIES + 1):
                    file_prep = FilePreparer(prefix, child_wacz.filename)

                    def sync_wacz_stream_iter(
                        child_wacz=child_wacz, file_prep=file_prep
                    ):
                        with RemoteZip(wacz_url) as remote_zip:
                            with remote_zip.open(child_wacz.filename) as stream:
                                for chunk in stream:
                                    file_prep.add_chunk(chunk)
                                    yield chunk

                    try:
                        if not await self.storage_ops.do_upload_multipart(
                            org,
                            file_prep.upload_name,
                            to_async_iterable(sync_wacz_stream_iter()),
                            MIN_UPLOAD_PART_SIZE,
                        ):
                            raise HTTPException(status_code=400, detail="upload_failed")
                        break
                    # pylint: disable=broad-exception-caught
                    except Exception:
                        if attempt == MAX_UPLOAD_RETRIES:
                            cwf_logger.error(
                                "multi_wacz_child_upload_failed",
                                filename=child_wacz.filename,
                                attempts=MAX_UPLOAD_RETRIES,
                            )
                            raise
                        cwf_logger.warning(
                            "multi_wacz_child_upload_retry",
                            filename=child_wacz.filename,
                            attempt=attempt,
                        )
                        await asyncio.sleep(2 ** (attempt - 1))

                crawl_file = file_prep.get_crawl_file(org.storage)
                cwf_logger.debug(
                    "multi_wacz_child_upload_success",
                    idx=idx + 1,
                    count=len(child_waczs),
                    filename=crawl_file.filename,
                    hash=crawl_file.hash,
                )
                new_upload_files.append(crawl_file)

            # Atomically replace the original single multi-WACZ with child WACZs
            # in the DB, and update file count/size fields. This is a single
            # atomic operation, so it's safe for concurrent splits, since each
            # $filter targets a different filename.
            size_diff = sum(f.size for f in new_upload_files) - original_file.size
            child_file_dicts = [f.model_dump() for f in new_upload_files]
            result = await self.crawls.find_one_and_update(
                {"_id": crawl_id, "deleted": {"$ne": True}},
                [
                    # Stage 1: replace the original file with child WACZ files.
                    {
                        "$set": {
                            "files": {
                                "$concatArrays": [
                                    {
                                        "$filter": {
                                            "input": "$files",
                                            "as": "f",
                                            "cond": {
                                                "$ne": [
                                                    "$$f.filename",
                                                    original_file.filename,
                                                ],
                                            },
                                        },
                                    },
                                    child_file_dicts,
                                ],
                            },
                        },
                    },
                    # Stage 2: recompute aggregate counts from the updated files list.
                    {
                        "$set": {
                            "fileCount": {"$size": "$files"},
                            "fileSize": {
                                "$sum": {
                                    "$map": {
                                        "input": "$files",
                                        "as": "f",
                                        "in": "$$f.size",
                                    },
                                },
                            },
                        },
                    },
                ],
            )

            if result is None:
                cwf_logger.warning("crawl_not_found_or_deleted")
                for crawl_file in new_upload_files:
                    await self.storage_ops.delete_file_object(org, crawl_file)
                return

            # Adjust org bytes stored for the size difference
            if size_diff != 0:
                await self.orgs.inc_org_bytes_stored(org.id, size_diff, "upload")

            cwf_logger.debug(
                "multi_wacz_split_complete",
                count=len(new_upload_files),
                original_wacz=wacz_url,
                new_upload_files=[f.filename for f in new_upload_files],
            )

            # Delete the original multi-WACZ from storage now that children
            # are in the DB. This is best-effort - if it fails, the original
            # is orphaned in storage (a leak) but the upload is correct.
            # pylint: disable=fixme
            # TODO: maybe periodically check for orphaned multi-WACZs in storage
            try:
                cwf_logger.debug(
                    "multi_wacz_delete_original",
                    filename=original_file.filename,
                )
                await self.storage_ops.delete_file_object(org, original_file)
                await self.presigned_urls.delete_one({"_id": original_file.filename})
                await self.background_job_ops.create_delete_replica_jobs(
                    org, original_file, crawl_id, "upload"
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                cwf_logger.warning(
                    "multi_wacz_original_delete_failed",
                    filename=original_file.filename,
                )
        # pylint: disable=broad-exception-caught
        except Exception:
            for crawl_file in new_upload_files:
                try:
                    await self.storage_ops.delete_file_object(org, crawl_file)
                    cwf_logger.debug(
                        "multi_wacz_cleanup_deleted",
                        filename=crawl_file.filename,
                    )
                # pylint: disable=broad-exception-caught
                except Exception:
                    cwf_logger.exception(
                        "multi_wacz_cleanup_failed",
                        filename=crawl_file.filename,
                    )
            cwf_logger.exception("multi_wacz_split_failed")
            raise

    async def delete_uploads(
        self,
        delete_list: DeleteCrawlList,
        org: Organization,
        user: User | None = None,
    ):
        """Delete uploaded crawls"""
        deleted_count, _, quota_reached = await self.delete_crawls(
            org, delete_list, "upload", user
        )

        if deleted_count < 1:
            raise HTTPException(status_code=404, detail="uploaded_crawl_not_found")

        return {"deleted": True, "storageQuotaReached": quota_reached}


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, invalid-name
def init_uploads_api(app, user_dep: Callable[[str], AsyncGenerator[User, None]], *args):
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
        uploads: list[UploadFile] = File(...),
        name: str = "",
        description: str = "",
        collections: str | None = "",
        tags: str | None = "",
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
        collections: str | None = "",
        tags: str | None = "",
        replaceId: str | None = "",
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
        state: str | None = None,
        userid: UUID | None = None,
        name: str | None = None,
        description: str | None = None,
        collectionId: UUID | None = None,
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
        "/orgs/{oid}/uploads/tagCounts",
        tags=["uploads"],
        response_model=TagsResponse,
    )
    async def get_uploads_tag_counts(
        org: Organization = Depends(org_viewer_dep),
    ):
        tags = await ops.get_all_crawls_tag_counts(
            org, only_successful=False, type_="upload"
        )
        return {"tags": tags}

    @app.get(
        "/orgs/{oid}/uploads/{crawlid}",
        tags=["uploads"],
        response_model=CrawlOut,
    )
    async def get_upload(
        crawlid: str, request: Request, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.get_crawl_out(
            crawlid, org, "upload", headers=dict(request.headers)
        )

    @app.get(
        "/orgs/all/uploads/{crawl_id}/replay.json",
        tags=["uploads"],
        response_model=CrawlOutWithResources,
    )
    async def get_upload_replay_admin(
        crawl_id, request: Request, user: User = Depends(user_dep)
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl_out(
            crawl_id, None, "upload", headers=dict(request.headers)
        )

    @app.get(
        "/orgs/{oid}/uploads/{crawl_id}/replay.json",
        tags=["uploads"],
        response_model=CrawlOutWithResources,
    )
    async def get_upload_replay(
        crawl_id, request: Request, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_crawl_out(
            crawl_id, org, "upload", headers=dict(request.headers)
        )

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
