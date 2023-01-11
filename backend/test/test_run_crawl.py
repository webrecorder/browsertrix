import requests
import hashlib
import time
import io
import zipfile

from .conftest import API_PREFIX, ADMIN_USERNAME, ADMIN_PW

host_prefix = "http://127.0.0.1:30870"

wacz_path = None
wacz_size = None
wacz_hash = None

wacz_content = None


def test_list_archives(admin_auth_headers, admin_aid):
    r = requests.get(f"{API_PREFIX}/archives", headers=admin_auth_headers)
    data = r.json()

    archives = data["archives"]
    assert len(archives) > 0

    archive_ids = []
    archive_names = []
    for archive in archives:
        archive_ids.append(archive["id"])
        archive_names.append(archive["name"])
    assert admin_aid in archive_ids
    assert "admin's Archive" in archive_names


def test_create_new_config(admin_auth_headers, admin_aid):
    crawl_data = {
        "runNow": True,
        "name": "Test Crawl",
        "config": {"seeds": ["https://example.com/"]},
    }
    r = requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["run_now_job"]


def test_wait_for_complete(admin_auth_headers, admin_aid, admin_crawl_id):
    print("")
    print("---- Running Crawl ----")

    while True:
        r = requests.get(
            f"{API_PREFIX}/archives/{admin_aid}/crawls/{admin_crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        assert (
            data["state"] == "starting"
            or data["state"] == "running"
            or data["state"] == "complete"
        ), data["state"]
        if data["state"] == "complete":
            break

        time.sleep(5)

    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]

    global wacz_path
    global wacz_size
    global wacz_hash
    wacz_path = data["resources"][0]["path"]
    wacz_size = data["resources"][0]["size"]
    wacz_hash = data["resources"][0]["hash"]


def test_crawl_info(admin_auth_headers, admin_aid, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/archives/{admin_aid}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["fileSize"] == wacz_size


def test_download_wacz():
    r = requests.get(host_prefix + wacz_path)
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
    assert '"https://example.com/"' in pages
