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
    try:
        with tempfile.NamedTemporaryFile() as temp:
            client.download_file(bucket_name, file_path, temp)
            return hash_file(temp)
    # pylint: disable=broad-except
    except Exception:
        return None


def verify_replica_file_identical_to_original(file_path: str):
    file_path_minus_bucket = file_path.split("/")[1]
    primary_file_hash = download_file_and_return_hash("btrix-test-data", file_path_minus_bucket)
    replica_file_hash = download_file_and_return_hash("replica-0", file_path_minus_bucket)
    return primary_file_hath == replica_file_hash

