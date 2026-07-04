import requests

from .conftest import API_PREFIX

NAME_1 = "Workflow 1"
NAME_2 = "Workflow 2"

DESCRIPTION_1 = "Description 1"
DESCRIPTION_2 = "Description 2"

FIRST_SEED_1 = "https://one.example.com"
FIRST_SEED_2 = "https://two.example.com"

FIRST_SEED_1_URL = FIRST_SEED_1 + "/"
FIRST_SEED_2_URL = FIRST_SEED_2 + "/"


def get_sample_crawl_data(name, description, first_seed):
    return {
        "runNow": False,
        "name": name,
        "config": {"seeds": [{"url": first_seed}]},
        "description": description,
    }


def test_create_new_config_1(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(NAME_1, DESCRIPTION_1, FIRST_SEED_1),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"] == None


def test_get_search_values_1(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/search-values",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert sorted(data["names"]) == sorted(
        [NAME_1, "Admin Test Crawl", "Canceled crawl", "crawler User Test Crawl"]
    )
    assert sorted(data["descriptions"]) == sorted(
        ["Admin Test Crawl description", "crawler test crawl", DESCRIPTION_1]
    )
    assert sorted(data["firstSeeds"]) == sorted(
        ["https://old.webrecorder.net/", FIRST_SEED_1_URL]
    )


def test_create_new_config_2(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(NAME_2, DESCRIPTION_2, FIRST_SEED_2),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"] == None


def test_get_search_values_2(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/search-values",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert sorted(data["names"]) == sorted(
        [
            NAME_1,
            NAME_2,
            "Admin Test Crawl",
            "Canceled crawl",
            "crawler User Test Crawl",
        ]
    )
    assert sorted(data["descriptions"]) == sorted(
        [
            "Admin Test Crawl description",
            "crawler test crawl",
            DESCRIPTION_1,
            DESCRIPTION_2,
        ]
    )
    assert sorted(data["firstSeeds"]) == sorted(
        ["https://old.webrecorder.net/", FIRST_SEED_1_URL, FIRST_SEED_2_URL]
    )


def test_create_new_config_3_duplicates(admin_auth_headers, default_org_id):
    """Add some duplicate values to ensure they aren't duplicated in response"""
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(NAME_1, DESCRIPTION_2, FIRST_SEED_1),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"] == None


def test_get_search_values_3(admin_auth_headers, default_org_id):
    """Test we still only get unique values"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/search-values",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert sorted(data["names"]) == sorted(
        [
            NAME_1,
            NAME_2,
            "Admin Test Crawl",
            "Canceled crawl",
            "crawler User Test Crawl",
        ]
    )
    assert sorted(data["descriptions"]) == sorted(
        [
            "Admin Test Crawl description",
            "crawler test crawl",
            DESCRIPTION_1,
            DESCRIPTION_2,
        ]
    )
    assert sorted(data["firstSeeds"]) == sorted(
        ["https://old.webrecorder.net/", FIRST_SEED_1_URL, FIRST_SEED_2_URL]
    )


def test_get_search_values_filter_profiles(
    admin_auth_headers, default_org_id, profile_id, profile_config_id
):
    """Test profile_ids filter"""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/search-values?profileIds={profile_id}",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data["names"] == ["Profile Test Crawl"]
    assert data["descriptions"] == ["Crawl using browser profile"]
    assert data["firstSeeds"] == ["https://old.webrecorder.net/"]
