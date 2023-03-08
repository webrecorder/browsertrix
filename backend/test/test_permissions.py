import requests

from .conftest import API_PREFIX


def test_admin_get_org_crawls(admin_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls", headers=admin_auth_headers
    )
    data = r.json()
    crawls = data["items"]
    crawl_ids = []
    assert len(crawls) > 0
    assert data["total"] > 0
    for crawl in crawls:
        assert crawl["oid"] == default_org_id
        crawl_ids.append(crawl["id"])
    assert admin_crawl_id in crawl_ids


def test_viewer_get_org_crawls(viewer_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls", headers=viewer_auth_headers
    )
    data = r.json()
    crawls = data["items"]
    crawl_ids = []
    assert len(crawls) > 0
    assert data["total"] > 0
    for crawl in crawls:
        assert crawl["oid"] == default_org_id
        crawl_ids.append(crawl["id"])
    assert admin_crawl_id in crawl_ids


def test_viewer_get_crawl(viewer_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}",
        headers=viewer_auth_headers,
    )
    data = r.json()
    assert data["id"] == admin_crawl_id
    assert data["oid"] == default_org_id


def test_viewer_get_crawl_replay(viewer_auth_headers, default_org_id, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=viewer_auth_headers,
    )
    data = r.json()
    assert data["id"] == admin_crawl_id
    assert data["oid"] == default_org_id
    assert data["resources"]
