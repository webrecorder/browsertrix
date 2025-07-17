import os
import requests
import time

import pytest

from .conftest import API_PREFIX
from .utils import read_in_chunks

curr_dir = os.path.dirname(os.path.realpath(__file__))


@pytest.fixture(scope="session")
def seed_file_id(crawler_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "data", "seedfile.txt"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/files/seedFile?filename=seedfile.txt",
            headers=crawler_auth_headers,
            data=read_in_chunks(fh),
        )
        assert r.status_code == 200
        return r.json()["id"]


def test_seed_file_cleanup_cron_job(admin_auth_headers, default_org_id, seed_file_id):
    # Verify seed file exists
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == seed_file_id
    assert data["oid"] == default_org_id

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

    # Check that seed file was deleted from database
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/files/{seed_file_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404
