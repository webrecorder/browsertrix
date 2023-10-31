"""background jobs tests, named to run after everything else has finished"""

import requests

import pytest

from .conftest import API_PREFIX


job_id = None


def test_background_jobs_list(admin_auth_headers, default_org_id):
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
        assert item["success"] in (True, False)
        assert item["started"]
        finished = item["finished"]
        assert finished or finished is None

    global job_id
    job_id = items[0]["id"]
    assert job_id


@pytest.mark.parametrize("job_type", [("create-replica"), ("delete-replica")])
def test_background_jobs_list_filter_by_type(
    admin_auth_headers, default_org_id, job_type
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


@pytest.mark.parametrize("success", [(True), (False)])
def test_background_jobs_list_filter_by_success(
    admin_auth_headers, default_org_id, success
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/?success={success}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    items = data["items"]

    assert items
    assert len(items) == data["total"]

    for item in items:
        assert item["success"] == success


def test_get_background_job(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/jobs/{job_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()

    assert data["id"]
    assert data["type"] in ("create-replica", "delete-replica")
    assert data["oid"] == default_org_id
    assert data["success"] in (True, False)
    assert data["started"]
    finished = data["finished"]
    assert finished or finished is None
    assert data["file_path"]
    assert data["object_type"]
    assert data["object_id"]
    assert data["replica_storage"]
