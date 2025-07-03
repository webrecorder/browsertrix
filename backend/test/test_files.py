import os
import requests

from .conftest import API_PREFIX
from .utils import read_in_chunks

curr_dir = os.path.dirname(os.path.realpath(__file__))

_seed_file_id = None


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

        global _seed_file_id
        _seed_file_id = data["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{_seed_file_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == _seed_file_id
    assert data["oid"] == default_org_id

    assert data["name"]
    assert data["path"]
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


def test_delete_seed_file(crawler_auth_headers, default_org_id):
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{_seed_file_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{_seed_file_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404
