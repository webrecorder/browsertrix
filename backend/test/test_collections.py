import requests

from .conftest import API_PREFIX

COLLECTION_NAME = "Test collection"
UPDATED_NAME = "Updated tést cöllection"
SECOND_COLLECTION_NAME = "second-collection"
DESCRIPTION = "Test description"

_coll_id = None
_second_coll_id = None

modified = None


def test_create_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [crawler_crawl_id],
            "name": COLLECTION_NAME,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]["name"] == COLLECTION_NAME

    global _coll_id
    _coll_id = data["added"]["id"]

    # Verify crawl in collection
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id in r.json()["collections"]


def test_create_collection_taken_name(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [crawler_crawl_id],
            "name": COLLECTION_NAME,
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "collection_name_taken"


def test_create_collection_empty_name(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [crawler_crawl_id],
            "name": "",
        },
    )
    assert r.status_code == 422


def test_update_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/update",
        headers=crawler_auth_headers,
        json={
            "description": DESCRIPTION,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["name"] == COLLECTION_NAME
    assert data["description"] == DESCRIPTION
    assert data["crawlCount"] == 1
    assert data["pageCount"] > 0
    global modified
    modified = data["modified"]
    assert modified


def test_rename_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/update",
        headers=crawler_auth_headers,
        json={"name": UPDATED_NAME},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["name"] == UPDATED_NAME
    assert data["modified"] >= modified


def test_rename_collection_taken_name(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    # Add second collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [crawler_crawl_id],
            "name": SECOND_COLLECTION_NAME,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]["name"] == SECOND_COLLECTION_NAME

    global _second_coll_id
    _second_coll_id = data["added"]["id"]

    # Try to rename first coll to second collection's name
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/update",
        headers=crawler_auth_headers,
        json={"name": SECOND_COLLECTION_NAME},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "collection_name_taken"


def test_add_remove_crawl_from_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    # Add crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/add",
        json={"crawlIds": [admin_crawl_id]},
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["crawlCount"] == 2
    assert data["pageCount"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]

    # Verify it was added
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id in r.json()["collections"]

    # Remove crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/remove",
        json={"crawlIds": [admin_crawl_id, crawler_crawl_id]},
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["crawlCount"] == 0
    assert data["pageCount"] == 0
    assert data["modified"] >= modified
    assert data.get("tags", []) == []

    # Verify they were removed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id not in r.json()["collections"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id not in r.json()["collections"]

    # Add crawls back for further tests
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/add",
        json={"crawlIds": [admin_crawl_id, crawler_crawl_id]},
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["crawlCount"] == 2
    assert data["pageCount"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]


def test_get_collection(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["name"] == UPDATED_NAME
    assert data["oid"] == default_org_id
    assert data["description"] == DESCRIPTION
    assert data["crawlCount"] == 2
    assert data["pageCount"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]


def test_get_collection_replay(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["name"] == UPDATED_NAME
    assert data["oid"] == default_org_id
    assert data["description"] == DESCRIPTION
    assert data["crawlCount"] == 2
    assert data["pageCount"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]

    resources = data["resources"]
    assert resources
    for resource in resources:
        assert resource["name"]
        assert resource["path"]
        assert resource["size"]


def test_list_collections(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
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
    assert first_coll["crawlCount"] == 2
    assert first_coll["pageCount"] > 0
    assert first_coll["modified"]
    assert first_coll["tags"] == ["wr-test-2", "wr-test-1"]

    second_coll = [coll for coll in items if coll["name"] == SECOND_COLLECTION_NAME][0]
    assert second_coll["id"]
    assert second_coll["name"] == SECOND_COLLECTION_NAME
    assert second_coll["oid"] == default_org_id
    assert second_coll.get("description") is None
    assert second_coll["crawlCount"] == 1
    assert second_coll["pageCount"] > 0
    assert second_coll["modified"]
    assert second_coll["tags"] == ["wr-test-2"]


def test_filter_sort_collections(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    # Test filtering by name
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?name={SECOND_COLLECTION_NAME}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1

    items = data["items"]
    assert len(items) == 1

    coll = items[0]
    assert coll["id"]
    assert coll["name"] == SECOND_COLLECTION_NAME
    assert coll["oid"] == default_org_id
    assert coll.get("description") is None

    # Test sorting by name, ascending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=name",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["name"] == SECOND_COLLECTION_NAME
    assert items[1]["name"] == UPDATED_NAME

    # Test sorting by name, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=name&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["name"] == UPDATED_NAME
    assert items[1]["name"] == SECOND_COLLECTION_NAME

    # Test sorting by description, ascending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=description",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["name"] == SECOND_COLLECTION_NAME
    assert items[0].get("description") is None
    assert items[1]["name"] == UPDATED_NAME
    assert items[1]["description"] == DESCRIPTION

    # Test sorting by description, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=description&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["name"] == UPDATED_NAME
    assert items[0]["description"] == DESCRIPTION
    assert items[1]["name"] == SECOND_COLLECTION_NAME
    assert items[1].get("description") is None

    # Test sorting by modified, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=modified",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["modified"] <= items[1]["modified"]

    # Test sorting by modified, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=modified&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["modified"] >= items[1]["modified"]


def test_delete_collection(crawler_auth_headers, default_org_id, crawler_crawl_id):
    # Delete second collection
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_second_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Verify collection id was removed from crawl
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _second_coll_id not in r.json()["collections"]

    # Make a new empty (no crawls) collection and delete it
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "name": "To delete",
            "description": "Deleting a collection with no crawls should work.",
        },
    )
    assert r.status_code == 200
    data = r.json()
    coll_id = data["added"]["id"]

    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]
