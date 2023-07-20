import requests
import time

from .conftest import API_PREFIX

manual_crawl_id = None
manual_crawl_2_id = None

MANUAL_CRAWL_NAME = "Test manual archive"
MANUAL_CRAWL_NOTES = "Lorem ipsum"

MANUAL_CRAWL_2_NAME = "Test manual archive 2"
MANUAL_CRAWL_2_NOTES = "Second description"


def test_ping_manual_browser(crawler_auth_headers, default_org_id, manual_browser_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/browser/{manual_browser_id}/ping",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["success"]
    assert data.get("origins") or data.get("origins") == []


def test_get_manual_browser_access_check(
    crawler_auth_headers, default_org_id, manual_browser_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/browser/{manual_browser_id}/access",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == {}


def test_get_manual_browser_url(
    crawler_auth_headers, default_org_id, manual_browser_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/browser/{manual_browser_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["url"]


def test_navigate_manual_browser(
    crawler_auth_headers, default_org_id, manual_browser_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/browser/{manual_browser_id}/navigate",
        headers=crawler_auth_headers,
        json={"url": "https://webrecorder.net"},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["success"]

    time.sleep(10)

    # Verify URL was changed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/browser/{manual_browser_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["url"] == "https://webrecorder.net"


# TODO: This won't pass until /createManualArchiveJS is implemented in crawler
def test_commit_manual_browser_to_crawl(
    crawler_auth_headers, default_org_id, manual_browser_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives",
        headers=crawler_auth_headers,
        json={
            "browserid": manual_browser_id,
            "name": MANUAL_CRAWL_NAME,
            "notes": MANUAL_CRAWL_NOTES,
            # TODO: Add WACZ filename base?
        },
    )
    assert r.status_code == 200

    data = r.json()
    assert data["added"]

    global manual_crawl_id
    manual_crawl_id = r.json()["id"]
    assert manual_crawl_id


def test_get_manual_crawl(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/{manual_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["id"] == manual_crawl_id
    assert data["type"] == "manual"
    assert data["name"] == MANUAL_CRAWL_NAME
    assert data["notes"] == MANUAL_CRAWL_NOTES

    assert "files" not in data
    assert data["resources"]


def test_get_manual_crawl_replay_json(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/{manual_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == manual_crawl_id
    assert data["type"] == "manual"
    assert data["name"] == MANUAL_CRAWL_NAME
    assert data["notes"] == MANUAL_CRAWL_NOTES
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert "files" not in data
    assert "errors" not in data or data.get("errors") is None


def test_get_manual_crawl_replay_json_admin(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/manual-archives/{manual_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == manual_crawl_id
    assert data["type"] == "manual"
    assert data["name"] == MANUAL_CRAWL_NAME
    assert data["notes"] == MANUAL_CRAWL_NOTES
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert "files" not in data
    assert "errors" not in data or data.get("errors") is None


def test_list_manual_crawls(crawler_auth_headers, default_org_id, manual_browser_2_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives",
        headers=crawler_auth_headers,
        json={
            "browserid": manual_browser_2_id,
            "name": MANUAL_CRAWL_2_NAME,
            "notes": MANUAL_CRAWL_2_NOTES,
            # TODO: Add WACZ filename base?
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    global manual_crawl_2_id
    manual_crawl_2_id = r.json()["id"]
    assert manual_crawl_2_id

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()

    assert data["total"] == 2
    assert data["page"] == 1
    assert data["pageSize"] == 1_000

    items = data["items"]
    assert len(items) == 2

    latest_crawl = items[0]
    assert latest_crawl["id"] == manual_crawl_2_id
    assert latest_crawl["name"] == MANUAL_CRAWL_2_NAME
    assert latest_crawl["notes"] == MANUAL_CRAWL_2_NOTES
    finished = latest_crawl["finished"]
    assert finished
    assert "files" not in latest_crawl
    assert "resources" not in latest_crawl

    older_crawl = items[1]
    assert older_crawl["id"] == manual_crawl_id
    assert latest_crawl["name"] == MANUAL_CRAWL_NAME
    assert latest_crawl["notes"] == MANUAL_CRAWL_NOTES
    assert older_crawl["finished"] <= finished
    assert "files" not in older_crawl
    assert "resources" not in older_crawl


def test_delete_manual_crawl_2(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/all/manual-archives/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [manual_crawl_2_id]},
    )
    assert r.status_code == 200
    assert r.json()["deleted"]

    # Verify it was deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/manual-archives/{manual_crawl_2_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 404


def test_get_manual_crawl_from_all_crawls(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{manual_crawl_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == manual_crawl_id
    assert data["name"] == MANUAL_CRAWL_NAME
    assert data["notes"] == MANUAL_CRAWL_NOTES

    assert "files" not in data or data.get("files") == []
    assert data["resources"]


def test_get_manual_crawl_replay_json_from_all_crawls(
    crawler_auth_headers, default_org_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls/{manual_crawl_id}/replay.json",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == manual_crawl_id
    assert data["name"] == MANUAL_CRAWL_NAME
    assert data["notes"] == MANUAL_CRAWL_NOTES
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert "files" not in data or data.get("files") == []
    assert "errors" not in data or data.get("errors") is None


def test_get_manual_crawl_replay_json_admin_from_all_crawls(
    admin_auth_headers, default_org_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/all/all-crawls/{manual_crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data
    assert data["id"] == upload_id_2
    assert data["name"] == MANUAL_CRAWL_NAME
    assert data["notes"] == MANUAL_CRAWL_NOTES
    assert data["resources"]
    assert data["resources"][0]["path"]
    assert data["resources"][0]["size"]
    assert data["resources"][0]["hash"]
    assert "files" not in data or data.get("files") == []
    assert "errors" not in data or data.get("errors") is None
