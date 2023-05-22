import requests

from .conftest import API_PREFIX


cid = None
UPDATED_NAME = "Updated name"
UPDATED_DESCRIPTION = "Updated description"
UPDATED_TAGS = ["tag3", "tag4"]


def test_add_crawl_config(crawler_auth_headers, default_org_id, sample_crawl_data):
    # Create crawl config
    sample_crawl_data["schedule"] = "0 0 * * *"
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


def test_update_desription_only(crawler_auth_headers, default_org_id):
    # update description only
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"description": "updated description"},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["success"]
    assert data["metadata_changed"] == True
    assert data["settings_changed"] == False


def test_update_crawl_config_metadata(crawler_auth_headers, default_org_id):
    # Update crawl config
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={
            "name": UPDATED_NAME,
            "description": UPDATED_DESCRIPTION,
            "tags": UPDATED_TAGS,
        },
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
    assert data["description"] == UPDATED_DESCRIPTION
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)


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


def test_workflow_total_size_and_last_crawl_stats(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    admin_crawl_cid = ""

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    items = data["items"]
    for workflow in items:
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
                admin_crawl_cid = workflow["id"]
                assert admin_crawl_cid
        else:
            assert workflow["totalSize"] == 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{admin_crawl_cid}",
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
