import time
from typing import Dict
from uuid import UUID

import requests
import pytest

from .conftest import (
    API_PREFIX,
    PROFILE_NAME,
    PROFILE_DESC,
    PROFILE_NAME_UPDATED,
    PROFILE_DESC_UPDATED,
    PROFILE_2_NAME,
    PROFILE_2_DESC,
    prepare_browser_for_profile_commit,
)


def test_commit_browser_to_new_profile(admin_auth_headers, default_org_id, profile_id):
    assert profile_id


def test_get_profile(admin_auth_headers, default_org_id, profile_id, profile_config_id):
    start_time = time.monotonic()
    time_limit = 10
    # Check get endpoint again and check that inUse is updated
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
            assert data["createdBy"]
            assert data["createdByName"] == "admin"
            assert data["modified"]
            assert data["modifiedBy"]
            assert data["modifiedByName"] == "admin"
            assert not data["baseid"]

            resource = data["resource"]
            assert resource
            assert resource["filename"]
            assert resource["hash"]
            assert resource["size"]
            assert resource["storage"]
            assert resource["storage"]["name"]
            assert resource.get("replicas") or resource.get("replicas") == []

            assert "crawlconfigs" not in data
            assert data["inUse"] == True
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

            # Second profile should be listed first by default because it was
            # modified more recently
            profile_2 = profiles[0]
            assert profile_2["id"] == profile_2_id
            assert profile_2["name"] == PROFILE_2_NAME
            assert profile_2["description"] == PROFILE_2_DESC
            assert profile_2["userid"]
            assert profile_2["oid"] == default_org_id
            assert profile_2.get("origins") or data.get("origins") == []
            assert profile_2["created"]
            assert profile_2["createdBy"]
            assert profile_2["createdByName"] == "admin"
            assert profile_2["modified"]
            assert profile_2["modifiedBy"]
            assert profile_2["modifiedByName"] == "admin"
            assert not profile_2["baseid"]
            resource = profile_2["resource"]
            assert resource
            assert resource["filename"]
            assert resource["hash"]
            assert resource["size"]
            assert resource["storage"]
            assert resource["storage"]["name"]
            assert resource.get("replicas") or resource.get("replicas") == []

            # First profile should be listed second by default because it was
            # modified less recently
            profile_1 = profiles[1]
            assert profile_1["id"] == profile_id
            assert profile_1["name"] == PROFILE_NAME
            assert profile_1["description"] == PROFILE_DESC
            assert profile_1["userid"]
            assert profile_1["oid"] == default_org_id
            assert profile_1.get("origins") or data.get("origins") == []
            assert profile_1["created"]
            assert profile_1["createdBy"]
            assert profile_1["createdByName"] == "admin"
            assert profile_1["modified"]
            assert profile_1["modifiedBy"]
            assert profile_1["modifiedByName"] == "admin"
            assert not profile_1["baseid"]
            resource = profile_1["resource"]
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


def test_update_profile_metadata(crawler_auth_headers, default_org_id, profile_id):
    # Get original created/modified times
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    original_created = data["created"]
    original_modified = data["modified"]

    # Update name and description
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=crawler_auth_headers,
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
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == profile_id
    assert data["name"] == PROFILE_NAME_UPDATED
    assert data["description"] == PROFILE_DESC_UPDATED

    # Ensure modified was updated but created was not
    assert data["modified"] > original_modified
    assert data["modifiedBy"]
    assert data["modifiedByName"] == "new-crawler"

    assert data["created"] == original_created
    assert data["createdBy"]
    assert data["createdByName"] == "admin"


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
    while True:
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
        if r.json().get("detail") == "waiting_for_browser":
            time.sleep(5)
            continue

        break

    assert r.json()["updated"]
    # Ensure modified was updated but created was not
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/profiles/{profile_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["modified"] > original_modified
    assert data["modifiedBy"]
    assert data["modifiedByName"] == "admin"

    assert data["created"] == original_created
    assert data["createdBy"]
    assert data["createdByName"] == "admin"


@pytest.mark.parametrize(
    "sort_by,sort_direction,profile_1_index,profile_2_index",
    [
        # Modified, descending
        ("modified", -1, 0, 1),
        # Modified, ascending
        ("modified", 1, 1, 0),
        # Created, descending
        ("created", -1, 1, 0),
        # Created, ascending
        ("created", 1, 0, 1),
        # Name, descending
        ("name", -1, 0, 1),
        # Name, ascending
        ("name", 1, 1, 0),
        # URL, descending
        ("url", -1, 1, 0),
        # URL, ascending
        ("url", 1, 0, 1),
    ],
)
def test_sort_profiles(
    admin_auth_headers,
    default_org_id,
    profile_id,
    profile_2_id,
    sort_by,
    sort_direction,
    profile_1_index,
    profile_2_index,
):
    start_time = time.monotonic()
    time_limit = 10
    while True:
        try:
            r = requests.get(
                f"{API_PREFIX}/orgs/{default_org_id}/profiles?sortBy={sort_by}&sortDirection={sort_direction}",
                headers=admin_auth_headers,
            )
            assert r.status_code == 200
            data = r.json()
            assert data["total"] == 2

            profiles = data["items"]
            assert len(profiles) == 2

            profile_1 = profiles[profile_1_index]
            assert profile_1["id"] == profile_id
            assert profile_1["name"] == PROFILE_NAME_UPDATED

            profile_2 = profiles[profile_2_index]
            assert profile_2["id"] == profile_2_id
            assert profile_2["name"] == PROFILE_2_NAME

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


def test_create_profile_read_only_org(
    admin_auth_headers, default_org_id, profile_browser_4_id
):
    # Set org to read-only
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/read-only",
        headers=admin_auth_headers,
        json={"readOnly": True, "readOnlyReason": "For testing purposes"},
    )
    assert r.json()["updated"]

    prepare_browser_for_profile_commit(
        profile_browser_4_id, admin_auth_headers, default_org_id
    )

    # Try to create profile, verify we get 403 forbidden
    start_time = time.monotonic()
    time_limit = 30
    while True:
        try:
            r = requests.post(
                f"{API_PREFIX}/orgs/{default_org_id}/profiles",
                headers=admin_auth_headers,
                json={
                    "browserid": profile_browser_4_id,
                    "name": "uncreatable",
                    "description": "because org is read-only",
                },
                timeout=10,
            )
            detail = r.json().get("detail")
            if detail == "waiting_for_browser":
                time.sleep(5)
                continue
            assert detail == "org_set_to_read_only"
            assert r.status_code == 403
            break
        except:
            if time.monotonic() - start_time > time_limit:
                raise
            time.sleep(5)

    # Set readOnly back to false on org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/read-only",
        headers=admin_auth_headers,
        json={"readOnly": False},
    )
    assert r.json()["updated"]
