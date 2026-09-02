import time

import structlog
import pytest
import requests

from .conftest import API_PREFIX

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


def test_recalculate_org_storage(admin_auth_headers, default_org_id):
    """Prior to deleting org, ensure recalculating storage works as expected"""

    # First get our baseline values
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    bytes_total = data["bytesStored"]
    assert bytes_total > 0
    bytes_crawls = data["bytesStoredCrawls"]
    assert bytes_crawls > 0
    bytes_finished_crawls = data["bytesStoredFinishedCrawls"]
    assert bytes_finished_crawls > 0
    bytes_active_crawls = data["bytesStoredActiveCrawls"]
    assert bytes_active_crawls >= 0

    assert bytes_crawls == bytes_finished_crawls + bytes_active_crawls

    bytes_uploads = data["bytesStoredUploads"]
    assert bytes_uploads > 0
    bytes_profiles = data["bytesStoredProfiles"]
    assert bytes_profiles > 0
    bytes_seed_files = data["bytesStoredSeedFiles"]
    assert bytes_seed_files >= 0
    bytes_thumbnails = data["bytesStoredThumbnails"]
    assert bytes_thumbnails >= 0
    bytes_dedupe_indexes = data["bytesStoredDedupeIndexes"]
    assert bytes_dedupe_indexes >= 0

    assert (
        bytes_total
        == bytes_crawls
        + bytes_uploads
        + bytes_profiles
        + bytes_seed_files
        + bytes_thumbnails
        + bytes_dedupe_indexes
    )

    # Recalculate
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

    # Validate results of recalculation
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["bytesStored"] == bytes_total
    assert data["bytesStoredCrawls"] == bytes_crawls
    assert data["bytesStoredFinishedCrawls"] == bytes_finished_crawls
    assert data["bytesStoredActiveCrawls"] == bytes_active_crawls
    assert data["bytesStoredUploads"] == bytes_uploads
    assert data["bytesStoredProfiles"] == bytes_profiles
    assert data["bytesStoredSeedFiles"] == bytes_seed_files
    assert data["bytesStoredThumbnails"] == bytes_thumbnails
    assert data["bytesStoredDedupeIndexes"] == bytes_dedupe_indexes


def test_delete_org_non_superadmin(crawler_auth_headers, default_org_id):
    # Assert that non-superadmin can't delete org
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=crawler_auth_headers, timeout=120
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"


def test_delete_org_superadmin(admin_auth_headers, default_org_id):
    # Track items in org to ensure they're deleted later (we may want to expand
    # this, but currently only have the ability to check items across all orgs)
    item_ids = []

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        timeout=120,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    for item in data["items"]:
        item_ids.append(item["id"])

    # Delete org and its data
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers, timeout=120
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

    # Ensure org and items got deleted
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers, timeout=120
    )
    assert r.status_code == 404

    for item_id in item_ids:
        r = requests.get(
            f"{API_PREFIX}/orgs/all/all-crawls/{item_id}/replay.json",
            headers=admin_auth_headers,
            timeout=120,
        )
        assert r.status_code == 404
