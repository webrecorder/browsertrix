import requests
import time

from .conftest import API_PREFIX
from .utils import get_crawl_status

crawl_id_a = None
crawl_id_b = None


def test_set_concurrent_crawl_limit(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"maxConcurrentCrawls": 1},
    )
    data = r.json()
    assert data.get("updated") == True


def test_run_two_only_one_concurrent(org_with_quotas, admin_auth_headers):
    global crawl_id_a
    crawl_id_a, _ = run_crawl(org_with_quotas, admin_auth_headers)
    time.sleep(1)

    global crawl_id_b
    crawl_id_b, _ = run_crawl(org_with_quotas, admin_auth_headers)

    while get_crawl_status(org_with_quotas, crawl_id_a, admin_auth_headers) in (
        "starting",
        "waiting_capacity",
    ):
        time.sleep(2)

    assert get_crawl_status(org_with_quotas, crawl_id_a, admin_auth_headers) in (
        "running",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    )

    while (
        get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers) == "starting"
    ):
        time.sleep(2)

    assert (
        get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers)
        == "waiting_org_limit"
    )

    crawl_id, res = run_crawl(org_with_quotas, admin_auth_headers)
    assert not crawl_id
    assert res["errorDetail"] == "slow_down_too_many_crawls_queued"

    config_id = res["id"]

    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/crawlconfigs/{config_id}/run",
        headers=admin_auth_headers,
    )
    assert r.status_code == 429


def test_cancel_and_run_other(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/crawls/{crawl_id_a}/cancel",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["success"] == True

    while (
        get_crawl_status(org_with_quotas, crawl_id_a, admin_auth_headers) != "canceled"
    ):
        time.sleep(2)

    while (
        get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers)
        == "waiting_org_limit"
    ):
        time.sleep(5)

    assert get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers) in (
        "starting",
        "running",
        "waiting_capacity",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    )

    # cancel second crawl as well
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/crawls/{crawl_id_b}/cancel",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["success"] == True


def run_crawl(org_id, headers):
    crawl_data = {
        "runNow": True,
        "name": "Concurrent Crawl",
        "config": {
            "seeds": [{"url": "https://specs.webrecorder.net/"}],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_id}/crawlconfigs/",
        headers=headers,
        json=crawl_data,
    )
    r.raise_for_status()
    data = r.json()
    return data["run_now_job"], data
