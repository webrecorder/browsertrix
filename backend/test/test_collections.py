import requests
import os
from uuid import uuid4

from zipfile import ZipFile, ZIP_STORED
from tempfile import TemporaryFile

from .conftest import API_PREFIX, NON_DEFAULT_ORG_NAME, NON_DEFAULT_ORG_SLUG
from .utils import read_in_chunks

COLLECTION_NAME = "Test collection"
COLLECTION_SLUG = "test-collection"
PUBLIC_COLLECTION_NAME = "Public Test collection"
PUBLIC_COLLECTION_SLUG = "custom-public-collection-slug"
UPDATED_NAME = "Updated tést cöllection"
UPDATED_SLUG = "updated-test-collection"
SECOND_COLLECTION_NAME = "second-collection"
DESCRIPTION = "Test description"
CAPTION = "Short caption"
UPDATED_CAPTION = "Updated caption"
SECOND_PUBLIC_COLL_SLUG = "second-public-collection"

NON_PUBLIC_COLL_FIELDS = (
    "tags",
    "homeUrlPageId",
)
NON_PUBLIC_IMAGE_FIELDS = ("originalFilename", "userid", "userName", "created")


_coll_id = None
_second_coll_id = None
_public_coll_id = None
_second_public_coll_id = None
upload_id = None
modified = None
default_org_slug = None

curr_dir = os.path.dirname(os.path.realpath(__file__))


def test_create_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    default_thumbnail_name = "default-thumbnail.jpg"

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [crawler_crawl_id],
            "name": COLLECTION_NAME,
            "caption": CAPTION,
            "defaultThumbnailName": default_thumbnail_name,
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
    assert _coll_id in r.json()["collectionIds"]
    assert r.json()["collections"] == [{"name": COLLECTION_NAME, "id": _coll_id}]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == _coll_id
    assert data["name"] == COLLECTION_NAME
    assert data["slug"] == COLLECTION_SLUG
    assert data["caption"] == CAPTION
    assert data["crawlCount"] == 1
    assert data["pageCount"] > 0
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    modified = data["modified"]
    assert modified
    assert modified.endswith("Z")

    assert data["dateEarliest"]
    assert data["dateLatest"]

    assert data["defaultThumbnailName"] == default_thumbnail_name
    assert data["allowPublicDownload"]


def test_create_public_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [crawler_crawl_id],
            "name": PUBLIC_COLLECTION_NAME,
            "slug": PUBLIC_COLLECTION_SLUG,
            "caption": CAPTION,
            "access": "public",
            "allowPublicDownload": False,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["name"] == PUBLIC_COLLECTION_NAME

    global _public_coll_id
    _public_coll_id = data["id"]

    # Verify that it is public
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.json()["access"] == "public"


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
    assert r.json()["detail"] in ("collection_name_taken", "collection_slug_taken")


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


def test_create_empty_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "name": "Empty Collection",
        },
    )
    assert r.status_code == 200
    coll_id = r.json()["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{coll_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["crawlCount"] == 0
    assert data["pageCount"] == 0
    assert len(data["resources"]) == 0

    # Delete the empty collection
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]


def test_update_collection(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "description": DESCRIPTION,
            "caption": UPDATED_CAPTION,
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
    assert data["caption"] == UPDATED_CAPTION
    assert data["crawlCount"] == 1
    assert data["pageCount"] > 0
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    global modified
    modified = data["modified"]
    assert modified
    assert modified.endswith("Z")
    assert data["dateEarliest"]
    assert data["dateLatest"]
    assert data["defaultThumbnailName"]


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
    assert data["slug"] == UPDATED_SLUG
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
    assert r.json()["detail"] in ("collection_name_taken", "collection_slug_taken")

    # Try to set first coll's slug to value already used for second collection
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={"slug": SECOND_COLLECTION_NAME},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "collection_slug_taken"


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
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]
    assert data["dateEarliest"]
    assert data["dateLatest"]

    # Verify it was added
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id in r.json()["collectionIds"]

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
    assert data["uniquePageCount"] == 0
    assert data["totalSize"] == 0
    assert data["modified"] >= modified
    assert data.get("tags", []) == []
    assert data.get("dateEarliest") is None
    assert data.get("dateLatest") is None

    # Verify they were removed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{admin_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id not in r.json()["collectionIds"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id not in r.json()["collectionIds"]

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
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]
    assert data["dateEarliest"]
    assert data["dateLatest"]


def test_get_collection(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["name"] == UPDATED_NAME
    assert data["slug"] == UPDATED_SLUG
    assert data["oid"] == default_org_id
    assert data["description"] == DESCRIPTION
    assert data["caption"] == UPDATED_CAPTION
    assert data["crawlCount"] == 2
    assert data["pageCount"] > 0
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]
    assert data["dateEarliest"]
    assert data["dateLatest"]
    assert data["defaultThumbnailName"]


def test_get_collection_replay(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _coll_id
    assert data["name"] == UPDATED_NAME
    assert data["slug"] == UPDATED_SLUG
    assert data["oid"] == default_org_id
    assert data["description"] == DESCRIPTION
    assert data["caption"] == UPDATED_CAPTION
    assert data["crawlCount"] == 2
    assert data["pageCount"] > 0
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data["tags"] == ["wr-test-2", "wr-test-1"]
    assert data["dateEarliest"]
    assert data["dateLatest"]
    assert data["defaultThumbnailName"]
    assert data["initialPages"]
    assert data["pagesQueryUrl"].endswith(
        f"/orgs/{default_org_id}/collections/{_coll_id}/pages"
    )
    assert data["downloadUrl"] is None
    assert "preloadResources" in data

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

    # make public and test replay headers
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "access": "public",
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/public/replay.json",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["initialPages"]
    assert data["pagesQueryUrl"].endswith(
        f"/orgs/{default_org_id}/collections/{_coll_id}/public/pages"
    )
    assert data["downloadUrl"] is not None
    assert "preloadResources" in data

    assert r.status_code == 200
    assert r.headers["Access-Control-Allow-Origin"] == "*"
    assert r.headers["Access-Control-Allow-Headers"] == "*"

    # test public pages endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/public/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) > 0

    # make unlisted and test replay headers
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "access": "unlisted",
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
            "access": "private",
        },
    )

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/public/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/public/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404


def test_collection_access_invalid_value(crawler_auth_headers, default_org_id):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
        json={
            "access": "invalid",
        },
    )
    assert r.status_code == 422

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["access"] == "private"


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
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"]
    assert data["tags"] == ["wr-test-2", "wr-test-1"]
    assert data["dateEarliest"]
    assert data["dateLatest"]
    assert data["defaultThumbnailName"]

    # Verify it was added
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id in r.json()["collectionIds"]
    assert r.json()["collections"] == [{"name": UPDATED_NAME, "id": _coll_id}]


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
    assert data["total"] == 3

    items = data["items"]
    assert len(items) == 3

    first_coll = [coll for coll in items if coll["name"] == UPDATED_NAME][0]
    assert first_coll["id"] == _coll_id
    assert first_coll["name"] == UPDATED_NAME
    assert first_coll["slug"] == UPDATED_SLUG
    assert first_coll["oid"] == default_org_id
    assert first_coll["description"] == DESCRIPTION
    assert first_coll["caption"] == UPDATED_CAPTION
    assert first_coll["crawlCount"] == 3
    assert first_coll["pageCount"] > 0
    assert first_coll["uniquePageCount"] > 0
    assert first_coll["totalSize"] > 0
    assert first_coll["modified"]
    assert first_coll["tags"] == ["wr-test-2", "wr-test-1"]
    assert first_coll["access"] == "private"
    assert first_coll["dateEarliest"]
    assert first_coll["dateLatest"]
    assert first_coll["defaultThumbnailName"]

    second_coll = [coll for coll in items if coll["name"] == SECOND_COLLECTION_NAME][0]
    assert second_coll["id"]
    assert second_coll["name"] == SECOND_COLLECTION_NAME
    assert second_coll["slug"] == SECOND_COLLECTION_NAME
    assert second_coll["oid"] == default_org_id
    assert second_coll.get("description") is None
    assert second_coll["crawlCount"] == 1
    assert second_coll["pageCount"] > 0
    assert second_coll["uniquePageCount"] > 0
    assert second_coll["totalSize"] > 0
    assert second_coll["modified"]
    assert second_coll["tags"] == ["wr-test-2"]
    assert second_coll["access"] == "private"
    assert second_coll["dateEarliest"]
    assert second_coll["dateLatest"]


def test_list_pages_in_collection(crawler_auth_headers, default_org_id):
    # Test list endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["items"]) >= 0

    pages = data["items"]
    assert pages

    for page in pages:
        assert page["id"]
        assert page["oid"]
        assert page["crawl_id"]
        assert page["url"]
        assert page["ts"]
        assert page.get("title") or page.get("title") is None
        assert page.get("loadState") or page.get("loadState") is None
        assert page.get("status") or page.get("status") is None
        assert page.get("mime") or page.get("mime") is None
        assert page["isError"] in (None, True, False)
        assert page["isFile"] in (None, True, False)

    # Save info for page to test url and urlPrefix filters
    coll_page = pages[0]
    coll_page_id = coll_page["id"]
    coll_page_url = coll_page["url"]
    coll_page_ts = coll_page["ts"]
    coll_page_title = coll_page["title"]

    # Test search filter, make sure text search isn't case sensitive
    partial_title = "Archiving"
    partial_title_lower = partial_title.lower()
    partial_url = coll_page_url[:8]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?search={partial_title_lower}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["items"]) >= 1
    for matching_page in data["items"]:
        assert (
            partial_title in matching_page["title"]
            or partial_url in matching_page["url"]
        )

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?search={partial_url}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["items"]) >= 1
    for matching_page in data["items"]:
        assert (
            partial_title in matching_page["title"]
            or partial_url in matching_page["url"]
        )

    # Test exact url filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?url={coll_page_url}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["items"]) >= 1
    for matching_page in data["items"]:
        assert matching_page["url"] == coll_page_url

    # Test exact url and ts filters together
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?url={coll_page_url}&ts={coll_page_ts}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["items"]) >= 1
    for matching_page in data["items"]:
        assert matching_page["url"] == coll_page_url
        assert matching_page["ts"] == coll_page_ts

    # Test urlPrefix filter
    url_prefix = coll_page_url[:8]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?urlPrefix={url_prefix}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["items"]) >= 1

    found_matching_page = False
    for page in data["items"]:
        if page["id"] == coll_page_id and page["url"] == coll_page_url:
            found_matching_page = True

    assert found_matching_page

    # Test isSeed filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?isSeed=true",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    for page in data["items"]:
        assert page["isSeed"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?isSeed=false",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    for page in data["items"]:
        assert page["isSeed"] is False

    # Test depth filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?depth=0",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    for page in data["items"]:
        assert page["depth"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_coll_id}/pages?depth=1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    for page in data["items"]:
        assert page["depth"] == 1


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
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    assert data["modified"] >= modified
    assert data.get("tags") == ["wr-test-2", "wr-test-1"]

    # Verify it was removed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert _coll_id not in r.json()["collectionIds"]


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

    # Test filtering by access
    name_prefix = name_prefix.upper()
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?access=public",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1

    items = data["items"]
    assert len(items) == 1

    coll = items[0]
    assert coll["id"]
    assert coll["name"] == PUBLIC_COLLECTION_NAME
    assert coll["oid"] == default_org_id
    assert coll.get("description") is None
    assert coll["access"] == "public"

    # Test sorting by name, ascending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=name",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    items = data["items"]
    assert items[0]["name"] == PUBLIC_COLLECTION_NAME
    assert items[1]["name"] == SECOND_COLLECTION_NAME
    assert items[2]["name"] == UPDATED_NAME

    # Test sorting by name, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=name&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    items = data["items"]
    assert items[0]["name"] == UPDATED_NAME
    assert items[1]["name"] == SECOND_COLLECTION_NAME
    assert items[2]["name"] == PUBLIC_COLLECTION_NAME

    # Test sorting by description, ascending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=description",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    items = data["items"]
    assert (
        items[0]["name"] == SECOND_COLLECTION_NAME
        or items[0]["name"] == PUBLIC_COLLECTION_NAME
    )
    assert items[0].get("description") is None
    assert (
        items[1]["name"] == PUBLIC_COLLECTION_NAME
        or items[1]["name"] == SECOND_COLLECTION_NAME
    )
    assert items[1]["name"] != items[0]["name"]
    assert items[1].get("description") is None
    assert items[2]["name"] == UPDATED_NAME
    assert items[2]["description"] == DESCRIPTION

    # Test sorting by description, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=description&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    items = data["items"]
    assert items[0]["name"] == UPDATED_NAME
    assert items[0]["description"] == DESCRIPTION
    assert (
        items[1]["name"] == SECOND_COLLECTION_NAME
        or items[1]["name"] == PUBLIC_COLLECTION_NAME
    )
    assert items[1].get("description") is None
    assert (
        items[2]["name"] == PUBLIC_COLLECTION_NAME
        or items[2]["name"] == SECOND_COLLECTION_NAME
    )
    assert items[1]["name"] != items[2]["name"]
    assert items[2].get("description") is None

    # Test sorting by modified, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=modified",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    items = data["items"]
    assert items[0]["modified"] <= items[1]["modified"]

    # Test sorting by modified, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=modified&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    items = data["items"]
    assert items[0]["modified"] >= items[1]["modified"]

    # Test sorting by size, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=totalSize",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    items = data["items"]
    assert items[0]["totalSize"] <= items[1]["totalSize"]

    # Test sorting by size, descending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?sortBy=totalSize&sortDirection=-1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

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


def test_list_public_collections(
    crawler_auth_headers,
    admin_auth_headers,
    default_org_id,
    non_default_org_id,
    crawler_crawl_id,
    admin_crawl_id,
):
    # Create new public collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [crawler_crawl_id],
            "name": "Second public collection",
            "slug": SECOND_PUBLIC_COLL_SLUG,
            "description": "Lorem ipsum",
            "access": "public",
        },
    )
    assert r.status_code == 200

    global _second_public_coll_id
    _second_public_coll_id = r.json()["id"]

    # Get default org slug
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    global default_org_slug
    default_org_slug = data["slug"]

    org_name = data["name"]

    # Verify that public profile isn't enabled
    assert data["enablePublicProfile"] is False
    assert data["publicDescription"] == ""
    assert data["publicUrl"] == ""

    # Try listing public collections without org public profile enabled
    r = requests.get(f"{API_PREFIX}/public/orgs/{default_org_slug}/collections")
    assert r.status_code == 404
    assert r.json()["detail"] == "public_profile_not_found"

    # Enable public profile on org
    public_description = "This is a test public org!"
    public_url = "https://example.com"

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/public-profile",
        headers=admin_auth_headers,
        json={
            "enablePublicProfile": True,
            "publicDescription": public_description,
            "publicUrl": public_url,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["enablePublicProfile"]
    assert data["publicDescription"] == public_description
    assert data["publicUrl"] == public_url

    # List public collections with no auth (no public profile)
    r = requests.get(f"{API_PREFIX}/public/orgs/{default_org_slug}/collections")
    assert r.status_code == 200
    data = r.json()

    org_data = data["org"]
    assert org_data["name"] == org_name
    assert org_data["description"] == public_description
    assert org_data["url"] == public_url

    collections = data["collections"]
    assert len(collections) == 2
    for collection in collections:
        assert collection["id"] in (_public_coll_id, _second_public_coll_id)
        assert collection["oid"]
        assert collection["access"] == "public"
        assert collection["name"]
        assert collection["created"]
        assert collection["modified"]
        assert collection["slug"]
        assert collection["dateEarliest"]
        assert collection["dateLatest"]
        assert collection["crawlCount"] > 0
        assert collection["pageCount"] > 0
        assert collection["uniquePageCount"] > 0
        assert collection["totalSize"] > 0

    # Test non-existing slug - it should return a 404 but not reveal
    # whether or not an org exists with that slug
    r = requests.get(f"{API_PREFIX}/public/orgs/nonexistentslug/collections")
    assert r.status_code == 404
    assert r.json()["detail"] == "public_profile_not_found"


def test_list_public_collections_no_colls(non_default_org_id, admin_auth_headers):
    # Test existing org that's not public - should return same 404 as
    # if org doesn't exist
    r = requests.get(f"{API_PREFIX}/public/orgs/{NON_DEFAULT_ORG_SLUG}/collections")
    assert r.status_code == 404
    assert r.json()["detail"] == "public_profile_not_found"

    # Enable public profile on org with zero public collections
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/public-profile",
        headers=admin_auth_headers,
        json={
            "enablePublicProfile": True,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # List public collections with no auth - should still get profile even
    # with no public collections
    r = requests.get(f"{API_PREFIX}/public/orgs/{NON_DEFAULT_ORG_SLUG}/collections")
    assert r.status_code == 200
    data = r.json()
    assert data["org"]["name"] == NON_DEFAULT_ORG_NAME
    assert data["collections"] == []


def test_set_collection_home_url(
    crawler_auth_headers, default_org_id, crawler_crawl_id
):
    # Get a page id from crawler_crawl_id
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/pages",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1

    page = data["items"][0]
    assert page

    page_id = page["id"]
    assert page_id

    page_url = page["url"]
    page_ts = page["ts"]

    # Set page as home url
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}/home-url",
        headers=crawler_auth_headers,
        json={"pageId": page_id},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Check that fields were set in collection as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["homeUrl"] == page_url
    assert data["homeUrlTs"] == page_ts
    assert data["homeUrlPageId"] == page_id


def test_collection_url_list(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}/pageUrlCounts",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["items"]) >= 1
    urls = data["items"]
    assert urls

    for url in urls:
        assert url["url"]
        assert url["count"] >= 1

        snapshots = url["snapshots"]
        assert snapshots

        for snapshot in snapshots:
            assert snapshot["pageId"]
            assert snapshot["ts"]
            assert snapshot["status"]


def test_upload_collection_thumbnail(crawler_auth_headers, default_org_id):
    # https://dev.browsertrix.com/api/orgs/c69247f4-415e-4abc-b449-e85d2f26c626/collections/b764fbe1-baab-4dc5-8dca-2db6f82c250b/thumbnail?filename=page-thumbnail_47fe599e-ed62-4edd-b078-93d4bf281e0f.jpeg&sourceUrl=https%3A%2F%2Fspecs.webrecorder.net%2F&sourceTs=2024-08-16T08%3A00%3A21.601000Z&sourcePageId=47fe599e-ed62-4edd-b078-93d4bf281e0f
    with open(os.path.join(curr_dir, "data", "thumbnail.jpg"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}/thumbnail?filename=thumbnail.jpg&sourceUrl=https%3A%2F%2Fexample.com%2F&sourceTs=2024-08-16T08%3A00%3A21.601000Z&sourcePageId=1bba4aba-d5be-4943-ad48-d6710633d754",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 200
        assert r.json()["added"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    collection = r.json()
    thumbnail = collection["thumbnail"]

    assert thumbnail["name"]
    assert thumbnail["path"]
    assert thumbnail["hash"]
    assert thumbnail["size"] > 0

    assert thumbnail["originalFilename"] == "thumbnail.jpg"
    assert thumbnail["mime"] == "image/jpeg"
    assert thumbnail["userid"]
    assert thumbnail["userName"]
    assert thumbnail["created"]

    thumbnailSource = collection["thumbnailSource"]

    assert thumbnailSource["url"]
    assert thumbnailSource["urlTs"]
    assert thumbnailSource["urlPageId"]

    assert thumbnailSource["url"] == "https://example.com/"
    assert thumbnailSource["urlTs"] == "2024-08-16T08:00:21.601000Z"
    assert thumbnailSource["urlPageId"] == "1bba4aba-d5be-4943-ad48-d6710633d754"


def test_set_collection_default_thumbnail(crawler_auth_headers, default_org_id):
    default_thumbnail_name = "orange-default.avif"

    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_second_public_coll_id}",
        headers=crawler_auth_headers,
        json={"defaultThumbnailName": default_thumbnail_name},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_second_public_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == _second_public_coll_id
    assert data["defaultThumbnailName"] == default_thumbnail_name


def test_list_public_colls_home_url_thumbnail():
    # Check we get expected data for each public collection
    # and nothing we don't expect
    non_public_fields = (
        "tags",
        "homeUrlPageId",
    )
    non_public_image_fields = ("originalFilename", "userid", "userName", "created")

    r = requests.get(f"{API_PREFIX}/public/orgs/{default_org_slug}/collections")
    assert r.status_code == 200
    collections = r.json()["collections"]
    assert len(collections) == 2

    for coll in collections:
        assert coll["id"] in (_public_coll_id, _second_public_coll_id)
        assert coll["oid"]
        assert coll["access"] == "public"
        assert coll["name"]
        assert coll["created"]
        assert coll["modified"]
        assert coll["dateEarliest"]
        assert coll["dateLatest"]
        assert coll["crawlCount"] > 0
        assert coll["pageCount"] > 0
        assert coll["uniquePageCount"] > 0
        assert coll["totalSize"] > 0

        for field in non_public_fields:
            assert field not in coll

        if coll["id"] == _public_coll_id:
            assert coll["allowPublicDownload"] is False

            assert coll["caption"] == CAPTION

            assert coll["homeUrl"]
            assert coll["homeUrlTs"]

            thumbnail = coll["thumbnail"]
            assert thumbnail

            assert thumbnail["name"]
            assert thumbnail["path"]
            assert thumbnail["hash"]
            assert thumbnail["size"]
            assert thumbnail["mime"]

            for field in non_public_image_fields:
                assert field not in thumbnail

        if coll["id"] == _second_public_coll_id:
            assert coll["description"]
            assert coll["defaultThumbnailName"] == "orange-default.avif"
            assert coll["allowPublicDownload"]


def test_get_public_collection(default_org_id):
    r = requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{PUBLIC_COLLECTION_SLUG}"
    )
    assert r.status_code == 200
    coll = r.json()

    assert coll["id"] == _public_coll_id
    assert coll["oid"] == default_org_id
    assert coll["access"] == "public"
    assert coll["name"]
    assert coll["created"]
    assert coll["modified"]
    assert coll["slug"] == PUBLIC_COLLECTION_SLUG
    assert coll["resources"]
    assert coll["dateEarliest"]
    assert coll["dateLatest"]
    assert coll["crawlCount"] > 0
    assert coll["pageCount"] > 0
    assert coll["uniquePageCount"] > 0
    assert coll["totalSize"] > 0

    for field in NON_PUBLIC_COLL_FIELDS:
        assert field not in coll

    assert coll["caption"] == CAPTION

    assert coll["homeUrl"]
    assert coll["homeUrlTs"]

    assert coll["allowPublicDownload"] is False

    thumbnail = coll["thumbnail"]
    assert thumbnail

    assert thumbnail["name"]
    assert thumbnail["path"]
    assert thumbnail["hash"]
    assert thumbnail["size"]
    assert thumbnail["mime"]

    for field in NON_PUBLIC_IMAGE_FIELDS:
        assert field not in thumbnail

    # Invalid org slug - don't reveal whether org exists or not, use
    # same exception as if collection doesn't exist
    r = requests.get(
        f"{API_PREFIX}/public/orgs/doesntexist/collections/{PUBLIC_COLLECTION_SLUG}"
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "collection_not_found"

    # Unused slug
    random_uuid = uuid4()
    r = requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/someslugnotinuse"
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "collection_not_found"

    # Collection isn't public
    r = requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{UPDATED_SLUG}"
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "collection_not_found"


def test_get_public_collection_unlisted(crawler_auth_headers, default_org_id):
    # Make second public coll unlisted
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_second_public_coll_id}",
        headers=crawler_auth_headers,
        json={
            "access": "unlisted",
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Verify single public collection GET endpoint works for unlisted collection
    r = requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{SECOND_PUBLIC_COLL_SLUG}"
    )
    assert r.status_code == 200
    coll = r.json()

    assert coll["id"] == _second_public_coll_id
    assert coll["oid"] == default_org_id
    assert coll["access"] == "unlisted"
    assert coll["name"]
    assert coll["created"]
    assert coll["modified"]
    assert coll["slug"] == SECOND_PUBLIC_COLL_SLUG
    assert coll["resources"]
    assert coll["dateEarliest"]
    assert coll["dateLatest"]
    assert coll["crawlCount"] > 0
    assert coll["pageCount"] > 0
    assert coll["uniquePageCount"] > 0
    assert coll["totalSize"] > 0
    assert coll["defaultThumbnailName"] == "orange-default.avif"
    assert coll["allowPublicDownload"]

    for field in NON_PUBLIC_COLL_FIELDS:
        assert field not in coll


def test_get_public_collection_unlisted_org_profile_disabled(
    admin_auth_headers, default_org_id
):
    # Disable org profile
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/public-profile",
        headers=admin_auth_headers,
        json={
            "enablePublicProfile": False,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Verify we can still get public details for unlisted collection
    r = requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{SECOND_PUBLIC_COLL_SLUG}"
    )
    assert r.status_code == 200
    coll = r.json()

    assert coll["id"] == _second_public_coll_id
    assert coll["oid"] == default_org_id
    assert coll["access"] == "unlisted"
    assert coll["name"]
    assert coll["created"]
    assert coll["modified"]
    assert coll["slug"]
    assert coll["resources"]
    assert coll["dateEarliest"]
    assert coll["dateLatest"]
    assert coll["crawlCount"] > 0
    assert coll["pageCount"] > 0
    assert coll["uniquePageCount"] > 0
    assert coll["totalSize"] > 0
    assert coll["defaultThumbnailName"] == "orange-default.avif"
    assert coll["allowPublicDownload"]

    for field in NON_PUBLIC_COLL_FIELDS:
        assert field not in coll

    # Re-enable org profile
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/public-profile",
        headers=admin_auth_headers,
        json={
            "enablePublicProfile": True,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]


def test_delete_thumbnail(crawler_auth_headers, default_org_id):
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}/thumbnail",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["deleted"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json().get("thumbnail") is None

    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_second_public_coll_id}/thumbnail",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "thumbnail_not_found"


def test_unset_collection_home_url(
    crawler_auth_headers, default_org_id, crawler_crawl_id
):
    # Unset home url
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}/home-url",
        headers=crawler_auth_headers,
        json={"pageId": None},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Check that fields were set in collection as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("homeUrl") is None
    assert data.get("homeUrlTs") is None
    assert data.get("homeUrlPageId") is None


def test_download_streaming_public_collection(crawler_auth_headers, default_org_id):
    # Check that download is blocked if allowPublicDownload is False
    with requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{PUBLIC_COLLECTION_SLUG}/download",
        stream=True,
    ) as r:
        assert r.status_code == 403

    # Set allowPublicDownload to True and then check downloading works
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}",
        headers=crawler_auth_headers,
        json={
            "allowPublicDownload": True,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    with TemporaryFile() as fh:
        with requests.get(
            f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{PUBLIC_COLLECTION_SLUG}/download",
            stream=True,
        ) as r:
            assert r.status_code == 200
            for chunk in r.iter_content():
                fh.write(chunk)

        fh.seek(0)
        with ZipFile(fh, "r") as zip_file:
            contents = zip_file.namelist()

            assert len(contents) == 2
            for filename in contents:
                assert filename.endswith(".wacz") or filename == "datapackage.json"
                assert zip_file.getinfo(filename).compress_type == ZIP_STORED


def test_download_streaming_public_collection_profile_disabled(
    admin_auth_headers, default_org_id
):
    # Disable org public profile and ensure download still works for public collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/public-profile",
        headers=admin_auth_headers,
        json={
            "enablePublicProfile": False,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    with TemporaryFile() as fh:
        with requests.get(
            f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{PUBLIC_COLLECTION_SLUG}/download",
            stream=True,
        ) as r:
            assert r.status_code == 200
            for chunk in r.iter_content():
                fh.write(chunk)

        fh.seek(0)
        with ZipFile(fh, "r") as zip_file:
            contents = zip_file.namelist()

            assert len(contents) == 2
            for filename in contents:
                assert filename.endswith(".wacz") or filename == "datapackage.json"
                assert zip_file.getinfo(filename).compress_type == ZIP_STORED


def test_get_public_collection_slug_redirect(admin_auth_headers, default_org_id):
    # Update public collection slug
    new_slug = "new-slug"

    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_public_coll_id}",
        headers=admin_auth_headers,
        json={
            "slug": new_slug,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Get public collection from previous slug
    r = requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{PUBLIC_COLLECTION_SLUG}"
    )
    assert r.status_code == 200
    coll = r.json()

    assert coll["id"] == _public_coll_id
    assert coll["oid"] == default_org_id
    assert coll["slug"] == new_slug

    # Rename second public collection slug to now-unused PUBLIC_COLLECTION_SLUG
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_second_public_coll_id}",
        headers=admin_auth_headers,
        json={
            "slug": PUBLIC_COLLECTION_SLUG,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Delete second public collection
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{_second_public_coll_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Verify that trying to go to PUBLIC_COLLECTION_SLUG now 404s instead of taking
    # us to the collection that had the slug before it was reassigned
    r = requests.get(
        f"{API_PREFIX}/public/orgs/{default_org_slug}/collections/{PUBLIC_COLLECTION_SLUG}"
    )
    assert r.status_code == 404


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
    assert _second_coll_id not in r.json()["collectionIds"]

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
