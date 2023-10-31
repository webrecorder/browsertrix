import math
import requests
import time
from datetime import datetime

from .conftest import API_PREFIX
from .utils import get_crawl_status


EXEC_MINS_QUOTA = 1
EXEC_MINS_ALLOWED_OVERAGE = 10
EXEC_MINS_HARD_CAP = EXEC_MINS_QUOTA + EXEC_MINS_ALLOWED_OVERAGE

config_id = None


def test_set_execution_mins_quota(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"maxExecMinutesPerMonth": EXEC_MINS_QUOTA},
    )
    data = r.json()
    assert data.get("updated") == True


def test_crawl_stopped_when_quota_reached(org_with_quotas, admin_auth_headers):
    # Run crawl
    global config_id
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

    # Ensure that crawl was stopped by quota
    assert (
        get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers)
        == "complete:exec-time-quota"
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


def run_crawl(org_id, headers):
    crawl_data = {
        "runNow": True,
        "name": "Execution Mins Quota",
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
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
