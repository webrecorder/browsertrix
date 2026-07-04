import os

import requests
import pytest

from .conftest import API_PREFIX
from .utils import read_in_chunks

curr_dir = os.path.dirname(os.path.realpath(__file__))

@pytest.fixture(scope="module")
def seed_file_id(crawler_auth_headers, default_org_id):
    """Upload a test seed file and return its ID."""
    with open(os.path.join(curr_dir, "data", "seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=seedfile.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 200
        return r.json()["id"]


def test_seed_file_upload(crawler_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=seedfile.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["added"]
        assert data["id"]

        _seed_file_id = data["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{_seed_file_id}",
        headers={"Host": "custom-host.example.com", **crawler_auth_headers},
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == _seed_file_id
    assert data["oid"] == default_org_id

    assert data["name"]
    assert data["path"].startswith("http://custom-host.example.com/data/")
    assert data["hash"]
    assert data["size"] > 0

    assert data["originalFilename"] == "seedfile.txt"
    assert data["mime"] == "text/plain"
    assert data["userid"]
    assert data["userName"]
    assert data["created"]

    assert data["type"] == "seedFile"
    assert data["firstSeed"] == "https://specs.webrecorder.net"
    assert data["seedCount"] == 2


def test_list_user_files(seed_file_id, crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files",
        headers={"Host": "localhost", **crawler_auth_headers},
    )
    assert r.status_code == 200
    data = r.json()

    items = data["items"]
    total = data["total"]

    assert total >= 0
    assert total == len(items)

    for data in items:
        assert data["id"]
        assert data["oid"] == default_org_id

        assert data["name"]
        assert data["path"].startswith("http://localhost/data/")
        assert data["hash"]
        assert data["size"] > 0

        assert data["originalFilename"]
        assert data["mime"]
        assert data["userid"]
        assert data["userName"]
        assert data["created"]

        assert data["type"] == "seedFile"
        assert data["firstSeed"]
        assert data["seedCount"]


def test_delete_seed_file(seed_file_id, crawler_auth_headers, default_org_id):
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404


def test_invalid_seed_file_upload(crawler_auth_headers, default_org_id):
    # Ensure we can't upload a binary file as a seed file
    with open(os.path.join(curr_dir, "data", "thumbnail.jpg"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=imposter.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "invalid_seed_file"

    # Ensure "seed file" with no valid seeds also fails to upload
    with open(os.path.join(curr_dir, "data", "invalid-seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=novalidseeds.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "invalid_seed_file"
