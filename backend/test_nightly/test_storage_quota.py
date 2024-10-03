import math
import requests
import time
from datetime import datetime
from typing import Dict

from .conftest import API_PREFIX
from .utils import get_crawl_status


STORAGE_QUOTA_KB = 5
STORAGE_QUOTA_BYTES = STORAGE_QUOTA_KB * 1000

config_id = None


def run_crawl(org_id, headers):
    crawl_data = {
        "runNow": True,
        "name": "Storage Quota",
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


def test_storage_quota(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"storageQuota": STORAGE_QUOTA_BYTES},
    )
    assert r.status_code == 200
    assert r.json()["updated"]


def test_crawl_stopped_when_storage_quota_reached(org_with_quotas, admin_auth_headers):
    # Run crawl
    global config_id
    crawl_id, config_id = run_crawl(org_with_quotas, admin_auth_headers)
    time.sleep(1)

    while get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers) in (
        "starting",
        "waiting_capacity",
        "waiting_org_limit",
    ):
        time.sleep(2)

    while get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers) in (
        "running",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    ):
        time.sleep(2)

    time.sleep(5)

    # Ensure that crawl was stopped by quota
    assert (
        get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers)
        == "stopped_storage_quota_reached"
    )

    time.sleep(5)

    # Ensure crawl storage went over quota
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_with_quotas}",
        headers=admin_auth_headers,
    )
    data = r.json()
    bytes_stored = data["bytesStored"]
    assert bytes_stored >= STORAGE_QUOTA_BYTES

    time.sleep(5)

    # Ensure we can't start another crawl when over the quota
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/crawlconfigs/{config_id}/run",
        headers=admin_auth_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "storage_quota_reached"


def test_unset_quotas(org_with_quotas, admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"maxExecMinutesPerMonth": 0, "storageQuota": 0},
    )
    assert r.status_code == 200
    assert r.json()["updated"]
