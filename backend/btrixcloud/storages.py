"""
Storage API
"""
from typing import Union
from urllib.parse import urlsplit
from contextlib import asynccontextmanager
import os

from fastapi import Depends, HTTPException
from aiobotocore.session import get_session

from .archives import Archive, DefaultStorage, S3Storage
from .users import User


# sign access endpoint
sign_access_endpoint = os.environ.get("SIGN_ACCESS_ENDPOINT")


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
@asynccontextmanager
async def get_s3_client(storage, use_access=False):
    """ context manager for s3 client"""
    endpoint_url = (
        storage.endpoint_url if not use_access else storage.access_endpoint_url
    )
    if not endpoint_url.endswith("/"):
        endpoint_url += "/"

    parts = urlsplit(endpoint_url)
    bucket, key = parts.path[1:].split("/", 1)

    endpoint_url = parts.scheme + "://" + parts.netloc

    session = get_session()

    async with session.create_client(
        "s3",
        region_name=storage.region,
        endpoint_url=endpoint_url,
        aws_access_key_id=storage.access_key,
        aws_secret_access_key=storage.secret_key,
    ) as client:
        yield client, bucket, key


# ============================================================================
async def verify_storage_upload(storage, filename):
    """ Test credentials and storage endpoint by uploading an empty test file """

    async with get_s3_client(storage) as (client, bucket, key):
        key += filename
        data = b""

        resp = await client.put_object(Bucket=bucket, Key=key, Body=data)
        assert resp["ResponseMetadata"]["HTTPStatusCode"] == 200


# ============================================================================
async def get_presigned_url(archive, crawlfile, crawl_manager, duration=3600):
    """ generate pre-signed url for crawl file """
    if crawlfile.def_storage_name:
        s3storage = await crawl_manager.get_default_storage(crawlfile.def_storage_name)

    elif archive.storage.type == "s3":
        s3storage = archive.storage

    else:
        raise Exception("No Default Storage Found, Invalid Storage Type")

    async with get_s3_client(s3storage, sign_access_endpoint) as (client, bucket, key):
        key += crawlfile.filename

        presigned_url = await client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=duration
        )

        if (
            not sign_access_endpoint
            and s3storage.access_endpoint_url
            and s3storage.access_endpoint_url != s3storage.endpoint_url
        ):
            presigned_url = presigned_url.replace(
                s3storage.endpoint_url, s3storage.access_endpoint_url
            )

    return presigned_url
