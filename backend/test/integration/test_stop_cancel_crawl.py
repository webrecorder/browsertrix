"""Tests for stopping and canceling crawls.

Each test is independently runnable - no module-level globals.
"""

import time

import pytest
import requests

from .conftest import API_PREFIX


def _get_crawl(org_id, auth_headers, crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_id}/crawls/{crawl_id}/replay.json",
        headers=auth_headers,
    )
    assert r.status_code == 200
    return r.json()


def _start_crawl(default_org_id, crawler_config_id_only, crawler_auth_headers):
    """Start a crawl and return its ID."""
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawler_config_id_only}/run",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("started")
    return data["started"]


def test_cancel_crawl(
    default_org_id, crawler_config_id_only, crawler_auth_headers
):
    """Start a crawl, wait for it to begin, then cancel it."""
    # Wait for no crawl to be running
    while True:
        time.sleep(2)
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawler_config_id_only}",
            headers=crawler_auth_headers,
        )
        if r.json().get("isCrawlRunning") is False:
            break

    crawl_id = _start_crawl(
        default_org_id, crawler_config_id_only, crawler_auth_headers
    )

    # Wait until crawl is past "starting" state
    data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)
    while data["state"] == "starting":
        time.sleep(5)
        data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/cancel",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["success"] == True

    data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)

    while data["state"] in (
        "starting",
        "running",
        "waiting_capacity",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    ):
        time.sleep(5)
        data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)

    assert data["state"] == "canceled"
    assert data["stopping"] == False
    assert len(data["resources"]) == 0


def test_stop_crawl_immediately(
    default_org_id, crawler_config_id_only, crawler_auth_headers
):
    """Start a crawl and stop it immediately."""
    # Wait for no crawl to be running
    while True:
        time.sleep(2)
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawler_config_id_only}",
            headers=crawler_auth_headers,
        )
        if r.json().get("isCrawlRunning") is False:
            break

    crawl_id = _start_crawl(
        default_org_id, crawler_config_id_only, crawler_auth_headers
    )

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/stop",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["success"] == True

    # Test crawl
    data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)
    assert data["stopping"] == True

    # Test workflow
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawler_config_id_only}",
        headers=crawler_auth_headers,
    )
    assert r.json()["lastCrawlStopping"] == True

    while data["state"] in (
        "starting",
        "running",
        "waiting_capacity",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    ):
        time.sleep(5)
        data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)

    assert data["state"] in ("canceled", "stopped_by_user")
    assert data["stopping"] == True


def test_stop_crawl_partial(
    default_org_id, crawler_config_id_only, crawler_auth_headers
):
    """Start a crawl, wait for some pages, then stop it."""
    # Wait for no crawl to be running
    while True:
        time.sleep(2)
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawler_config_id_only}",
            headers=crawler_auth_headers,
        )
        if r.json().get("isCrawlRunning") is False:
            break

    crawl_id = _start_crawl(
        default_org_id, crawler_config_id_only, crawler_auth_headers
    )

    # Wait for at least one page to be crawled
    data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)
    done = False
    while not done:
        time.sleep(2)
        data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)
        done = data.get("stats") and data.get("stats").get("done") > 0

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/stop",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["success"] == True

    # Test crawl
    data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)
    assert data["stopping"] == True

    # Test workflow
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawler_config_id_only}",
        headers=crawler_auth_headers,
    )
    assert r.json()["lastCrawlStopping"] == True

    while data["state"] in (
        "running",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    ):
        time.sleep(5)
        data = _get_crawl(default_org_id, crawler_auth_headers, crawl_id)

    assert data["state"] == "stopped_by_user"
    assert data["stopping"] == True
    assert len(data["resources"]) == 1


def test_crawl_with_hostname(
    default_org_id, crawler_auth_headers, crawler_crawl_id
):
    """Verify pagesQueryUrl respects X-Forwarded-Proto and Host headers."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/replay.json",
        headers={
            "X-Forwarded-Proto": "https",
            "host": "custom-domain.example.com",
            **crawler_auth_headers,
        },
    )
    assert r.status_code == 200
    assert r.json()["pagesQueryUrl"].startswith("https://custom-domain.example.com/")
