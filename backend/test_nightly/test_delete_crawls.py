import os
import requests
import time

from .conftest import API_PREFIX, HOST_PREFIX
from .utils import verify_file_and_replica_deleted


def test_delete_crawls(
    tmp_path, admin_auth_headers, default_org_id, crawl_id_wr, crawl_id_wr_specs
):
    # Check that crawls have associated files
    crawl_resource_urls = []

    def _file_is_retrievable(url):
        """Attempt to retrieve file at url and return True or False."""
        file_path = str(tmp_path / "test_download")
        if os.path.exists(file_path):
            os.remove(file_path)

        r = requests.get(f"{HOST_PREFIX}{url}")
        if not r.status_code == 200:
            return False

        with open(file_path, "wb") as fd:
            fd.write(r.content)

        if not (os.path.isfile(file_path) and os.path.getsize(file_path) > 0):
            return False

        os.remove(file_path)
        return True

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    resources = data["resources"]
    assert resources
    for resource in resources:
        crawl_resource_urls.append(resource["path"])

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr_specs}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    resources = data["resources"]
    assert resources
    for resource in resources:
        crawl_resource_urls.append(resource["path"])

    # Test retrieving resources
    for url in crawl_resource_urls:
        assert _file_is_retrievable(url)

    # Delete crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [crawl_id_wr, crawl_id_wr_specs]},
    )
    assert r.status_code == 200
    data = r.json()

    assert data["deleted"]

    # Verify that crawls don't exist in db
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr_specs}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404

    # Give Minio time to delete the files
    time.sleep(120)

    # Verify that files are no longer retrievable from storage
    for url in crawl_resource_urls:
        assert not _file_is_retrievable(url)


def test_delete_replica_job_run(admin_auth_headers, default_org_id):
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
