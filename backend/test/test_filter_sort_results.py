import requests
import urllib.parse

from .conftest import API_PREFIX
from .test_collections import UPDATED_NAME as COLLECTION_NAME


def test_get_config_by_created_by(crawler_auth_headers, default_org_id, crawler_userid):
    """Crawlconfig already created for user in test_crawlconfigs."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?userid={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 2
    assert r.json()["total"] == 2


def test_get_config_by_modified_by(
    crawler_auth_headers, default_org_id, crawler_userid
):
    """Crawlconfig already modified by user in test_crawlconfigs."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?modifiedBy={crawler_userid}",
        headers=crawler_auth_headers,
    )
    assert len(r.json()["items"]) == 2
    assert r.json()["total"] == 2


def test_get_configs_by_first_seed(
    crawler_auth_headers, default_org_id, crawler_crawl_id, admin_crawl_id
):
    first_seed = "https://webrecorder.net/"
    encoded_first_seed = urllib.parse.quote(first_seed)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?firstSeed={encoded_first_seed}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for config in r.json()["items"]:
        assert config["firstSeed"] == first_seed


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


def test_get_configs_by_description(
    crawler_auth_headers, default_org_id, crawler_crawl_id
):
    description = "crawler test crawl"
    encoded_description = urllib.parse.quote(description)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?description={encoded_description}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for config in r.json()["items"]:
        assert config["description"] == description


def test_get_configs_by_schedule_true(
    crawler_auth_headers, default_org_id, crawler_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?schedule=True",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["total"] == 1
    workflow = data["items"][0]
    assert workflow.get("schedule") not in ("", None)


def test_get_configs_by_schedule_false(
    crawler_auth_headers, default_org_id, crawler_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?schedule=False",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["total"] >= 1
    for config in data["items"]:
        assert config.get("schedule") in ("", None)


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
    first_seed = "https://webrecorder.net/"
    encoded_first_seed = urllib.parse.quote(first_seed)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?firstSeed={encoded_first_seed}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for crawl in r.json()["items"]:
        assert crawl["firstSeed"] == first_seed


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


def test_get_crawls_by_description(
    crawler_auth_headers, default_org_id, crawler_crawl_id
):
    description = "crawler test crawl"

    # Give crawl a description
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
        json={"description": description},
    )
    assert r.status_code == 200

    encoded_description = urllib.parse.quote(description)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?description={encoded_description}",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["description"] == description


def test_get_crawls_by_collection_id(
    crawler_auth_headers, default_org_id, crawler_crawl_id
):
    encoded_collection = urllib.parse.quote(COLLECTION_NAME)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/collections?name={encoded_collection}",
        headers=crawler_auth_headers,
    )
    collection_id = r.json()["items"][0]["id"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?collectionId={collection_id}",
        headers=crawler_auth_headers,
    )
    assert r.json()["total"] >= 1
    for crawl in r.json()["items"]:
        assert collection_id in crawl["collections"]


def test_sort_crawls(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    # Sort by started, descending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=started",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=started&sortDirection=1",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=finished",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=finished&sortDirection=1",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=fileSize",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=fileSize&sortDirection=1",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=firstSeed",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=firstSeed&sortDirection=1",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=invalid",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_by"

    # Invalid sort_direction value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=started&sortDirection=0",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_direction"


def test_sort_crawl_configs(
    crawler_auth_headers, default_org_id, admin_crawl_id, crawler_crawl_id
):
    # Sort by created, descending (default)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=created",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["total"] == 8
    items = data["items"]
    assert len(items) == 8

    last_created = None
    for crawl in items:
        if last_created:
            assert crawl["created"] <= last_created
        last_created = crawl["created"]

    # Sort by created, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=created&sortDirection=1",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=modified",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=modified&sortDirection=1",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=firstSeed",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=firstSeed&sortDirection=1",
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

    # Sort by lastCrawlTime
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=lastCrawlTime",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_crawl_time = None
    for config in items:
        config_last_time = config.get("lastCrawlTime")
        if not config_last_time:
            continue
        elif last_crawl_time and config_last_time:
            assert config_last_time <= last_crawl_time
        last_crawl_time = config_last_time

    # Sort by lastCrawlTime, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=lastCrawlTime&sortDirection=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_crawl_time = None
    for config in items:
        config_last_time = config.get("lastCrawlTime")
        if not config_last_time:
            continue
        elif last_crawl_time and config_last_time:
            assert config_last_time >= last_crawl_time
        last_crawl_time = config_last_time

    # Sort by lastCrawlStartTime
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=lastCrawlStartTime",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_crawl_time = None
    for config in items:
        config_last_time = config.get("lastCrawlStartTime")
        if not config_last_time:
            continue
        elif last_crawl_time and config_last_time:
            assert config_last_time <= last_crawl_time
        last_crawl_time = config_last_time

    # Sort by lastCrawlStartTime, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=lastCrawlStartTime&sortDirection=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_crawl_time = None
    for config in items:
        config_last_time = config.get("lastCrawlStartTime")
        if not config_last_time:
            continue
        elif last_crawl_time and config_last_time:
            assert config_last_time >= last_crawl_time
        last_crawl_time = config_last_time

    # Sort by lastRun
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=lastRun",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_updated_time = None
    for config in items:
        config_last_updated = config.get("lastRun")
        if not config_last_updated:
            continue
        elif last_updated_time and config_last_updated:
            assert config_last_updated <= last_updated_time
        last_updated_time = config_last_updated

    # Sort by lastRun, ascending
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=lastRun&sortDirection=1",
        headers=crawler_auth_headers,
    )
    data = r.json()
    items = data["items"]

    last_updated_time = None
    for config in items:
        config_last_updated = config.get("lastRun")
        if not config_last_updated:
            continue
        elif last_updated_time and config_last_updated:
            assert config_last_updated >= last_updated_time
        last_updated_time = config_last_updated

    # Invalid sort value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=invalid",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_by"

    # Invalid sort_direction value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs?sortBy=created&sortDirection=0",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_sort_direction"
