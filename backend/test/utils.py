"""Test utilities."""
import hashlib
import os
import tempfile

import boto3


def read_in_chunks(fh, blocksize=1024):
    """Lazy function (generator) to read a file piece by piece.
    Default chunk size: 1k."""
    while True:
        data = fh.read(blocksize)
        if not data:
            break
        yield data


def hash_file(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as file_:
        chunk = 0
        while chunk != b"":
            chunk = file_.read(1024)
            h.update(chunk)
    return h.hexdigest()


def download_file_and_return_hash(bucket_name: str, file_path: str) -> str:
    endpoint_url = "http://local-minio.default:30090/"
    client = boto3.client(
        "s3",
        region_name="",
        endpoint_url=endpoint_url,
        aws_access_key_id="ADMIN",
        aws_secret_access_key="PASSW0RD!",
    )
    try:
        temp = tempfile.NamedTemporaryFile(delete=False)
        client.download_file(bucket_name, file_path, temp.name)
        file_hash = hash_file(temp.name)
        temp.close()
        return file_hash
    # pylint: disable=broad-exception
    except Exception:
        return None


def verify_file_replicated(file_path: str):
    print(f"file path: {file_path}", flush=True)
    file_path_minus_bucket = file_path.split("/")[1]
    print(f"file path minus bucket: {file_path_minus_bucket}", flush=True)
    primary_file_hash = download_file_and_return_hash(
        "btrix-test-data", file_path_minus_bucket
    )
    replica_file_hash = download_file_and_return_hash(
        "replica-0", file_path_minus_bucket
    )
    print(f"Primary file hash: {primary_file_hash}", flush=True)
    assert primary_file_hash
    print(f"Replica file hash: {replica_file_hash}", flush=True)
    assert replica_file_hash
    assert primary_file_hash == replica_file_hash


def verify_file_and_replica_deleted(file_path: str):
    file_path_minus_bucket = file_path.split("/")[1]
    assert (
        download_file_and_return_hash("btrix-test-data", file_path_minus_bucket) is None
    )
    assert download_file_and_return_hash("replica-0", file_path_minus_bucket) is None
