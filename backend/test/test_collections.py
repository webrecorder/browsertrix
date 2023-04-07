import requests

from .conftest import API_PREFIX

COLLECTION_NAME = "Test collection"
UPDATED_NAME = "Updated tést cöllection"
DESCRIPTION = "Test description"


def test_create_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawl_ids": [crawler_crawl_id],
            "name": COLLECTION_NAME,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"] == COLLECTION_NAME


def test_update_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{COLLECTION_NAME}/update",
        headers=crawler_auth_headers,
        json={
            "crawl_ids": [crawler_crawl_id, admin_crawl_id],
            "description": DESCRIPTION,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == COLLECTION_NAME
    assert data["description"] == DESCRIPTION
    assert sorted(data["crawl_ids"]) == sorted([admin_crawl_id, crawler_crawl_id])


def test_rename_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{COLLECTION_NAME}/rename",
        headers=crawler_auth_headers,
        json={"name": UPDATED_NAME},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["renamed"] == UPDATED_NAME


def test_remove_crawl_from_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{UPDATED_NAME}/remove?crawlId={admin_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["crawl_ids"] == [crawler_crawl_id]


def test_add_crawl_to_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{UPDATED_NAME}/add?crawlId={admin_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["crawl_ids"]) == sorted([admin_crawl_id, crawler_crawl_id])
