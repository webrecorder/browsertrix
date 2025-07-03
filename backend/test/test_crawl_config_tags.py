import requests

from .conftest import API_PREFIX

new_cid_1 = None
new_cid_2 = None


def get_sample_crawl_data(tags):
    return {
        "runNow": False,
        "name": "Test Crawl",
        "config": {"seeds": [{"url": "https://example.com/"}]},
        "tags": tags,
    }


def test_create_new_config_1(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(["tag-1", "tag-2"]),
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"] == None

    global new_cid_1
    new_cid_1 = data["id"]


def test_get_config_1(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{new_cid_1}",
        headers=admin_auth_headers,
    )
    assert r.json()["tags"] == ["tag-1", "tag-2"]


def test_get_config_by_tag_1(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/tags",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert sorted(data) == ["tag-1", "tag-2", "wr-test-1", "wr-test-2"]


def test_get_config_by_tag_counts_1(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/tagCounts",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data == {
        "tags": [
            {"tag": "tag-1", "count": 1},
            {"tag": "tag-2", "count": 1},
            {"tag": "wr-test-1", "count": 1},
            {"tag": "wr-test-2", "count": 1},
        ]
    }


def test_create_new_config_2(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(["tag-3", "tag-0"]),
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"] == None

    global new_cid_2
    new_cid_2 = data["id"]


def test_get_config_by_tag_2(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/tags",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert sorted(data) == [
        "tag-0",
        "tag-1",
        "tag-2",
        "tag-3",
        "wr-test-1",
        "wr-test-2",
    ]


def test_get_config_by_tag_counts_2(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/tagCounts",
        headers=admin_auth_headers,
    )
    data = r.json()
    assert data == {
        "tags": [
            {"tag": "tag-0", "count": 1},
            {"tag": "tag-1", "count": 1},
            {"tag": "tag-2", "count": 1},
            {"tag": "tag-3", "count": 1},
            {"tag": "wr-test-1", "count": 1},
            {"tag": "wr-test-2", "count": 1},
        ]
    }


def test_get_config_2(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{new_cid_2}",
        headers=admin_auth_headers,
    )
    assert r.json()["tags"] == ["tag-3", "tag-0"]
