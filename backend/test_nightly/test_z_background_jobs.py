"""background jobs tests, named to run after everything else has finished"""

import requests

import pytest

from .conftest import API_PREFIX


job_id = None


def test_background_jobs_list(admin_auth_headers, default_org_id, deleted_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    items = data["items"]

    assert items
    assert len(items) == data["total"]

    for item in items:
        assert item["id"]
        assert item["type"]
        assert item["oid"]
        assert item["success"] in (True, False, None)
        assert item["started"]
        finished = item["finished"]
        assert finished or finished is None

    global job_id
    job_id = [item for item in items if item["finished"] and item["success"]][0]["id"]
    assert job_id


@pytest.mark.parametrize("job_type", [("create-replica"), ("delete-replica")])
def test_background_jobs_list_filter_by_type(
    admin_auth_headers, default_org_id, deleted_crawl_id, job_type
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/?jobType={job_type}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    items = data["items"]

    assert items
    assert len(items) == data["total"]

    for item in items:
        assert item["type"] == job_type


def test_background_jobs_list_filter_by_success(
    admin_auth_headers, default_org_id, deleted_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/?success=True",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    items = data["items"]

    assert items
    assert len(items) == data["total"]

    for item in items:
        assert item["success"]


def test_background_jobs_no_failures(
    admin_auth_headers, default_org_id, deleted_crawl_id
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/?success=False",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_get_background_job(admin_auth_headers, default_org_id, deleted_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/{job_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"]
    assert data["type"] in ("create-replica", "delete-replica")
    assert data["oid"] == default_org_id
    assert data["success"]
    assert data["started"]
    assert data["finished"]
    assert data["file_path"]
    assert data["object_type"]
    assert data["object_id"]
    assert data["replica_storage"]


def test_retry_all_failed_bg_jobs_not_superuser(crawler_auth_headers, deleted_crawl_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/all/jobs/retryFailed", headers=crawler_auth_headers
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"
