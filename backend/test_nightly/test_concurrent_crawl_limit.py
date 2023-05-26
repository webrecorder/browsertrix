import requests
import time

from .conftest import API_PREFIX

crawl_id_a = None
crawl_id_b = None


def test_set_parallel_crawl_limit(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"maxParallelCrawls": 1},
    )
    data = r.json()
    assert data.get("updated") == True


def test_run_two_only_one_concurrent(org_with_quotas, admin_auth_headers):
    global crawl_id_a
    crawl_id_a = run_crawl(org_with_quotas, admin_auth_headers)
    time.sleep(1)

    global crawl_id_b
    crawl_id_b = run_crawl(org_with_quotas, admin_auth_headers)

    while (
        get_crawl_status(org_with_quotas, crawl_id_a, admin_auth_headers) == "starting"
    ):
        time.sleep(5)

    assert (
        get_crawl_status(org_with_quotas, crawl_id_a, admin_auth_headers) == "running"
    )

    while (
        get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers) == "starting"
    ):
        time.sleep(5)

    assert (
        get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers)
        == "waiting_org_limit"
    )


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
        time.sleep(5)

    while (
        get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers)
        == "waiting_org_limit"
    ):
        time.sleep(5)

    assert get_crawl_status(org_with_quotas, crawl_id_b, admin_auth_headers) in (
        "starting",
        "running",
    )


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
    data = r.json()

    return data["run_now_job"]


def get_crawl_status(org_id, crawl_id, headers):
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{org_id}/crawls/{crawl_id}/replay.json",
            headers=headers,
        )
        data = r.json()
        return data["state"]
