import time

import requests

from .conftest import API_PREFIX


cid = None
UPDATED_NAME = "Updated name"
UPDATED_DESCRIPTION = "Updated description"
UPDATED_TAGS = ["tag3", "tag4"]

INVALID_BEHAVIOR_URL = "https://webrecorder.net/nonexistent/behavior.js"

_coll_id = None
_admin_crawl_cid = None


def test_crawl_config_usernames(
    crawler_auth_headers, default_org_id, crawler_config_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawler_config_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["createdByName"]
    assert data["modifiedByName"]
    assert data["lastStartedByName"]

    created = data["created"]
    assert created
    assert created.endswith("Z")

    modified = data["modified"]
    assert modified
    assert modified.endswith("Z")


def test_add_crawl_config(crawler_auth_headers, default_org_id, sample_crawl_data):
    # Create crawl config
    sample_crawl_data["schedule"] = "0 0 * * *"
    sample_crawl_data["profileid"] = ""
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200

    data = r.json()
    global cid
    cid = data["id"]


def test_update_name_only(crawler_auth_headers, default_org_id):
    # update name only
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"name": "updated name 1"},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["updated"]
    assert data["metadata_changed"] == True
    assert data["settings_changed"] == False


def test_update_desription_only(crawler_auth_headers, default_org_id):
    # update description only
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"description": "updated description"},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["updated"]
    assert data["metadata_changed"] == True
    assert data["settings_changed"] == False


def test_update_crawl_config_metadata(crawler_auth_headers, default_org_id):
    # Make a new collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={
            "crawlIds": [],
            "name": "autoAddUpdate",
        },
    )
    assert r.status_code == 200
    data = r.json()

    global _coll_id
    _coll_id = data["id"]
    assert _coll_id

    # Update crawl config
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "name": UPDATED_NAME,
            "description": UPDATED_DESCRIPTION,
            "tags": UPDATED_TAGS,
            "autoAddCollections": [_coll_id],
        },
    )
    assert r.status_code == 200

    data = r.json()
    assert data["updated"]
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
    assert data["description"] == UPDATED_DESCRIPTION
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)
    assert data["autoAddCollections"] == [_coll_id]
    assert data["firstSeed"] == "https://example.com/"


def test_update_config_invalid_format(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "seeds": ["https://example.com/"],
                "scopeType": "domain",
                "limit": 10,
            }
        },
    )

    assert r.status_code == 422


def test_update_config_invalid_exclude_regex(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"config": {"exclude": "["}},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_regex"

    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"config": {"exclude": ["abc.*", "["]}},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_regex"


def test_verify_default_select_links(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["config"]["selectLinks"] == ["a[href]->href"]


def test_update_config_data(crawler_auth_headers, default_org_id, sample_crawl_data):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "seeds": [{"url": "https://example.com/"}],
                "scopeType": "domain",
                "selectLinks": ["a[href]->href", "script[src]->src"],
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
    assert data["config"]["selectLinks"] == ["a[href]->href", "script[src]->src"]


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
                "selectLinks": ["a[href]->href", "script[src]->src"],
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


def test_update_max_crawl_size(crawler_auth_headers, default_org_id, sample_crawl_data):
    # Verify that updating crawl timeout works
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"maxCrawlSize": 4096},
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

    assert data["maxCrawlSize"] == 4096


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
    assert data["total"] == 3
    items = data["items"]
    assert len(items) == 3
    sorted_data = sorted(items, key=lambda revision: revision["rev"])
    assert sorted_data[0]["config"]["scopeType"] == "prefix"


def test_workflow_total_size_and_last_crawl_stats(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    items = data["items"]
    for workflow in items:
        assert workflow.get("config") is None
        assert workflow["seedCount"]
        assert workflow["firstSeed"]

        last_crawl_id = workflow.get("lastCrawlId")
        if last_crawl_id and last_crawl_id in (admin_crawl_id, crawler_crawl_id):
            assert workflow["totalSize"] > 0
            assert workflow["crawlCount"] > 0
            assert workflow["crawlSuccessfulCount"] > 0

            assert workflow["lastCrawlId"]
            assert workflow["lastCrawlStartTime"]
            assert workflow["lastStartedByName"]
            assert workflow["lastCrawlTime"]
            assert workflow["lastCrawlState"]
            assert workflow["lastRun"]
            assert workflow["lastCrawlSize"] > 0

            if last_crawl_id == admin_crawl_id:
                global _admin_crawl_cid
                _admin_crawl_cid = workflow["id"]
                assert _admin_crawl_cid
        else:
            assert workflow["totalSize"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["totalSize"] > 0
    assert data["crawlCount"] > 0
    assert data["crawlSuccessfulCount"] > 0

    assert data["lastCrawlId"]
    assert data["lastCrawlStartTime"]
    assert data["lastStartedByName"]
    assert data["lastCrawlTime"]
    assert data["lastCrawlState"]
    assert data["lastRun"]
    assert data["lastCrawlSize"] > 0


def test_incremental_workflow_total_size_and_last_crawl_stats(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    # Get baseline values
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["crawlCount"] == 1
    assert data["crawlSuccessfulCount"] == 1
    total_size = data["totalSize"]
    last_crawl_id = data["lastCrawlId"]
    last_crawl_started = data["lastCrawlStartTime"]
    last_crawl_finished = data["lastCrawlTime"]
    last_run = data["lastRun"]

    # Run new crawl in this workflow
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}/run",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawl_id = r.json()["started"]

    # Wait for it to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            break
        time.sleep(5)

    # Give time for stats to re-compute
    time.sleep(10)

    # Re-check stats
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["crawlCount"] == 2
    assert data["crawlSuccessfulCount"] == 2
    assert data["totalSize"] > total_size
    assert data["lastCrawlId"] == crawl_id
    assert data["lastCrawlStartTime"] > last_crawl_started
    assert data["lastCrawlTime"] > last_crawl_finished
    assert data["lastRun"] > last_run

    # Delete new crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=crawler_auth_headers,
        json={"crawl_ids": [crawl_id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"] == 1

    # Re-check stats
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["crawlCount"] == 1
    assert data["crawlSuccessfulCount"] == 1
    assert data["totalSize"] == total_size
    assert data["lastCrawlId"] == last_crawl_id
    assert data["lastCrawlStartTime"] == last_crawl_started
    assert data["lastCrawlTime"] == last_crawl_finished
    assert data["lastRun"] == last_run


def test_get_config_seeds(crawler_auth_headers, default_org_id, url_list_config_id):
    # Make sure seeds aren't included in the crawlconfig detail
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{url_list_config_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json().get("config").get("seeds") is None

    # Test getting seeds from separate endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{url_list_config_id}/seeds",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3

    EXPECTED_SEED_URLS = [
        "https://webrecorder.net/",
        "https://example.com/",
        "https://specs.webrecorder.net/",
    ]
    found_seed_urls = []

    for item in data["items"]:
        found_seed_urls.append(item["url"])

    assert sorted(found_seed_urls) == sorted(EXPECTED_SEED_URLS)

    # Test getting seeds with low page size
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{url_list_config_id}/seeds?pageSize=2",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    items = data["items"]
    assert len(items) == 2
    for item in items:
        assert item["url"] in EXPECTED_SEED_URLS

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{url_list_config_id}/seeds?pageSize=2&page=2",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    items = data["items"]
    assert len(items) == 1
    assert items[0]["url"] in EXPECTED_SEED_URLS


def test_get_crawler_channels(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/crawler-channels",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawler_channels = r.json()["channels"]
    assert crawler_channels
    assert len(crawler_channels) == 2
    for crawler_channel in crawler_channels:
        assert crawler_channel["id"]
        assert crawler_channel["image"]


def test_add_crawl_config_invalid_exclude_regex(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    sample_crawl_data["config"]["exclude"] = "["
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_regex"

    sample_crawl_data["config"]["exclude"] = ["abc.*", "["]
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_regex"


def test_add_crawl_config_custom_behaviors_invalid_url(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    sample_crawl_data["config"]["customBehaviors"] = [INVALID_BEHAVIOR_URL]
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_custom_behavior"


def test_add_crawl_config_custom_behaviors_valid_url(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    url = "https://raw.githubusercontent.com/webrecorder/custom-behaviors/refs/heads/main/behaviors/fulcrum.js"
    sample_crawl_data["config"]["customBehaviors"] = [url]
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200
    data = r.json()
    config_id = data["id"]
    assert config_id

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{config_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == config_id
    assert data["config"]["customBehaviors"] == [url]


def test_add_update_crawl_config_custom_behaviors_git_url(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    git_url = "git+https://github.com/webrecorder/custom-behaviors"
    git_url_with_params = (
        "git+https://github.com/webrecorder/custom-behaviors?branch=main&path=behaviors"
    )

    # Create workflow and validate it looks like we expect
    sample_crawl_data["config"]["customBehaviors"] = [git_url]
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200
    data = r.json()
    config_id = data["id"]
    assert config_id

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{config_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == config_id
    assert data["config"]["customBehaviors"] == [git_url]

    # Try to update custom behaviors with invalid url, validate unchanged
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{config_id}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "customBehaviors": [git_url, INVALID_BEHAVIOR_URL],
            }
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_custom_behavior"

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{config_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == config_id
    assert data["config"]["customBehaviors"] == [git_url]

    # Update custom behaviors with valid url, validate changed
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{config_id}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "customBehaviors": [git_url_with_params],
            }
        },
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{config_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == config_id
    assert data["config"]["customBehaviors"] == [git_url_with_params]
