import requests

from .conftest import API_PREFIX


def test_add_update_crawl_config(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    # Create crawl config
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )
    assert r.status_code == 200

    data = r.json()
    cid = data["added"]

    # Update crawl config
    UPDATED_NAME = "Updated name"
    UPDATED_TAGS = ["tag3", "tag4"]
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"name": UPDATED_NAME, "tags": UPDATED_TAGS},
    )
    assert r.status_code == 200

    data = r.json()
    assert data["success"]

    # Verify update was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["name"] == UPDATED_NAME
    assert sorted(data["tags"]) == sorted(UPDATED_TAGS)

    # Verify that deleting tags works as well
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
        json={"tags": []},
    )
    assert r.status_code == 200

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["name"] == UPDATED_NAME
    assert data["tags"] == []
