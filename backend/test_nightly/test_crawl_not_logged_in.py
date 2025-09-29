import time

import pytest
import requests
from typing import Dict
from uuid import UUID

from .conftest import API_PREFIX

config_id = None


def _create_profile_browser(
    headers: Dict[str, str], oid: UUID, url: str = "https://webrecorder.net"
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser",
        headers=headers,
        json={"url": url},
    )
    assert r.status_code == 200
    browser_id = r.json()["browserid"]

    time.sleep(5)

    # Wait until successful ping, then return profile browser id
    while True:
        r = requests.post(
            f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/ping",
            headers=headers,
        )
        data = r.json()
        if data.get("success"):
            return browser_id
        time.sleep(5)


@pytest.fixture(scope="session")
def profile_browser_id(admin_auth_headers, default_org_id):
    return _create_profile_browser(admin_auth_headers, default_org_id)


def prepare_browser_for_profile_commit(
    browser_id: str, headers: Dict[str, str], oid: UUID
) -> None:
    # Ping to make sure it doesn't expire
    r = requests.post(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/ping",
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("success")
    assert data.get("origins") or data.get("origins") == []

    # Verify browser seems good
    r = requests.get(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}",
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["url"]
    assert data["path"]
    assert data["password"]
    assert data["auth_bearer"]
    assert data["scale"]
    assert data["oid"] == oid

    # Navigate to new URL
    r = requests.post(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/navigate",
        headers=headers,
        json={"url": "https://webrecorder.net/tools"},
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Ping browser until ready
    max_attempts = 20
    attempts = 1
    while attempts <= max_attempts:
        try:
            r = requests.post(
                f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/ping",
                headers=headers,
            )
            data = r.json()
            if data["success"]:
                break
            time.sleep(5)
        except:
            time.sleep(5)
        attempts += 1


@pytest.fixture(scope="session")
def profile_id(admin_auth_headers, default_org_id, profile_browser_id):
    prepare_browser_for_profile_commit(
        profile_browser_id, admin_auth_headers, default_org_id
    )

    # Create profile
    start_time = time.monotonic()
    time_limit = 30
    while True:
        try:
            r = requests.post(
                f"{API_PREFIX}/orgs/{default_org_id}/profiles",
                headers=admin_auth_headers,
                json={
                    "browserid": profile_browser_id,
                    "name": "Test profile",
                },
                timeout=10,
            )
            assert r.status_code == 200
            data = r.json()
            if data.get("detail") and data.get("detail") == "waiting_for_browser":
                time.sleep(5)
                continue
            if data.get("added"):
                assert data["storageQuotaReached"] in (True, False)
                return data["id"]
        except:
            if time.monotonic() - start_time > time_limit:
                raise
            time.sleep(5)


@pytest.fixture(scope="session")
def fail_not_logged_in_crawl_id(admin_auth_headers, default_org_id, profile_id):
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
        "profileid": profile_id,
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
