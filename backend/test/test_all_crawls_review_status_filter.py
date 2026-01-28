import requests
import pytest
import time
import itertools

from .conftest import API_PREFIX, FINISHED_STATES

sample_crawl_index = itertools.count(1)


def get_sample_crawl_data():
    index = next(sample_crawl_index)
    data = {
        "runNow": True,
        "name": f"Test Crawl for Review Status {index}",
        "config": {"seeds": [{"url": "https://example-com.webrecorder.net/"}]},
    }
    return data


@pytest.fixture(scope="module")
def crawl_id_1(admin_auth_headers, default_org_id):
    # Create a crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(),
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"]

    crawlconfig_id = data["id"]
    crawl_id = data["run_now_job"]

    print(
        f"Created crawlconfig 1 with ID {crawlconfig_id} and crawl with ID {crawl_id}"
    )

    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(2)

    # Set review status to 1
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}",
        headers=admin_auth_headers,
        json={"reviewStatus": 1},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Verify review status was updated
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["reviewStatus"] == 1

    yield crawl_id

    # Cleanup
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [crawl_id]},
    )
    assert r.status_code == 200

    # wait for cleanup to complete
    time.sleep(2)

    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawlconfig_id}"
    )
    assert r.status_code == 200
    assert r.text == "deactivated"


@pytest.fixture(scope="module")
def crawl_id_2(admin_auth_headers, default_org_id):
    # Create a crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(),
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"]

    crawlconfig_id = data["id"]
    crawl_id = data["run_now_job"]

    print(
        f"Created crawlconfig 2 with ID {crawlconfig_id} and crawl with ID {crawl_id}"
    )

    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(2)

    # Set review status to 3
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}",
        headers=admin_auth_headers,
        json={"reviewStatus": 3},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Verify review status was updated
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["reviewStatus"] == 3

    yield crawl_id

    # Cleanup
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [crawl_id]},
    )
    assert r.status_code == 200

    # wait for cleanup to complete
    time.sleep(2)

    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawlconfig_id}"
    )
    assert r.status_code == 200
    assert r.text == "deactivated"


@pytest.fixture(scope="module")
def crawl_id_3(admin_auth_headers, default_org_id):
    # Create a crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=get_sample_crawl_data(),
    )

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["id"]
    assert data["run_now_job"]

    crawlconfig_id = data["id"]
    crawl_id = data["run_now_job"]

    print(
        f"Created crawlconfig 3 with ID {crawlconfig_id} and crawl with ID {crawl_id}"
    )

    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] in FINISHED_STATES:
            break
        time.sleep(2)

    # Set review status to 5
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}",
        headers=admin_auth_headers,
        json={"reviewStatus": 5},
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Verify review status was updated
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["reviewStatus"] == 5

    yield crawl_id

    # Cleanup
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [crawl_id]},
    )
    assert r.status_code == 200

    # wait for cleanup to complete
    time.sleep(2)

    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{crawlconfig_id}"
    )
    assert r.status_code == 200
    assert r.text == "deactivated"


def test_filter_by_single_review_status(admin_auth_headers, default_org_id, crawl_id_1):
    # Test filtering by a single review status value
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        params={"reviewStatus": [1]},
    )
    assert r.status_code == 200
    data = r.json()

    # Should find at least one config with review status 1
    assert data["total"] >= 1
    found_crawl = False
    for crawl in data["items"]:
        if crawl["id"] == crawl_id_1:
            assert crawl["reviewStatus"] == 1
            found_crawl = True
        # All returned crawls should have review status 1
        assert crawl["reviewStatus"] == 1
    assert found_crawl


def test_filter_by_review_status_range(
    admin_auth_headers, default_org_id, crawl_id_1, crawl_id_2, crawl_id_3
):
    # Test filtering by a range of review statuses (1-3)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        params={"reviewStatus": [1, 3]},
    )
    assert r.status_code == 200
    data = r.json()

    # Should find crawls with review status 1, 2, or 3
    assert data["total"] >= 2
    found_crawls = {"crawl1": False, "crawl2": False, "crawl3": False}
    for crawl in data["items"]:
        if crawl["id"] == crawl_id_1:
            assert crawl["reviewStatus"] == 1
            found_crawls["crawl1"] = True
        elif crawl["id"] == crawl_id_2:
            assert crawl["reviewStatus"] == 3
            found_crawls["crawl2"] = True
        elif crawl["id"] == crawl_id_3:
            # crawl_3 has review status 5, which is outside the range 1-3
            assert False, "crawl_id_3 should not be in the results"
        # All returned crawls should have review status in the range [1, 3]
        assert 1 <= crawl["reviewStatus"] <= 3

    assert found_crawls["crawl1"] and found_crawls["crawl2"]


def test_filter_by_review_status_wide_range(
    admin_auth_headers, default_org_id, crawl_id_1, crawl_id_2, crawl_id_3
):
    # Test filtering by a wide range of review statuses (1-5)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        params={"reviewStatus": [1, 5]},
    )
    assert r.status_code == 200
    data = r.json()

    # Should find all our test crawls
    assert data["total"] >= 3
    found_crawls = {"crawl1": False, "crawl2": False, "crawl3": False}
    for crawl in data["items"]:
        if crawl["id"] == crawl_id_1:
            assert crawl["reviewStatus"] == 1
            found_crawls["crawl1"] = True
        elif crawl["id"] == crawl_id_2:
            assert crawl["reviewStatus"] == 3
            found_crawls["crawl2"] = True
        elif crawl["id"] == crawl_id_3:
            assert crawl["reviewStatus"] == 5
            found_crawls["crawl3"] = True
        # All returned crawls should have review status in the range [1, 5]
        assert 1 <= crawl["reviewStatus"] <= 5

    assert found_crawls["crawl1"] and found_crawls["crawl2"] and found_crawls["crawl3"]


def test_filter_by_nonexistent_review_status(admin_auth_headers, default_org_id):
    # Test filtering by a review status that none of our crawls have (e.g., 2)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        params={"reviewStatus": [2]},
    )
    assert r.status_code == 200
    data = r.json()

    # The specific crawls we created don't have review status 2, but there might be other crawls
    # Just verify that all returned crawls have review status 2
    for crawl in data["items"]:
        assert crawl["reviewStatus"] == 2


def test_invalid_review_status_too_low(admin_auth_headers, default_org_id):
    # Test filtering by an invalid review status (0 - below minimum)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        params={"reviewStatus": [0]},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_qa_review_range"


def test_invalid_review_status_too_high(admin_auth_headers, default_org_id):
    # Test filtering by an invalid review status (6 - above maximum)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        params={"reviewStatus": [6]},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_qa_review_range"


def test_invalid_review_status_too_many_values(admin_auth_headers, default_org_id):
    # Test filtering by too many review status values (more than 2)
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls",
        headers=admin_auth_headers,
        params={"reviewStatus": [1, 2, 3]},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_qa_review_range"
