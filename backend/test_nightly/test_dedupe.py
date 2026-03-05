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
        json={"name": "Dedupe Collection"},
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
        if data.get("indexState") != status or (status == "idle" and not data.get("indexLastSavedAt")):
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


def test_first_crawl_stats(default_org_id, dedupe_coll_id, dedupe_first_crawl, crawler_auth_headers):
    find_crawl_in_collection(default_org_id, dedupe_coll_id, dedupe_first_crawl, crawler_auth_headers)

    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "ready")

    assert data.get("indexLastSavedAt") == None

    stats = data.get("indexStats")
    print(stats)
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


def test_second_crawl_stats(default_org_id, dedupe_coll_id, dedupe_second_crawl, crawler_auth_headers):
    find_crawl_in_collection(default_org_id, dedupe_coll_id, dedupe_second_crawl, crawler_auth_headers)

    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "ready")

    assert data.get("indexLastSavedAt") == last_saved_at

    stats = data.get("indexStats")
    print(stats)
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

def test_crawl_dependency_links(default_org_id, dedupe_coll_id, crawler_auth_headers, dedupe_first_crawl, dedupe_second_crawl):
    resp = requests.get(f"{API_PREFIX}/orgs/{default_org_id}/crawls/{dedupe_first_crawl}/replay.json", headers=crawler_auth_headers)
    first = resp.json()
    assert first["fileSize"] >= 51000000

    assert first["dedupeCollId"] == dedupe_coll_id
    assert first["requiredByCrawls"] == [dedupe_second_crawl]
    assert first["requiresCrawls"] == []

    stats = first["dedupeStats"]
    assert stats["conservedSize"] >= 2500
    assert stats["dupeUrls"] == 2
    assert stats["totalUrls"] == 50


    resp = requests.get(f"{API_PREFIX}/orgs/{default_org_id}/crawls/{dedupe_second_crawl}/replay.json", headers=crawler_auth_headers)
    second = resp.json()

    assert second["fileSize"] < 2100000
    assert second["dedupeCollId"] == dedupe_coll_id
    assert second["requiredByCrawls"] == []
    assert second["requiresCrawls"] == [dedupe_first_crawl]

    stats = second["dedupeStats"]
    assert stats["conservedSize"] >= 49000000
    assert stats["dupeUrls"] == 50
    assert stats["totalUrls"] == 50

def test_remove_crawl_from_collection(default_org_id, dedupe_coll_id, crawler_auth_headers, dedupe_second_crawl):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}/remove",
        json={"crawlIds": [dedupe_second_crawl]},
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "idle")

    stats = data.get("indexStats")
    print(stats)
    assert stats["conservedSize"] > 49000000
    assert stats["dupeUrls"] == 52
    assert stats["totalCrawlSize"] > 53000000
    assert stats["totalCrawls"] == 2
    assert stats["totalUrls"] == 100
    assert stats["uniqueHashes"] == 48
    assert stats["updateProgress"] == 1.0
    assert stats["estimatedRedundantSize"] == 0

    assert stats["removedCrawlSize"] < 2100000
    assert stats["removedCrawls"] == 1

def test_purge_index(default_org_id, dedupe_coll_id, admin_auth_headers, crawler_auth_headers):
    # requires admin
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}/dedupeIndex/purge",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 403

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}/dedupeIndex/purge",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200

    data = wait_index_status(default_org_id, dedupe_coll_id, crawler_auth_headers, "idle")

    # back to stats after only 1 crawl
    stats = data.get("indexStats")
    print(stats)
    assert stats["conservedSize"] > 2500
    assert stats["conservedSize"] <= 3000
    assert stats["dupeUrls"] == 2
    assert stats["totalCrawlSize"] > 51000000
    assert stats["totalCrawlSize"] <= 52000000
    assert stats["totalCrawls"] == 1
    assert stats["totalUrls"] == 50
    assert stats["uniqueHashes"] == 48
    assert stats["updateProgress"] == 0
    assert stats["estimatedRedundantSize"] == 0
    assert stats["removedCrawlSize"] == 0
    assert stats["removedCrawls"] == 0

def test_delete_coll(default_org_id, dedupe_coll_id, admin_auth_headers, crawler_auth_headers):
    # need to delete index first
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "not_allowed_while_dedupe_index_exists"

    # not allowed for crawler
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}/dedupeIndex/delete",
        json={"removeFromWorkflows": True},
        headers=crawler_auth_headers,
    )
    assert r.status_code == 403

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}/dedupeIndex/delete",
        json={"removeFromWorkflows": True},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200

    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{dedupe_coll_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]
