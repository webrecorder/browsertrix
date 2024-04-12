from .conftest import API_PREFIX, HOST_PREFIX
import requests
import time
from datetime import datetime

import pytest

MAX_ATTEMPTS = 24


@pytest.fixture(scope="module")
def qa_run_id(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/start",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 200

    data = r.json()
    qa_run_id = data["started"]
    assert qa_run_id
    return qa_run_id


@pytest.fixture(scope="module")
def qa_run_pages_ready(
    crawler_crawl_id, crawler_auth_headers, default_org_id, qa_run_id
):
    # Wait until activeQA is finished
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/activeQA",
            headers=crawler_auth_headers,
        )

        data = r.json()
        if not data["qa"]:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1

    # Wait until pages are ready
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/pages",
            headers=crawler_auth_headers,
        )
        if len(r.json()["items"]) > 0:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1


@pytest.fixture(scope="module")
def failed_qa_run_id(crawler_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/start",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 200

    data = r.json()
    failed_qa_run_id = data["started"]
    assert failed_qa_run_id

    # Wait until it's properly running
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/activeQA",
            headers=crawler_auth_headers,
        )

        data = r.json()
        if data.get("qa") and data["qa"].get("state") == "running":
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1

    # Ensure can't start another QA job while this one's running
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/start",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "qa_already_running"

    # Ensure activeQA responds as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/activeQA",
        headers=crawler_auth_headers,
    )

    data = r.json()
    qa = data["qa"]

    assert qa
    assert qa["state"]
    assert qa["started"]
    assert not qa["finished"]

    # Cancel crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/cancel",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    # Wait until it stops with canceled state
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/pages",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data.get("state") == "canceled":
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1

    return failed_qa_run_id


def test_qa_list(
    crawler_crawl_id, crawler_auth_headers, default_org_id, qa_run_pages_ready
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
        headers=crawler_auth_headers,
    )

    data = r.json()

    assert len(data) == 1

    qa = data[0]
    assert qa
    assert qa["state"]
    assert qa["started"]
    assert not qa["finished"]


def test_qa_completed(
    crawler_crawl_id, crawler_auth_headers, default_org_id, qa_run_pages_ready
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
        headers=crawler_auth_headers,
    )

    data = r.json()

    assert len(data) == 1

    qa = data[0]
    assert qa
    assert qa["state"] == "complete"
    assert qa["started"]
    assert qa["finished"]
    assert qa["stats"]["found"] == 1
    assert qa["stats"]["done"] == 1
    assert qa["crawlExecSeconds"] > 0


def test_qa_org_stats(
    crawler_crawl_id, crawler_auth_headers, default_org_id, qa_run_pages_ready
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}",
        headers=crawler_auth_headers,
    )
    crawl_stats = r.json()
    assert crawl_stats["qaCrawlExecSeconds"] > 0

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=crawler_auth_headers,
    )
    org_stats = r.json()

    yymm = datetime.utcnow().strftime("%Y-%m")
    assert org_stats["qaCrawlExecSeconds"][yymm] > 0
    assert org_stats["qaUsage"][yymm] > 0


def test_qa_page_data(
    crawler_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_id,
    qa_run_pages_ready,
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/pages",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert len(data["items"]) == 1
    page = data["items"][0]

    page_id = page["id"]
    assert page_id

    assert page["title"] == "Webrecorder"
    assert page["url"] == "https://webrecorder.net/"
    assert page["qa"]["textMatch"] == 1.0
    assert page["qa"]["screenshotMatch"] == 1.0
    assert page["qa"]["resourceCounts"] == {
        "crawlGood": 15,
        "crawlBad": 0,
        "replayGood": 15,
        "replayBad": 1,
    }

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    page = r.json()
    assert page["id"]
    assert page["title"] == "Webrecorder"
    assert page["url"] == "https://webrecorder.net/"
    assert page["qa"]["textMatch"] == 1.0
    assert page["qa"]["screenshotMatch"] == 1.0
    assert page["qa"]["resourceCounts"] == {
        "crawlGood": 15,
        "crawlBad": 0,
        "replayGood": 15,
        "replayBad": 1,
    }


def test_qa_replay(
    crawler_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_id,
    qa_run_pages_ready,
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run_id}/replay.json",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]


def test_run_qa_not_running(
    crawler_crawl_id, crawler_auth_headers, default_org_id, failed_qa_run_id
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/stop",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "qa_not_running"


def test_failed_qa_run(
    crawler_crawl_id,
    crawler_auth_headers,
    default_org_id,
    failed_qa_run_id,
    qa_run_pages_ready,
):
    # Ensure failed QA run is included in list endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
        headers=crawler_auth_headers,
    )

    data = r.json()

    assert len(data) == 2

    failed_run = [qa_run for qa_run in data if qa_run.get("id") == failed_qa_run_id][0]
    assert failed_run
    assert failed_run["state"] == "canceled"
    assert failed_run["started"]
    assert failed_run["finished"]
    assert failed_run["stats"]
    assert failed_run["crawlExecSeconds"] >= 0

    # Ensure failed QA run not included in list endpoint with skipFailed param
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa?skipFailed=true",
        headers=crawler_auth_headers,
    )

    data = r.json()

    assert len(data) == 1

    qa = data[0]
    assert qa
    assert qa["state"] == "complete"
    assert qa["started"]
    assert qa["finished"]
    assert qa["stats"]["found"] == 1
    assert qa["stats"]["done"] == 1
    assert qa["crawlExecSeconds"] > 0


def test_delete_qa_runs(
    crawler_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_pages_ready,
    failed_qa_run_id,
):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/delete",
        json={"qa_run_ids": [qa_run_id, failed_qa_run_id]},
        headers=crawler_auth_headers,
    )

    assert r.status_code == 200
    assert r.json()["deleted"] == 2

    # Wait for QA runs and their pages to be deleted
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
            headers=crawler_auth_headers,
        )

        data = r.json()
        if data.get("count") == 0:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1

    # Ensure runs are deleted from finished qa list
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["count"] == 0
    assert len(data["items"]) == 0

    # Ensure associated files are also deleted
    for qa_run in (qa_run_id, failed_qa_run_id):
        count = 0
        while count < MAX_ATTEMPTS:
            r = requests.get(
                f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawler_crawl_id}/qa/{qa_run}/pages",
                headers=crawler_auth_headers,
            )
            data = r.json()
            if data["count"] == 0 and len(data["items"]) == 0:
                break

            if count + 1 == MAX_ATTEMPTS:
                assert False

            time.sleep(5)
            count += 1
