import requests
import hashlib
import time
import io
import zipfile

from .conftest import API_PREFIX, HOST_PREFIX

wacz_path = None
wacz_size = None
wacz_hash = None

wacz_content = None


def test_list_orgs(admin_auth_headers, default_org_id):
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()

    orgs = data["orgs"]
    assert len(orgs) > 0

    org_ids = []
    for org in orgs:
        org_ids.append(org["id"])
    assert default_org_id in org_ids


def test_create_new_config(admin_auth_headers, default_org_id):
    crawl_data = {
        "runNow": True,
        "name": "Test Crawl",
        "config": {"seeds": ["https://webrecorder.net/"]},
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["run_now_job"]


def test_wait_for_complete(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["state"] == "complete"

    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]

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

    pages = z.open("pages/pages.jsonl").read().decode("utf-8")
    assert '"https://webrecorder.net/"' in pages


def test_update_tags(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == ["wr-test-1", "wr-test-2"]

    # Submit patch request to update tags
    UPDATED_TAGS = ["wr-test-1-updated", "wr-test-2-updated"]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={"tags": UPDATED_TAGS},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)

    # Verify deleting all tags works as well
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={"tags": []},
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["tags"] == []
