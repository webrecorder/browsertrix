import requests
import os
from urllib.parse import urljoin

from .conftest import API_PREFIX

upload_id = None
upload_dl_path = None


curr_dir = os.path.dirname(os.path.realpath(__file__))

def test_upload_stream(admin_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?name=test.wacz",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    global upload_id
    upload_id = r.json()["id"]


def test_list_uploads(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    assert len(results["items"]) > 0

    assert results["items"][0]["id"] == upload_id

    assert results["items"][0]["name"] == "test.wacz"

    global upload_dl_path
    upload_dl_path = results["items"][0]["resources"][0]["path"]

def test_verify_upload():
    dl_path = urljoin(API_PREFIX, upload_dl_path)
    wacz_resp = requests.get(dl_path)
    actual = wacz_resp.content

    with open(os.path.join(curr_dir, "example.wacz"), "rb") as fh:
        expected = fh.read()

    assert len(actual) == len(expected)
    assert actual == expected

def test_delete_uploads(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id]}
        #json=[upload_id]
    )
    assert r.json()["deleted"] == True

def read_in_chunks(fh, blocksize=1024):
    """Lazy function (generator) to read a file piece by piece.
    Default chunk size: 1k."""
    while True:
        data = fh.read(blocksize)
        if not data:
            break
        yield data

