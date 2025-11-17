import math
import time
from typing import Dict

import pytest
import requests

from .conftest import API_PREFIX
from .utils import get_crawl_status

EXEC_MINS_QUOTA = 1
EXEC_SECS_QUOTA = EXEC_MINS_QUOTA * 60
GIFTED_MINS_QUOTA = 3
GIFTED_SECS_QUOTA = GIFTED_MINS_QUOTA * 60
EXTRA_MINS_QUOTA = 5
EXTRA_SECS_QUOTA = EXTRA_MINS_QUOTA * 60
EXTRA_MINS_ADDED_QUOTA = 7
EXTRA_SECS_ADDED_QUOTA = EXTRA_MINS_ADDED_QUOTA * 60


def test_set_execution_mins_quota(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"maxExecMinutesPerMonth": EXEC_MINS_QUOTA},
    )
    data = r.json()
    assert data.get("updated") == True


def test_crawl_paused_when_quota_reached(org_with_quotas, admin_auth_headers):
    # Run crawl
    crawl_id, config_id = run_crawl(org_with_quotas, admin_auth_headers)
    time.sleep(1)

    while get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers) in (
        "starting",
        "waiting_capacity",
    ):
        time.sleep(2)

    while get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers) in (
        "running",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    ):
        time.sleep(2)

    # Ensure that crawl was paused by quota
    assert (
        get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers)
        == "paused_time_quota_reached"
    )

    time.sleep(5)

    # Ensure crawl execution seconds went over quota
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_with_quotas}/crawls/{crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    data = r.json()
    execution_seconds = data["crawlExecSeconds"]
    assert math.floor(execution_seconds / 60) >= EXEC_MINS_QUOTA

    time.sleep(5)

    # Ensure we can't start another crawl when over the quota
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/crawlconfigs/{config_id}/run",
        headers=admin_auth_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "exec_minutes_quota_reached"


def test_set_execution_mins_extra_quotas(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={
            "maxExecMinutesPerMonth": EXEC_MINS_QUOTA,
            "extraExecMinutes": EXTRA_MINS_QUOTA,
            "giftedExecMinutes": GIFTED_MINS_QUOTA,
        },
    )
    data = r.json()
    assert data.get("updated") == True

    # Ensure org data looks as we expect
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_with_quotas}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["extraExecSecondsAvailable"] == EXTRA_SECS_QUOTA
    assert data["giftedExecSecondsAvailable"] == GIFTED_SECS_QUOTA
    assert data["extraExecSeconds"] == {}
    assert data["giftedExecSeconds"] == {}
    assert get_total_exec_seconds(data["crawlExecSeconds"]) >= EXEC_SECS_QUOTA
    assert len(data["quotaUpdates"])
    for update in data["quotaUpdates"]:
        assert update["modified"]
        assert update["update"]


@pytest.mark.timeout(1200)
def test_crawl_paused_when_quota_reached_with_extra(
    org_with_quotas, admin_auth_headers
):
    # Run crawl
    crawl_id, config_id = run_crawl(org_with_quotas, admin_auth_headers)
    time.sleep(1)

    while get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers) in (
        "starting",
        "waiting_capacity",
    ):
        time.sleep(2)

    while get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers) in (
        "running",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    ):
        time.sleep(2)

    # Ensure that crawl was paused by quota
    assert (
        get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers)
        == "paused_time_quota_reached"
    )

    time.sleep(5)

    # Ensure org data looks as we expect
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_with_quotas}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["extraExecSecondsAvailable"] == 0
    assert data["giftedExecSecondsAvailable"] == 0
    assert get_total_exec_seconds(data["extraExecSeconds"]) >= EXTRA_SECS_QUOTA
    assert get_total_exec_seconds(data["giftedExecSeconds"]) == GIFTED_SECS_QUOTA
    assert get_total_exec_seconds(data["crawlExecSeconds"]) >= EXEC_SECS_QUOTA

    time.sleep(5)

    # Ensure we can't start another crawl when over the quota
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/crawlconfigs/{config_id}/run",
        headers=admin_auth_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "exec_minutes_quota_reached"


def run_crawl(org_id, headers):
    crawl_data = {
        "runNow": True,
        "name": "Execution Mins Quota",
        "config": {
            "seeds": [{"url": "https://old.webrecorder.net/"}],
            "extraHops": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_id}/crawlconfigs/",
        headers=headers,
        json=crawl_data,
    )
    data = r.json()

    return data["run_now_job"], data["id"]


def get_total_exec_seconds(execSeconds: Dict[str, int]) -> int:
    return sum(list(execSeconds.values()))


def test_unset_execution_mins_quota(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"maxExecMinutesPerMonth": 0},
    )
    data = r.json()
    assert data.get("updated") == True


def test_add_execution_mins_extra_quotas(
    org_with_quotas, admin_auth_headers, preshared_secret_auth_headers
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas/add",
        headers=preshared_secret_auth_headers,
        json={
            "extraExecMinutes": EXTRA_MINS_ADDED_QUOTA,
            "context": "test context 123",
        },
    )
    data = r.json()
    assert data.get("updated") == True

    # Ensure org data looks as we expect
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_with_quotas}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert (
        data["extraExecSecondsAvailable"] == EXTRA_SECS_QUOTA + EXTRA_SECS_ADDED_QUOTA
    )
    assert data["giftedExecSecondsAvailable"] == GIFTED_SECS_QUOTA
    assert data["extraExecSeconds"] == {}
    assert data["giftedExecSeconds"] == {}
    assert len(data["quotaUpdates"])
    for update in data["quotaUpdates"]:
        assert update["modified"]
        assert update["update"]
    assert data["quotaUpdates"][-1]["context"] == "test context 123"
