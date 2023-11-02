import time
import os
import requests

from .conftest import API_PREFIX

from .utils import (
    read_in_chunks,
    verify_file_replicated,
    verify_file_and_replica_deleted,
)

curr_dir = os.path.dirname(os.path.realpath(__file__))

def test_upload_stream(admin_auth_headers, default_org_id):
    with open(os.path.join(curr_dir, "..", "test", "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    assert r.json()["added"]

    global upload_id
    upload_id = r.json()["id"]


def test_upload_file_replicated(admin_auth_headers, default_org_id):
    time.sleep(20)

    # Verify replication job was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs?sortBy=started&sortDirection=-1&jobType=create-replica",
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

    # Verify file updated
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/{upload_id}/replay.json",
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
    job = r.json()
    print(job["file_path"])
    verify_file_replicated(job["file_path"])


def test_delete_upload_and_replicas(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [upload_id]},
    )
    data = r.json()
    assert data["deleted"]
    assert data["storageQuotaReached"] is False

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads",
        headers=admin_auth_headers,
    )
    results = r.json()

    for res in results["items"]:
        if res["id"] == upload_id:
            assert False

    time.sleep(20)

    # Verify delete replica job was successful
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs?sortBy=started&sortDirection=-1&jobType=delete-replica",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    latest_job = r.json()["items"][0]
    assert latest_job["type"] == "delete-replica"
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

    time.sleep(10)

    # Verify replica is no longer stored
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/{job_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    job = r.json()
    verify_file_and_replica_deleted(job["file_path"])
