"""Tests for org deletion and storage recalculation.

Each test is independently runnable. The deletion test creates its own
org to avoid destroying the session's default org fixture.
"""

import time

import structlog
import pytest
import requests

from .conftest import API_PREFIX

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


@pytest.fixture(scope="module")
def org_to_delete(admin_auth_headers):
    """Create an org that will be deleted during the deletion tests."""
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": "Org to Delete", "slug": "org-to-delete"},
    )
    assert r.status_code == 200
    data = r.json()

    # Wait for org to be fully created
    max_attempts = 18
    attempts = 1
    while True:
        r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
        orgs = r.json().get("items", [])
        for org in orgs:
            if org["name"] == "Org to Delete":
                return org["id"]
        if attempts >= max_attempts:
            pytest.fail("Org to delete was not created in time")
        time.sleep(5)
        attempts += 1


def test_recalculate_org_storage(admin_auth_headers, default_org_id, admin_crawl_id):
    # Prior to deleting org, ensure recalculating storage works now that
    # resources of all types have been created.
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/recalculate-storage",
        headers=admin_auth_headers,
        timeout=120,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"]

    job_id = data["id"]
    assert job_id

    # Check that background job is launched and eventually succeeds
    max_attempts = 18
    attempts = 1
    while True:
        try:
            r = requests.get(
                f"{API_PREFIX}/orgs/all/jobs/{job_id}",
                headers=admin_auth_headers,
                timeout=120,
            )
            assert r.status_code == 200
            success = r.json()["success"]

            if success:
                break

            if success is False:
                pytest.fail("Job failed")

            time.sleep(10)
        except:
            time.sleep(10)

        if attempts >= max_attempts:
            pytest.fail(f"Giving up waiting for job after {max_attempts} attempts")

        attempts += 1
        logger.info(
            "test_job_retrying",
            attempts=attempts,
            max_attempts=max_attempts,
            unstructured_message=f"Job not yet succeeded, retrying... ({attempts}/{max_attempts})",
        )

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["bytesStored"] > 0
    assert data["bytesStoredCrawls"] > 0
    assert data["bytesStoredUploads"] > 0
    assert data["bytesStoredProfiles"] > 0


def test_delete_org_non_superadmin(crawler_auth_headers, default_org_id):
    # Assert that non-superadmin can't delete org
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=crawler_auth_headers, timeout=120
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"


def test_delete_org_superadmin(admin_auth_headers, org_to_delete):
    """Delete a dedicated org (not the session default org) and verify cleanup."""
    r = requests.delete(
        f"{API_PREFIX}/orgs/{org_to_delete}", headers=admin_auth_headers, timeout=120
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    job_id = data["id"]
    assert job_id

    # Check that background job is launched and eventually succeeds
    max_attempts = 18
    attempts = 1
    while True:
        try:
            r = requests.get(
                f"{API_PREFIX}/orgs/all/jobs/{job_id}",
                headers=admin_auth_headers,
                timeout=120,
            )
            assert r.status_code == 200
            success = r.json()["success"]

            if success:
                break

            if success is False:
                pytest.fail("Job failed")

            time.sleep(10)
        except:
            time.sleep(10)

        if attempts >= max_attempts:
            pytest.fail(f"Giving up waiting for job after {max_attempts} attempts")

        attempts += 1
        logger.info(
            "test_job_retrying",
            attempts=attempts,
            max_attempts=max_attempts,
            unstructured_message=f"Job not yet succeeded, retrying... ({attempts}/{max_attempts})",
        )

    # Ensure org got deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_to_delete}", headers=admin_auth_headers, timeout=120
    )
    assert r.status_code == 404
