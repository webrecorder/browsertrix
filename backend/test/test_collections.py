import requests

from .conftest import API_PREFIX

COLLECTION_NAME = "Test collection"
UPDATED_NAME = "Updated tést cöllection"
SECOND_COLLECTION_NAME = "second-collection"
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


def test_get_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{UPDATED_NAME}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    resources = data["resources"]
    assert resources
    for resource in resources:
        assert resource["name"]
        assert resource["path"]
        assert resource["size"]
        assert resource["crawlId"] in (crawler_crawl_id, admin_crawl_id)


def test_list_collections(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    # Add second collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawl_ids": [crawler_crawl_id],
            "name": SECOND_COLLECTION_NAME,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"] == SECOND_COLLECTION_NAME

    # Test endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections", headers=crawler_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert len(items) == 2

    first_coll = [coll for coll in items if coll["name"] == UPDATED_NAME][0]
    assert first_coll["id"]
    assert first_coll["name"] == UPDATED_NAME
    assert first_coll["oid"] == default_org_id
    assert first_coll["description"] == DESCRIPTION
    assert sorted(first_coll["crawl_ids"]) == sorted([crawler_crawl_id, admin_crawl_id])

    second_coll = [coll for coll in items if coll["name"] == SECOND_COLLECTION_NAME][0]
    assert second_coll["id"]
    assert second_coll["name"] == SECOND_COLLECTION_NAME
    assert second_coll["oid"] == default_org_id
    assert second_coll.get("description") is None
    assert second_coll["crawl_ids"] == [crawler_crawl_id]
