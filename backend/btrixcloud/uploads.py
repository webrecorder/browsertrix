""" handle user uploads into browsertrix """

import uuid
import hashlib
import os
import base64

from io import BufferedReader
from typing import Optional, List
from fastapi import Depends, UploadFile, File

from fastapi import HTTPException
from pydantic import Field, UUID4

from starlette.requests import Request
from pathvalidate import sanitize_filename

from .basecrawls import (
    BaseCrawl,
    BaseCrawlOut,
    BaseCrawlOps,
    CrawlFile,
    CrawlFileOut,
    DeleteCrawlList,
)
from .users import User
from .orgs import Organization
from .pagination import PaginatedResponseModel, paginated_format, DEFAULT_PAGE_SIZE
from .storages import do_upload_single, do_upload_multipart
from .utils import dt_now


MIN_UPLOAD_PART_SIZE = 10000000


# ============================================================================
class UploadedCrawl(BaseCrawl):
    """Store State of a Crawl Upload"""

    type: str = Field("upload", const=True)

    name: str

    description: str = ""


# ============================================================================
class UploadedCrawlOut(BaseCrawlOut):
    """Output model for Crawl Uploads"""

    userName: Optional[str]


# ============================================================================
class UploadedCrawlOutWithResources(UploadedCrawlOut):
    """Output model for Crawl Uploads with all file resources"""

    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class UploadOps(BaseCrawlOps):
    """upload ops"""

    # pylint: disable=too-many-arguments, too-many-locals, duplicate-code
    async def upload_stream(
        self,
        stream,
        name: str,
        desc: Optional[str],
        org: Organization,
        user: User,
    ):
        """Upload streaming file, length unknown"""

        id_ = uuid.uuid4()
        prefix = f"{org.id}/uploads/{id_}/"
        file_prep = FilePreparer(prefix, name)

        async def stream_iter():
            """iterate over each chunk and compute and digest + total size"""
            async for chunk in stream:
                file_prep.add_chunk(chunk)
                yield chunk

        print("Stream Upload Start", flush=True)

        if not await do_upload_multipart(
            org,
            file_prep.upload_name,
            stream_iter(),
            MIN_UPLOAD_PART_SIZE,
            self.crawl_manager,
        ):
            raise HTTPException(status_code=400, detail="upload_failed")

        files = [file_prep.get_crawl_file()]

        return await self._create_upload(files, name, desc, id_, org, user)

    # pylint: disable=too-many-arguments, too-many-locals
    async def upload_formdata(
        self,
        uploads: List[UploadFile],
        name: Optional[str],
        desc: Optional[str],
        org: Organization,
        user: User,
    ):
        """handle uploading content to uploads subdir + request subdir"""
        id_ = uuid.uuid4()
        files = []
        prefix = f"{org.id}/uploads/{id_}/"

        for upload in uploads:
            file_prep = FilePreparer(prefix, upload.filename)
            file_reader = UploadFileReader(upload, file_prep)

            await do_upload_single(
                org, file_reader.file_prep.upload_name, file_reader, self.crawl_manager
            )
            files.append(file_reader.file_prep.get_crawl_file())

        return await self._create_upload(files, name, desc, id_, org, user)

    async def _create_upload(self, files, name, desc, id_, org, user):
        now = dt_now()
        ts_now = now.strftime("%Y%m%d%H%M%S")
        crawl_id = f"upload-{ts_now}-{str(id_)[:12]}"

        file_size = sum(file_.size for file_ in files)

        uploaded = UploadedCrawl(
            id=crawl_id,
            name=name or "New Upload @ " + str(now),
            description=desc,
            userid=user.id,
            oid=org.id,
            files=files,
            state="complete",
            fileCount=len(files),
            fileSize=file_size,
            started=now,
            finished=now,
        )

        result = await self.crawls.insert_one(uploaded.to_dict())
        print(uploaded)

        return {"id": str(result.inserted_id), "added": True}

    async def delete_uploads(
        self, delete_list: DeleteCrawlList, org: Optional[Organization] = None
    ):
        """Delete uploaded crawls"""
        deleted_count, _, _ = await self.delete_crawls(org, delete_list, "upload")

        if deleted_count < 1:
            raise HTTPException(status_code=404, detail="uploaded_crawl_not_found")

        return {"deleted": True}

    async def get_upload_crawl(self, crawlid: str, org: Organization):
        """return single upload crawl with resources resolved"""
        res = await self.get_crawl_raw(crawlid=crawlid, type_="upload", org=org)
        files = [CrawlFile(**data) for data in res["files"]]
        res["resources"] = await self._resolve_signed_urls(files, org, res["_id"])
        return UploadedCrawlOutWithResources.from_dict(res)


# ============================================================================
class FilePreparer:
    """wrapper to compute digest / name for streaming upload"""

    def __init__(self, prefix, filename):
        self.upload_size = 0
        self.upload_hasher = hashlib.sha256()
        self.upload_name = prefix + self.prepare_filename(filename)

    def add_chunk(self, chunk):
        """add chunk for file"""
        self.upload_size += len(chunk)
        self.upload_hasher.update(chunk)

    def get_crawl_file(self, def_storage_name="default"):
        """get crawl file"""
        return CrawlFile(
            filename=self.upload_name,
            hash=self.upload_hasher.hexdigest(),
            size=self.upload_size,
            def_storage_name=def_storage_name,
        )

    def prepare_filename(self, filename):
        """prepare filename by sanitizing and adding extra string
        to avoid duplicates"""
        name = sanitize_filename(filename.rsplit("/", 1)[-1])
        parts = name.split(".")
        randstr = base64.b32encode(os.urandom(5)).lower()
        parts[0] += "-" + randstr.decode("utf-8")
        return ".".join(parts)


# ============================================================================
class UploadFileReader(BufferedReader):
    """Compute digest on file upload"""

    def __init__(self, upload, file_prep):
        super().__init__(upload.file._file)
        self.file_prep = file_prep

    def read(self, size, *args):
        """read and digest file chunk"""
        chunk = super().read(size, *args)
        self.file_prep.add_chunk(chunk)
        return chunk


# ============================================================================
def init_uploads_api(app, mdb, crawl_manager, orgs, user_dep):
    """uploads api"""
    # pylint: disable=invalid-name

    # ops = CrawlOps(mdb, users, crawl_manager, crawl_config_ops, orgs)
    ops = UploadOps(mdb, crawl_manager)

    org_viewer_dep = orgs.org_viewer_dep
    org_crawl_dep = orgs.org_crawl_dep

    # pylint: disable=too-many-arguments
    @app.put("/orgs/{oid}/uploads/formdata", tags=["uploads"])
    async def upload_formdata(
        uploads: List[UploadFile] = File(...),
        name: Optional[str] = "",
        desc: Optional[str] = "",
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.upload_formdata(uploads, name, desc, org, user)

    @app.put("/orgs/{oid}/uploads/stream", tags=["uploads"])
    async def upload_stream(
        request: Request,
        name: str,
        desc: Optional[str] = "",
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.upload_stream(request.stream(), name, desc, org, user)

    @app.get(
        "/orgs/{oid}/uploads", tags=["uploads"], response_model=PaginatedResponseModel
    )
    async def list_uploads(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID4] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        sortBy: Optional[str] = "finished",
        sortDirection: Optional[int] = -1,
    ):
        uploads, total = await ops.list_all_base_crawls(
            org,
            userid=userid,
            name=name,
            description=description,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            type_="upload",
            cls_type=UploadedCrawlOut,
        )
        return paginated_format(uploads, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/uploads/{crawlid}",
        tags=["uploads"],
        response_model=UploadedCrawlOutWithResources,
    )
    async def get_upload(crawlid: str, org: Organization = Depends(org_crawl_dep)):
        return await ops.get_upload_crawl(crawlid, org)

    @app.post("/orgs/{oid}/delete", tags=["uploads"])
    async def delete_uploads(
        delete_list: DeleteCrawlList,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_uploads(delete_list, org)
