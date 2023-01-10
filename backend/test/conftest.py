import pytest
import requests
import time


API_PREFIX = "http://127.0.0.1:30870/api"

ADMIN_USERNAME = "admin@example.com"
ADMIN_PW = "PASSW0RD!"

VIEWER_USERNAME = "viewer@example.com"
VIEWER_PW = "viewerPASSW0RD!"


@pytest.fixture(scope="session")
def admin_auth_headers():
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def admin_aid(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/archives", headers=admin_auth_headers)
    data = r.json()
    return data["archives"][0]["id"]


@pytest.fixture(scope="session")
def admin_crawl_id(admin_auth_headers, admin_aid):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Admin Test Crawl",
        "config": {"seeds": ["https://example.com/"]},
    }
    r = requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()
    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/archives/{admin_aid}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def viewer_auth_headers(admin_auth_headers, admin_aid):
    requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/add-user",
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
        headers=admin_auth_headers,
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}
