import os
import pytest
import requests
import subprocess
import time
from typing import Dict
from uuid import UUID

from .utils import read_in_chunks


HOST_PREFIX = "http://127.0.0.1:30870"
API_PREFIX = HOST_PREFIX + "/api"

ADMIN_USERNAME = "admin@example.com"
ADMIN_PW = "PASSW0RD!"

VIEWER_USERNAME = "viewer@example.com"
VIEWER_PW = "viewerPASSW0RD!"

CRAWLER_USERNAME = "CraWleR@example.com"
CRAWLER_USERNAME_LOWERCASE = "crawler@example.com"
CRAWLER_PW = "crawlerPASSWORD!"

_admin_config_id = None
_crawler_config_id = None
_auto_add_config_id = None
_all_crawls_config_id = None
_all_crawls_delete_config_id = None

NON_DEFAULT_ORG_NAME = "Non-default org"
NON_DEFAULT_ORG_SLUG = "non-default-org"

FAILED_STATES = ["canceled", "failed", "skipped_quota_reached"]

SUCCESSFUL_STATES = ["complete", "stopped_by_user", "stopped_quota_reached"]

FINISHED_STATES = [*FAILED_STATES, *SUCCESSFUL_STATES]


curr_dir = os.path.abspath(os.path.dirname(os.path.realpath(__file__)))


@pytest.fixture(scope="session")
def admin_auth_headers():
    while True:
        r = requests.post(
            f"{API_PREFIX}/auth/jwt/login",
            data={
                "username": ADMIN_USERNAME,
                "password": ADMIN_PW,
                "grant_type": "password",
            },
        )
        data = r.json()
        try:
            return {"Authorization": f"Bearer {data['access_token']}"}
        except:
            print("Waiting for admin_auth_headers")
            time.sleep(5)


@pytest.fixture(scope="session")
def default_org_id(admin_auth_headers):
    while True:
        r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
        data = r.json()
        try:
            for org in data["items"]:
                if org["default"] is True:
                    return org["id"]
        except:
            print("Waiting for default org id")
            time.sleep(5)


@pytest.fixture(scope="session")
def non_default_org_id(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": NON_DEFAULT_ORG_NAME, "slug": NON_DEFAULT_ORG_SLUG},
    )
    assert r.status_code == 200

    while True:
        r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
        data = r.json()
        try:
            for org in data["items"]:
                if org["name"] == NON_DEFAULT_ORG_NAME:
                    return org["id"]
        except:
            print("Waiting for non-default org id")
            time.sleep(5)


@pytest.fixture(scope="session")
def admin_crawl_id(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Admin Test Crawl",
        "description": "Admin Test Crawl description",
        "tags": ["wr-test-1", "wr-test-2"],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/", "depth": 1}],
            "exclude": "community",
            # limit now set via 'max_pages_per_crawl' global limit
            # "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _admin_config_id
    _admin_config_id = data["id"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def admin_config_id(admin_crawl_id):
    return _admin_config_id


@pytest.fixture(scope="session")
def admin_userid(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/users/me", headers=admin_auth_headers)
    return r.json()["id"]


@pytest.fixture(scope="session")
def viewer_auth_headers(admin_auth_headers, default_org_id):
    requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": VIEWER_USERNAME,
            "password": VIEWER_PW,
            "name": "newviewer",
            "role": 10,
        },
        headers=admin_auth_headers,
    )
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VIEWER_USERNAME,
            "password": VIEWER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def crawler_auth_headers(admin_auth_headers, default_org_id):
    requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "name": "new-crawler",
            "role": 20,
        },
        headers=admin_auth_headers,
    )
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def crawler_userid(crawler_auth_headers):
    r = requests.get(f"{API_PREFIX}/users/me", headers=crawler_auth_headers)
    return r.json()["id"]


@pytest.fixture(scope="session")
def _crawler_create_config_only(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": False,
        "name": "Crawler User Test Crawl",
        "description": "crawler test crawl",
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "pageExtraDelay": 10,
            "limit": 3,
            "exclude": "community",
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _crawler_config_id
    _crawler_config_id = data["id"]


@pytest.fixture(scope="session")
def crawler_crawl_id(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Crawler User Test Crawl",
        "description": "crawler test crawl",
        "tags": ["wr-test-2"],
        "config": {"seeds": [{"url": "https://webrecorder.net/"}], "limit": 3},
        "crawlerChannel": "test",
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _crawler_config_id
    _crawler_config_id = data["id"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def qa_crawl_id(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Crawler User Crawl for Testing QA",
        "description": "crawler test crawl for qa",
        "config": {"seeds": [{"url": "https://old.webrecorder.net/"}], "limit": 1},
        "crawlerChannel": "test",
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def wr_specs_crawl_id(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Webrecorder Specs sample crawl",
        "config": {"seeds": [{"url": "https://specs.webrecorder.net/"}], "limit": 1},
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def crawler_config_id(crawler_crawl_id):
    return _crawler_config_id


@pytest.fixture(scope="session")
def crawler_config_id_only(_crawler_create_config_only):
    return _crawler_config_id


@pytest.fixture(scope="function")
def sample_crawl_data():
    return {
        "runNow": False,
        "name": "Test Crawl",
        "config": {"seeds": [{"url": "https://example.com/"}], "extraHops": 1},
        "tags": ["tag1", "tag2"],
    }


@pytest.fixture(scope="session")
def auto_add_collection_id(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={"name": "Auto Add Collection"},
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="session")
def auto_add_crawl_id(crawler_auth_headers, default_org_id, auto_add_collection_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Auto Add",
        "description": "For testing auto-adding new workflow crawls to collections",
        "autoAddCollections": [auto_add_collection_id],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _auto_add_config_id
    _auto_add_config_id = data["id"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def auto_add_config_id(auto_add_crawl_id):
    return _auto_add_config_id


@pytest.fixture(scope="session")
def all_crawls_crawl_id(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "All Crawls Test Crawl",
        "description": "Lorem ipsum",
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "exclude": "community",
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _all_crawls_config_id
    _all_crawls_config_id = data["id"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(5)

    # Add description to crawl
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}",
        headers=crawler_auth_headers,
        json={"description": "Lorem ipsum"},
    )
    assert r.status_code == 200
    return crawl_id


@pytest.fixture(scope="session")
def all_crawls_config_id(all_crawls_crawl_id):
    return _all_crawls_config_id


@pytest.fixture(scope="session")
def uploads_collection_id(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={"name": "Upload test collection"},
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="session")
def all_crawls_delete_crawl_ids(admin_auth_headers, default_org_id):
    crawl_data = {
        "runNow": True,
        "name": "All Crawls Delete Test Workflow",
        "description": "Lorem ipsum",
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "exclude": "community",
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _all_crawls_delete_config_id
    _all_crawls_delete_config_id = data["id"]

    return_crawl_ids = []

    crawl_id = data["run_now_job"]
    return_crawl_ids.append(crawl_id)

    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(5)

    # Run workflow again and wait for second crawl to complete
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_all_crawls_delete_config_id}/run",
        headers=admin_auth_headers,
    )
    crawl_2_id = r.json()["started"]
    return_crawl_ids.append(crawl_2_id)

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_2_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(5)

    return return_crawl_ids


@pytest.fixture(scope="session")
def all_crawls_delete_config_id(admin_crawl_id):
    return _all_crawls_delete_config_id


@pytest.fixture(scope="session")
def custom_behaviors_crawl_id(admin_auth_headers, default_org_id):
    crawl_data = {
        "runNow": True,
        "name": "Custom Behavior Logs",
        "config": {
            "seeds": [{"url": "https://specs.webrecorder.net/"}],
            "customBehaviors": [
                "https://raw.githubusercontent.com/webrecorder/browsertrix-crawler/refs/heads/main/tests/custom-behaviors/custom.js"
            ],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]

    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(5)

    return crawl_id


@pytest.fixture(scope="session")
def url_list_config_id(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": False,
        "name": "URL List config",
        "description": "Contains 3 seeds",
        "config": {
            "seeds": [
                {"url": "https://webrecorder.net"},
                {"url": "https://example.com"},
                {"url": "https://specs.webrecorder.net"},
            ],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    return r.json()["id"]


@pytest.fixture(scope="session")
def profile_browser_id(admin_auth_headers, default_org_id):
    return _create_profile_browser(admin_auth_headers, default_org_id)


@pytest.fixture(scope="session")
def profile_browser_2_id(admin_auth_headers, default_org_id):
    return _create_profile_browser(
        admin_auth_headers, default_org_id, "https://specs.webrecorder.net"
    )


@pytest.fixture(scope="session")
def profile_browser_3_id(admin_auth_headers, default_org_id):
    return _create_profile_browser(admin_auth_headers, default_org_id)


@pytest.fixture(scope="session")
def profile_browser_4_id(admin_auth_headers, default_org_id):
    return _create_profile_browser(admin_auth_headers, default_org_id)


def _create_profile_browser(
    headers: Dict[str, str], oid: UUID, url: str = "https://webrecorder.net"
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser",
        headers=headers,
        json={"url": url},
    )
    assert r.status_code == 200
    browser_id = r.json()["browserid"]

    time.sleep(5)

    # Wait until successful ping, then return profile browser id
    while True:
        r = requests.post(
            f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/ping",
            headers=headers,
        )
        data = r.json()
        if data.get("success"):
            return browser_id
        time.sleep(5)


@pytest.fixture(scope="function")
def echo_server():
    print(f"Echo server starting", flush=True)
    p = subprocess.Popen(["python3", os.path.join(curr_dir, "echo_server.py")])
    print(f"Echo server started", flush=True)
    time.sleep(1)
    yield p
    time.sleep(10)
    print(f"Echo server terminating", flush=True)
    p.terminate()
    print(f"Echo server terminated", flush=True)


PROFILE_NAME = "Test profile"
PROFILE_DESC = "Profile used for backend tests"

PROFILE_NAME_UPDATED = "Updated test profile"
PROFILE_DESC_UPDATED = "Updated profile used for backend tests"

PROFILE_2_NAME = "Second test profile"
PROFILE_2_DESC = "Second profile used to test list endpoint"


def prepare_browser_for_profile_commit(
    browser_id: str, headers: Dict[str, str], oid: UUID
) -> None:
    # Ping to make sure it doesn't expire
    r = requests.post(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/ping",
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("success")
    assert data.get("origins") or data.get("origins") == []

    # Verify browser seems good
    r = requests.get(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}",
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["url"]
    assert data["path"]
    assert data["password"]
    assert data["auth_bearer"]
    assert data["scale"]
    assert data["oid"] == oid

    # Navigate to new URL
    r = requests.post(
        f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/navigate",
        headers=headers,
        json={"url": "https://webrecorder.net/tools"},
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Ping browser until ready
    max_attempts = 20
    attempts = 1
    while attempts <= max_attempts:
        try:
            r = requests.post(
                f"{API_PREFIX}/orgs/{oid}/profiles/browser/{browser_id}/ping",
                headers=headers,
            )
            data = r.json()
            if data["success"]:
                break
            time.sleep(5)
        except:
            time.sleep(5)
        attempts += 1


@pytest.fixture(scope="session")
def profile_id(admin_auth_headers, default_org_id, profile_browser_id):
    prepare_browser_for_profile_commit(
        profile_browser_id, admin_auth_headers, default_org_id
    )

    # Create profile
    start_time = time.monotonic()
    time_limit = 30
    while True:
        try:
            r = requests.post(
                f"{API_PREFIX}/orgs/{default_org_id}/profiles",
                headers=admin_auth_headers,
                json={
                    "browserid": profile_browser_id,
                    "name": PROFILE_NAME,
                    "description": PROFILE_DESC,
                },
                timeout=10,
            )
            assert r.status_code == 200
            data = r.json()
            if data.get("detail") and data.get("detail") == "waiting_for_browser":
                time.sleep(5)
                continue
            if data.get("added"):
                assert data["storageQuotaReached"] in (True, False)
                return data["id"]
        except:
            if time.monotonic() - start_time > time_limit:
                raise
            time.sleep(5)


@pytest.fixture(scope="session")
def profile_config_id(admin_auth_headers, default_org_id, profile_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == profile_id
    assert data["name"] == PROFILE_NAME
    assert data["description"] == PROFILE_DESC
    assert data["userid"]
    assert data["oid"] == default_org_id
    assert data.get("origins") or data.get("origins") == []
    assert data["createdBy"]
    assert data["createdByName"] == "admin"
    assert data["modifiedBy"]
    assert data["modifiedByName"] == "admin"
    assert not data["baseid"]

    created = data["created"]
    assert created
    assert created.endswith("Z")

    modified = data["modified"]
    assert modified
    assert modified.endswith("Z")

    resource = data["resource"]
    assert resource
    assert resource["filename"]
    assert resource["hash"]
    assert resource["size"]
    assert resource["storage"]
    assert resource["storage"]["name"]
    assert resource.get("replicas") or resource.get("replicas") == []

    # Use profile in a workflow
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json={
            "runNow": False,
            "name": "Profile Test Crawl",
            "description": "Crawl using browser profile",
            "config": {
                "seeds": [{"url": "https://webrecorder.net/"}],
                "exclude": "community",
            },
            "profileid": profile_id,
        },
    )
    data = r.json()
    return data["id"]


@pytest.fixture(scope="session")
def profile_2_id(admin_auth_headers, default_org_id, profile_browser_2_id):
    prepare_browser_for_profile_commit(
        profile_browser_2_id, admin_auth_headers, default_org_id
    )

    # Create profile
    start_time = time.monotonic()
    time_limit = 30
    while True:
        try:
            r = requests.post(
                f"{API_PREFIX}/orgs/{default_org_id}/profiles",
                headers=admin_auth_headers,
                json={
                    "browserid": profile_browser_2_id,
                    "name": PROFILE_2_NAME,
                    "description": PROFILE_2_DESC,
                },
                timeout=10,
            )
            assert r.status_code == 200
            data = r.json()
            if data.get("detail") and data.get("detail") == "waiting_for_browser":
                time.sleep(5)
            if data.get("added"):
                assert data["storageQuotaReached"] in (True, False)

                return data["id"]
        except:
            if time.monotonic() - start_time > time_limit:
                raise
            time.sleep(5)


@pytest.fixture(scope="session")
def seed_file_id(crawler_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=seedfile.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 200
        return r.json()["id"]


@pytest.fixture(scope="session")
def seed_file_config_id(crawler_auth_headers, default_org_id, seed_file_id):
    crawl_data = {
        "runNow": False,
        "name": "Seed File Test Crawl",
        "config": {
            "scopeType": "page",
            "seedFileId": seed_file_id,
            "limit": 2,
        },
        "crawlerChannel": "test",
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    return r.json()["id"]
