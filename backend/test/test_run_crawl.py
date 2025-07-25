import requests
import hashlib
import time
import io
import zipfile
import re
import csv
import codecs
import json
from tempfile import TemporaryFile
from zipfile import ZipFile, ZIP_STORED

import pytest

from .conftest import API_PREFIX, HOST_PREFIX, FINISHED_STATES
from .test_collections import UPDATED_NAME as COLLECTION_NAME

wacz_path = None
wacz_size = None
wacz_hash = None

wacz_content = None

page_id = None

# newly started crawl for this test suite
# (not using the fixture to be able to test running crawl)
admin_crawl_id = None


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
        "config": {"seeds": [{"url": "https://old.webrecorder.net/"}]},
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
    assert data["storageQuotaReached"] is False


def test_start_crawl(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Admin Test Crawl",
        "description": "Admin Test Crawl description",
        "tags": ["wr-test-1", "wr-test-2"],
        "config": {
            "seeds": [{"url": "https://old.webrecorder.net/", "depth": 1}],
            "exclude": "community",
            # limit now set via 'max_pages_per_crawl' global limit
            # "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global admin_crawl_id
    admin_crawl_id = data["run_now_job"]


def test_wait_for_running(admin_auth_headers, default_org_id):
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "running":
            break
        time.sleep(2)


def test_crawl_queue(admin_auth_headers, default_org_id):
    # 422 - requires offset and count
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/queue",
        headers=admin_auth_headers,
    )
    assert r.status_code == 422

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/queue?offset=0&count=20",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        if data["total"] > 0:
            break

    assert len(data["results"]) > 0
    assert data["results"][0].startswith("https://")


def test_crawl_queue_match(admin_auth_headers, default_org_id):
    # 422, regex required
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/queueMatchAll",
        headers=admin_auth_headers,
    )
    assert r.status_code == 422

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/queueMatchAll?regex=webrecorder&offset=0",
        headers=admin_auth_headers,
    )

    data = r.json()
    assert data["total"] > 0
    assert len(data["matched"]) > 0
    assert data["matched"][0].startswith("https://")


def test_add_exclusion(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/exclusions?regex=test",
        headers=admin_auth_headers,
    )
    assert r.json()["success"] == True


def test_add_invalid_exclusion(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/exclusions?regex=[",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_regex"


def test_remove_exclusion(admin_auth_headers, default_org_id):
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/exclusions?regex=test",
        headers=admin_auth_headers,
    )
    assert r.json()["success"] == True


def test_wait_for_complete(admin_auth_headers, default_org_id):
    state = None
    data = None
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            state = data["state"]
            break
        time.sleep(5)

    assert data["state"] == "complete"

    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]

    assert len(data["initialPages"]) == 4
    assert data["pagesQueryUrl"].endswith(
        f"/orgs/{default_org_id}/crawls/{admin_crawl_id}/pagesSearch"
    )
    assert data["downloadUrl"] is None

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


def test_queue_and_exclusions_error_crawl_not_running(
    admin_auth_headers, default_org_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/queue?offset=0&count=20",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "crawl_not_running"

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/queueMatchAll?regex=webrecorder&offset=0",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "crawl_not_running"

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/exclusions?regex=test2",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "crawl_not_running"


def test_crawl_info(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["fileSize"] == wacz_size
    assert data["fileCount"] == 1
    assert data["userName"]
    assert data["version"] == 2
    assert data["scale"] == 1
    assert data["browserWindows"] == 2


def test_crawls_include_seed_info(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["firstSeed"] == "https://old.webrecorder.net/"
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


def test_crawl_seeds_endpoint(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/seeds",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["url"] == "https://old.webrecorder.net/"
    assert data["items"][0]["depth"] == 1


def test_crawls_exclude_errors(admin_auth_headers, default_org_id):
    # Get endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("errors") == []

    # replay.json endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("errors") == []

    # List endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    for crawl in crawls:
        assert data.get("errors") == []


def test_crawls_exclude_full_seeds(admin_auth_headers, default_org_id):
    # Get endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    config = data.get("config")
    assert config is None or config.get("seeds") is None

    # replay.json endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    config = r.json().get("config")
    assert config is None or config.get("seeds") is None

    # List endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    for crawl in crawls:
        config = crawl.get("config")
        assert config is None or config.get("seeds") is None


def test_crawls_include_file_error_page_counts(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["filePageCount"] >= 0
    assert data["errorPageCount"] >= 0


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
    assert '"https://old.webrecorder.net/"' in pages

    # 1 seed page + header line
    assert len(pages.strip().split("\n")) == 2

    # 1 other page
    pages = z.open("pages/extraPages.jsonl").read().decode("utf-8")
    assert '"https://old.webrecorder.net/blog"' in pages

    # 3 other page + header line
    assert len(pages.strip().split("\n")) == 4


@pytest.mark.parametrize(
    "type_path",
    [
        # crawls endpoint
        ("crawls"),
        # all-crawls endpoint
        ("all-crawls"),
    ],
)
def test_download_wacz_crawls(
    admin_auth_headers, default_org_id, admin_crawl_id, type_path
):
    with TemporaryFile() as fh:
        with requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/{type_path}/{admin_crawl_id}/download",
            headers=admin_auth_headers,
            stream=True,
        ) as r:
            assert r.status_code == 200
            for chunk in r.iter_content():
                fh.write(chunk)

        fh.seek(0)
        with ZipFile(fh, "r") as zip_file:
            contents = zip_file.namelist()

            assert len(contents) >= 2
            for filename in contents:
                assert filename.endswith(".wacz") or filename == "datapackage.json"
                assert zip_file.getinfo(filename).compress_type == ZIP_STORED

                if filename == "datapackage.json":
                    data = zip_file.read(filename).decode("utf-8")
                    datapackage = json.loads(data)
                    assert len(datapackage["resources"]) == 1
                    for resource in datapackage["resources"]:
                        assert resource["name"] == resource["path"]
                        assert resource["hash"]
                        assert resource["bytes"]


def test_update_crawl(
    admin_auth_headers,
    default_org_id,
    admin_crawl_id,
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == ["wr-test-1", "wr-test-2"]
    assert len(data["collectionIds"]) == 1

    # Make new collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={"name": "Crawl Update Test Collection"},
    )
    new_coll_id = r.json()["id"]

    # Submit patch request
    UPDATED_TAGS = ["wr-test-1-updated", "wr-test-2-updated"]
    UPDATED_DESC = "Lorem ipsum test note."
    UPDATED_NAME = "Updated crawl name"
    UPDATED_COLLECTION_IDS = [new_coll_id]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={
            "tags": UPDATED_TAGS,
            "description": UPDATED_DESC,
            "name": UPDATED_NAME,
            "collectionIds": UPDATED_COLLECTION_IDS,
        },
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
    assert data["collectionIds"] == UPDATED_COLLECTION_IDS
    assert data.get("reviewStatus") is None

    # Update reviewStatus and verify
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={
            "reviewStatus": 5,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["reviewStatus"] == 5

    # Test sorting on reviewStatus
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=reviewStatus",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[0]["id"] == admin_crawl_id
    assert crawls[0]["reviewStatus"] == 5

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=reviewStatus&sortDirection=1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[-1]["id"] == admin_crawl_id
    assert crawls[-1]["reviewStatus"] == 5

    # Test sorting on reviewStatus for all-crawls
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=reviewStatus",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[0]["id"] == admin_crawl_id
    assert crawls[0]["reviewStatus"] == 5

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=reviewStatus&sortDirection=1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[-1]["id"] == admin_crawl_id
    assert crawls[-1]["reviewStatus"] == 5

    # Try to update to invalid reviewStatus
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
        json={
            "reviewStatus": "invalid",
        },
    )
    assert r.status_code == 422

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["reviewStatus"] == 5

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


def test_crawl_stats_all_orgs_not_superadmin(crawler_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/crawls/stats", headers=crawler_auth_headers
    )
    assert r.status_code == 403


def test_crawl_stats_all_orgs(admin_auth_headers):
    with requests.get(
        f"{API_PREFIX}/orgs/all/crawls/stats", headers=admin_auth_headers, stream=True
    ) as r:
        assert r.status_code == 200

        # Wait for stream content
        if not r.content:
            while True:
                if r.content:
                    break
                time.sleep(5)

        buffer = r.iter_lines()
        for row in csv.DictReader(
            codecs.iterdecode(buffer, "utf-8"), skipinitialspace=True
        ):
            assert row["id"]
            assert row["oid"]
            assert row["org"]
            assert row["cid"]
            assert row["name"] or row["name"] == ""
            assert row["state"]
            assert row["userid"]
            assert row["user"]
            assert row["started"]
            assert row["finished"] or row["finished"] is None
            assert row["duration"] or row["duration"] == 0
            assert row["pages"] or row["pages"] == 0
            assert row["filesize"] or row["filesize"] == 0
            assert row["avg_page_time"] or row["avg_page_time"] == 0


def test_crawl_stats(crawler_auth_headers, default_org_id):
    with requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/stats",
        headers=crawler_auth_headers,
        stream=True,
    ) as r:
        assert r.status_code == 200

        # Wait for stream content
        if not r.content:
            while True:
                if r.content:
                    break
                time.sleep(5)

        buffer = r.iter_lines()
        for row in csv.DictReader(
            codecs.iterdecode(buffer, "utf-8"), skipinitialspace=True
        ):
            assert row["id"]
            assert row["oid"] == default_org_id
            assert row["org"]
            assert row["cid"]
            assert row["name"] or row["name"] == ""
            assert row["state"]
            assert row["userid"]
            assert row["user"]
            assert row["finished"] or row["finished"] is None
            assert row["duration"] or row["duration"] == 0
            assert row["pages"] or row["pages"] == 0
            assert row["filesize"] or row["filesize"] == 0
            assert row["avg_page_time"] or row["avg_page_time"] == 0

            started = row["started"]
            assert started
            assert started.endswith("Z")


def test_crawl_pages(crawler_auth_headers, default_org_id, crawler_crawl_id):
    # Test GET list endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["total"] == 3

    pages = data["items"]
    assert pages

    for page in pages:
        assert page["id"]
        assert page["oid"]
        assert page["crawl_id"]
        assert page["url"]
        assert page["ts"]
        assert page.get("title") or page.get("title") is None
        assert page["loadState"]
        assert page["status"]
        assert page["mime"]
        assert page["filename"]
        assert page["depth"] is not None
        assert page["favIconUrl"]
        assert page["isSeed"] in (True, False)
        assert page["isError"] in (True, False)
        assert page["isFile"] in (True, False)

    # Test GET page endpoint
    global page_id
    test_page = pages[0]
    page_id = test_page["id"]
    test_page_url = test_page["url"]
    test_page_ts = test_page["ts"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    page = r.json()

    assert page["id"] == page_id
    assert page["oid"]
    assert page["crawl_id"]
    assert page["url"]
    assert page["ts"]
    assert page.get("title") or page.get("title") is None
    assert page["loadState"]
    assert page["mime"]
    assert page["filename"]
    assert page["depth"] is not None
    assert page["favIconUrl"]
    assert page["isSeed"] in (True, False)
    assert page["isError"] in (True, False)
    assert page["isFile"] in (True, False)

    assert page["notes"] == []
    assert page.get("userid") is None
    assert page.get("modified") is None
    assert page.get("approved") is None

    # Test exact url filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?url={test_page_url}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["total"] >= 1
    for matching_page in data["items"]:
        assert matching_page["url"] == test_page_url

    # Test exact url and ts filters together
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?url={test_page_url}&ts={test_page_ts}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["total"] >= 1
    for matching_page in data["items"]:
        assert matching_page["url"] == test_page_url
        assert matching_page["ts"] == test_page_ts

    # Test urlPrefix filter
    url_prefix = test_page_url[:8]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?urlPrefix={url_prefix}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["total"] >= 1

    found_matching_page = False
    for page in data["items"]:
        if page["id"] == page_id and page["url"] == test_page_url:
            found_matching_page = True

    assert found_matching_page

    # Test isSeed filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?isSeed=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    for page in data["items"]:
        assert page["isSeed"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?isSeed=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    for page in data["items"]:
        assert page["isSeed"] is False

    # Test depth filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?depth=0",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    for page in data["items"]:
        assert page["depth"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?depth=1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    for page in data["items"]:
        assert page["depth"] == 1


def test_crawl_pages_qa_filters(crawler_auth_headers, default_org_id, crawler_crawl_id):
    # Test reviewed filter (page has no notes or approved so should show up in false)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?reviewed=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 3

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?reviewed=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0

    # Update page with approval
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
        json={
            "approved": True,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["approved"]

    # Test approval filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=True,False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=None",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 2

    # Test reviewed filter (page now approved so should show up in True, other pages show here)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?reviewed=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 2

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?reviewed=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    page = r.json()

    assert page["id"] == page_id
    assert page["oid"]
    assert page["crawl_id"]
    assert page["url"]
    assert page["ts"]
    assert page.get("title") or page.get("title") is None
    assert page["loadState"]
    assert page["mime"]
    assert page["filename"]
    assert page["depth"] is not None
    assert page["favIconUrl"]
    assert page["isSeed"] in (True, False)
    assert page["isError"] in (True, False)
    assert page["isFile"] in (True, False)

    assert page["notes"] == []
    assert page["userid"]
    assert page["approved"]

    modified = page["modified"]
    assert modified
    assert modified.endswith("Z")

    # Set approved to False and test filter again
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
        json={
            "approved": False,
        },
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=True,False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=None",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 2


def test_re_add_crawl_pages(crawler_auth_headers, default_org_id, crawler_crawl_id):
    # Store page counts to compare against after re-adding
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    page_count_before = data["pageCount"]
    page_count_before_unique = data["uniquePageCount"]
    page_count_before_files = data["filePageCount"]
    page_count_before_errors = data["errorPageCount"]

    # Re-add pages and verify they were correctly added
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/reAdd",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["started"]

    time.sleep(10)

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 0

    pages = data["items"]
    assert pages

    for page in pages:
        assert page["id"]
        assert page["oid"]
        assert page["crawl_id"]
        assert page["url"]
        assert page["ts"]
        assert page.get("title") or page.get("title") is None
        assert page["loadState"]
        assert page["status"]
        assert page["mime"]
        assert page["filename"]
        assert page["depth"] is not None
        assert page["favIconUrl"]
        assert page["isSeed"] in (True, False)
        assert page["isError"] in (True, False)
        assert page["isFile"] in (True, False)

    # Ensure only superuser can re-add pages for all crawls in an org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/all/pages/reAdd",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 403

    # Check that crawl page counts were recalculated properly
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["pageCount"] > 0 and data["pageCount"] == page_count_before
    assert (
        data["uniquePageCount"] > 0
        and data["uniquePageCount"] == page_count_before_unique
    )
    assert data["filePageCount"] == page_count_before_files
    assert data["errorPageCount"] == page_count_before_errors


def test_crawl_page_notes(crawler_auth_headers, default_org_id, crawler_crawl_id):
    note_text = "testing"
    updated_note_text = "updated"
    untouched_text = "untouched"

    # Add note
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes",
        headers=crawler_auth_headers,
        json={"text": note_text},
    )
    assert r.status_code == 200
    assert r.json()["added"]

    # Check that note was added
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["notes"]) == 1

    first_note = data["notes"][0]

    first_note_id = first_note["id"]
    assert first_note_id

    assert first_note["created"]
    assert first_note["userid"]
    assert first_note["userName"]
    assert first_note["text"] == note_text

    # Make sure page approval is set to None and re-test filters
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
        json={
            "approved": None,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Test approved filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=True,False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=None",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 3

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?approved=true,false,none",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 3

    # Test reviewed filter (page now has notes so should show up in True)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?reviewed=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 2

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?reviewed=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1

    # Test notes filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?hasNotes=False",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 2

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages?hasNotes=True",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1

    # Add second note to test selective updates/deletes
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes",
        headers=crawler_auth_headers,
        json={"text": untouched_text},
    )
    assert r.status_code == 200
    assert r.json()["added"]

    # Edit first note
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes",
        headers=crawler_auth_headers,
        json={"text": updated_note_text, "id": first_note_id},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Verify notes look as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    notes = data["notes"]

    assert len(notes) == 2

    updated_note = [note for note in notes if note["id"] == first_note_id][0]
    assert updated_note["text"] == updated_note_text

    second_note_id = [note["id"] for note in notes if note["text"] == untouched_text][0]
    assert second_note_id

    # Delete both notes
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}/notes/delete",
        headers=crawler_auth_headers,
        json={"delete_list": [first_note_id, second_note_id]},
    )
    assert r.status_code == 200
    assert r.json()["deleted"]

    # Verify notes were deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    notes = data.get("notes")
    assert notes == []


def test_delete_crawls_crawler(crawler_auth_headers, default_org_id, crawler_crawl_id):
    # Test that crawler user can't delete another user's crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [admin_crawl_id]},
    )
    assert r.status_code == 403
    data = r.json()
    assert data["detail"] == "not_allowed"

    # Check that pages exist for crawl
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] > 0

    # Get WACZ presigned url for crawl about to delete
    wacz_presigned_urls = []
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["resources"]) >= 1
    for resource in data["resources"]:
        wacz_presigned_urls.append(resource["path"])

    # Test that crawler user can delete own crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [crawler_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"] == 1
    assert data["storageQuotaReached"] is False

    time.sleep(5)

    # Test that crawl is not found after deleting
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404

    # Test that WACZs are deleted
    for wacz_url in wacz_presigned_urls:
        r = requests.get(f"http://localhost:30870{wacz_url}")
        assert r.status_code == 404

    # Test that associated pages are also deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0


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
    assert data["storageQuotaReached"] is False

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


def test_custom_behavior_logs(
    custom_behaviors_crawl_id, crawler_auth_headers, default_org_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{custom_behaviors_crawl_id}/behaviorLogs",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    custom_log_line_count = 0

    assert data["total"] > 0
    for log in data["items"]:
        assert log["timestamp"]
        assert log["context"] in ("behavior", "behaviorScript", "behaviorScriptCustom")

        if log["context"] == "behaviorScriptCustom":
            assert log["message"] in (
                "test-stat",
                "In Test Behavior!",
            )
            if log["message"] in ("test-stat", "done!"):
                assert log["details"]["behavior"] == "TestBehavior"
            assert log["details"]["page"] == "https://specs.webrecorder.net/"

            custom_log_line_count += 1

    assert custom_log_line_count == 2


def test_crawls_exclude_behavior_logs(
    custom_behaviors_crawl_id, admin_auth_headers, default_org_id
):
    # Get endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{custom_behaviors_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("behaviorLogs") == []

    # replay.json endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{custom_behaviors_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("behaviorLogs") == []

    # List endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    for crawl in crawls:
        assert data.get("behaviorLogs") == []


def test_seed_file_crawl(
    crawler_auth_headers, default_org_id, seed_file_id, seed_file_config_id
):
    # Run crawl from workflow with seed file
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{seed_file_config_id}/run",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawl_id = r.json()["started"]

    # Wait for it to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(5)

    time.sleep(10)

    # Check on crawl
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["config"]["seedFileId"] == seed_file_id
    assert data["state"] == "complete"

    # Validate crawl pages
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    for page in data["items"]:
        assert page["url"] in (
            "https://specs.webrecorder.net/",
            "https://webrecorder.net/",
        )
