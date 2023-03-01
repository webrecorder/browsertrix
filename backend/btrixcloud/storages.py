"""
Storage API
"""
import io
import json
import os
import struct
import zipfile
import zlib
from typing import Union
from urllib.parse import urlsplit
from contextlib import asynccontextmanager

from fastapi import Depends, HTTPException
from aiobotocore.session import get_session

from .orgs import Organization, DefaultStorage, S3Storage
from .users import User


EOCD_RECORD_SIZE = 22
ZIP64_EOCD_RECORD_SIZE = 56
ZIP64_EOCD_LOCATOR_SIZE = 20

MAX_STANDARD_ZIP_SIZE = 4_294_967_295


# ============================================================================
def init_storages_api(org_ops, crawl_manager, user_dep):
    """API for updating storage for an org"""

    router = org_ops.router
    org_owner_dep = org_ops.org_owner_dep

    # pylint: disable=bare-except, raise-missing-from
    @router.patch("/storage", tags=["organizations"])
    async def update_storage(
        storage: Union[S3Storage, DefaultStorage],
        org: Organization = Depends(org_owner_dep),
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

        await org_ops.update_storage(org, storage)

        await crawl_manager.update_org_storage(org.id, str(user.id), org.storage)

        return {"updated": True}


# ============================================================================
@asynccontextmanager
async def get_s3_client(storage, use_access=False):
    """context manager for s3 client"""
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
    """Test credentials and storage endpoint by uploading an empty test file"""

    async with get_s3_client(storage) as (client, bucket, key):
        key += filename
        data = b""

        resp = await client.put_object(Bucket=bucket, Key=key, Body=data)
        assert resp["ResponseMetadata"]["HTTPStatusCode"] == 200


# ============================================================================
async def get_presigned_url(org, crawlfile, crawl_manager, duration=3600):
    """generate pre-signed url for crawl file"""
    if crawlfile.def_storage_name:
        s3storage = await crawl_manager.get_default_storage(crawlfile.def_storage_name)

    elif org.storage.type == "s3":
        s3storage = org.storage

    else:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    async with get_s3_client(s3storage, s3storage.use_access_for_presign) as (
        client,
        bucket,
        key,
    ):
        key += crawlfile.filename

        presigned_url = await client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=duration
        )

        if (
            not s3storage.use_access_for_presign
            and s3storage.access_endpoint_url
            and s3storage.access_endpoint_url != s3storage.endpoint_url
        ):
            presigned_url = presigned_url.replace(
                s3storage.endpoint_url, s3storage.access_endpoint_url
            )

    return presigned_url


# ============================================================================
async def delete_crawl_file_object(org, crawlfile, crawl_manager):
    """delete crawl file from storage."""
    status_code = None

    if crawlfile.def_storage_name:
        s3storage = await crawl_manager.get_default_storage(crawlfile.def_storage_name)

    elif org.storage.type == "s3":
        s3storage = org.storage

    else:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    async with get_s3_client(s3storage, s3storage.use_access_for_presign) as (
        client,
        bucket,
        key,
    ):
        key += crawlfile.filename
        response = await client.delete_object(Bucket=bucket, Key=key)
        status_code = response["ResponseMetadata"]["HTTPStatusCode"]

    return status_code


# ============================================================================
async def get_wacz_logs(org, crawlfile, crawl_manager):
    """Return combined and sorted list of log line dicts from all logs in WACZ."""
    if crawlfile.def_storage_name:
        s3storage = await crawl_manager.get_default_storage(crawlfile.def_storage_name)

    elif org.storage.type == "s3":
        s3storage = org.storage

    else:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    async with get_s3_client(s3storage, s3storage.use_access_for_presign) as (
        client,
        bucket,
        key,
    ):
        key += crawlfile.filename
        cd_start, zip_file = await get_zip_file(client, bucket, key)
        log_files = [
            f
            for f in zip_file.filelist
            if f.filename.startswith("logs/") and not f.is_dir()
        ]

        combined_log_lines = []

        for log_zipinfo in log_files:
            parsed_log_lines = await extract_and_parse_log_file(
                client, bucket, key, log_zipinfo, cd_start
            )
            combined_log_lines.extend(parsed_log_lines)

        return sorted(combined_log_lines, key=lambda line: line["timestamp"])


async def extract_and_parse_log_file(client, bucket, key, log_zipinfo, cd_start):
    """Return parsed JSON from extracted and uncompressed log"""
    # pylint: disable=too-many-locals
    file_head = await fetch(
        client, bucket, key, cd_start + log_zipinfo.header_offset + 26, 4
    )
    name_len = parse_little_endian_to_int(file_head[0:2])
    extra_len = parse_little_endian_to_int(file_head[2:4])

    content = await fetch(
        client,
        bucket,
        key,
        cd_start + log_zipinfo.header_offset + 30 + name_len + extra_len,
        log_zipinfo.compress_size,
    )

    if log_zipinfo.compress_type == zipfile.ZIP_DEFLATED:
        uncompressed_content = zlib.decompressobj(-zlib.MAX_WBITS).decompress(content)
    else:
        uncompressed_content = content

    content_length = len(uncompressed_content)
    if not log_zipinfo.file_size == content_length:
        # pylint: disable=line-too-long
        detail = f"Error extracting log file {log_zipinfo.filename} from WACZ {os.path.basename(key)}."
        detail += f" Expected {log_zipinfo.file_size} bytes uncompressed but found {content_length}"
        print(detail, flush=True)
        raise HTTPException(status_code=500, detail=detail)

    parsed_log_lines = []

    for json_line in uncompressed_content.decode("utf-8").split("\n"):
        if not json_line:
            continue
        try:
            result = json.loads(json_line)
            parsed_log_lines.append(result)
        except json.JSONDecodeError as err:
            print(f"Error decoding json-l line: {json_line}. Error: {err}", flush=True)

    return parsed_log_lines


async def get_zip_file(client, bucket, key):
    """Fetch enough of the WACZ file be able to read the zip filelist"""
    file_size = await get_file_size(client, bucket, key)
    eocd_record = await fetch(
        client, bucket, key, file_size - EOCD_RECORD_SIZE, EOCD_RECORD_SIZE
    )

    if file_size <= MAX_STANDARD_ZIP_SIZE:
        cd_start, cd_size = get_central_directory_metadata_from_eocd(eocd_record)
        central_directory = await fetch(client, bucket, key, cd_start, cd_size)
        return (
            cd_start,
            zipfile.ZipFile(io.BytesIO(central_directory + eocd_record)),
        )

    zip64_eocd_record = await fetch(
        client,
        bucket,
        key,
        file_size
        - (EOCD_RECORD_SIZE + ZIP64_EOCD_LOCATOR_SIZE + ZIP64_EOCD_RECORD_SIZE),
        ZIP64_EOCD_RECORD_SIZE,
    )
    zip64_eocd_locator = await fetch(
        client,
        bucket,
        key,
        file_size - (EOCD_RECORD_SIZE + ZIP64_EOCD_LOCATOR_SIZE),
        ZIP64_EOCD_LOCATOR_SIZE,
    )
    cd_start, cd_size = get_central_directory_metadata_from_eocd64(zip64_eocd_record)
    central_directory = await fetch(client, bucket, key, cd_start, cd_size)
    return (
        cd_start,
        zipfile.ZipFile(
            io.BytesIO(
                central_directory + zip64_eocd_record + zip64_eocd_locator + eocd_record
            )
        ),
    )


async def get_file_size(client, bucket, key):
    """Get WACZ file size from HEAD request"""
    head_response = await client.head_object(Bucket=bucket, Key=key)
    return head_response["ContentLength"]


async def fetch(client, bucket, key, start, length):
    """Fetch a byte range from a file in object storage"""
    end = start + length - 1
    response = await client.get_object(
        Bucket=bucket, Key=key, Range=f"bytes={start}-{end}"
    )
    return await response["Body"].read()


def get_central_directory_metadata_from_eocd(eocd):
    """Get central directory start and size"""
    cd_size = parse_little_endian_to_int(eocd[12:16])
    cd_start = parse_little_endian_to_int(eocd[16:20])
    return cd_start, cd_size


def get_central_directory_metadata_from_eocd64(eocd64):
    """Get central directory start and size for zip64"""
    cd_size = parse_little_endian_to_int(eocd64[40:48])
    cd_start = parse_little_endian_to_int(eocd64[48:56])
    return cd_start, cd_size


def parse_little_endian_to_int(little_endian_bytes):
    """Convert little endian used in zip spec to int"""
    byte_length = len(little_endian_bytes)
    format_character = "q"
    if byte_length == 4:
        format_character = "i"
    elif byte_length == 2:
        format_character = "h"

    return struct.unpack("<" + format_character, little_endian_bytes)[0]
