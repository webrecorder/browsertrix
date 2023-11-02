import requests
import time

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

    # Wait some time to let crawl start, hit timeout, and gracefully stop
    time.sleep(60)

    # Verify crawl was stopped
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{timeout_crawl}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["state"] == "partial_complete"


def test_crawl_files_replicated(admin_auth_headers, default_org_id, timeout_crawl):
    time.sleep(20)

    # Verify replication job was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs?sortBy=started&sortDirection=1&jobType=create-replica",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    latest_job = r.json()["items"][0]
    assert latest_job["type"] == "create-replica"
    job_id = latest_job["id"]

    attempts = 0
    while attempts < 5:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/jobs/{job_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        job = r.json()
        finished = latest_job.get("finished")
        if not finished:
            attempts += 1
            time.sleep(10)
            continue

        assert job["success"]
        break

    # Assert file was updated
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{timeout_crawl}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    files = data.get("resources")
    assert files
    for file_ in files:
        assert file_["numReplicas"] == 1

    # Verify replica is stored
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/{job_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    verify_file_replicated(data["file_path"])
