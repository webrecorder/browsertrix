import os
import time
from tempfile import TemporaryFile
from urllib.parse import urljoin
from zipfile import ZIP_STORED, ZipFile

import pytest
import requests

from .conftest import API_PREFIX
from .utils import read_in_chunks

curr_dir = os.path.dirname(os.path.realpath(__file__))

MAX_ATTEMPTS = 24


@pytest.fixture(scope="module")
def upload_id(admin_auth_headers, default_org_id, uploads_collection_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz&name=My%20Upload&description=Testing%0AData&collections={uploads_collection_id}&tags=one%2Ctwo",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    upload_id = r.json()["id"]
    assert upload_id
    return upload_id


@pytest.fixture(scope="module")
def upload_id_2(admin_auth_headers, default_org_id, uploads_collection_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        data = fh.read()

    files = [
        ("uploads", ("test.wacz", data, "application/octet-stream")),
        ("uploads", ("test-2.wacz", data, "application/octet-stream")),
        ("uploads", ("test.wacz", data, "application/octet-stream")),
    ]

    r = requests.put(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/formdata?name=test2.wacz&collections={uploads_collection_id}&tags=three%2Cfour",
        headers=admin_auth_headers,
        files=files,
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["storageQuotaReached"] is False

    upload_id_2 = r.json()["id"]
    assert upload_id_2
    return upload_id_2


@pytest.fixture(scope="module")
def replaced_upload_id(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id
):
    # Replace upload_id with a non-existent upload
    actual_id = do_upload_replace(
        admin_auth_headers, default_org_id, upload_id, uploads_collection_id
    )

    assert actual_id
    assert actual_id != upload_id
    return actual_id


@pytest.fixture(scope="module")
def multi_wacz_upload_id(admin_auth_headers, default_org_id):
    """Upload a multi-WACZ file (zip containing child .wacz files).
    Post-processing splits the multi-WACZ into individual child WACZ files."""
    with open(os.path.join(curr_dir, "data", "multi-wacz.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream"
            "?filename=test-multi.wacz"
            "&name=Multi-WACZ%20Upload",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    upload_id = r.json()["id"]
    assert upload_id

    # Post-processing is synchronous (called with await), so no sleep needed.
    # But give a brief moment for page counts to settle.
    time.sleep(2)

    return upload_id


def test_list_stream_upload(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    assert len(results["items"]) > 0

    found = None

    for res in results["items"]:
        if res["id"] == upload_id:
            found = res

    assert found
    assert found["name"] == "My Upload"
    assert found["description"] == "Testing\nData"
    assert found["collectionIds"] == [uploads_collection_id]
    assert sorted(found["tags"]) == ["one", "two"]
    assert "files" not in found
    assert "resources" not in found


def test_get_stream_upload(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()
    assert uploads_collection_id in result["collectionIds"]
    assert "files" not in result
    upload_dl_path = result["resources"][0]["path"]
    assert "test-" in result["resources"][0]["name"]
    assert result["resources"][0]["name"].endswith(".wacz")

    dl_path = urljoin(API_PREFIX, upload_dl_path)
    wacz_resp = requests.get(dl_path)
    actual = wacz_resp.content

    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        expected = fh.read()

    assert len(actual) == len(expected)
    assert actual == expected

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200


def test_list_uploads(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id_2
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    assert len(results["items"]) > 1

    found = None

    for res in results["items"]:
        if res["id"] == upload_id_2:
            found = res

    assert found
    assert found["name"] == "test2.wacz"
    assert found["collectionIds"] == [uploads_collection_id]
    assert sorted(found["tags"]) == ["four", "three"]

    assert "files" not in res
    assert "resources" not in res


def test_collection_uploads(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id, upload_id_2
):
    # Test uploads filtered by collection
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads?collectionId={uploads_collection_id}",
        headers=admin_auth_headers,
    )

    results = r.json()

    assert len(results["items"]) == 2
    assert results["items"][0]["id"] in (upload_id, upload_id_2)
    assert results["items"][1]["id"] in (upload_id, upload_id_2)

    # Test all crawls filtered by collection
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?collectionId={uploads_collection_id}",
        headers=admin_auth_headers,
    )

    results = r.json()

    assert len(results["items"]) == 2
    assert results["items"][0]["id"] in (upload_id, upload_id_2)
    assert results["items"][1]["id"] in (upload_id, upload_id_2)


def test_get_upload_replay_json(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id
    assert data["name"] == "My Upload"
    assert data["collectionIds"] == [uploads_collection_id]
    assert sorted(data["tags"]) == ["one", "two"]
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data
    assert data["version"] == 2


def test_get_upload_replay_json_admin(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/uploads/{upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id
    assert data["name"] == "My Upload"
    assert data["collectionIds"] == [uploads_collection_id]
    assert sorted(data["tags"]) == ["one", "two"]
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data
    assert data["version"] == 2


def test_get_upload_pages(admin_auth_headers, default_org_id, upload_id):
    # Give time for pages to finish being uploaded
    time.sleep(10)

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/pages",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["total"] > 0

    pages = data["items"]
    for page in pages:
        assert page["id"]
        assert page["oid"]
        assert page["crawl_id"] == upload_id
        assert page["url"]
        assert page["ts"]
        assert page["filename"]
        assert page.get("title") or page.get("title") is None
        assert page["isSeed"]

    page_id = pages[0]["id"]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/pages/{page_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    page = r.json()

    assert page["id"] == page_id
    assert page["oid"]
    assert page["crawl_id"]
    assert page["url"]
    assert page["ts"]
    assert page["filename"]
    assert page.get("title") or page.get("title") is None
    assert page["isSeed"]

    assert page["notes"] == []
    assert page.get("userid") is None
    assert page.get("modified") is None
    assert page.get("approved") is None

    # Check that pageCount and uniquePageCount stored on upload
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["pageCount"] > 0
    assert data["uniquePageCount"] > 0


def test_uploads_collection_updated(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id
):
    # Verify that collection is updated when WACZ is added on upload
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{uploads_collection_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["crawlCount"] > 0
    assert data["pageCount"] > 0
    assert data["uniquePageCount"] > 0
    assert data["totalSize"] > 0
    assert data["dateEarliest"]
    assert data["dateLatest"]
    assert data["modified"] >= data["created"]


def test_replace_upload(
    admin_auth_headers, default_org_id, uploads_collection_id, upload_id
):
    actual_id = do_upload_replace(
        admin_auth_headers, default_org_id, upload_id, uploads_collection_id
    )

    assert upload_id == actual_id


def do_upload_replace(
    admin_auth_headers, default_org_id, upload_id, uploads_collection_id
):
    with open(os.path.join(curr_dir, "data", "example-2.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz&name=My%20Upload%20Updated&replaceId={upload_id}&collections={uploads_collection_id}",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]
    actual_id = r.json()["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{actual_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    # only one file, previous file removed
    assert len(result["resources"]) == 1

    dl_path = urljoin(API_PREFIX, result["resources"][0]["path"])
    wacz_resp = requests.get(dl_path)
    actual = wacz_resp.content

    with open(os.path.join(curr_dir, "data", "example-2.wacz"), "rb") as fh:
        expected = fh.read()

    assert len(actual) == len(expected)
    assert actual == expected

    return actual_id


def test_update_upload_metadata(admin_auth_headers, default_org_id, upload_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "My Upload Updated"
    assert not data["tags"]
    assert not data["description"]
    assert len(data["collectionIds"]) == 1

    # Make new collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={"name": "Patch Update Test Collection"},
    )
    patch_coll_id = r.json()["id"]

    # Submit patch request to update name, tags, and description
    UPDATED_NAME = "New Upload Name"
    UPDATED_TAGS = ["wr-test-1-updated", "wr-test-2-updated"]
    UPDATED_DESC = "Lorem ipsum test note."
    UPDATED_COLLECTION_IDS = [patch_coll_id]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
        json={
            "tags": UPDATED_TAGS,
            "description": UPDATED_DESC,
            "name": UPDATED_NAME,
            "collectionIds": UPDATED_COLLECTION_IDS,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME
    assert data["collectionIds"] == UPDATED_COLLECTION_IDS


def test_download_wacz_uploads(admin_auth_headers, default_org_id, upload_id):
    with TemporaryFile() as fh:
        with requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/download",
            headers=admin_auth_headers,
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


def test_delete_stream_upload(
    admin_auth_headers, crawler_auth_headers, default_org_id, upload_id
):
    # Verify non-admin user who didn't upload crawl can't delete it
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [upload_id]},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "not_allowed"

    # Verify user who created upload can delete it
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id]},
    )
    data = r.json()
    assert data["deleted"]
    assert data["storageQuotaReached"] is False


def test_ensure_deleted(admin_auth_headers, default_org_id, upload_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    for res in results["items"]:
        if res["id"] == upload_id:
            assert False


def test_verify_from_upload_resource_count(
    admin_auth_headers, default_org_id, upload_id_2
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    assert "files" not in result
    assert len(result["resources"]) == 3

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200


def test_list_all_crawls(
    admin_auth_headers, default_org_id, replaced_upload_id, upload_id_2
):
    """Test that /all-crawls lists crawls and uploads before deleting uploads"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    items = data["items"]

    assert len(items) == data["total"]

    crawls = [item for item in items if item["type"] == "crawl"]
    assert len(crawls) > 0

    uploads = [item for item in items if item["type"] == "upload"]
    assert len(uploads) > 0

    for item in items:
        assert item["type"] in ("crawl", "upload")

        if item["type"] == "crawl":
            assert item["firstSeed"]
            assert item["seedCount"]
            assert item.get("name") or item.get("name") == ""

        assert item["id"]
        assert item["userid"]
        assert item["oid"] == default_org_id
        assert item["started"]
        assert item["finished"]
        assert item["state"]
        assert item["version"] == 2

    # Test that all-crawls lastQAState and lastQAStarted sorts always puts crawls before uploads
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=lastQAState",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    last_type = None
    for item in data["items"]:
        if last_type == "upload":
            assert item["type"] != "crawl"
        last_type = item["type"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=lastQAStarted",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    last_type = None
    for item in data["items"]:
        if last_type == "upload":
            assert item["type"] != "crawl"
        last_type = item["type"]


def test_get_all_crawls_by_name(
    admin_auth_headers, default_org_id, replaced_upload_id, upload_id_2
):
    """Test filtering /all-crawls by name"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?name=test2.wacz",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    items = data["items"]
    assert items[0]["id"] == upload_id_2
    assert items[0]["name"] == "test2.wacz"

    crawl_name = "crawler User Test Crawl"
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?name={crawl_name}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    for item in data["items"]:
        assert item["name"] == crawl_name


def test_get_all_crawls_by_first_seed(
    admin_auth_headers,
    default_org_id,
    crawler_crawl_id,
    replaced_upload_id,
    upload_id_2,
):
    """Test filtering /all-crawls by first seed"""
    first_seed = "https://old.webrecorder.net/"
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?firstSeed={first_seed}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 6
    for item in data["items"]:
        assert item["firstSeed"] == first_seed


def test_get_all_crawls_by_type(
    admin_auth_headers, default_org_id, admin_crawl_id, replaced_upload_id, upload_id_2
):
    """Test filtering /all-crawls by crawl type"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?crawlType=crawl",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 7
    for item in data["items"]:
        assert item["type"] == "crawl"

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?crawlType=upload",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    for item in data["items"]:
        assert item["type"] == "upload"

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?crawlType=invalid",
        headers=admin_auth_headers,
    )
    assert r.status_code == 422


def test_get_all_crawls_by_user(
    admin_auth_headers, default_org_id, crawler_userid, replaced_upload_id, upload_id_2
):
    """Test filtering /all-crawls by userid"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?userid={crawler_userid}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 5
    for item in data["items"]:
        assert item["userid"] == crawler_userid


def test_get_all_crawls_by_cid(
    admin_auth_headers, default_org_id, all_crawls_config_id
):
    """Test filtering /all-crawls by cid"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?cid={all_crawls_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["cid"] == all_crawls_config_id


def test_get_all_crawls_by_state(
    admin_auth_headers, default_org_id, admin_crawl_id, replaced_upload_id, upload_id_2
):
    """Test filtering /all-crawls by cid"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?state=complete,stopped_by_user",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 5
    items = data["items"]
    for item in items:
        assert item["state"] in (
            "complete",
            "stopped_by_user",
        )


def test_get_all_crawls_by_collection_id(
    admin_auth_headers, default_org_id, admin_config_id, all_crawls_crawl_id
):
    """Test filtering /all-crawls by collection id"""
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={
            "crawlIds": [all_crawls_crawl_id],
            "name": "all-crawls collection",
        },
    )
    assert r.status_code == 200
    new_coll_id = r.json()["id"]
    assert new_coll_id

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?collectionId={new_coll_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["id"] == all_crawls_crawl_id


def test_sort_all_crawls(
    admin_auth_headers, default_org_id, admin_crawl_id, replaced_upload_id, upload_id_2
):
    # Sort by started, descending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=started",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["total"] >= 9
    items = data["items"]
    assert len(items) >= 9

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["started"] <= last_created
        last_created = crawl["started"]

    # Sort by started, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=started&sortDirection=1",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["started"] >= last_created
        last_created = crawl["started"]

    # Sort by finished
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=finished",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_finished = None
    for crawl in items:
        if not crawl["finished"]:
            continue
        if last_finished:
            assert crawl["finished"] <= last_finished
        last_finished = crawl["finished"]

    # Sort by finished, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=finished&sortDirection=1",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_finished = None
    for crawl in items:
        if not crawl["finished"]:
            continue
        if last_finished:
            assert crawl["finished"] >= last_finished
        last_finished = crawl["finished"]

    # Sort by fileSize
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=fileSize",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_size = None
    for crawl in items:
        if last_size:
            assert crawl["fileSize"] <= last_size
        last_size = crawl["fileSize"]

    # Sort by fileSize, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=fileSize&sortDirection=1",
        headers=admin_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_size = None
    for crawl in items:
        if last_size:
            assert crawl["fileSize"] >= last_size
        last_size = crawl["fileSize"]

    # Invalid sort value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=invalid",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_by"

    # Invalid sort_direction value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=started&sortDirection=0",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_direction"


def test_all_crawls_search_values(
    admin_auth_headers, default_org_id, replaced_upload_id, upload_id_2
):
    """Test that all-crawls search values return expected results"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["names"]) == 9
    expected_names = [
        "crawler User Test Crawl",
        "Canceled crawl",
        "Custom Behavior Logs",
        "My Upload Updated",
        "test2.wacz",
        "All Crawls Test Crawl",
        "Crawler User Crawl for Testing QA",
    ]
    for expected_name in expected_names:
        assert expected_name in data["names"]

    assert sorted(data["descriptions"]) == ["Lorem ipsum"]
    assert sorted(data["firstSeeds"]) == [
        "https://old.webrecorder.net/",
        "https://specs.webrecorder.net/",
    ]

    # Test filtering by crawls
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values?crawlType=crawl",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["names"]) == 6
    expected_names = [
        "Admin Test Crawl",
        "All Crawls Test Crawl",
        "Canceled crawl",
        "Crawler User Crawl for Testing QA",
        "crawler User Test Crawl",
        "Custom Behavior Logs",
    ]
    for expected_name in expected_names:
        assert expected_name in data["names"]

    assert sorted(data["descriptions"]) == ["Lorem ipsum"]
    assert sorted(data["firstSeeds"]) == [
        "https://old.webrecorder.net/",
        "https://specs.webrecorder.net/",
    ]

    # Test filtering by uploads
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values?crawlType=upload",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert len(data["names"]) == 3
    expected_names = [
        "My Upload Updated",
        "test2.wacz",
    ]
    for expected_name in expected_names:
        assert expected_name in data["names"]

    assert sorted(data["descriptions"]) == []
    assert sorted(data["firstSeeds"]) == []

    # Test invalid filter
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/search-values?crawlType=invalid",
        headers=admin_auth_headers,
    )
    assert r.status_code == 422


def test_get_upload_from_all_crawls(admin_auth_headers, default_org_id, upload_id_2):
    """Test that /all-crawls lists crawls and uploads before deleting uploads"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["name"] == "test2.wacz"

    assert "files" not in data
    assert data["resources"]


def test_get_upload_replay_json_from_all_crawls(
    admin_auth_headers, default_org_id, upload_id_2
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id_2
    assert data["name"] == "test2.wacz"
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data
    assert data["version"] == 2


def test_get_upload_replay_json_admin_from_all_crawls(
    admin_auth_headers, default_org_id, upload_id_2
):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/all-crawls/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id_2
    assert data["name"] == "test2.wacz"
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == []
    assert "files" not in data
    assert data["version"] == 2


def test_update_upload_metadata_all_crawls(
    admin_auth_headers, default_org_id, replaced_upload_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{replaced_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "My Upload Updated"
    assert not data["tags"]
    assert not data["description"]
    assert len(data["collectionIds"]) == 1

    # Make new collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={"name": "Patch Update Test Collection 2"},
    )
    patch_coll_id_2 = r.json()["id"]

    # Submit patch request to update name, tags, and description
    UPDATED_NAME = "New Upload Name 2"
    UPDATED_TAGS = ["wr-test-1-updated-again", "wr-test-2-updated-again"]
    UPDATED_DESC = "Lorem ipsum test note 2."
    UPDATED_COLLECTION_IDS = [patch_coll_id_2]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{replaced_upload_id}",
        headers=admin_auth_headers,
        json={
            "tags": UPDATED_TAGS,
            "description": UPDATED_DESC,
            "name": UPDATED_NAME,
            "collectionIds": UPDATED_COLLECTION_IDS,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{replaced_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME
    assert data["collectionIds"] == UPDATED_COLLECTION_IDS

    # Submit patch request to set collections to empty list
    UPDATED_COLLECTION_IDS = []
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{replaced_upload_id}",
        headers=admin_auth_headers,
        json={
            "collectionIds": UPDATED_COLLECTION_IDS,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{replaced_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["description"] == UPDATED_DESC
    assert data["name"] == UPDATED_NAME
    assert data["collectionIds"] == []


def test_clear_all_presigned_urls(
    admin_auth_headers, crawler_auth_headers, default_org_id
):
    # All orgs
    r = requests.post(
        f"{API_PREFIX}/orgs/clear-presigned-urls",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"

    r = requests.post(
        f"{API_PREFIX}/orgs/clear-presigned-urls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Per-org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/clear-presigned-urls",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 403

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/clear-presigned-urls",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]


def test_all_crawls_tag_counts(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/tagCounts",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == {
        "tags": [
            {"tag": "wr-test-1", "count": 3},
            {"tag": "wr-test-2", "count": 2},
            {"tag": "all-crawls", "count": 1},
            {"tag": "behaviors", "count": 1},
            {"tag": "four", "count": 1},
            {"tag": "qa", "count": 1},
            {"tag": "three", "count": 1},
            {"tag": "wr-test-1-updated-again", "count": 1},
            {"tag": "wr-test-2-updated-again", "count": 1},
        ]
    }


def test_all_crawls_tag_counts_including_failed(
    crawler_auth_headers, default_org_id, canceled_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/tagCounts?onlySuccessful=false",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == {
        "tags": [
            {"tag": "wr-test-1", "count": 3},
            {"tag": "wr-test-2", "count": 2},
            {"tag": "all-crawls", "count": 1},
            {"tag": "behaviors", "count": 1},
            {"tag": "canceled", "count": 1},
            {"tag": "four", "count": 1},
            {"tag": "qa", "count": 1},
            {"tag": "three", "count": 1},
            {"tag": "wr-test-1-updated-again", "count": 1},
            {"tag": "wr-test-2-updated-again", "count": 1},
        ]
    }


def test_crawls_tag_counts(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/tagCounts",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == {
        "tags": [
            {"tag": "wr-test-1", "count": 3},
            {"tag": "wr-test-2", "count": 2},
            {"tag": "all-crawls", "count": 1},
            {"tag": "behaviors", "count": 1},
            {"tag": "qa", "count": 1},
        ]
    }


def test_crawls_tag_counts_including_failed(
    crawler_auth_headers, default_org_id, canceled_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/tagCounts?onlySuccessful=false",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == {
        "tags": [
            {"tag": "wr-test-1", "count": 3},
            {"tag": "wr-test-2", "count": 2},
            {"tag": "all-crawls", "count": 1},
            {"tag": "behaviors", "count": 1},
            {"tag": "canceled", "count": 1},
            {"tag": "qa", "count": 1},
        ]
    }


def test_uploads_tag_counts(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/tagCounts",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == {
        "tags": [
            {"tag": "four", "count": 1},
            {"tag": "three", "count": 1},
            {"tag": "wr-test-1-updated-again", "count": 1},
            {"tag": "wr-test-2-updated-again", "count": 1},
        ]
    }


def test_multi_wacz_upload_split(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify that a multi-WACZ upload is split into child WACZ files."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{multi_wacz_upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    # Should have 2 child WACZ resources (not the original multi-WACZ container)
    resources = result["resources"]
    assert len(resources) == 2, f"Expected 2 child WACZ resources, got {len(resources)}"

    for res in resources:
        assert res["name"].endswith(".wacz"), (
            f"Resource {res['name']} should be a .wacz"
        )
        assert res["path"], f"Resource {res['name']} should have a path"
        assert res["size"] > 0, f"Resource {res['name']} should have size > 0"
        assert res["hash"], f"Resource {res['name']} should have a hash"

    # Verify upload metadata reflects the split
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{multi_wacz_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    upload_data = r.json()

    assert upload_data["fileCount"] == 2, (
        f"Expected fileCount=2 after split, got {upload_data['fileCount']}"
    )
    assert upload_data["state"] == "complete", (
        f"Expected state=complete, got {upload_data['state']}"
    )


def test_multi_wacz_upload_pages(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify that pages are extracted from the split child WACZ files."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{multi_wacz_upload_id}/pages",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["total"] > 0, (
        f"Expected pages from multi-WACZ children, got {data['total']}"
    )

    for page in data["items"]:
        assert page["id"]
        assert page["crawl_id"] == multi_wacz_upload_id
        assert page["url"]

    # Verify page counts on the upload metadata
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{multi_wacz_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    upload_data = r.json()
    assert upload_data["pageCount"] > 0
    assert upload_data["uniquePageCount"] > 0


def test_multi_wacz_upload_download(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify download as single WACZ still works after multi-WACZ split."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{multi_wacz_upload_id}/download",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    downloaded = r.content
    assert len(downloaded) > 0

    # The downloaded file should be a valid zip (combined WACZ)
    with TemporaryFile() as tmp:
        tmp.write(downloaded)
        tmp.seek(0)
        with ZipFile(tmp, "r") as zf:
            names = zf.namelist()
            assert any(name.endswith(".wacz") for name in names), (
                f"Downloaded zip should contain .wacz files, got {names}"
            )


def test_multi_wacz_upload_list(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify that the multi-WACZ upload appears correctly in the uploads list."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    results = r.json()

    found = None
    for item in results["items"]:
        if item["id"] == multi_wacz_upload_id:
            found = item
            break

    assert found, "Multi-WACZ upload should appear in uploads list"
    assert found["name"] == "Multi-WACZ Upload"
    assert found["fileCount"] == 2
    assert found["state"] == "complete"
    assert found["fileSize"] > 0


def test_multi_wacz_upload_all_crawls(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify that the multi-WACZ upload appears in /all-crawls with correct state."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{multi_wacz_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == multi_wacz_upload_id
    assert data["type"] == "upload"
    assert data["state"] == "complete"
    assert data["fileCount"] == 2
    assert data["fileSize"] > 0

    # Also verify it appears in the paginated list
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?crawlType=upload",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    results = r.json()
    ids = [item["id"] for item in results["items"]]
    assert multi_wacz_upload_id in ids


def test_multi_wacz_upload_all_crawls_replay_json(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify replay.json via /all-crawls shows split child WACZs."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{multi_wacz_upload_id}"
        "/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()

    resources = result["resources"]
    assert len(resources) == 2

    for res in resources:
        assert res["name"].endswith(".wacz")
        assert res["path"]
        assert res["size"] > 0
        assert res["hash"]


def test_multi_wacz_upload_child_wacz_download(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify each child WACZ file is individually downloadable."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{multi_wacz_upload_id}"
        "/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()
    resources = result["resources"]

    for res in resources:
        dl_url = urljoin(API_PREFIX, res["path"])
        dl_resp = requests.get(dl_url)
        assert dl_resp.status_code == 200, (
            f"Child WACZ {res['name']} should be downloadable, got {dl_resp.status_code}: "
            f"{dl_resp.text}"
        )
        assert len(dl_resp.content) > 0, f"Child WACZ {res['name']} should not be empty"

        # Verify it's a valid WACZ (zip starts with PK)
        assert dl_resp.content[:2] == b"PK", (
            f"Child WACZ {res['name']} should be a valid zip/WACZ"
        )


def test_multi_wacz_upload_state_visible(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify the upload reached 'complete' state after processing."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{multi_wacz_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["state"] == "complete", (
        f"Expected state=complete after multi-WACZ processing, got {data['state']}"
    )

    # Verify the upload is counted in all-crawls with only successful states
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls"
        "?crawlType=upload"
        "&state=complete",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    results = r.json()
    ids = [item["id"] for item in results["items"]]
    assert multi_wacz_upload_id in ids, (
        "Completed multi-WACZ upload should be visible when filtering by state=complete"
    )


def test_multi_wacz_upload_in_collection(
    admin_auth_headers, default_org_id, multi_wacz_upload_id
):
    """Verify the multi-WACZ upload's pages contribute to org-side collection stats."""
    # Create a fresh collection for this multi-WACZ upload
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={"name": "Multi-WACZ Collection Test"},
    )
    assert r.status_code == 200
    coll_id = r.json()["id"]

    # Upload a multi-WACZ file assigned to this collection
    with open(os.path.join(curr_dir, "data", "multi-wacz.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream"
            f"?filename=test-multi-coll.wacz"
            f"&name=Multi-WACZ%20Collection%20Upload"
            f"&collections={coll_id}",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )
    assert r.status_code == 200
    assert r.json()["added"]
    coll_upload_id = r.json()["id"]

    # Post-processing is synchronous for small files, but give a brief moment
    # for pages and collection stats to settle
    time.sleep(2)

    # Wait for the background job to update collection stats
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/collections/{coll_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        if data.get("pageCount", 0) > 0:
            break
        if count + 1 == MAX_ATTEMPTS:
            assert False, "Max attempts reached waiting for collection stats update"
        time.sleep(10)
        count += 1

    # Verify collection stats reflect the multi-WACZ upload's pages
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{coll_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["crawlCount"] == 1
    assert data["pageCount"] == 2
    assert data["uniquePageCount"] == 1
    assert data["totalSize"] == 260082

    # Verify the collection's pages endpoint returns the upload's pages
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{coll_id}/pages",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    pages_data = r.json()
    assert pages_data["total"] > 0
    for page in pages_data["items"]:
        assert page["id"]
        assert page["url"]

    # Verify the upload has the collection in its collectionIds
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{coll_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    upload_data = r.json()
    assert coll_id in upload_data.get("collectionIds", [])
    assert upload_data["pageCount"] == 2
    assert upload_data["uniquePageCount"] == 1

    # Also verify the existing multi_wacz_upload_id (uploaded without a collection)
    # still has pages correctly extracted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{multi_wacz_upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    no_coll_data = r.json()
    assert no_coll_data["pageCount"] == 2
    assert no_coll_data["uniquePageCount"] == 1
    assert no_coll_data["fileSize"] == 260082


def test_delete_form_upload_and_crawls_from_all_crawls(
    admin_auth_headers,
    crawler_auth_headers,
    default_org_id,
    all_crawls_delete_crawl_ids,
    all_crawls_delete_config_id,
    upload_id_2,
):
    crawls_to_delete = all_crawls_delete_crawl_ids
    crawls_to_delete.append(upload_id_2)

    # Get org metrics
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/metrics",
        headers=admin_auth_headers,
    )
    data = r.json()

    org_bytes = data["storageUsedBytes"]
    org_crawl_bytes = data["storageUsedCrawls"]
    org_upload_bytes = data["storageUsedUploads"]

    # Get workflow and crawl sizes
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{all_crawls_delete_config_id}",
        headers=admin_auth_headers,
    )
    workflow_size = r.json()["totalSize"]

    crawl_id_1 = all_crawls_delete_crawl_ids[0]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_1}/replay.json",
        headers=admin_auth_headers,
    )
    crawl_1_size = r.json()["fileSize"]

    crawl_id_2 = all_crawls_delete_crawl_ids[1]
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    crawl_2_size = r.json()["fileSize"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id_2}/replay.json",
        headers=admin_auth_headers,
    )
    upload_size = r.json()["fileSize"]

    combined_crawl_size = crawl_1_size + crawl_2_size
    total_size = combined_crawl_size + upload_size

    # Verify that non-admin user can't delete another's items
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": crawls_to_delete},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "not_allowed"

    # Delete mixed type archived items
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": crawls_to_delete},
    )
    data = r.json()
    assert data["deleted"]
    assert data["storageQuotaReached"] is False

    # Check that org and workflow size figures are as expected
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/metrics",
            headers=admin_auth_headers,
        )
        data = r.json()

        all_good = True

        if data["storageUsedBytes"] != org_bytes - total_size:
            all_good = False

        if data["storageUsedCrawls"] != org_crawl_bytes - combined_crawl_size:
            all_good = False

        if data["storageUsedUploads"] != org_upload_bytes - upload_size:
            all_good = False

        if all_good:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert data["storageUsedBytes"] == org_bytes - total_size
            assert data["storageUsedCrawls"] == org_crawl_bytes - combined_crawl_size
            assert data["storageUsedUploads"] == org_upload_bytes - upload_size

        time.sleep(5)
        count += 1

    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{all_crawls_delete_config_id}",
            headers=admin_auth_headers,
        )
        if r.json()["totalSize"] == workflow_size - combined_crawl_size:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(10)
        count += 1
