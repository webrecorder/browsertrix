import time
from typing import Dict
from uuid import UUID

import requests
import pytest

from .conftest import API_PREFIX, FINISHED_STATES


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
            pass
        attempts += 1


@pytest.fixture(scope="module")
def profile_id(admin_auth_headers, default_org_id, profile_browser_id):
    prepare_browser_for_profile_commit(
        profile_browser_id, admin_auth_headers, default_org_id
    )

    # Create profile
    start_time = time.monotonic()
    time_limit = 300
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


@pytest.fixture(scope="module")
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
    assert data["created"]
    assert data["modified"]
    assert not data["baseid"]

    resource = data["resource"]
    assert resource
    assert resource["filename"]
    assert resource["hash"]
    assert resource["size"]
    assert resource["storage"]
    assert resource["storage"]["name"]
    assert resource.get("replicas") or resource.get("replicas") == []

    assert data.get("crawlconfigs") == []

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


@pytest.fixture(scope="module")
def profile_2_id(admin_auth_headers, default_org_id, profile_browser_2_id):
    prepare_browser_for_profile_commit(
        profile_browser_2_id, admin_auth_headers, default_org_id
    )

    # Create profile
    start_time = time.monotonic()
    time_limit = 300
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


def test_commit_browser_to_new_profile(admin_auth_headers, default_org_id, profile_id):
    assert profile_id


def test_get_profile(admin_auth_headers, default_org_id, profile_id, profile_config_id):
    start_time = time.monotonic()
    time_limit = 10
    # Check get endpoint again and check that crawlconfigs is updated
    while True:
        try:
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
            assert data["created"]
            assert data["modified"]
            assert not data["baseid"]

            resource = data["resource"]
            assert resource
            assert resource["filename"]
            assert resource["hash"]
            assert resource["size"]
            assert resource["storage"]
            assert resource["storage"]["name"]
            assert resource.get("replicas") or resource.get("replicas") == []

            crawl_configs = data.get("crawlconfigs")
            assert crawl_configs
            assert len(crawl_configs) == 1
            assert crawl_configs[0]["id"] == profile_config_id
            assert crawl_configs[0]["name"] == "Profile Test Crawl"
            break
        except:
            if time.monotonic() - start_time > time_limit:
                raise
            time.sleep(1)


def test_commit_second_profile(profile_2_id):
    assert profile_2_id


def test_list_profiles(admin_auth_headers, default_org_id, profile_id, profile_2_id):
    start_time = time.monotonic()
    time_limit = 10
    # Check get endpoint again and check that crawlconfigs is updated
    while True:
        try:
            r = requests.get(
                f"{API_PREFIX}/orgs/{default_org_id}/profiles",
                headers=admin_auth_headers,
            )
            assert r.status_code == 200
            data = r.json()
            assert data["total"] == 2

            profiles = data["items"]
            assert len(profiles) == 2

            profile_1 = [
                profile for profile in profiles if profile["id"] == profile_id
            ][0]
            assert profile_1["id"] == profile_id
            assert profile_1["name"] == PROFILE_NAME
            assert profile_1["description"] == PROFILE_DESC
            assert profile_1["userid"]
            assert profile_1["oid"] == default_org_id
            assert profile_1.get("origins") or data.get("origins") == []
            assert profile_1["created"]
            assert profile_1["modified"]
            assert not profile_1["baseid"]
            resource = profile_1["resource"]
            assert resource
            assert resource["filename"]
            assert resource["hash"]
            assert resource["size"]
            assert resource["storage"]
            assert resource["storage"]["name"]
            assert resource.get("replicas") or resource.get("replicas") == []

            profile_2 = [
                profile for profile in profiles if profile["id"] == profile_2_id
            ][0]
            assert profile_2["id"] == profile_2_id
            assert profile_2["name"] == PROFILE_2_NAME
            assert profile_2["description"] == PROFILE_2_DESC
            assert profile_2["userid"]
            assert profile_2["oid"] == default_org_id
            assert profile_2.get("origins") or data.get("origins") == []
            assert profile_2["created"]
            assert profile_2["modified"]
            assert not profile_2["baseid"]
            resource = profile_2["resource"]
            assert resource
            assert resource["filename"]
            assert resource["hash"]
            assert resource["size"]
            assert resource["storage"]
            assert resource["storage"]["name"]
            assert resource.get("replicas") or resource.get("replicas") == []
            break
        except:
            if time.monotonic() - start_time > time_limit:
                raise
            time.sleep(1)


def test_delete_profile(admin_auth_headers, default_org_id, profile_2_id):
    # Delete second profile
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_2_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Verify profile has been deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_2_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "profile_not_found"

    # Try to delete it again and verify we get a 404
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_2_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "profile_not_found"


def test_update_profile_metadata(admin_auth_headers, default_org_id, profile_id):
    # Get original created/modified times
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.jsoN()
    original_created = data["created"]
    original_modified = data["modified"]

    # Update name and description
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
        json={
            "name": PROFILE_NAME_UPDATED,
            "description": PROFILE_DESC_UPDATED,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    time.sleep(5)

    # Verify update
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == profile_id
    assert data["name"] == PROFILE_NAME_UPDATED
    assert data["description"] == PROFILE_DESC_UPDATED

    # Ensure modified was updated but created was not
    assert data["modified"] > original_modified
    assert data["created"] == original_created


def test_commit_browser_to_existing_profile(
    admin_auth_headers, default_org_id, profile_browser_3_id, profile_id
):
    # Get original modified time
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    original_created = data["created"]
    original_modified = data["modified"]

    prepare_browser_for_profile_commit(
        profile_browser_3_id, admin_auth_headers, default_org_id
    )

    # Commit new browser to existing profile
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
        json={
            "browserid": profile_browser_3_id,
            "name": PROFILE_NAME_UPDATED,
            "description": PROFILE_DESC_UPDATED,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Ensure modified was updated but created was not
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["modified"] > original_modified
    assert data["created"] == original_created
