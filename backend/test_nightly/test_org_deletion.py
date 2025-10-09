import requests
import time
from uuid import uuid4

import pytest

from .conftest import API_PREFIX


@pytest.fixture(scope="function")
def non_default_org_id(admin_auth_headers):
    # Use uuid as name and slug so that fixture is reusable per-function
    org_name = str(uuid4())
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": org_name, "slug": org_name},
    )
    assert r.status_code == 200

    while True:
        r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
        data = r.json()
        try:
            for org in data["items"]:
                if org["name"] == org_name:
                    return org["id"]
        except:
            print("Waiting for non-default org id")
            time.sleep(5)


@pytest.fixture(scope="function")
def crawl_id_running(admin_auth_headers, non_default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Org deletion while crawl runs",
        "tags": ["wr", "nightly testing"],
        "config": {
            "seeds": [{"url": "https://old.webrecorder.net/"}],
            "limit": 40,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    crawl_id = data["run_now_job"]
    # Wait for it to start running and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{non_default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "running":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="function")
def qa_run_id_running(admin_auth_headers, non_default_org_id):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Org deletion while QA runs",
        "tags": ["wr", "nightly testing"],
        "config": {
            "seeds": [{"url": "https://old.webrecorder.net/"}],
            "limit": 10,
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    crawl_id = r.json()["run_now_job"]

    # Wait for it to finish and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{non_default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            break
        time.sleep(5)

    # Start analysis run, return qa crawl id when running
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/crawls/{crawl_id}/qa/start",
        headers=admin_auth_headers,
    )
    qa_run_id = r.json()["started"]

    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{non_default_org_id}/crawls/{crawl_id}/qa/activeQA",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data.get("qa") and data["qa"]["state"] == "running":
            return qa_run_id
        time.sleep(5)


@pytest.fixture(scope="function")
def browser_profile_id_running(admin_auth_headers, non_default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/profiles/browser",
        headers=admin_auth_headers,
        json={"url": "https://old.webrecorder.net"},
    )
    assert r.status_code == 200
    browser_id = r.json()["browserid"]

    time.sleep(5)

    # Wait until successful ping, then return profile browser id
    while True:
        r = requests.post(
            f"{API_PREFIX}/orgs/{non_default_org_id}/profiles/browser/{browser_id}/ping",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data.get("success"):
            return browser_id
        time.sleep(5)


def test_delete_org_crawl_running(
    admin_auth_headers, non_default_org_id, crawl_id_running
):
    r = requests.delete(
        f"{API_PREFIX}/orgs/{non_default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    job_id = data["id"]

    # Check that background job is launched and eventually succeeds
    max_attempts = 18
    attempts = 1
    while True:
        try:
            r = requests.get(
                f"{API_PREFIX}/orgs/all/jobs/{job_id}", headers=admin_auth_headers
            )
            assert r.status_code == 200
            success = r.json()["success"]

            if success:
                break

            if success is False:
                assert False

            if attempts >= max_attempts:
                assert False

            time.sleep(10)
        except:
            time.sleep(10)

        attempts += 1

    # Check that org was deleted
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()
    for org in data["items"]:
        if org["id"] == non_default_org_id:
            assert False


def test_delete_org_qa_running(
    admin_auth_headers, non_default_org_id, qa_run_id_running
):
    r = requests.delete(
        f"{API_PREFIX}/orgs/{non_default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    job_id = data["id"]

    # Check that background job is launched and eventually succeeds
    max_attempts = 18
    attempts = 1
    while True:
        try:
            r = requests.get(
                f"{API_PREFIX}/orgs/all/jobs/{job_id}", headers=admin_auth_headers
            )
            assert r.status_code == 200
            success = r.json()["success"]

            if success:
                break

            if success is False:
                assert False

            if attempts >= max_attempts:
                assert False

            time.sleep(10)
        except:
            time.sleep(10)

        attempts += 1

    # Check that org was deleted
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()
    for org in data["items"]:
        if org["id"] == non_default_org_id:
            assert False


def test_delete_org_profile_running(
    admin_auth_headers, non_default_org_id, browser_profile_id_running
):
    r = requests.delete(
        f"{API_PREFIX}/orgs/{non_default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    job_id = data["id"]

    # Check that background job is launched and eventually succeeds
    max_attempts = 18
    attempts = 1
    while True:
        try:
            r = requests.get(
                f"{API_PREFIX}/orgs/all/jobs/{job_id}", headers=admin_auth_headers
            )
            assert r.status_code == 200
            success = r.json()["success"]

            if success:
                break

            if success is False:
                assert False

            if attempts >= max_attempts:
                assert False

            time.sleep(10)
        except:
            time.sleep(10)

        attempts += 1

    # Check that org was deleted
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()
    for org in data["items"]:
        if org["id"] == non_default_org_id:
            assert False
