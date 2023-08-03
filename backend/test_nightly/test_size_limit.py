import requests
import time

from .conftest import API_PREFIX


def test_crawl_timeout(admin_auth_headers, default_org_id, size_limit_crawl):
    # Verify that crawl has started
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{size_limit_crawl}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["state"] in (
        "starting",
        "running",
        "generate-wacz",
        "uploading-wacz",
        "pending-wait",
    )

    # Wait some time to let crawl start, hit size limit, and gracefully stop
    time.sleep(180)

    # Verify crawl was stopped
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{size_limit_crawl}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["state"] == "partial_complete"
