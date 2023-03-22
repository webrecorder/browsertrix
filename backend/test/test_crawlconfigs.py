import requests
import urllib.parse

import pytest

from .conftest import API_PREFIX


cid = None
UPDATED_NAME = "Updated name"
UPDATED_TAGS = ["tag3", "tag4"]


def test_add_crawl_config(crawler_auth_headers, default_org_id, sample_crawl_data):
    # Create crawl config
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200

    data = r.json()
    global cid
    cid = data["added"]


def test_update_name_only(crawler_auth_headers, default_org_id):
    # update name only
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"name": "updated name 1"},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["success"]
    assert data["metadata_changed"] == True
    assert data["settings_changed"] == False


def test_update_crawl_config_name_and_tags(crawler_auth_headers, default_org_id):
    # Update crawl config
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"name": UPDATED_NAME, "tags": UPDATED_TAGS},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["success"]
    assert data["metadata_changed"] == True
    assert data["settings_changed"] == False


def test_verify_update(crawler_auth_headers, default_org_id):
    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["name"] == UPDATED_NAME
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)


def test_update_config_data(crawler_auth_headers, default_org_id, sample_crawl_data):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "seeds": [{"url": "https://example.com/"}],
                "scopeType": "domain",
            }
        },
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()

    assert data["config"]["scopeType"] == "domain"


def test_update_config_no_changes(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "seeds": [{"url": "https://example.com/"}],
                "scopeType": "domain",
            }
        },
    )
    assert r.status_code == 200

    data = r.json()
    assert data["settings_changed"] == False
    assert data["metadata_changed"] == False


def test_update_crawl_timeout(crawler_auth_headers, default_org_id, sample_crawl_data):
    # Verify that updating crawl timeout works
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"crawlTimeout": 60},
    )
    assert r.status_code == 200
    data = r.json()

    assert data["settings_changed"] == True
    assert data["metadata_changed"] == False

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()

    assert data["crawlTimeout"] == 60


def test_verify_delete_tags(crawler_auth_headers, default_org_id):
    # Verify that deleting tags and name works as well
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"tags": [], "name": None},
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert not data["name"]
    assert data["tags"] == []


def test_verify_revs_history(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/revs",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["total"] == 2
    items = data["items"]
    assert len(items) == 2
    sorted_data = sorted(items, key=lambda revision: revision["rev"])
    assert sorted_data[0]["config"]["scopeType"] == "prefix"


@pytest.mark.parametrize(
    "search_query, expected_result_count",
    [
        # Search by first seed url
        ("webrecorder.net", 3),
        ("https://webrecorder.net/", 3),
        ("specs.webrecorder.net", 1),
        ("http://specs.webrecorder.net/", 1),
        ("example.com", 1),
        ("notinfixtures.com", 0),
        # Search by name
        ("Test Crawl", 2),
        ("Webrecorder Specs sample crawl", 1),
        ("invalid", 0),
    ],
)
def test_search_crawl_configs(
    search_query,
    expected_result_count,
    crawler_auth_headers,
    default_org_id,
    admin_crawl_id,
    crawler_crawl_id,
    wr_specs_crawl_id,
):
    encoded_search_query = urllib.parse.quote(search_query)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/search?search={encoded_search_query}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == expected_result_count
    items = data["items"]
    assert len(items) == expected_result_count
    for item in items:
        assert (search_query in item.get("name", "")) or (
            search_query in item["firstSeed"]
        )
