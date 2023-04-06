import requests

from .conftest import API_PREFIX


def test_get_crawl_errors(admin_auth_headers, default_org_id, error_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{error_crawl_id}/errors",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["errors"]
