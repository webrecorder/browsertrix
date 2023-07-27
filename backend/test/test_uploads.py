import requests
import os
from urllib.parse import urljoin

from .conftest import API_PREFIX
from .utils import read_in_chunks

upload_id = None
upload_id_2 = None
upload_dl_path = None


curr_dir = os.path.dirname(os.path.realpath(__file__))


def test_upload_stream(admin_auth_headers, default_org_id, uploads_collection_id):
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz&name=My%20Upload&description=Testing%0AData&collections={uploads_collection_id}&tags=one%2Ctwo",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    global upload_id
    upload_id = r.json()["id"]


def test_list_stream_upload(admin_auth_headers, default_org_id, uploads_collection_id):
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
    assert found["collections"] == [uploads_collection_id]
    assert sorted(found["tags"]) == ["one", "two"]
    assert "files" not in found
    assert "resources" not in found


def test_get_stream_upload(admin_auth_headers, default_org_id, uploads_collection_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    result = r.json()
    assert uploads_collection_id in result["collections"]
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


def test_upload_form(admin_auth_headers, default_org_id, uploads_collection_id):
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
    assert r.json()["added"]

    global upload_id_2
    upload_id_2 = r.json()["id"]


def test_list_uploads(admin_auth_headers, default_org_id, uploads_collection_id):
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
    assert found["collections"] == [uploads_collection_id]
    assert sorted(found["tags"]) == ["four", "three"]

    assert "files" not in res
    assert "resources" not in res


def test_collection_uploads(admin_auth_headers, default_org_id, uploads_collection_id):
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
    admin_auth_headers, default_org_id, uploads_collection_id
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
    assert data["collections"] == [uploads_collection_id]
    assert sorted(data["tags"]) == ["one", "two"]
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == None
    assert "files" not in data


def test_get_upload_replay_json_admin(
    admin_auth_headers, default_org_id, uploads_collection_id
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
    assert data["collections"] == [uploads_collection_id]
    assert sorted(data["tags"]) == ["one", "two"]
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert data["errors"] == None
    assert "files" not in data


def test_replace_upload(admin_auth_headers, default_org_id, uploads_collection_id):
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


def test_update_upload_metadata(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "My Upload Updated"
    assert not data["tags"]
    assert not data["description"]

    # Submit patch request to update name, tags, and description
    UPDATED_NAME = "New Upload Name"
    UPDATED_TAGS = ["wr-test-1-updated", "wr-test-2-updated"]
    UPDATED_DESC = "Lorem ipsum test note."
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}",
        headers=admin_auth_headers,
        json={"tags": UPDATED_TAGS, "description": UPDATED_DESC, "name": UPDATED_NAME},
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


def test_delete_stream_upload(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id]},
    )
    assert r.json()["deleted"] == True


def test_ensure_deleted(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    for res in results["items"]:
        if res["id"] == upload_id:
            assert False


def test_replace_upload_non_existent(
    admin_auth_headers, default_org_id, uploads_collection_id
):
    global upload_id

    # same replacement, but now to a non-existent upload
    actual_id = do_upload_replace(
        admin_auth_headers, default_org_id, upload_id, uploads_collection_id
    )

    # new upload_id created
    assert actual_id != upload_id

    upload_id = actual_id


def test_verify_from_upload_resource_count(admin_auth_headers, default_org_id):
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


def test_list_all_crawls(admin_auth_headers, default_org_id):
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


def test_get_upload_from_all_crawls(admin_auth_headers, default_org_id):
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


def test_get_upload_replay_json_from_all_crawls(admin_auth_headers, default_org_id):
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
    assert data["errors"] == None
    assert "files" not in data


def test_get_upload_replay_json_admin_from_all_crawls(
    admin_auth_headers, default_org_id
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
    assert data["errors"] == None
    assert "files" not in data


def test_delete_form_upload_from_all_crawls(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id_2]},
    )
    assert r.json()["deleted"] == True
