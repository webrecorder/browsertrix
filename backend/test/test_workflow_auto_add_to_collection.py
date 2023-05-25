import requests
import time

from .conftest import API_PREFIX


def test_workflow_crawl_auto_added_to_collection(
    crawler_auth_headers,
    default_org_id,
    auto_add_collection_id,
    auto_add_crawl_id,
):
    # Verify that crawl is in collection
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{auto_add_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert auto_add_collection_id in r.json()["collections"]


def test_workflow_crawl_auto_added_subsequent_runs(
    crawler_auth_headers,
    default_org_id,
    auto_add_collection_id,
    auto_add_crawl_id,
    auto_add_config_id,
):
    # Run workflow again and make sure new crawl is also in collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{auto_add_config_id}/run",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("started")
    crawl_id = data["started"]

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            break
        time.sleep(5)

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert auto_add_collection_id in r.json()["collections"]
