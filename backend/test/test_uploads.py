import requests
import os
from urllib.parse import urljoin

from .conftest import API_PREFIX

upload_id = None
upload_id_2 = None
upload_dl_path = None


curr_dir = os.path.dirname(os.path.realpath(__file__))


def test_upload_stream(admin_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?name=test.wacz",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    global upload_id
    upload_id = r.json()["id"]


def test_list_stream_upload(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    assert len(results["items"]) > 0

    found = None

    for res in results["items"]:
        if res["id"] == upload_id:
            found = res

    assert found
    assert found["name"] == "test.wacz"
    assert "files" not in found
    assert "resources" not in found


def test_get_stream_upload(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()
    assert "files" not in result
    upload_dl_path = result["resources"][0]["path"]

    dl_path = urljoin(API_PREFIX, upload_dl_path)
    wacz_resp = requests.get(dl_path)
    actual = wacz_resp.content

    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        expected = fh.read()

    assert len(actual) == len(expected)
    assert actual == expected

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200


def test_replace_upload(admin_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "example-2.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?name=test.wacz&replaceId={upload_id}",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    assert upload_id == r.json()["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    # only one file, previous file removed
    assert len(result["resources"]) == 1

    dl_path = urljoin(API_PREFIX, result["resources"][0]["path"])
    wacz_resp = requests.get(dl_path)
    actual = wacz_resp.content

    with open(os.path.join(curr_dir, "data", "example-2.wacz"), "rb") as fh:
        expected = fh.read()

    assert len(actual) == len(expected)
    assert actual == expected


def test_delete_stream_upload(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id]},
    )
    assert r.json()["deleted"] == True


def test_upload_form(admin_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        data = fh.read()

    files = [
        ("uploads", ("test.wacz", data, "application/octet-stream")),
        ("uploads", ("test-2.wacz", data, "application/octet-stream")),
        ("uploads", ("test.wacz", data, "application/octet-stream")),
    ]

    r = requests.put(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/formdata?name=test2.wacz",
        headers=admin_auth_headers,
        files=files,
    )

    assert r.status_code == 200
    assert r.json()["added"]

    global upload_id_2
    upload_id_2 = r.json()["id"]


def test_list_form_upload(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    assert len(results["items"]) > 0

    found = None

    for res in results["items"]:
        if res["id"] == upload_id_2:
            found = res

    assert found
    assert found["name"] == "test2.wacz"

    assert "files" not in res
    assert "resources" not in res


def test_verify_from_upload_resource_count(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id_2}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    assert "files" not in result
    assert len(result["resources"]) == 3

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200


def test_list_all_crawls(admin_auth_headers, default_org_id):
    """Test that /all-crawls lists crawls and uploads before deleting uploads"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    items = data["items"]

    assert len(items) == data["total"]

    crawls = [item for item in items if item["type"] == "crawl"]
    assert len(crawls) > 0

    uploads = [item for item in items if item["type"] == "upload"]
    assert len(uploads) > 0

    for item in items:
        assert item["type"] in ("crawl", "upload")
        assert item["id"]
        assert item["userid"]
        assert item["oid"] == default_org_id
        assert item["started"]
        assert item["finished"]
        assert item["state"]


def test_get_upload_from_all_crawls(admin_auth_headers, default_org_id):
    """Test that /all-crawls lists crawls and uploads before deleting uploads"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["name"] == "test2.wacz"

    assert "files" not in data
    assert data["resources"]


def test_delete_form_upload_from_all_crawls(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id_2]},
    )
    assert r.json()["deleted"] == True


def test_ensure_deleted(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    for res in results["items"]:
        if res["id"] in (upload_id_2, upload_id):
            assert False


def read_in_chunks(fh, blocksize=1024):
    """Lazy function (generator) to read a file piece by piece.
    Default chunk size: 1k."""
    while True:
        data = fh.read(blocksize)
        if not data:
            break
        yield data
