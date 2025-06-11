from .conftest import API_PREFIX, HOST_PREFIX
import requests
import time
from datetime import datetime
from tempfile import TemporaryFile
from zipfile import ZipFile, ZIP_STORED

import pytest

MAX_ATTEMPTS = 24


@pytest.fixture(scope="module")
def qa_run_id(qa_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/start",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 200

    data = r.json()
    qa_run_id = data["started"]
    assert qa_run_id
    return qa_run_id


@pytest.fixture(scope="module")
def qa_run_pages_ready(qa_crawl_id, crawler_auth_headers, default_org_id, qa_run_id):
    # Wait until activeQA is finished
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/activeQA",
            headers=crawler_auth_headers,
        )

        data = r.json()
        if not data["qa"]:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(10)
        count += 1

    # Wait until pages are ready
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/pages",
            headers=crawler_auth_headers,
        )
        if len(r.json()["items"]) > 0:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1


@pytest.fixture(scope="module")
def failed_qa_run_id(qa_crawl_id, crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/start",
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
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/activeQA",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/start",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "qa_already_running"

    # Ensure activeQA responds as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/activeQA",
        headers=crawler_auth_headers,
    )

    data = r.json()
    qa = data["qa"]

    assert qa
    assert qa["state"]
    assert qa["started"]
    assert not qa["finished"]

    # Ensure sorting by lastQAState works as expected - current floated to top
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=lastQAState",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[0]["id"] == qa_crawl_id
    assert crawls[0]["activeQAStats"]
    assert crawls[0]["lastQAState"]
    assert crawls[0]["lastQAStarted"]

    # Ensure sorting by lastQAState works as expected with all-crawls
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=lastQAState",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[0]["id"] == qa_crawl_id
    assert crawls[0]["activeQAStats"]
    assert crawls[0]["lastQAState"]
    assert crawls[0]["lastQAStarted"]

    # Ensure sorting by lastQAStarted works as expected - current floated to top
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=lastQAStarted",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[0]["id"] == qa_crawl_id
    assert crawls[0]["activeQAStats"]
    assert crawls[0]["lastQAState"]
    assert crawls[0]["lastQAStarted"]

    # Ensure sorting by lastQAState works as expected with all-crawls
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=lastQAStarted",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]
    assert crawls[0]["id"] == qa_crawl_id
    assert crawls[0]["activeQAStats"]
    assert crawls[0]["lastQAState"]
    assert crawls[0]["lastQAStarted"]

    # Cancel crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/cancel",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Wait for state to be changed
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa",
            headers=crawler_auth_headers,
        )
        assert r.status_code == 200

        data = r.json()
        matching_runs = [
            qa_run for qa_run in data if qa_run.get("id") == failed_qa_run_id
        ]
        if matching_runs:
            matching_run = matching_runs[0]
            if matching_run.get("state") == "canceled":
                break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1

    return failed_qa_run_id


def test_qa_completed(
    qa_crawl_id, crawler_auth_headers, default_org_id, qa_run_pages_ready
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa",
        headers=crawler_auth_headers,
    )

    data = r.json()

    assert len(data) >= 1

    for qa in data:
        assert qa
        assert qa["state"]
        assert qa["started"]
        assert qa["finished"]
        assert qa["stats"]["found"] == 1
        assert qa["stats"]["done"] == 1
        assert qa["crawlExecSeconds"] > 0


def test_qa_org_stats(
    qa_crawl_id, crawler_auth_headers, default_org_id, qa_run_pages_ready
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}",
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
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_id,
    qa_run_pages_ready,
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/pages",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    page = data["items"][0]

    page_id = page["id"]
    assert page_id

    assert page["title"] == "Webrecorder"
    assert page["url"] == "https://old.webrecorder.net/"
    assert page["mime"] == "text/html"
    assert page["status"] == 200
    assert page["qa"]["textMatch"] == 1.0
    assert page["qa"]["screenshotMatch"] == 1.0
    assert page["qa"]["resourceCounts"] == {
        "crawlGood": 14,
        "crawlBad": 0,
        "replayGood": 13,
        "replayBad": 1,
    }

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/pages/{page_id}",
        headers=crawler_auth_headers,
    )
    page = r.json()
    assert page["id"]
    assert page["title"] == "Webrecorder"
    assert page["url"] == "https://old.webrecorder.net/"
    assert page["mime"] == "text/html"
    assert page["status"] == 200
    assert page["qa"]["textMatch"] == 1.0
    assert page["qa"]["screenshotMatch"] == 1.0
    assert page["qa"]["resourceCounts"] == {
        "crawlGood": 14,
        "crawlBad": 0,
        "replayGood": 13,
        "replayBad": 1,
    }


def test_qa_replay(
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_id,
    qa_run_pages_ready,
):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/replay.json",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]


def test_qa_stats(
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_id,
    qa_run_pages_ready,
):
    # We'll want to improve this test by having more pages to test
    # if we can figure out stable page scores to test against
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/stats?screenshotThresholds=0.7,0.9&textThresholds=0.7,0.9",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["screenshotMatch"] == [
        {"lowerBoundary": "0.0", "count": 0},
        {"lowerBoundary": "0.7", "count": 0},
        {"lowerBoundary": "0.9", "count": 1},
    ]
    assert data["textMatch"] == [
        {"lowerBoundary": "0.0", "count": 0},
        {"lowerBoundary": "0.7", "count": 0},
        {"lowerBoundary": "0.9", "count": 1},
    ]

    # Test we get expected results with explicit 0 boundary
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/stats?screenshotThresholds=0,0.7,0.9&textThresholds=0,0.7,0.9",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200

    data = r.json()
    assert data["screenshotMatch"] == [
        {"lowerBoundary": "0.0", "count": 0},
        {"lowerBoundary": "0.7", "count": 0},
        {"lowerBoundary": "0.9", "count": 1},
    ]
    assert data["textMatch"] == [
        {"lowerBoundary": "0.0", "count": 0},
        {"lowerBoundary": "0.7", "count": 0},
        {"lowerBoundary": "0.9", "count": 1},
    ]

    # Test that missing threshold values result in 422 HTTPException
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/stats?screenshotThresholds=0.7",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 422
    assert r.json()["detail"][0]["msg"] == "Field required"

    # Test that invalid threshold values result in 400 HTTPException
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/stats?screenshotThresholds=0.7&textThresholds=null",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_thresholds"


def test_run_qa_not_running(
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    failed_qa_run_id,
    qa_run_pages_ready,
):
    # Make sure no active QA is running
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/activeQA",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data.get("qa") is None:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1

    # Try to stop when there's no running QA run
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/stop",
        headers=crawler_auth_headers,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "qa_not_running"


def test_failed_qa_run(
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    failed_qa_run_id,
    qa_run_pages_ready,
):
    # Ensure failed QA run is included in list endpoint
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa",
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
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa?skipFailed=true",
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


def test_sort_crawls_by_qa_runs(
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    failed_qa_run_id,
    qa_run_pages_ready,
):
    # Test that sorting by qaRunCount works as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=qaRunCount",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]

    assert crawls[0]["id"] == qa_crawl_id
    qa_run_count = crawls[0]["qaRunCount"]
    assert qa_run_count > 0

    last_count = qa_run_count
    for crawl in crawls:
        if crawl["id"] == qa_crawl_id:
            continue
        crawl_qa_count = crawl["qaRunCount"]
        assert isinstance(crawl_qa_count, int)
        assert crawl_qa_count <= last_count
        last_count = crawl_qa_count

    # Test ascending sort
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls?sortBy=qaRunCount&sortDirection=1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]

    assert crawls[-1]["id"] == qa_crawl_id
    assert crawls[-1]["qaRunCount"] > 0

    last_count = 0
    for crawl in crawls:
        if crawl["id"] == qa_crawl_id:
            continue
        crawl_qa_count = crawl["qaRunCount"]
        assert isinstance(crawl_qa_count, int)
        assert crawl_qa_count >= last_count
        last_count = crawl_qa_count

    # Test same with all-crawls
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=qaRunCount",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]

    assert crawls[0]["id"] == qa_crawl_id
    qa_run_count = crawls[0]["qaRunCount"]
    assert qa_run_count > 0

    last_count = qa_run_count
    for crawl in crawls:
        if crawl["id"] == qa_crawl_id:
            continue
        crawl_qa_count = crawl["qaRunCount"]
        assert isinstance(crawl_qa_count, int)
        assert crawl_qa_count <= last_count
        last_count = crawl_qa_count

    # Test ascending sort
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/all-crawls?sortBy=qaRunCount&sortDirection=1",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    crawls = r.json()["items"]

    assert crawls[-1]["id"] == qa_crawl_id
    assert crawls[-1]["qaRunCount"] > 0

    last_count = 0
    for crawl in crawls:
        if crawl["id"] == qa_crawl_id:
            continue
        crawl_qa_count = crawl["qaRunCount"]
        assert isinstance(crawl_qa_count, int)
        assert crawl_qa_count >= last_count
        last_count = crawl_qa_count


def test_download_wacz_crawls(
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_id,
    qa_run_pages_ready,
):
    with TemporaryFile() as fh:
        with requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/download",
            headers=crawler_auth_headers,
            stream=True,
        ) as r:
            assert r.status_code == 200
            for chunk in r.iter_content():
                fh.write(chunk)

        fh.seek(0)
        with ZipFile(fh, "r") as zip_file:
            contents = zip_file.namelist()

            assert len(contents) >= 2
            for filename in contents:
                assert filename.endswith(".wacz") or filename == "datapackage.json"
                assert zip_file.getinfo(filename).compress_type == ZIP_STORED


def test_delete_qa_runs(
    qa_crawl_id,
    crawler_auth_headers,
    default_org_id,
    qa_run_id,
    qa_run_pages_ready,
    failed_qa_run_id,
):
    # Get download links for QA WACZs
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run_id}/replay.json",
        headers=crawler_auth_headers,
    )
    data = r.json()
    assert len(data["resources"]) == 1
    qa_wacz_url = data["resources"][0]["path"]

    # Delete QA runs
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/delete",
        json={"qa_run_ids": [qa_run_id, failed_qa_run_id]},
        headers=crawler_auth_headers,
    )

    assert r.status_code == 200
    assert r.json()["deleted"] == 2

    # Wait for QA runs to be deleted
    count = 0
    while count < MAX_ATTEMPTS:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa",
            headers=crawler_auth_headers,
        )

        if len(r.json()) == 0:
            break

        if count + 1 == MAX_ATTEMPTS:
            assert False

        time.sleep(5)
        count += 1

    # Ensure QA WACZs was deleted
    r = requests.get(f"http://localhost:30870{qa_wacz_url}")
    assert r.status_code == 404

    # Ensure associated qa run information in pages is also deleted
    for qa_run in (qa_run_id, failed_qa_run_id):
        count = 0
        while count < MAX_ATTEMPTS:
            r = requests.get(
                f"{API_PREFIX}/orgs/{default_org_id}/crawls/{qa_crawl_id}/qa/{qa_run}/pages",
                headers=crawler_auth_headers,
            )
            data = r.json()

            pages_with_qa_run = [
                page
                for page in data["items"]
                if page.get("qa") and page.get("qa").get(qa_run)
            ]

            if not pages_with_qa_run:
                break

            if count + 1 == MAX_ATTEMPTS:
                assert False

            time.sleep(5)
            count += 1
