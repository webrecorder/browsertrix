"""Test utilities."""
import hashlib
import os
import tempfile

import boto3
import pytest


def read_in_chunks(fh, blocksize=1024):
    """Lazy function (generator) to read a file piece by piece.
    Default chunk size: 1k."""
    while True:
        data = fh.read(blocksize)
        if not data:
            break
        yield data


def download_file_and_return_hash(bucket_name: str, file_path: str) -> str:
    endpoint_url = f"http://127.0.0.1:30090/"
    client = boto3.client(
        "s3",
        region_name="",
        endpoint_url=endpoint_url,
        aws_access_key_id="ADMIN",
        aws_secret_access_key="PASSW0RD",
    )
    try:
        response = client.get_object(Bucket=bucket_name, Key=file_path)
        h = hashlib.sha256()
        for chunk in response["Body"].iter_chunks():
            h.update(chunk)
        return h.hexdigest()
    except client.exceptions.NoSuchKey:
        raise


def verify_file_replicated(file_path: str):
    assert "btrix-test-data/" not in file_path
    assert "replica-0/" not in file_path
    print(f"Verifying file {file_path} in bucket btrix-test-data", flush=True)
    primary_file_hash = download_file_and_return_hash("btrix-test-data", file_path)
    print(f"Verifying file {file_path} in bucket replica-0", flush=True)
    replica_file_hash = download_file_and_return_hash("replica-0", file_path)
    print(f"Primary file hash: {primary_file_hash}", flush=True)
    assert primary_file_hash
    print(f"Replica file hash: {replica_file_hash}", flush=True)
    assert replica_file_hash
    assert primary_file_hash == replica_file_hash


def verify_file_and_replica_deleted(file_path: str):
    assert "btrix-test-data/" not in file_path
    assert "replica-0/" not in file_path
    with pytest.raises(Exception):
        download_file_and_return_hash("btrix-test-data", file_path)
    with pytest.raises(Exception):
        download_file_and_return_hash("replica-0", file_path)
