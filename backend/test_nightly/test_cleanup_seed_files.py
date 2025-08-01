import os
import requests
import time

import pytest

from .conftest import API_PREFIX
from .utils import read_in_chunks

curr_dir = os.path.dirname(os.path.realpath(__file__))


@pytest.fixture(scope="session")
def seed_file_unused_id(crawler_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=seedfile.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 200
        return r.json()["id"]


@pytest.fixture(scope="session")
def seed_file_used_id(crawler_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=seedfile.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 200
        return r.json()["id"]


@pytest.fixture(scope="session")
def seed_file_config_id(crawler_auth_headers, default_org_id, seed_file_used_id):
    crawl_data = {
        "runNow": False,
        "name": "Seed File Test Crawl Nightly",
        "config": {
            "scopeType": "page",
            "seedFileId": seed_file_used_id,
            "limit": 2,
        },
        "crawlerChannel": "test",
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    return r.json()["id"]


@pytest.mark.timeout(1200)
def test_seed_file_cleanup_cron_job(
    admin_auth_headers,
    default_org_id,
    seed_file_unused_id,
    seed_file_used_id,
    seed_file_config_id,
):
    # Verify unused and used seed files exist
    for seed_file_id in (seed_file_unused_id, seed_file_used_id):
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == seed_file_id
        assert data["oid"] == default_org_id

    # Verify workflow with used seed file exists
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{seed_file_config_id}/",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == seed_file_config_id
    assert data["config"]["seedFileId"] == seed_file_used_id

    # Wait 5 minutes to give cleanup job time to run
    time.sleep(300)

    # Check that at least one bg job entry exists for cleanup jobs and that
    # the jobs are marked as successful
    r = requests.get(
        f"{API_PREFIX}/orgs/all/jobs?jobType=cleanup-seed-files",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["total"] > 0
    for job in data["items"]:
        print(job)
        assert job["id"]
        assert job["type"] == "cleanup-seed-files"
        assert job["success"]
        assert job["started"]
        assert job["finished"]

    # Check that unused seed file was deleted from database
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_unused_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404

    # Check that used seed file was not deleted from database
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_used_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["id"] == seed_file_used_id
