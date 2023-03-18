import requests
import urllib.parse

from .conftest import API_PREFIX


def test_get_config_by_created_by(crawler_auth_headers, default_org_id, crawler_userid):
    """Crawlconfig already created for user in test_crawlconfigs."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?created_by={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 1
    assert r.json()["total"] == 1


def test_get_config_by_modified_by(
    crawler_auth_headers, default_org_id, crawler_userid
):
    """Crawlconfig already modified by user in test_crawlconfigs."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?modified_by={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 1
    assert r.json()["total"] == 1


def test_get_configs_by_first_seed(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    first_seed = "https://webrecorder.net/"
    encoded_first_seed = urllib.parse.quote(first_seed)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?first_seed={encoded_first_seed}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for config in r.json()["items"]:
        assert config["firstSeed"].rstrip("/") == first_seed.rstrip("/")


def test_get_configs_by_name(crawler_auth_headers, default_org_id, crawler_crawl_id):
    name = "Crawler User Test Crawl"
    encoded_name = urllib.parse.quote(name)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?name={encoded_name}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for config in r.json()["items"]:
        assert config["name"] == name


def test_ensure_crawl_and_admin_user_crawls(
    default_org_id, crawler_auth_headers, crawler_crawl_id, admin_crawl_id
):
    assert crawler_crawl_id
    assert admin_crawl_id
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 2
    assert r.json()["total"] == 2


def test_get_crawl_job_by_user(
    crawler_auth_headers, default_org_id, crawler_userid, crawler_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?userid={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 1
    assert r.json()["total"] == 1


def test_get_crawl_job_by_config(
    crawler_auth_headers, default_org_id, admin_config_id, crawler_config_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?cid={admin_config_id}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 1
    assert r.json()["total"] == 1

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?cid={crawler_config_id}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 1
    assert r.json()["total"] == 1


def test_get_crawls_by_first_seed(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    first_seed = "https://webrecorder.net"
    encoded_first_seed = urllib.parse.quote(first_seed)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?first_seed={encoded_first_seed}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for crawl in r.json()["items"]:
        assert crawl["firstSeed"].rstrip("/") == first_seed.rstrip("/")


def test_get_crawls_by_name(crawler_auth_headers, default_org_id, crawler_crawl_id):
    name = "Crawler User Test Crawl"
    encoded_name = urllib.parse.quote(name)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?name={encoded_name}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for crawl in r.json()["items"]:
        assert crawl["name"] == name


def test_sort_crawls(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    # Sort by started, descending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=started",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["total"] == 2
    items = data["items"]
    assert len(items) == 2

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["started"] <= last_created
        last_created = crawl["started"]

    # Sort by started, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=started&sort_direction=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["started"] >= last_created
        last_created = crawl["started"]

    # Sort by finished
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=finished",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_finished = None
    for crawl in items:
        if not crawl["finished"]:
            continue
        if last_finished:
            assert crawl["finished"] <= last_finished
        last_finished = crawl["finished"]

    # Sort by finished, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=finished&sort_direction=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_finished = None
    for crawl in items:
        if not crawl["finished"]:
            continue
        if last_finished:
            assert crawl["finished"] >= last_finished
        last_finished = crawl["finished"]

    # Sort by fileSize
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=fileSize",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_size = None
    for crawl in items:
        if last_size:
            assert crawl["fileSize"] <= last_size
        last_size = crawl["fileSize"]

    # Sort by fileSize, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=fileSize&sort_direction=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_size = None
    for crawl in items:
        if last_size:
            assert crawl["fileSize"] >= last_size
        last_size = crawl["fileSize"]

    # Sort by first seed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=firstSeed",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_first_seed = None
    for crawl in items:
        if not crawl["firstSeed"]:
            continue
        if last_first_seed:
            assert crawl["firstSeed"] <= last_first_seed
        last_first_seed = crawl["firstSeed"]

    # Sort by first seed, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=firstSeed&sort_direction=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_first_seed = None
    for crawl in items:
        if not crawl["firstSeed"]:
            continue
        if last_first_seed:
            assert crawl["firstSeed"] >= last_first_seed
        last_first_seed = crawl["firstSeed"]

    # Invalid sort value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=invalid",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_field"

    # Invalid sort_direction value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sort_field=started&sort_direction=0",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_direction"


def test_sort_crawl_configs(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    # Sort by created, descending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=created",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["total"] == 5
    items = data["items"]
    assert len(items) == 5

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["created"] <= last_created
        last_created = crawl["created"]

    # Sort by created, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=created&sort_direction=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["created"] >= last_created
        last_created = crawl["created"]

    # Sort by modified
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=modified",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_modified = None
    for crawl in items:
        if last_modified:
            assert crawl["modified"] <= last_modified
        last_modified = crawl["modified"]

    # Sort by modified, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=modified&sort_direction=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_modified = None
    for crawl in items:
        if last_modified:
            assert crawl["modified"] >= last_modified
        last_modified = crawl["modified"]

    # Sort by first seed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=firstSeed",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_first_seed = None
    for crawl in items:
        if not crawl["firstSeed"]:
            continue
        if last_first_seed:
            assert crawl["firstSeed"] <= last_first_seed
        last_first_seed = crawl["firstSeed"]

    # Sort by first seed, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=firstSeed&sort_direction=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_first_seed = None
    for crawl in items:
        if not crawl["firstSeed"]:
            continue
        if last_first_seed:
            assert crawl["firstSeed"] >= last_first_seed
        last_first_seed = crawl["firstSeed"]

    # Invalid sort value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=invalid",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_field"

    # Invalid sort_direction value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sort_field=created&sort_direction=0",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_direction"
