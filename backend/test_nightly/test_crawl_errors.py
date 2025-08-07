import requests
import pytest

from .conftest import API_PREFIX


@pytest.mark.timeout(1200)
def test_get_crawl_errors(admin_auth_headers, default_org_id, error_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{error_crawl_id}/errors",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    assert data["items"]

    for item in data["items"]:
        assert item["id"]
        assert item["crawlId"] == error_crawl_id
        assert item["oid"] == default_org_id
        assert item["qaRunId"] is None
        assert item["timestamp"]
        assert item["logLevel"] in ("error", "fatal")
        assert item["context"]
        assert item["message"]
        assert item.get("details") or item.get("details") is None
