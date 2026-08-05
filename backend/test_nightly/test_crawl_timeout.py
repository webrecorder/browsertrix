import time

import pytest
import requests

from btrixcloud.utils import dt_now

from .conftest import API_PREFIX
from .utils import verify_file_replicated


def test_crawl_timeout(admin_auth_headers, default_org_id, timeout_crawl):
    # Verify that crawl has started
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{timeout_crawl}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["state"] in ("starting", "running")

    attempts = 0
    while True:
        # Try for 10 minutes before failing
        if attempts > 30:
            assert False

        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{timeout_crawl}/replay.json",
            headers=admin_auth_headers,
        )
        if r.json()["state"] == "complete":
            break
        time.sleep(20)
        attempts += 1


@pytest.mark.timeout(1800)
def test_crawl_files_replicated(admin_auth_headers, default_org_id, timeout_crawl):
    crawl_complete = dt_now()

    # Verify copy bucket job has run and succeeded since crawl completed
    job_id = None

    # Give job up to 15 minutes to complete
    attempts = 0
    while attempts < 15:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/jobs?sortBy=started&sortDirection=-1&jobType=copy-bucket",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        jobs = r.json().get("items", [])
        if jobs:
            latest_job = jobs[0]
            assert latest_job["type"] == "copy-bucket"
            if latest_job["started"] >= crawl_complete:
                job_id = latest_job["id"]
                break

        attempts += 1
        time.sleep(60)

    # Give job up to 5 minutes to finish
    attempts = 0
    while attempts < 10:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/jobs/{job_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        job = r.json()
        finished = latest_job.get("finished")
        if not finished:
            attempts += 1
            time.sleep(30)
            continue

        assert job["success"]
        break

    # Verify crawlfiles are stored in replica location
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{timeout_crawl}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    oid = data["oid"]
    assert oid

    files = data.get("resources")
    assert files
    for file_ in files:
        filename = file_["name"]
        file_path = f"{oid}/{filename}"
        verify_file_replicated(file_path)
