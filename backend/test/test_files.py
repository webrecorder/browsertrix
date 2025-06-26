import os
import requests

from .conftest import API_PREFIX

curr_dir = os.path.dirname(os.path.realpath(__file__))

_seed_file_id = None


def test_seed_file_upload(crawler_auth_headers, default_org_id):
    # https://dev.browsertrix.com/api/orgs/c69247f4-415e-4abc-b449-e85d2f26c626/collections/b764fbe1-baab-4dc5-8dca-2db6f82c250b/data?filename=page-data_47fe599e-ed62-4edd-b078-93d4bf281e0f.jpeg&sourceUrl=https%3A%2F%2Fspecs.webrecorder.net%2F&sourceTs=2024-08-16T08%3A00%3A21.601000Z&sourcePageId=47fe599e-ed62-4edd-b078-93d4bf281e0f
    with open(os.path.join(curr_dir, "data", "seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedfile?filename=seedfile.txt",
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
