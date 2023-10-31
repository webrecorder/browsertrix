import requests
import time

from .conftest import API_PREFIX


def test_max_crawl_size(admin_auth_headers, default_org_id, max_crawl_size_crawl_id):
    # Verify that crawl has started
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{max_crawl_size_crawl_id}/replay.json",
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

    # Wait some time to let crawl start, hit max size limit, and gracefully stop
    time.sleep(240)

    # Verify crawl was stopped
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{max_crawl_size_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["state"] == "complete:size-limit"
