import requests
import os

from zipfile import ZipFile, ZIP_STORED
from tempfile import TemporaryFile

from .conftest import API_PREFIX
from .utils import read_in_chunks

COLLECTION_NAME = "Test collection"
UPDATED_NAME = "Updated tést cöllection"
SECOND_COLLECTION_NAME = "second-collection"
DESCRIPTION = "Test description"

_coll_id = None
_second_coll_id = None
upload_id = None
modified = None

curr_dir = os.path.dirname(os.path.realpath(__file__))


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
    assert data["added"]
    assert data["name"] == COLLECTION_NAME

    global _coll_id
    _coll_id = data["id"]

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
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "description": DESCRIPTION,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == _coll_id
    assert data["name"] == COLLECTION_NAME
    assert data["description"] == DESCRIPTION
    assert data["crawlCount"] == 1
    assert data["pageCount"] > 0
    assert data["totalSize"] > 0
    global modified
    modified = data["modified"]
    assert modified


def test_rename_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "name": UPDATED_NAME,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
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
    assert data["added"]
    assert data["name"] == SECOND_COLLECTION_NAME

    global _second_coll_id
    _second_coll_id = data["id"]

    # Try to rename first coll to second collection's name
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
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
    assert data["totalSize"] > 0
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
    assert data["totalSize"] == 0
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
    assert data["totalSize"] > 0
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
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]


def test_get_collection_replay(crawler_auth_headers, default_org_id):
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
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]

    resources = data["resources"]
    assert resources
    for resource in resources:
        assert resource["name"]
        assert resource["path"]
        assert resource["size"]


def test_collection_public(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/public/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404

    # make public
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "isPublic": True,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/public/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.headers["Access-Control-Allow-Origin"] == "*"
    assert r.headers["Access-Control-Allow-Headers"] == "*"

    # make private again
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "isPublic": False,
        },
    )

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/public/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404


def test_add_upload_to_collection(crawler_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test-upload.wacz",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    global upload_id
    upload_id = r.json()["id"]

    # Add upload
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/add",
        json={"crawlIds": [upload_id]},
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["crawlCount"] == 3
    assert data["pageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"]
    assert data["tags"] == ["wr-test-2", "wr-test-1"]

    # Verify it was added
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id in r.json()["collections"]


def test_download_streaming_collection(crawler_auth_headers, default_org_id):
    # Add upload
    with TemporaryFile() as fh:
        with requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/download",
            headers=crawler_auth_headers,
            stream=True,
        ) as r:
            assert r.status_code == 200
            for chunk in r.iter_content():
                fh.write(chunk)

        fh.seek(0)
        with ZipFile(fh, "r") as zip_file:
            contents = zip_file.namelist()

            assert len(contents) == 4
            for filename in contents:
                assert filename.endswith(".wacz") or filename == "datapackage.json"
                assert zip_file.getinfo(filename).compress_type == ZIP_STORED


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
    assert first_coll["crawlCount"] == 3
    assert first_coll["pageCount"] > 0
    assert first_coll["totalSize"] > 0
    assert first_coll["modified"]
    assert first_coll["tags"] == ["wr-test-2", "wr-test-1"]

    second_coll = [coll for coll in items if coll["name"] == SECOND_COLLECTION_NAME][0]
    assert second_coll["id"]
    assert second_coll["name"] == SECOND_COLLECTION_NAME
    assert second_coll["oid"] == default_org_id
    assert second_coll.get("description") is None
    assert second_coll["crawlCount"] == 1
    assert second_coll["pageCount"] > 0
    assert second_coll["totalSize"] > 0
    assert second_coll["modified"]
    assert second_coll["tags"] == ["wr-test-2"]


def test_remove_upload_from_collection(crawler_auth_headers, default_org_id):
    # Remove upload
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/remove",
        json={"crawlIds": [upload_id]},
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["crawlCount"] == 2
    assert data["pageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data.get("tags") == ["wr-test-2", "wr-test-1"]

    # Verify it was removed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id not in r.json()["collections"]


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

    # Test filtering by name prefix
    name_prefix = SECOND_COLLECTION_NAME[0:4]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?namePrefix={name_prefix}",
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

    # Test filtering by name prefix (case insensitive)
    name_prefix = name_prefix.upper()
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?namePrefix={name_prefix}",
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

    # Test sorting by size, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=totalSize",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["totalSize"] <= items[1]["totalSize"]

    # Test sorting by size, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=totalSize&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2

    items = data["items"]
    assert items[0]["totalSize"] >= items[1]["totalSize"]

    # Invalid sort value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=invalid",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_by"

    # Invalid sort_direction value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=modified&sortDirection=0",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_direction"


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
    assert data["added"]
    coll_id = data["id"]

    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]
