import time

import pytest
import requests

from .conftest import API_PREFIX

config_id = None


@pytest.fixture(scope="session")
def fail_not_logged_in_crawl_id(admin_auth_headers, default_org_id):
    # Start crawl
    crawl_data = {
        "runNow": True,
        "name": "Fail Crawl Not Logged In",
        "config": {
            "seeds": [{"url": "https://x.com/webrecorder_io"}],
            "scopeType": "page",
            "limit": 1,
            "failOnContentCheck": True,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global config_id
    config_id = data["id"]

    crawl_id = data["run_now_job"]

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "running":
            # Give crawl time to start properly
            time.sleep(30)
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def failed_crawl_finished(
    admin_auth_headers, default_org_id, fail_not_logged_in_crawl_id
):
    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{fail_not_logged_in_crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in ("complete", "failed", "failed_not_logged_in"):
            # Give some time for WACZ files to be stored
            time.sleep(30)
            break
        time.sleep(5)


def test_fail_crawl_not_logged_in(
    admin_auth_headers,
    default_org_id,
    fail_not_logged_in_crawl_id,
    failed_crawl_finished,
):
    # Ensure crawl has expected state
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{fail_not_logged_in_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["state"] == "failed_not_logged_in"

    # Ensure workflow lastCrawlState has expected state
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["lastCrawlState"] == "failed_not_logged_in"
