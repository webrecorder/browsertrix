"""Test utilities."""
import hashlib
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
    with tempfile.NamedTemporaryFile(delete_on_close=False) as temp:
        print(f"temp.name: {temp.name}", flush=True)
        client.download_file(bucket_name, file_path, temp.name)
        print("Stat for downloaded file {temp.name}", flush=True)
        file_status = os.stat(temp.name)
        print(file_status, print=True)
        return hash_file(temp.name)


def verify_file_replicated(file_path: str):
    file_path_minus_bucket = file_path.split("/")[1]
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
