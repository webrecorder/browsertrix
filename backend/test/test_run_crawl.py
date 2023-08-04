import requests
import hashlib
import time
import io
import zipfile
import re

from .conftest import API_PREFIX, HOST_PREFIX
from .test_collections import UPDATED_NAME as COLLECTION_NAME

wacz_path = None
wacz_size = None
wacz_hash = None

wacz_content = None


def test_list_orgs(admin_auth_headers, default_org_id):
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()

    orgs = data["items"]
    assert len(orgs) > 0
    assert data["total"] > 0

    org_ids = []
    for org in orgs:
        org_ids.append(org["id"])
    assert default_org_id in org_ids


def test_create_new_config(admin_auth_headers, default_org_id):
    crawl_data = {
        "runNow": False,
        "name": "Test Crawl",
        "config": {"seeds": [{"url": "https://webrecorder.net/"}]},
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["run_now_job"] == None


def test_wait_for_complete(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["state"] == "complete"

    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]

    # ensure filename matches specified pattern
    # set in default_crawl_filename_template
    assert re.search("/[\\d]+-testing-[\\w-]+\\.wacz", data["resources"][0]["path"])

    assert data["tags"] == ["wr-test-1", "wr-test-2"]

    global wacz_path
    global wacz_size
    global wacz_hash
    wacz_path = data["resources"][0]["path"]
    wacz_size = data["resources"][0]["size"]
    wacz_hash = data["resources"][0]["hash"]


def test_crawl_info(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["fileSize"] == wacz_size
    assert data["fileCount"] == 1


def test_crawls_include_seed_info(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["firstSeed"] == "https://webrecorder.net/"
    assert data["seedCount"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    data = r.json()
    crawls = data["items"]
    assert crawls
    for crawl in crawls:
        assert crawl["firstSeed"]
        assert crawl["seedCount"] > 0

    r = requests.get(
        f"{API_PREFIX}/orgs/all/crawls?runningOnly=0",
        headers=admin_auth_headers,
    )
    data = r.json()
    crawls = data["items"]
    assert crawls
    for crawl in crawls:
        assert crawl["firstSeed"]
        assert crawl["seedCount"] > 0


def test_crawls_exclude_errors(admin_auth_headers, default_org_id, admin_crawl_id):
    # Get endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "errors" not in data or data.get("errors") is None

    # replay.json endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "errors" not in data or data.get("errors") is None

    # List endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    for crawl in crawls:
        assert "errors" not in crawl or crawl.get("errors") is None


def test_download_wacz():
    r = requests.get(HOST_PREFIX + wacz_path)
    assert r.status_code == 200
    assert len(r.content) == wacz_size

    h = hashlib.sha256()
    h.update(r.content)
    assert h.hexdigest() == wacz_hash, (h.hexdigest(), wacz_hash)

    global wacz_content
    wacz_content = r.content


def test_verify_wacz():
    b = io.BytesIO(wacz_content)
    z = zipfile.ZipFile(b)

    assert "pages/pages.jsonl" in z.namelist()

    # 1 seed page
    pages = z.open("pages/pages.jsonl").read().decode("utf-8")
    assert '"https://webrecorder.net/"' in pages

    # 1 seed page + header line
    assert len(pages.strip().split("\n")) == 2

    # 1 other page
    pages = z.open("pages/extraPages.jsonl").read().decode("utf-8")
    assert '"https://webrecorder.net/blog"' in pages

    # 3 other page + header line
    assert len(pages.strip().split("\n")) == 4


def test_update_crawl(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == ["wr-test-1", "wr-test-2"]

    # Submit patch request to update tags and description
    UPDATED_TAGS = ["wr-test-1-updated", "wr-test-2-updated"]
    UPDATED_DESC = "Lorem ipsum test note."
    UPDATED_NAME = "Updated crawl name"
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={"tags": UPDATED_TAGS, "description": UPDATED_DESC, "name": UPDATED_NAME},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME

    # Verify deleting works as well
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={"tags": [], "description": None},
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["tags"] == []
    assert not data["description"]


def test_delete_crawls_crawler(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    # Test that crawler user can't delete another user's crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [admin_crawl_id]},
    )
    assert r.status_code == 403
    data = r.json()
    assert data["detail"] == "Not Allowed"

    # Test that crawler user can delete own crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [crawler_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"] == 1

    # Test that crawl is not found after deleting
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404


def test_delete_crawls_org_owner(
    admin_auth_headers,
    crawler_auth_headers,
    default_org_id,
    admin_crawl_id,
    crawler_crawl_id,
    wr_specs_crawl_id,
):
    # Test that org owner can delete own crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [admin_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404

    # Test that org owner can delete another org user's crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [wr_specs_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{wr_specs_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404
