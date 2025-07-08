import requests
import pytest

from .conftest import API_PREFIX
from .test_profiles import profile_id, profile_2_id

new_cid_1 = None
new_cid_2 = None
new_cid_3 = None


def get_sample_crawl_data(profile_id=None):
    data = {
        "runNow": False,
        "name": "Test Crawl",
        "config": {"seeds": [{"url": "https://example.com/"}]},
    }
    if profile_id:
        data["profileid"] = profile_id
    return data


def test_create_new_config_with_profile_1(admin_auth_headers, default_org_id, profile_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(profile_id),
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"] == None

    global new_cid_1
    new_cid_1 = data["id"]


def test_create_new_config_with_profile_2(admin_auth_headers, default_org_id, profile_2_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(profile_2_id),
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"] == None

    global new_cid_2
    new_cid_2 = data["id"]


def test_filter_configs_by_single_profile_id(admin_auth_headers, default_org_id, profile_id):
    # Test filtering by a single profile ID
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        params={"profileId": profile_id},
    )
    assert r.status_code == 200
    data = r.json()

    # Should find at least one config with this profile ID
    assert data["total"] >= 1
    found_config = False
    for config in data["items"]:
        if config["id"] == new_cid_1:
            assert config["profileid"] == profile_id
            found_config = True
        # All returned configs should have the requested profile ID
        assert config["profileid"] == profile_id
    assert found_config


def test_filter_configs_by_multiple_profile_ids(admin_auth_headers, default_org_id, profile_id, profile_2_id):
    # Test filtering by multiple profile IDs with OR logic (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        params={"profileId": [profile_id, profile_2_id]},
    )
    assert r.status_code == 200
    data = r.json()

    # Should find configs with either profile ID
    assert data["total"] >= 2
    found_configs = {"config1": False, "config2": False}
    for config in data["items"]:
        if config["id"] == new_cid_1:
            assert config["profileid"] == profile_id
            found_configs["config1"] = True
        elif config["id"] == new_cid_2:
            assert config["profileid"] == profile_2_id
            found_configs["config2"] = True
        # All returned configs should have one of the requested profile IDs
        assert config["profileid"] in [profile_id, profile_2_id]

    assert found_configs["config1"] and found_configs["config2"]


def test_filter_configs_by_nonexistent_profile_id(admin_auth_headers, default_org_id):
    # Test filtering by a profile ID that doesn't exist
    import uuid
    nonexistent_profile_id = str(uuid.uuid4())
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        params={"profileId": nonexistent_profile_id},
    )
    assert r.status_code == 200
    data = r.json()

    # Should find no configs with this profile ID
    assert data["total"] == 0
    assert data["items"] == []


def test_deprecated_profileid_param(admin_auth_headers, default_org_id, profile_id):
    # Test the deprecated profileid parameter still works
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        params={"profileid": profile_id},
    )
    assert r.status_code == 200
    data = r.json()

    # Should find at least one config with this profile ID
    assert data["total"] >= 1
    found_config = False
    for config in data["items"]:
        if config["id"] == new_cid_1:
            assert config["profileid"] == profile_id
            found_config = True
        # All returned configs should have the requested profile ID
        assert config["profileid"] == profile_id
    assert found_config
