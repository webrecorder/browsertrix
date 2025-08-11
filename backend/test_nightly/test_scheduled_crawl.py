import time

import pytest
import requests

from .conftest import API_PREFIX

# Every five minutes
SCHEDULE = "*/5 * * * *"


@pytest.fixture(scope="session")
def scheduled_config_id(admin_auth_headers, default_org_id):
    # Start crawl
    crawl_data = {
        "runNow": False,
        "schedule": SCHEDULE,
        "name": "Scheduled crawl",
        "config": {
            "seeds": [{"url": "https://webrecorder.net"}],
            "scopeType": "page",
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()
    return data["id"]


def test_scheduled_crawl(admin_auth_headers, default_org_id, scheduled_config_id):
    # Ensure workflow exists with correct schedule, no crawls yet
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{scheduled_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["schedule"] == SCHEDULE

    assert data["crawlCount"] == 0
    assert data["crawlAttemptCount"] == 0
    assert data["crawlSuccessfulCount"] == 0

    assert data["lastCrawlId"] is None
    assert data["lastCrawlState"] is None

    # Wait until a crawl completes (up to 20 minutes)
    attempts = 0
    max_attempts = 120

    while True:
        attempts += 1

        if attempts > max_attempts:
            break

        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{scheduled_config_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()

        last_crawl_id = data.get("lastCrawlId")
        last_crawl_state = data.get("lastCrawlState")

        if not last_crawl_id or last_crawl_state not in ("complete", "failed"):
            time.sleep(10)

    # Recheck workflow stats
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{scheduled_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["schedule"] == SCHEDULE

    assert data["crawlCount"] >= 1
    assert data["crawlAttemptCount"] >= 1
    assert data["crawlSuccessfulCount"] >= 1

    assert data["lastCrawlId"]
    assert data["lastCrawlState"] == "complete"
