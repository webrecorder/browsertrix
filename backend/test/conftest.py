import pytest
import requests
import time


HOST_PREFIX = "http://127.0.0.1:30870"
API_PREFIX = HOST_PREFIX + "/api"

ADMIN_USERNAME = "admin@example.com"
ADMIN_PW = "PASSW0RD!"

VIEWER_USERNAME = "viewer@example.com"
VIEWER_PW = "viewerPASSW0RD!"

CRAWLER_USERNAME = "crawler@example.com"
CRAWLER_PW = "crawlerPASSWORD!"

_admin_config_id = None
_crawler_config_id = None
_auto_add_config_id = None

NON_DEFAULT_ORG_NAME = "Non-default org"


@pytest.fixture(scope="session")
def admin_auth_headers():
    while True:
        r = requests.post(
            f"{API_PREFIX}/auth/jwt/login",
            data={
                "username": ADMIN_USERNAME,
                "password": ADMIN_PW,
                "grant_type": "password",
            },
        )
        data = r.json()
        try:
            return {"Authorization": f"Bearer {data['access_token']}"}
        except:
            print("Waiting for admin_auth_headers")
            time.sleep(5)


@pytest.fixture(scope="session")
def default_org_id(admin_auth_headers):
    while True:
        r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
        data = r.json()
        try:
            for org in data["items"]:
                if org["default"] is True:
                    return org["id"]
        except:
            print("Waiting for default org id")
            time.sleep(5)


@pytest.fixture(scope="session")
def non_default_org_id(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": NON_DEFAULT_ORG_NAME},
    )
    assert r.status_code == 200

    while True:
        r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
        data = r.json()
        try:
            for org in data["items"]:
                if org["name"] == NON_DEFAULT_ORG_NAME:
                    return org["id"]
        except:
            print("Waiting for non-default org id")
            time.sleep(5)


@pytest.fixture(scope="session")
def admin_crawl_id(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Admin Test Crawl",
        "description": "Admin Test Crawl description",
        "tags": ["wr-test-1", "wr-test-2"],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            # limit now set via 'max_pages_per_crawl' global limit
            # "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _admin_config_id
    _admin_config_id = data["id"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def admin_config_id(admin_crawl_id):
    return _admin_config_id


@pytest.fixture(scope="session")
def viewer_auth_headers(admin_auth_headers, default_org_id):
    requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": VIEWER_USERNAME,
            "password": VIEWER_PW,
            "name": "newviewer",
            "role": 10,
        },
        headers=admin_auth_headers,
    )
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VIEWER_USERNAME,
            "password": VIEWER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def crawler_auth_headers(admin_auth_headers, default_org_id):
    requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "name": "new-crawler",
            "description": "crawler test crawl",
            "role": 20,
        },
        headers=admin_auth_headers,
    )
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def crawler_userid(crawler_auth_headers):
    r = requests.get(f"{API_PREFIX}/users/me", headers=crawler_auth_headers)
    return r.json()["id"]


@pytest.fixture(scope="session")
def _crawler_create_config_only(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": False,
        "name": "Crawler User Test Crawl",
        "description": "crawler test crawl",
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
            "pageExtraDelay": 20,
            "limit": 4,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _crawler_config_id
    _crawler_config_id = data["id"]


@pytest.fixture(scope="session")
def crawler_crawl_id(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Crawler User Test Crawl",
        "description": "crawler test crawl",
        "tags": ["wr-test-2"],
        "config": {"seeds": [{"url": "https://webrecorder.net/"}], "limit": 1},
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _crawler_config_id
    _crawler_config_id = data["id"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def wr_specs_crawl_id(crawler_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Webrecorder Specs sample crawl",
        "config": {"seeds": [{"url": "https://specs.webrecorder.net/"}], "limit": 1},
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def crawler_config_id(crawler_crawl_id):
    return _crawler_config_id


@pytest.fixture(scope="session")
def crawler_config_id_only(_crawler_create_config_only):
    return _crawler_config_id


@pytest.fixture(scope="session")
def sample_crawl_data():
    return {
        "runNow": False,
        "name": "Test Crawl",
        "config": {"seeds": [{"url": "https://example.com/"}]},
        "tags": ["tag1", "tag2"],
    }


@pytest.fixture(scope="session")
def auto_add_collection_id(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={"name": "Auto Add Collection"},
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="session")
def auto_add_crawl_id(crawler_auth_headers, default_org_id, auto_add_collection_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Auto Add",
        "description": "For testing auto-adding new workflow crawls to collections",
        "autoAddCollections": [auto_add_collection_id],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _auto_add_config_id
    _auto_add_config_id = data["id"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def auto_add_config_id(auto_add_crawl_id):
    return _auto_add_config_id


@pytest.fixture(scope="session")
def uploads_collection_id(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=crawler_auth_headers,
        json={"name": "Upload test collection"},
    )
    assert r.status_code == 200
    return r.json()["id"]
