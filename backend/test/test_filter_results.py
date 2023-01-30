import requests

from .conftest import API_PREFIX


def test_create_new_config_crawler_user(
    crawler_auth_headers, default_org_id, sample_crawl_data
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=sample_crawl_data,
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["run_now_job"] == None


def test_get_config_by_user(crawler_auth_headers, default_org_id, crawler_userid):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?userid={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["crawlConfigs"]) == 1


def test_ensure_crawl_and_admin_user_crawls(
    default_org_id, crawler_auth_headers, crawler_crawl_id, admin_crawl_id
):
    assert crawler_crawl_id
    assert admin_crawl_id
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["crawls"]) == 2


def test_get_crawl_job_by_user(
    crawler_auth_headers, default_org_id, crawler_userid, crawler_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?userid={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["crawls"]) == 1


def test_get_crawl_job_by_config(
    crawler_auth_headers, default_org_id, admin_config_id, crawler_config_id
):

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?cid={admin_config_id}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["crawls"]) == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?cid={crawler_config_id}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["crawls"]) == 1
