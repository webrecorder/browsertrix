"""user-uploaded files"""

from typing import TYPE_CHECKING, Union, Any, Optional, Dict, Tuple

import os
import tempfile
from uuid import UUID, uuid4

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Request
import pymongo

from .models import (
    UserUploadFile,
    UserUploadFileOut,
    SeedFile,
    ImageFile,
    ImageFilePreparer,
    Organization,
    User,
    AddedResponseId,
    SuccessResponse,
    MIN_UPLOAD_PART_SIZE,
)
from .utils import dt_now

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .storages import StorageOps

else:
    OrgOps = StorageOps = object


ALLOWED_UPLOAD_TYPES = ["seedFile"]

SEED_FILE_MAX_SIZE = 25_000_000
SEED_FILE_ALLOWED_EXTENSIONS = [".txt"]


# ============================================================================
# pylint: disable=too-many-instance-attributes
class FileUploadOps:
    """user non-wacz file upload management"""

    org_ops: OrgOps
    storage_ops: StorageOps

    # pylint: disable=too-many-locals, too-many-arguments, invalid-name

    def __init__(self, mdb, org_ops, storage_ops):
        self.files = mdb["file_uploads"]

        self.org_ops = org_ops
        self.storage_ops = storage_ops

        self.router = APIRouter(
            prefix="/files",
            tags=["userfiles"],
            responses={404: {"description": "Not found"}},
        )

    async def init_index(self):
        """init index for user file uploads db collection"""
        await self.files.create_index([("oid", pymongo.HASHED)])

    async def get_file_raw(
        self,
        file_id: UUID,
        org: Optional[Organization] = None,
        type_: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get raw file from db"""
        query: dict[str, object] = {"_id": file_id}
        if org:
            query["oid"] = org.id

        if type_:
            query["type"] = type_

        res = await self.files.find_one(query)

        if not res:
            raise HTTPException(status_code=404, detail="file_not_found")

        return res

    async def get_file(
        self,
        file_id: UUID,
        org: Optional[Organization] = None,
        type_: Optional[str] = None,
    ) -> UserUploadFile:
        """Get file by UUID"""
        file_raw = await self.get_file_raw(file_id, org, type_)
        return UserUploadFile.from_dict(file_raw)

    async def get_file_out(
        self,
        file_id: UUID,
        org: Optional[Organization] = None,
        type_: Optional[str] = None,
    ) -> UserUploadFileOut:
        """Get file output model by UUID"""
        user_file = await self.get_file(file_id, org, type_)
        return await user_file.get_file_out(org, self.storage_ops)

    # pylint: disable=duplicate-code
    async def upload_user_file_stream(
        self,
        stream,
        filename: str,
        org: Organization,
        user: User,
        upload_type: str = "seedfile",
    ) -> Dict[str, Union[bool, UUID]]:
        """Upload file stream and return its id"""
        self.org_ops.can_write_data(org, include_time=False)

        _, extension = os.path.splitext(filename)

        # Validate extension
        allowed_extensions = SEED_FILE_ALLOWED_EXTENSIONS
        if extension not in allowed_extensions:
            raise HTTPException(status_code=400, detail="invalid_extension")

        file_id = uuid4()

        new_filename = f"{upload_type}-{str(file_id)}{extension}"

        prefix = org.storage.get_storage_extra_path(str(org.id)) + f"{upload_type}s/"

        file_prep = ImageFilePreparer(
            prefix,
            new_filename,
            original_filename=filename,
            user=user,
            created=dt_now(),
        )

        async def stream_iter():
            """iterate over each chunk and compute and digest + total size"""
            async for chunk in stream:
                file_prep.add_chunk(chunk)
                yield chunk

        print(f"{upload_type} stream upload starting", flush=True)

        if not await self.storage_ops.do_upload_multipart(
            org,
            file_prep.upload_name,
            stream_iter(),
            MIN_UPLOAD_PART_SIZE,
            mime=file_prep.mime,
        ):
            print(f"{upload_type} stream upload failed", flush=True)
            raise HTTPException(status_code=400, detail="upload_failed")

        print(f"{upload_type} stream upload complete", flush=True)

        file_obj = file_prep.get_image_file(org.storage)

        # Validate size
        max_size = SEED_FILE_MAX_SIZE
        if file_obj.size > max_size:
            print(
                f"{upload_type} stream upload failed: max size (25 MB) exceeded",
                flush=True,
            )
            await self.storage_ops.delete_file_object(org, file_obj)
            raise HTTPException(
                status_code=400,
                detail="max_size_25_mb_exceeded",
            )

        first_seed, seed_count = await self._parse_seed_info_from_file(file_obj, org)

        # Save file to database
        file_to_insert = SeedFile(
            id=file_id,
            oid=org.id,
            filename=file_obj.filename,
            hash=file_obj.hash,
            size=file_obj.size,
            storage=file_obj.storage,
            originalFilename=file_obj.originalFilename,
            mime=file_obj.mime,
            userid=file_obj.userid,
            userName=file_obj.userName,
            created=file_obj.created,
            firstSeed=first_seed,
            seedCount=seed_count,
        )

        await self.files.insert_one(file_to_insert.to_dict())

        return {"added": True, "id": file_id}

    async def _parse_seed_info_from_file(
        self, file_obj: ImageFile, org: Organization
    ) -> Tuple[str, int]:
        first_seed = ""
        seed_count = 0

        image_file_out = await file_obj.get_image_file_out(org, self.storage_ops)

        with tempfile.TemporaryFile() as fp:
            async with aiohttp.ClientSession() as session:
                async with session.get(image_file_out.path) as resp:
                    async for chunk in resp.content.iter_chunked(4096):
                        fp.write(chunk)

            fp.seek(0)

            for line in fp:
                if not line:
                    continue

                if not first_seed:
                    first_seed = line.decode("utf-8").strip()
                seed_count += 1

        return first_seed, seed_count

    async def delete_user_file(
        self, file_id: UUID, org: Organization
    ) -> Dict[str, bool]:
        """Delete user-uploaded file from storage and db"""
        file = await self.get_file(file_id, org)
        await self.storage_ops.delete_file_object(org, file)
        await self.files.delete_one({"_id": file_id, "oid": org.id})

        return {"success": True}


# ============================================================================
def init_file_uploads_api(
    mdb,
    org_ops,
    storage_ops,
    user_dep,
):
    """Init /files api routes"""

    ops = FileUploadOps(mdb, org_ops, storage_ops)

    router = ops.router

    org_crawl_dep = org_ops.org_crawl_dep
    org_viewer_dep = org_ops.org_viewer_dep

    @router.put("/seedfile", response_model=AddedResponseId)
    async def upload_seedfile_stream(
        request: Request,
        filename: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.upload_user_file_stream(
            request.stream(), filename, org, user, upload_type="seedFile"
        )

    @router.get("/{file_id}", response_model=UserUploadFileOut)
    async def get_user_file(file_id: UUID, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_file_out(file_id, org)

    @router.delete("/{file_id}", response_model=SuccessResponse)
    async def delete_user_file(
        file_id: UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.delete_user_file(file_id, org)

    if org_ops.router:
        org_ops.router.include_router(router)

    return ops
