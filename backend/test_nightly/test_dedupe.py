import time
import pytest
import requests

from .conftest import API_PREFIX


last_saved_at = None


@pytest.fixture(scope="session")
def dedupe_coll_id(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={"name": "Dedupe Coll"},
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="session")
def dedupe_workflow_id(crawler_auth_headers, default_org_id, dedupe_coll_id):
    # Start crawl
    crawl_data = {
        "runNow": False,
        "name": "Crawl with dedupe",
        "config": {
            "seeds": [{"url": "https://old.webrecorder.net/"}],
            "scopeType": "domain",
            "limit": 10,
            "exclude": "community"
        },
        "crawlerChannel": "dedupe",
        "dedupeCollId": dedupe_coll_id
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()
    return data["id"]


def start_and_wait_for_crawl(workflow_id, org_id, headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_id}/crawlconfigs/{workflow_id}/run",
        headers=headers,
    )
    crawl_id = r.json()["started"]

    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{org_id}/crawls/{crawl_id}/replay.json",
            headers=headers
        )
        data = r.json()
        if data["state"] in ("complete", "failed"):
            return crawl_id
        time.sleep(5)


def find_crawl_in_collection(default_org_id, dedupe_coll_id, crawl_id, crawler_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?collectionId={dedupe_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    found = False
    for crawl in r.json()["items"]:
        if crawl["id"] == crawl_id:
            found = True
            break

    assert found


def wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, status, max_wait=30):
    count = 0
    while count < max_wait:
        coll = requests.get(f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}", headers=crawler_auth_headers)
        data = coll.json()
        if data.get("indexState") != status and (status != "idle" or data.get("indexLastSavedAt")):
            count += 1
            time.sleep(5)
            continue

        break

    return data


@pytest.fixture(scope="session")
def dedupe_first_crawl(dedupe_workflow_id, default_org_id, dedupe_coll_id, crawler_auth_headers):
    return start_and_wait_for_crawl(dedupe_workflow_id, default_org_id, crawler_auth_headers)


@pytest.fixture(scope="session")
def dedupe_second_crawl(dedupe_workflow_id, default_org_id, dedupe_coll_id, crawler_auth_headers):
    return start_and_wait_for_crawl(dedupe_workflow_id, default_org_id, crawler_auth_headers)


@pytest.mark.timeout(600)
def test_first_crawl_stats(default_org_id, dedupe_coll_id, dedupe_first_crawl, crawler_auth_headers):
    find_crawl_in_collection(default_org_id, dedupe_coll_id, dedupe_first_crawl, crawler_auth_headers)

    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "ready")

    assert data.get("indexLastSavedAt") == None

    stats = data.get("indexStats")
    assert stats["conservedSize"] > 2500
    assert stats["dupeUrls"] == 2
    assert stats["totalCrawlSize"] > 51000000
    assert stats["totalCrawls"] == 1
    assert stats["totalUrls"] == 50
    assert stats["uniqueHashes"] == 48
    assert stats["updateProgress"] == 0
    assert stats["estimatedRedundantSize"] == 0
    assert stats["removedCrawlSize"] == 0
    assert stats["removedCrawls"] == 0


def test_index_idle_after_first(default_org_id, dedupe_coll_id, crawler_auth_headers):
    global last_saved_at
    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "idle")
    last_saved_at = data.get("indexLastSavedAt")


@pytest.mark.timeout(600)
def test_second_crawl_stats(default_org_id, dedupe_coll_id, dedupe_second_crawl, crawler_auth_headers):
    find_crawl_in_collection(default_org_id, dedupe_coll_id, dedupe_second_crawl, crawler_auth_headers)

    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "ready")

    assert data.get("indexLastSavedAt") == last_saved_at

    stats = data.get("indexStats")
    assert stats["conservedSize"] > 49000000
    assert stats["dupeUrls"] == 52
    assert stats["totalCrawlSize"] > 53000000
    assert stats["totalCrawls"] == 2
    assert stats["totalUrls"] == 100
    assert stats["uniqueHashes"] == 48
    assert stats["updateProgress"] == 0
    assert stats["estimatedRedundantSize"] == 0
    assert stats["removedCrawlSize"] == 0
    assert stats["removedCrawls"] == 0


def test_index_idle_after_second(default_org_id, dedupe_coll_id, crawler_auth_headers):
    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "idle")
    saved_at = data.get("indexLastSavedAt")

    assert saved_at > last_saved_at
