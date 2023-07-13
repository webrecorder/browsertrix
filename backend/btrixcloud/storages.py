"""
Storage API
"""
from typing import Union
from urllib.parse import urlsplit
from contextlib import asynccontextmanager

import asyncio
import json
import queue
import time

from datetime import datetime

from fastapi import Depends, HTTPException
from stream_zip import stream_zip, NO_COMPRESSION_64

from boto3.s3.transfer import TransferConfig


import aiobotocore.session
import boto3

from .orgs import Organization, DefaultStorage, S3Storage
from .users import User
from .zip import get_zip_file, extract_and_parse_log_file


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
async def get_client(org, crawl_manager, storage_name="default"):
    """get async client"""
    s3storage = None

    if org.storage.type == "s3":
        s3storage = org.storage
    else:
        s3storage = await crawl_manager.get_default_storage(storage_name)

    if not s3storage:
        raise TypeError("No Default Storage Found, Invalid Storage Type")

    return get_s3_client(s3storage)


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

        return combined_log_lines


# ============================================================================
def get_public_policy(bucket_path):
    """return public policy for /public paths"""
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": ["s3:GetObject"],
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Resource": [f"arn:aws:s3:::{bucket_path}/*/public/*"],
                "Sid": "",
            }
        ],
    }


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


# ============================================================================
async def upload_streaming_wacz(
    target_path, org, crawl_manager, files, update_published_callback
):
    """perform a streaming upload of a wacz file for the specified collection"""

    client, bucket, key, endpoint_url = await get_sync_client(
        org, crawl_manager, use_access=True
    )

    # set published url to empty / publishing
    await update_published_callback("")

    loop = asyncio.get_event_loop()

    msgq = queue.Queue()

    total_size = 0
    for file_ in files:
        total_size += file_.size

    uploading = True

    async def process_q(msgq, total_size, update_published_callback):
        """update upload size in db"""

        while uploading:
            try:
                new_value = msgq.get_nowait()
                if new_value == -1:
                    break

                percent = 100 * new_value / total_size

                await update_published_callback("", percent)

            except queue.Empty:
                await asyncio.sleep(3)

    async def finish_task(published_url):
        if not await loop.run_in_executor(
            None,
            _sync_publish,
            files,
            client,
            bucket,
            key,
            target_path,
            msgq,
        ):
            # publishing failed
            published_url = ""

        nonlocal uploading
        uploading = False

        await update_published_callback(published_url)

    asyncio.create_task(process_q(msgq, total_size, update_published_callback))

    published_url = endpoint_url + target_path
    asyncio.create_task(finish_task(published_url))

    return {"publishing": True}


# ============================================================================
def _sync_publish(all_files, client, bucket, key, target_path, msgq):
    """publish collection to public s3 path"""

    counter = UploadCounter(msgq)
    try:
        target_path = key + target_path

        wacz_stream = _sync_dl(all_files, client, bucket, key)
        wacz_stream = to_file_like_obj(wacz_stream)

        # set part size to 5MB
        config = TransferConfig(multipart_threshold=5 * 1024**2)

        client.upload_fileobj(
            Fileobj=wacz_stream,
            Bucket=bucket,
            Key=target_path,
            Callback=counter.update,
            Config=config,
        )

        bucket_path = bucket + "/" + key.rstrip("/") if key else bucket

        policy = json.dumps(get_public_policy(bucket_path))

        client.put_bucket_policy(Bucket=bucket, Policy=policy)

        # indicate we're done with this q
        msgq.put(-1)

        return True

    # pylint: disable=broad-exception-caught
    except Exception:
        return False


# ============================================================================
# pylint: disable=too-few-public-methods
class UploadCounter:
    """UploadCounter"""

    def __init__(self, msgq):
        self.counter = 0
        self.msgq = msgq
        self.last_update = 0

    def update(self, num):
        """upload callback"""
        self.counter += num
        update_time = time.time()
        if (update_time - self.last_update) > 1:
            self.last_update = update_time
            self.msgq.put(self.counter)


# ============================================================================
def to_file_like_obj(iterable):
    """iter to file like obj"""
    chunk = b""
    offset = 0
    # pylint: disable=invalid-name
    it = iter(iterable)

    def up_to_iter(size):
        nonlocal chunk, offset

        # if no size, yield exactly one chunk
        if not size or size < 0:
            try:
                chunk = next(it)
                yield chunk
            except StopIteration:
                pass

            return

        while size:
            if offset == len(chunk):
                try:
                    chunk = next(it)
                except StopIteration:
                    break
                else:
                    offset = 0
            to_yield = min(size, len(chunk) - offset)
            offset = offset + to_yield
            size -= to_yield
            yield chunk[offset - to_yield : offset]

    # pylint: disable=too-few-public-methods
    class FileLikeObj:
        """file-like obj wrapper for upload"""

        def read(self, size=-1):
            """read interface for file-like obj"""
            return b"".join(up_to_iter(size))

    return FileLikeObj()
