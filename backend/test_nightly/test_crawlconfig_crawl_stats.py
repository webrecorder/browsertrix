import requests
import time

from .conftest import API_PREFIX


def test_crawlconfig_crawl_stats(admin_auth_headers, default_org_id, crawl_config_info):
    crawl_config_id, crawl_id, second_crawl_id = crawl_config_info

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    first_crawl_finished = data["finished"]
    assert first_crawl_finished

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{second_crawl_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    second_crawl_finished = data["finished"]
    assert second_crawl_finished

    # Verify crawl stats from /crawlconfigs
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawl_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["crawlAttemptCount"] == 2
    assert data["crawlCount"] == 2
    assert data["lastCrawlId"] == second_crawl_id
    assert data["lastCrawlState"] == "complete"
    assert data["lastCrawlTime"] == second_crawl_finished

    # Delete second crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [second_crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    # Verify crawl stats from /crawlconfigs
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawl_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["crawlAttemptCount"] == 2
    assert data["crawlCount"] == 1
    assert data["lastCrawlId"] == crawl_id
    assert data["lastCrawlState"] == "complete"
    assert data["lastCrawlTime"] == first_crawl_finished

    # Delete first crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    # Verify crawl stats from /crawlconfigs
    max_attempts = 18
    attempts = 1
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawl_config_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()

        if data["crawlAttemptCount"] == 2 and data["crawlCount"] == 0:
            assert not data["lastCrawlId"]
            assert not data["lastCrawlState"]
            assert not data["lastCrawlTime"]
            break

        if attempts >= max_attempts:
            assert False

        time.sleep(10)
        attempts += 1
