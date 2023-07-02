""" handle user uploads into browsertrix """

import uuid
import hashlib
import os
import base64

from io import BufferedReader
from typing import Optional, List
from fastapi import Depends, UploadFile, File

# from fastapi import HTTPException
from pydantic import Field

from starlette.requests import Request
from pathvalidate import sanitize_filename

from .basecrawls import BaseCrawl, BaseCrawlOps, CrawlFile
from .users import User
from .orgs import Organization
from .storages import do_upload_single, do_upload_multipart
from .utils import dt_now


# ============================================================================
class UploadedCrawl(BaseCrawl):
    """Store State of a Crawl (Finished or Running)"""

    type: str = Field("upload", const=True)

    name: str

    description: str = ""


# ============================================================================
class UploadOps(BaseCrawlOps):
    """upload ops"""

    # pylint: disable=too-many-arguments, too-many-locals
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
        file_prep = FilePreparer(f"uploads/{id_}/", name)

        async def stream_iter():
            """iterate over each chunk and compute and digest + total size"""
            async for chunk in stream:
                file_prep.add_chunk(chunk)
                yield chunk

        await do_upload_multipart(
            org,
            file_prep.upload_name,
            stream_iter(),
            10000000,
            self.crawl_manager,
        )

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

        for upload in uploads:
            file_prep = FilePreparer(f"uploads/{id_}/", upload.filename)
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
    # ops = CrawlOps(mdb, users, crawl_manager, crawl_config_ops, orgs)
    ops = UploadOps(mdb, crawl_manager)

    # org_viewer_dep = orgs.org_viewer_dep
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
