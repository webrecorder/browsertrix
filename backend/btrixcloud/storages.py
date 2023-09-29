"""
Storage API
"""
from typing import Optional, Union, Iterator, Iterable, List, Dict
from urllib.parse import urlsplit
from contextlib import asynccontextmanager

import asyncio
import heapq
import json
import itertools

from datetime import datetime

from fastapi import Depends, HTTPException
from stream_zip import stream_zip, NO_COMPRESSION_64

import aiobotocore.session
import boto3

from .models import CrawlFile, Organization, DefaultStorage, S3Storage, User
from .zip import (
    sync_get_zip_file,
    sync_get_log_stream,
)


CHUNK_SIZE = 1024 * 256


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

    session = aiobotocore.session.get_session()

    async with session.create_client(
        "s3",
        region_name=storage.region,
        endpoint_url=endpoint_url,
        aws_access_key_id=storage.access_key,
        aws_secret_access_key=storage.secret_key,
    ) as client:
        yield client, bucket, key


# ============================================================================
def get_sync_s3_client(storage, use_access=False):
    """context manager for s3 client"""
    endpoint_url = storage.endpoint_url

    if not endpoint_url.endswith("/"):
        endpoint_url += "/"

    parts = urlsplit(endpoint_url)
    bucket, key = parts.path[1:].split("/", 1)

    endpoint_url = parts.scheme + "://" + parts.netloc

    client = boto3.client(
        "s3",
        region_name=storage.region,
        endpoint_url=endpoint_url,
        aws_access_key_id=storage.access_key,
        aws_secret_access_key=storage.secret_key,
    )

    public_endpoint_url = (
        storage.endpoint_url if not use_access else storage.access_endpoint_url
    )

    return client, bucket, key, public_endpoint_url


# ============================================================================
async def verify_storage_upload(storage, filename):
    """Test credentials and storage endpoint by uploading an empty test file"""

    async with get_s3_client(storage) as (client, bucket, key):
        key += filename
        data = b""

        resp = await client.put_object(Bucket=bucket, Key=key, Body=data)
        assert resp["ResponseMetadata"]["HTTPStatusCode"] == 200


# ============================================================================
async def do_upload_single(org, filename, data, crawl_manager, storage_name="default"):
    """do upload to specified key"""
    s3storage = None

    if org.storage.type == "s3":
        s3storage = org.storage
    else:
        s3storage = await crawl_manager.get_default_storage(storage_name)

    if not s3storage:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    async with get_s3_client(s3storage) as (client, bucket, key):
        key += filename

        return await client.put_object(Bucket=bucket, Key=key, Body=data)


# ============================================================================
async def get_sync_client(org, crawl_manager, storage_name="default", use_access=False):
    """get sync client"""
    s3storage = None

    if org.storage.type == "s3":
        s3storage = org.storage
    else:
        s3storage = await crawl_manager.get_default_storage(storage_name)

    if not s3storage:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    return get_sync_s3_client(s3storage, use_access=use_access)


# ============================================================================
# pylint: disable=too-many-arguments,too-many-locals
async def do_upload_multipart(
    org, filename, file_, min_size, crawl_manager, storage_name="default"
):
    """do upload to specified key using multipart chunking"""
    s3storage = None

    if org.storage.type == "s3":
        s3storage = org.storage
    else:
        s3storage = await crawl_manager.get_default_storage(storage_name)

    if not s3storage:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    async def get_next_chunk(file_, min_size):
        total = 0
        bufs = []

        async for chunk in file_:
            bufs.append(chunk)
            total += len(chunk)

            if total >= min_size:
                break

        if len(bufs) == 1:
            return bufs[0]
        return b"".join(bufs)

    async with get_s3_client(s3storage) as (client, bucket, key):
        key += filename

        mup_resp = await client.create_multipart_upload(
            ACL="bucket-owner-full-control", Bucket=bucket, Key=key
        )

        upload_id = mup_resp["UploadId"]

        parts = []
        part_number = 1

        try:
            while True:
                chunk = await get_next_chunk(file_, min_size)

                resp = await client.upload_part(
                    Bucket=bucket,
                    Body=chunk,
                    UploadId=upload_id,
                    PartNumber=part_number,
                    Key=key,
                )

                print(f"part added: {part_number} {len(chunk)} {upload_id}", flush=True)

                parts.append({"PartNumber": part_number, "ETag": resp["ETag"]})

                part_number += 1

                if len(chunk) < min_size:
                    break

            await client.complete_multipart_upload(
                Bucket=bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )

            print(f"Multipart upload succeeded: {upload_id}")

            return True
        # pylint: disable=broad-exception-caught
        except Exception as exc:
            await client.abort_multipart_upload(
                Bucket=bucket, Key=key, UploadId=upload_id
            )

            print(exc)
            print(f"Multipart upload failed: {upload_id}")

            return False


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
    return await delete_file(
        org, crawlfile.filename, crawl_manager, crawlfile.def_storage_name
    )


# ============================================================================
async def delete_file(org, filename, crawl_manager, def_storage_name="default"):
    """delete specified file from storage"""
    status_code = None

    if def_storage_name:
        s3storage = await crawl_manager.get_default_storage(def_storage_name)

    elif org.storage.type == "s3":
        s3storage = org.storage

    else:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    async with get_s3_client(s3storage, s3storage.use_access_for_presign) as (
        client,
        bucket,
        key,
    ):
        key += filename
        response = await client.delete_object(Bucket=bucket, Key=key)
        status_code = response["ResponseMetadata"]["HTTPStatusCode"]

    return status_code == 204


# ============================================================================
async def sync_stream_wacz_logs(org, wacz_files, log_levels, contexts, crawl_manager):
    """Return filtered stream of logs from specified WACZs sorted by timestamp"""
    client, bucket, key, _ = await get_sync_client(org, crawl_manager)

    loop = asyncio.get_event_loop()

    resp = await loop.run_in_executor(
        None, _sync_get_logs, wacz_files, log_levels, contexts, client, bucket, key
    )

    return resp


# ============================================================================
def _parse_json(line):
    """Parse JSON str into dict."""
    parsed_json: Optional[dict] = None
    try:
        parsed_json = json.loads(line)
    except json.JSONDecodeError as err:
        print(f"Error decoding json-l line: {line}. Error: {err}", flush=True)
    return parsed_json


# ============================================================================
def _sync_get_logs(
    wacz_files: List[CrawlFile],
    log_levels: List[str],
    contexts: List[str],
    client,
    bucket: str,
    key: str,
) -> Iterator[bytes]:
    """Generate filtered stream of logs from specified WACZs sorted by timestamp"""

    # pylint: disable=too-many-function-args
    def stream_log_lines(
        wacz_key, wacz_filename, cd_start, log_zipinfo
    ) -> Iterator[dict]:
        """Pass lines as json objects"""

        print(f"Fetching log {log_zipinfo.filename} from {wacz_filename}", flush=True)

        line_iter: Iterator[bytes] = sync_get_log_stream(
            client, bucket, wacz_key, log_zipinfo, cd_start
        )

        for line in line_iter:
            yield _parse_json(line.decode("utf-8", errors="ignore"))

    def stream_json_lines(
        iterator: Iterable[dict], log_levels: List[str], contexts: List[str]
    ) -> Iterator[bytes]:
        """Yield parsed JSON dicts as JSON-lines bytes after filtering as necessary"""
        for line_dict in iterator:
            if log_levels and line_dict["logLevel"] not in log_levels:
                continue
            if contexts and line_dict["context"] not in contexts:
                continue
            json_str = json.dumps(line_dict, ensure_ascii=False) + "\n"
            yield json_str.encode("utf-8")

    def organize_based_on_instance_number(
        wacz_files: List[CrawlFile],
    ) -> List[List[CrawlFile]]:
        """Place wacz_files into their own list based on instance number"""
        wacz_files.sort(key=lambda file: file.filename)
        waczs_groups: Dict[str, List[CrawlFile]] = {}
        for file in wacz_files:
            instance_number = file.filename[
                file.filename.rfind("-") + 1 : file.filename.rfind(".")
            ]
            if instance_number in waczs_groups:
                waczs_groups[instance_number].append(file)
            else:
                waczs_groups[instance_number] = [file]
        return list(waczs_groups.values())

    log_generators: List[Iterator[dict]] = []

    waczs_groups = organize_based_on_instance_number(wacz_files)
    for instance_list in waczs_groups:
        wacz_log_streams: List[Iterator[dict]] = []

        for wacz_file in instance_list:
            wacz_key = key + wacz_file.filename
            cd_start, zip_file = sync_get_zip_file(client, bucket, wacz_key)

            log_files = [
                f
                for f in zip_file.filelist
                if f.filename.startswith("logs/") and not f.is_dir()
            ]
            log_files.sort(key=lambda log_zipinfo: log_zipinfo.filename)

            for log_zipinfo in log_files:
                wacz_log_streams.append(
                    stream_log_lines(
                        wacz_key, wacz_file.filename, cd_start, log_zipinfo
                    )
                )

        log_generators.append(itertools.chain(*wacz_log_streams))

    heap_iter = heapq.merge(*log_generators, key=lambda entry: entry["timestamp"])

    return stream_json_lines(heap_iter, log_levels, contexts)


# ============================================================================
def _sync_dl(all_files, client, bucket, key):
    """generate streaming zip as sync"""
    for file_ in all_files:
        file_.path = file_.name

    datapackage = {
        "profile": "multi-wacz-package",
        "resources": [file_.dict() for file_ in all_files],
    }
    datapackage = json.dumps(datapackage).encode("utf-8")

    def get_file(name):
        response = client.get_object(Bucket=bucket, Key=key + name)
        return response["Body"].iter_chunks(chunk_size=CHUNK_SIZE)

    def member_files():
        modified_at = datetime(year=1980, month=1, day=1)
        perms = 0o664
        for file_ in all_files:
            yield (
                file_.name,
                modified_at,
                perms,
                NO_COMPRESSION_64,
                get_file(file_.name),
            )

        yield (
            "datapackage.json",
            modified_at,
            perms,
            NO_COMPRESSION_64,
            (datapackage,),
        )

    return stream_zip(member_files(), chunk_size=CHUNK_SIZE)


# ============================================================================
async def download_streaming_wacz(org, crawl_manager, files):
    """return an iter for downloading a stream nested wacz file
    from list of files"""
    client, bucket, key, _ = await get_sync_client(org, crawl_manager)

    loop = asyncio.get_event_loop()

    resp = await loop.run_in_executor(None, _sync_dl, files, client, bucket, key)

    return resp
