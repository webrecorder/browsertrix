import pytest
import requests
from uuid import uuid4

from .conftest import API_PREFIX

# TODO: build these tests in a way that doesn't rely on `dedupe-enabled`


@pytest.fixture(autouse=True)
def cleanup_feature_flags(admin_auth_headers):
    """
    Autouse fixture to ensure feature flags are in a clean state before each test.
    This runs before each test to prevent state pollution between tests.
    """
    # Reset all feature flags for all organizations by setting empty org list
    feature_name = "dedupe-enabled"
    try:
        requests.patch(
            f"{API_PREFIX}/flags/{feature_name}/orgs",
            headers=admin_auth_headers,
            json={"orgs": []},
            timeout=10,
        )
    except Exception as e:
        # Log but don't fail if cleanup fails
        print(f"Warning: Feature flag cleanup failed: {e}")

    yield

    # Cleanup after test as well to ensure clean state
    try:
        requests.patch(
            f"{API_PREFIX}/flags/{feature_name}/orgs",
            headers=admin_auth_headers,
            json={"orgs": []},
            timeout=10,
        )
    except Exception as e:
        print(f"Warning: Feature flag cleanup failed: {e}")


def test_get_metadata(admin_auth_headers):
    """Test getting metadata about all feature flags"""
    r = requests.get(
        f"{API_PREFIX}/flags/metadata",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0

    # Check structure of metadata
    for flag in data:
        assert "name" in flag
        assert "description" in flag
        assert "owner" in flag
        assert "scope" in flag
        assert "defaultValue" in flag
        assert "count" in flag
        assert isinstance(flag["count"], int)
        assert flag["count"] >= 0


def test_get_metadata_viewer_forbidden(viewer_auth_headers):
    """Test that non-superuser cannot access metadata endpoint"""
    r = requests.get(
        f"{API_PREFIX}/flags/metadata",
        headers=viewer_auth_headers,
        timeout=10,
    )
    assert r.status_code == 403


def test_get_feature_flag_default(admin_auth_headers, default_org_id):
    """Test checking the default value of a feature flag for an organization"""
    feature_name = "dedupe-enabled"
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    # Default value should be False based on FLAG_METADATA
    assert data is False


def test_get_feature_flag_viewer_forbidden(viewer_auth_headers, default_org_id):
    """Test that non-superuser cannot check feature flag for org"""
    feature_name = "dedupe-enabled"
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=viewer_auth_headers,
        timeout=10,
    )
    assert r.status_code == 403


def test_get_feature_flag_nonexistent_org(admin_auth_headers):
    """Test checking feature flag for non-existent organization"""
    nonexistent_org_id = str(uuid4())
    feature_name = "dedupe-enabled"
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{nonexistent_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 404


def test_set_feature_flag(admin_auth_headers, default_org_id):
    """Test setting a feature flag for an organization"""
    feature_name = "dedupe-enabled"

    # Verify initial state is False
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is False

    # Set the flag to True
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["feature"] == feature_name
    assert data["updated"] is True

    # Verify the flag was set to True
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is True

    # Set the flag back to False
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": False},
        timeout=10,
    )
    assert r.status_code == 200

    # Verify the flag was set back to False
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is False


def test_set_feature_flag_viewer_forbidden(viewer_auth_headers, default_org_id):
    """Test that non-superuser cannot set feature flag for org"""
    feature_name = "dedupe-enabled"
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=viewer_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 403


def test_set_feature_flag_nonexistent_org(admin_auth_headers):
    """Test setting feature flag for non-existent organization"""
    nonexistent_org_id = str(uuid4())
    feature_name = "dedupe-enabled"
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{nonexistent_org_id}",
        headers=admin_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 404


def test_get_orgs_for_feature_flag(admin_auth_headers, default_org_id):
    """Test getting all organizations that have a feature flag set"""
    feature_name = "dedupe-enabled"

    # Verify initial state - no orgs should have the flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    initial_orgs = r.json()
    assert isinstance(initial_orgs, list)

    # Set the flag for the default org
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 200

    # Get all orgs with the flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)

    # Verify count increased by 1 (only default org was added)
    assert len(data) == len(initial_orgs) + 1

    # Verify default org is in the list
    org_ids = [org["id"] for org in data]
    assert default_org_id in org_ids


def test_get_orgs_for_feature_flag_viewer_forbidden(viewer_auth_headers):
    """Test that non-superuser cannot get orgs list for feature flag"""
    feature_name = "dedupe-enabled"
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=viewer_auth_headers,
        timeout=10,
    )
    assert r.status_code == 403


def test_set_orgs_for_feature_flag(
    admin_auth_headers, default_org_id, non_default_org_id
):
    """Test setting feature flag for multiple organizations"""
    feature_name = "dedupe-enabled"

    # Get initial count
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    initial_orgs = r.json()
    initial_count = len(initial_orgs)

    # Set the flag for both orgs
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        json={"orgs": [default_org_id, non_default_org_id]},
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["feature"] == feature_name
    assert data["updated"] is True

    # Verify both orgs have the flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    orgs_with_flag = r.json()
    org_ids_with_flag = [org["id"] for org in orgs_with_flag]
    assert default_org_id in org_ids_with_flag
    assert non_default_org_id in org_ids_with_flag

    # Verify count is initial count + 2 (added two orgs)
    assert len(orgs_with_flag) == initial_count + 2

    # Set flag for only default org (this should unset it for non_default)
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        json={"orgs": [default_org_id]},
        timeout=10,
    )
    assert r.status_code == 200

    # Verify count is back to initial count + 1 (only default org)
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    orgs_with_flag = r.json()
    assert len(orgs_with_flag) == initial_count + 1

    # Verify non_default org no longer has the flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{non_default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.json() is False


def test_set_orgs_for_feature_flag_viewer_forbidden(viewer_auth_headers):
    """Test that non-superuser cannot set feature flag for multiple orgs"""
    feature_name = "dedupe-enabled"
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=viewer_auth_headers,
        json={"orgs": []},
        timeout=10,
    )
    assert r.status_code == 403


def test_metadata_counts_update(admin_auth_headers, default_org_id):
    """Test that metadata counts are updated when flags are set"""
    feature_name = "dedupe-enabled"

    # Get initial metadata
    r = requests.get(
        f"{API_PREFIX}/flags/metadata",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    initial_data = r.json()
    initial_flag_data = next(
        (f for f in initial_data if f["name"] == feature_name), None
    )
    assert initial_flag_data is not None
    initial_count = initial_flag_data["count"]

    # Verify flag is currently False for the org
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is False

    # Set flag for an org
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 200

    # Get updated metadata
    r = requests.get(
        f"{API_PREFIX}/flags/metadata",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    updated_data = r.json()
    updated_flag_data = next(
        (f for f in updated_data if f["name"] == feature_name), None
    )
    assert updated_flag_data is not None
    updated_count = updated_flag_data["count"]

    # Verify count increased by exactly 1
    assert updated_count == initial_count + 1

    # Unset flag
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": False},
        timeout=10,
    )
    assert r.status_code == 200

    # Verify count decreased by exactly 1
    r = requests.get(
        f"{API_PREFIX}/flags/metadata",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    final_data = r.json()
    final_flag_data = next((f for f in final_data if f["name"] == feature_name), None)
    assert final_flag_data is not None
    final_count = final_flag_data["count"]
    assert final_count == initial_count


def test_invalid_feature_name(admin_auth_headers, default_org_id):
    """Test accessing endpoints with invalid feature name"""
    invalid_feature = "non-existent-feature"

    # Test GET endpoint
    r = requests.get(
        f"{API_PREFIX}/flags/{invalid_feature}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 422  # Unprocessable Entity for invalid enum value

    # Test PATCH org endpoint
    r = requests.patch(
        f"{API_PREFIX}/flags/{invalid_feature}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 422

    # Test GET orgs endpoint
    r = requests.get(
        f"{API_PREFIX}/flags/{invalid_feature}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 422

    # Test PATCH orgs endpoint
    r = requests.patch(
        f"{API_PREFIX}/flags/{invalid_feature}/orgs",
        headers=admin_auth_headers,
        json={"orgs": []},
        timeout=10,
    )
    assert r.status_code == 422


def test_set_feature_flag_idempotent(admin_auth_headers, default_org_id):
    """Test that setting a feature flag to the same value multiple times is idempotent"""
    feature_name = "dedupe-enabled"

    # Verify initial state is False
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is False

    # Set flag to True
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["feature"] == feature_name
    assert data["updated"] is True

    # Verify flag is True
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is True

    # Set flag to True again (should be idempotent)
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        json={"value": True},
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["feature"] == feature_name
    assert data["updated"] is True

    # Verify flag is still True (unchanged)
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is True


def test_set_orgs_for_feature_flag_empty_list(
    admin_auth_headers, default_org_id, non_default_org_id
):
    """Test that setting feature flag with empty org list unsets flag for all orgs"""
    feature_name = "dedupe-enabled"

    # Set flag for both orgs
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        json={"orgs": [default_org_id, non_default_org_id]},
        timeout=10,
    )
    assert r.status_code == 200

    # Verify both orgs have the flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    orgs_with_flag = r.json()
    assert len(orgs_with_flag) >= 2

    # Set flag with empty list (should unset for all orgs)
    r = requests.patch(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        json={"orgs": []},
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["feature"] == feature_name
    assert data["updated"] is True

    # Verify no orgs have the flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/orgs",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    orgs_with_flag = r.json()
    assert len(orgs_with_flag) == 0

    # Verify default org no longer has flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is False

    # Verify non_default org no longer has flag
    r = requests.get(
        f"{API_PREFIX}/flags/{feature_name}/org/{non_default_org_id}",
        headers=admin_auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() is False
