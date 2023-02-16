import pytest
import requests
import time


HOST_PREFIX = "http://127.0.0.1:30870"
API_PREFIX = HOST_PREFIX + "/api"

ADMIN_USERNAME = "admin@example.com"
ADMIN_PW = "PASSW0RD!"


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
            for org in data["orgs"]:
                if org["default"] is True:
                    return org["id"]
        except:
            print("Waiting for default org id")
            time.sleep(5)


@pytest.fixture(scope="session")
def crawl_id_wr(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Webrecorder admin test crawl",
        "tags": ["wr", "nightly testing"],
        "config": {
            "seeds": ["https://webrecorder.net/"],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

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
def crawl_id_wr_specs(admin_auth_headers, default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Webrecorder Specs admin test crawl",
        "tags": ["wr-specs", "nightly testing"],
        "config": {
            "seeds": ["https://specs.webrecorder.net/"],
            "limit": 1,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

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
