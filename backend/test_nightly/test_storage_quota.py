import math
import requests
import time
from datetime import datetime
from typing import Dict

from .conftest import API_PREFIX
from .utils import get_crawl_status


STORAGE_QUOTA_MB_TO_INCREASE = 5
STORAGE_QUOTA_BYTES_INC = STORAGE_QUOTA_MB_TO_INCREASE * 1000 * 1000

config_id = None

storage_quota = None


def run_crawl(org_id, headers):
    crawl_data = {
        "runNow": True,
        "name": "Storage Quota",
        "config": {
            "seeds": [{"url": "https://specs.webrecorder.net/"}],
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
    # Get current storage usage
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_with_quotas}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    bytes_stored = r.json()["bytesStored"]

    global storage_quota
    storage_quota = bytes_stored + STORAGE_QUOTA_BYTES_INC

    # Set storage quota higher than bytesStored
    r = requests.post(
        f"{API_PREFIX}/orgs/{org_with_quotas}/quotas",
        headers=admin_auth_headers,
        json={"storageQuota": storage_quota},
    )
    assert r.status_code == 200
    assert r.json()["updated"]


def test_crawl_paused_when_storage_quota_reached(org_with_quotas, admin_auth_headers):
    # Run crawl
    global config_id
    crawl_id, config_id = run_crawl(org_with_quotas, admin_auth_headers)
    time.sleep(1)

    assert crawl_id

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

    assert (
        get_crawl_status(org_with_quotas, crawl_id, admin_auth_headers)
        == "paused_storage_quota_reached"
    )

    # Ensure crawl storage went over quota
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_with_quotas}",
        headers=admin_auth_headers,
    )
    data = r.json()
    bytes_stored = data["bytesStored"]
    assert bytes_stored >= storage_quota

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
