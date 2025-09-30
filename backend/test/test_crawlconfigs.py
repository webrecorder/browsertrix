import time

import requests

from .conftest import API_PREFIX

cid = None
cid_single_page = None
UPDATED_NAME = "Updated name"
UPDATED_DESCRIPTION = "Updated description"
UPDATED_TAGS = ["tag3", "tag4"]

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


def test_verify_default_browser_windows(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data.get("scale") is None
    assert data["browserWindows"] == 2


def test_add_crawl_config_single_page(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    # Create crawl config
    sample_crawl_data["config"]["limit"] = 1
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200

    data = r.json()
    global cid_single_page
    cid_single_page = data["id"]


def test_verify_default_browser_windows_single_page(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid_single_page}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data.get("scale") is None
    assert data["browserWindows"] == 1


def test_custom_browser_windows(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    sample_crawl_data["browserWindows"] = 4
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200
    workflow_id = r.json()["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{workflow_id}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data.get("scale") is None
    assert data["browserWindows"] == 4


def test_custom_scale(crawler_auth_headers, default_org_id, sample_crawl_data):
    sample_crawl_data["scale"] = 3
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200
    workflow_id = r.json()["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{workflow_id}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data.get("scale") is None
    assert data["browserWindows"] == 6


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
    assert data["firstSeed"] == "https://example-com.webrecorder.net/"


def test_update_config_invalid_format(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "seeds": ["https://example-com.webrecorder.net/"],
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


def test_update_config_invalid_link_selector(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"config": {"selectLinks": []}},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_link_selector"

    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"config": {"selectLinks": ["a[href]->href", "->href"]}},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_link_selector"


def test_update_config_invalid_lang(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    for invalid_code in ("f", "fra", "french"):
        r = requests.patch(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
            headers=crawler_auth_headers,
            json={"config": {"lang": invalid_code}},
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "invalid_lang"


def test_verify_default_select_links(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["config"]["selectLinks"] == ["a[href]->href"]


def test_verify_default_click_selector(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["config"]["clickSelector"] == "a"


def test_update_config_data(crawler_auth_headers, default_org_id, sample_crawl_data):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "seeds": [{"url": "https://example-com.webrecorder.net/"}],
                "scopeType": "domain",
                "selectLinks": ["a[href]->href", "script[src]->src"],
                "clickSelector": "button",
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
    assert data["config"]["clickSelector"] == "button"


def test_update_config_no_changes(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "seeds": [{"url": "https://example-com.webrecorder.net/"}],
                "scopeType": "domain",
                "selectLinks": ["a[href]->href", "script[src]->src"],
                "clickSelector": "button",
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


def test_update_browser_windows(crawler_auth_headers, default_org_id):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"browserWindows": 1},
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data.get("scale") is None
    assert data["browserWindows"] == 1


def test_update_scale(crawler_auth_headers, default_org_id):
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"scale": 1},
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data.get("scale") is None
    assert data["browserWindows"] == 2


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
    assert data["total"] == 5
    items = data["items"]
    assert len(items) == 5
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

            stats = workflow["lastCrawlStats"]
            assert stats["found"] > 0
            assert stats["done"] > 0
            assert stats["size"] > 0

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

    stats = data["lastCrawlStats"]
    assert stats["found"] > 0
    assert stats["done"] > 0
    assert stats["size"] > 0


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
    last_stats = data["lastCrawlStats"]

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
    stats = data["lastCrawlStats"]
    assert stats["found"] > 0
    assert stats["done"] > 0
    assert stats["size"] > 0

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
    assert data["lastCrawlStats"] == last_stats


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
        "https://example-com.webrecorder.net/",
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


def test_add_crawl_config_invalid_lang(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    for invalid_code in ("f", "fra", "french"):
        sample_crawl_data["config"]["lang"] = invalid_code
        r = requests.post(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
            headers=crawler_auth_headers,
            json=sample_crawl_data,
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "invalid_lang"


def test_add_crawl_config_invalid_link_selectors(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    sample_crawl_data["config"]["selectLinks"] = []
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_link_selector"

    sample_crawl_data["config"]["selectLinks"] = ["a[href]->href", "->href"]
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_link_selector"


def test_add_crawl_config_custom_behaviors_invalid_url(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    sample_crawl_data["config"]["customBehaviors"] = ["http"]
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
                "customBehaviors": [git_url, "not-a-url"],
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


def test_validate_custom_behavior(crawler_auth_headers, default_org_id):
    valid_url = "https://raw.githubusercontent.com/webrecorder/custom-behaviors/refs/heads/main/behaviors/fulcrum.js"
    invalid_url_404 = "https://webrecorder.net/nonexistent/behavior.js"
    doesnt_resolve_url = "https://nonexistenturl-for-testing-browsertrix.com"
    malformed_url = "http"

    git_url = "git+https://github.com/webrecorder/custom-behaviors"
    invalid_git_url = "git+https://github.com/webrecorder/doesntexist"
    private_git_url = "git+https://github.com/webrecorder/website"

    git_url_with_params = (
        "git+https://github.com/webrecorder/custom-behaviors?branch=main&path=behaviors"
    )
    git_url_invalid_branch = (
        "git+https://github.com/webrecorder/custom-behaviors?branch=doesntexist"
    )

    # Success
    for url in (valid_url, git_url, git_url_with_params):
        r = requests.post(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/validate/custom-behavior",
            headers=crawler_auth_headers,
            json={"customBehavior": url},
        )
        assert r.status_code == 200
        assert r.json()["success"]

    # Behavior 404s
    for url in (invalid_url_404, doesnt_resolve_url):
        r = requests.post(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/validate/custom-behavior",
            headers=crawler_auth_headers,
            json={"customBehavior": url},
        )
        assert r.status_code == 404
        assert r.json()["detail"] == "custom_behavior_not_found"

    # Malformed url
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/validate/custom-behavior",
        headers=crawler_auth_headers,
        json={"customBehavior": malformed_url},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_custom_behavior"

    # Git repo doesn't exist
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/validate/custom-behavior",
        headers=crawler_auth_headers,
        json={"customBehavior": invalid_git_url},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "custom_behavior_not_found"

    # Git repo isn't public
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/validate/custom-behavior",
        headers=crawler_auth_headers,
        json={"customBehavior": private_git_url},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "custom_behavior_not_found"

    # Git branch doesn't exist
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/validate/custom-behavior",
        headers=crawler_auth_headers,
        json={"customBehavior": git_url_invalid_branch},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "custom_behavior_branch_not_found"


def test_add_crawl_config_with_seed_file(
    crawler_auth_headers, default_org_id, seed_file_id, seed_file_config_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{seed_file_config_id}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["id"] == seed_file_config_id
    assert data["name"] == "Seed File Test Crawl"
    assert data["config"]["seedFileId"] == seed_file_id
    assert data["config"]["seeds"] is None


def test_delete_seed_file_in_use_crawlconfig(
    crawler_auth_headers, default_org_id, seed_file_id, seed_file_config_id
):
    # Attempt to delete in-use seed file, verify we get 400 response
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "seed_file_in_use"

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_id}",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["id"] == seed_file_id


def test_shareable_workflow(admin_auth_headers, default_org_id, admin_crawl_id):
    # Verify workflow is not shareable
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["shareable"] is False

    # Verify public replay.json returns 404 while not shareable
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}/public/replay.json"
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "crawl_config_not_found"

    # Verify public pagesSearch endpoint returns 404 while not shareable
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}/public/pagesSearch"
    )
    assert r.status_code == 404

    # Mark workflow as shareable
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}/",
        headers=admin_auth_headers,
        json={"shareable": True},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["updated"]
    assert data["settings_changed"]
    assert data["metadata_changed"] is False

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["shareable"]

    # Verify public replay.json returns last successful crawl while shareable
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}/public/replay.json"
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"] == admin_crawl_id
    assert data["oid"] == default_org_id
    assert data["cid"] == _admin_crawl_cid
    assert data["type"] == "crawl"
    assert data["state"] == "complete"

    resources = data["resources"]
    assert resources
    assert resources[0]["path"]

    assert len(data["initialPages"]) == 4

    pages_query_url = data["pagesQueryUrl"]
    assert pages_query_url.endswith(
        f"/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}/public/pagesSearch"
    )
    assert data["downloadUrl"] is None

    # Verify pages search endpoint is accessible and works
    r = requests.get(pages_query_url)
    assert r.status_code == 200
    data = r.json()
    assert data["items"]
    for page in data["items"]:
        assert page["id"]
        assert page["oid"] == default_org_id
        assert page["crawl_id"] == admin_crawl_id
        assert page["url"]


def test_add_crawl_config_fail_on_content_check_no_profile(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    # Ensure we're not able to set failOnContentCheck on a new crawlconfig
    # if a profile is not also set
    sample_crawl_data["config"]["failOnContentCheck"] = True
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "fail_on_content_check_requires_profile"

    # Ensure an empty string doesn't count as a profile being set
    sample_crawl_data["profileid"] = ""
    sample_crawl_data["config"]["failOnContentCheck"] = True
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "fail_on_content_check_requires_profile"


def test_update_crawl_config_fail_on_content_check_no_profile(
    crawler_auth_headers, default_org_id
):
    # Ensure we're not able to update an existing config with no profile to
    # enable failOnContentCheck
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{_admin_crawl_cid}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "failOnContentCheck": True,
            }
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "fail_on_content_check_requires_profile"


def test_update_crawl_config_remove_profile_with_fail_on_content_check(
    crawler_auth_headers, default_org_id, profile_2_config_id
):
    # Ensure removing a profile fails validation if failOnContentCheck is set
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{profile_2_config_id}/",
        headers=crawler_auth_headers,
        json={
            "profileid": "",
            "config": {
                "failOnContentCheck": True,
            },
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "fail_on_content_check_requires_profile"


def test_update_crawl_config_fail_on_content_check_with_profile(
    crawler_auth_headers, default_org_id, profile_2_config_id
):
    # Ensure we are able to update a config to enable failOnContentCheck
    # if a profile is set for the config
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{profile_2_config_id}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "failOnContentCheck": True,
            }
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["settings_changed"] == True
    assert data["metadata_changed"] == False


def test_update_crawl_config_remove_profile_no_fail_on_content_check(
    crawler_auth_headers, default_org_id, profile_2_id, profile_2_config_id
):
    # First remove failOnContentCheck
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{profile_2_config_id}/",
        headers=crawler_auth_headers,
        json={
            "config": {
                "failOnContentCheck": False,
            }
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["settings_changed"] == True
    assert data["metadata_changed"] == False

    # Now we should be able to remove the profile without getting an error
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{profile_2_config_id}/",
        headers=crawler_auth_headers,
        json={"profileid": ""},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["settings_changed"] == True
    assert data["metadata_changed"] == False

    # Add the profile and failOnContentCheck back
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{profile_2_config_id}/",
        headers=crawler_auth_headers,
        json={"profileid": profile_2_id, "config": {"failOnContentCheck": True}},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["settings_changed"] == True
    assert data["metadata_changed"] == False

    # Now check removing them both together
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{profile_2_config_id}/",
        headers=crawler_auth_headers,
        json={"profileid": "", "config": {"failOnContentCheck": False}},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["settings_changed"] == True
    assert data["metadata_changed"] == False
