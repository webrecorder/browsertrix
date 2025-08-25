import time

import requests
import pytest

from .conftest import API_PREFIX


@pytest.fixture(scope="session")
def behavior_log_crawl_id(admin_auth_headers, default_org_id):
    crawl_data = {
        "runNow": True,
        "name": "Crawl with behavior logs",
        "config": {
            "seeds": [
                {"url": "https://x.com/webrecorder_io"},
            ],
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

    crawl_id = data["run_now_job"]

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in ("failed", "complete"):
            return crawl_id
        time.sleep(5)


@pytest.mark.timeout(1200)
def test_get_crawl_behavior_logs(
    admin_auth_headers, default_org_id, behavior_log_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{behavior_log_crawl_id}/behaviorLogs",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    assert data["items"]

    for item in data["items"]:
        assert item["id"]
        assert item["crawlId"] == behavior_log_crawl_id
        assert item["oid"] == default_org_id
        assert item["qaRunId"] is None
        assert item["timestamp"]
        assert item["logLevel"]
        assert item["context"] in ("behavior", "behaviorScript", "behaviorScriptCustom")
        assert item["message"]
        assert item.get("details") or item.get("details") is None
