import requests

from .conftest import API_PREFIX

def get_sample_crawl_data():
    return {
        "runNow": False,
        "name": "Test Crawl",
        "config": {"seeds": ["https://example.com/"]},
    }

def test_create_new_config_2_diff_user(crawler_auth_headers, admin_aid):
    r = requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=get_sample_crawl_data()
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["run_now_job"] == None

def test_get_config_by_user(crawler_auth_headers, admin_aid, crawler_userid):
    r = requests.get(
        f"{API_PREFIX}/archives/{admin_aid}/crawlconfigs?userid={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["crawlConfigs"]) == 1

def test_get_crawl_job_by_user(crawler_auth_headers, admin_aid, crawler_userid, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/archives/{admin_aid}/crawls?userid={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["crawls"]) == 0


