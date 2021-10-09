"""
Storage API
"""
from typing import Union
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException
from aiobotocore.session import get_session

from archives import Archive, DefaultStorage, S3Storage
from users import User


# ============================================================================
def init_storages_api(archive_ops, crawl_manager, user_dep):
    """ API for updating storage for an archive """

    router = archive_ops.router
    archive_owner_dep = archive_ops.archive_owner_dep

    # pylint: disable=bare-except, raise-missing-from
    @router.patch("/storage", tags=["archives"])
    async def update_storage(
        storage: Union[S3Storage, DefaultStorage],
        archive: Archive = Depends(archive_owner_dep),
        user: User = Depends(user_dep),
    ):
        if storage.type == "default":
            try:
                await crawl_manager.check_storage(storage.name, is_default=True)
            except:
                raise HTTPException(
                    status_code=400, detail=f"Invalid default storage {storage.name}"
                )

        else:
            try:
                await verify_storage_upload(storage, ".btrix-upload-verify")
            except:
                raise HTTPException(
                    status_code=400,
                    detail="Could not verify custom storage. Check credentials are valid?",
                )

        await archive_ops.update_storage(archive, storage)

        await crawl_manager.update_archive_storage(
            archive.id, str(user.id), archive.storage
        )

        return {"updated": True}


# ============================================================================
async def verify_storage_upload(storage, filename):
    """ Test credentials and storage endpoint by uploading an empty test file """
    if not storage.endpoint_url.endswith("/"):
        storage.endpoint_url += "/"

    session = get_session()

    parts = urlsplit(storage.endpoint_url)

    bucket, key = parts.path[1:].split("/", 1)
    key += filename

    endpoint_url = parts.scheme + "://" + parts.netloc

    async with session.create_client(
        "s3",
        region_name="",
        endpoint_url=endpoint_url,
        aws_access_key_id=storage.access_key,
        aws_secret_access_key=storage.secret_key,
    ) as client:
        data = b""
        resp = await client.put_object(Bucket=bucket, Key=key, Body=data)
        assert resp["ResponseMetadata"]["HTTPStatusCode"] == 200
