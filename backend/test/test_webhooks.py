import json
import os
import time

import requests

from .conftest import API_PREFIX
from .utils import read_in_chunks

_webhook_event_id = None

curr_dir = os.path.dirname(os.path.realpath(__file__))

ECHO_SERVER_URL = "http://localhost:18080"

# Pull address to echo server running on host from CI env var.
# If not set, default to host.docker.internal (for local testing with
# Docker Desktop).
ECHO_SERVER_URL_FROM_K8S = os.environ.get(
    "ECHO_SERVER_HOST_URL", "http://host.docker.internal:18080"
)


def test_list_webhook_events(admin_auth_headers, default_org_id):
    # Verify that webhook URLs have been set in previous tests
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    urls = data["webhookUrls"]
    assert urls["crawlStarted"]
    assert urls["crawlFinished"]
    assert urls["crawlDeleted"]
    assert urls["uploadFinished"]
    assert urls["uploadDeleted"]
    assert urls["addedToCollection"]
    assert urls["removedFromCollection"]
    assert urls["collectionDeleted"]

    # Verify list endpoint works as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/webhooks",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    for item in data["items"]:
        assert item["id"]
        assert item["event"]
        assert item["oid"]
        assert item["body"]
        assert item["success"] is False
        assert item["attempts"] == 1
        assert item["created"]
        assert item["lastAttempted"]

    global _webhook_event_id
    _webhook_event_id = data["items"][0]["id"]
    assert _webhook_event_id


def test_get_webhook_event(admin_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/webhooks/{_webhook_event_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    item = r.json()

    assert item["id"]
    assert item["oid"]
    assert item["success"] is False
    assert item["attempts"] == 1
    assert item["created"]
    assert item["lastAttempted"]

    body = item["body"]
    assert body

    event = item["event"]
    assert event

    if event in ("crawlFinished", "uploadFinished"):
        assert len(body["resources"]) >= 1
        assert body["resources"][0]["expireAt"]
        assert body["itemId"]

    elif event in ("crawlStarted"):
        assert len(body.get("resources", [])) == 0
        assert body["itemId"]

    elif event in ("addedToCollection", "removedFromCollection"):
        assert len(body.get("resources", [])) == 0
        assert body["downloadUrl"]
        assert body["collectionId"]
        assert len(body["itemIds"]) >= 1


def test_retry_webhook_event(admin_auth_headers, default_org_id):
    # Expect to fail because we haven't set up URLs that accept webhooks
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/webhooks/{_webhook_event_id}/retry",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Give it some time to run with exponential backoff retries
    time.sleep(90)

    # Verify attempts have been increased
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/webhooks/{_webhook_event_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    item = r.json()
    assert item["id"]
    assert item["event"]
    assert item["oid"]
    assert item["body"]
    assert item["success"] is False
    assert item["attempts"] == 2
    assert item["created"]
    assert item["lastAttempted"]


def test_webhooks_sent(
    admin_auth_headers,
    default_org_id,
    all_crawls_crawl_id,
    echo_server,
):
    # Reconfigure event webhooks to use echo server
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/event-webhook-urls",
        headers=admin_auth_headers,
        json={
            "crawlStarted": ECHO_SERVER_URL_FROM_K8S,
            "crawlFinished": ECHO_SERVER_URL_FROM_K8S,
            "crawlDeleted": ECHO_SERVER_URL_FROM_K8S,
            "qaAnalysisStarted": ECHO_SERVER_URL_FROM_K8S,
            "qaAnalysisFinished": ECHO_SERVER_URL_FROM_K8S,
            "crawlReviewed": ECHO_SERVER_URL_FROM_K8S,
            "uploadFinished": ECHO_SERVER_URL_FROM_K8S,
            "uploadDeleted": ECHO_SERVER_URL_FROM_K8S,
            "addedToCollection": ECHO_SERVER_URL_FROM_K8S,
            "removedFromCollection": ECHO_SERVER_URL_FROM_K8S,
            "collectionDeleted": ECHO_SERVER_URL_FROM_K8S,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    # Create collection with all_crawls_crawl_id already in it
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections",
        headers=admin_auth_headers,
        json={
            "name": "Event webhooks test collection",
            "crawlIds": [all_crawls_crawl_id],
        },
    )
    assert r.status_code == 200
    webhooks_coll_id = r.json()["id"]
    assert webhooks_coll_id

    # Create and run workflow that adds crawl to collection
    crawl_data = {
        "runNow": True,
        "name": "Webhook crawl test",
        "autoAddCollections": [webhooks_coll_id],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/"}],
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    assert r.status_code == 200
    data = r.json()
    webhooks_config_id = data["id"]
    assert webhooks_config_id
    webhooks_crawl_id = data["run_now_job"]

    # Wait for crawl to complete
    while True:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{webhooks_crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            break
        time.sleep(5)

    # Run QA analysis on crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{webhooks_crawl_id}/qa/start",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200

    qa_run_id = r.json()["started"]

    # Wait for QA to complete
    count = 0
    max_attempts = 24
    while count < max_attempts:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawls/{webhooks_crawl_id}/qa/activeQA",
            headers=admin_auth_headers,
        )

        data = r.json()
        if not data["qa"]:
            break

        if count + 1 == max_attempts:
            assert False

        time.sleep(5)
        count += 1

    # Review crawl
    r = requests.patch(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{webhooks_crawl_id}",
        headers=admin_auth_headers,
        json={"reviewStatus": 5, "description": "Perfect crawl"},
    )
    assert r.status_code == 200

    # Create upload and add to collection
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=webhookstest.wacz&name=Webhooks%20Upload&collections={webhooks_coll_id}",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    webhooks_upload_id = data["id"]

    # Remove upload from collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{webhooks_coll_id}/remove",
        json={"crawlIds": [webhooks_upload_id]},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"]

    # Delete upload
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/uploads/delete",
        json={"crawl_ids": [webhooks_upload_id]},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    # Remove crawls from collection
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{webhooks_coll_id}/remove",
        json={"crawlIds": [webhooks_crawl_id, all_crawls_crawl_id]},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"]

    # Delete crawl
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        json={"crawl_ids": [webhooks_crawl_id]},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["deleted"]

    # Delete collection
    r = requests.delete(
        f"{API_PREFIX}/orgs/{default_org_id}/collections/{webhooks_coll_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200

    # Wait to ensure async notifications are all sent
    time.sleep(30)

    # Send GET request to echo server to retrieve and verify POSTed data
    r = requests.get(ECHO_SERVER_URL)
    assert r.status_code == 200

    data = r.json()

    crawl_started_count = 0
    crawl_finished_count = 0
    crawl_deleted_count = 0
    qa_analysis_started_count = 0
    qa_analysis_finished_count = 0
    crawl_reviewed_count = 0
    upload_finished_count = 0
    upload_deleted_count = 0
    added_to_collection_count = 0
    removed_from_collection_count = 0
    collection_deleted_count = 0

    for post in data["post_bodies"]:
        assert post["orgId"]
        event = post["event"]
        assert event

        if event == "crawlStarted":
            crawl_started_count += 1
            assert post["itemId"]
            assert post["scheduled"] in (True, False)
            assert post.get("resources") is None

        elif event == "crawlFinished":
            crawl_finished_count += 1
            assert post["itemId"]
            assert post["state"]
            assert post["resources"]

        elif event == "crawlDeleted":
            crawl_deleted_count += 1
            assert post["itemId"]

        elif event == "qaAnalysisStarted":
            qa_analysis_started_count += 1
            assert post["itemId"] == webhooks_crawl_id
            assert post["qaRunId"] == qa_run_id

        elif event == "qaAnalysisFinished":
            qa_analysis_finished_count += 1
            assert post["itemId"] == webhooks_crawl_id
            assert post["qaRunId"] == qa_run_id
            assert post["resources"]

        elif event == "crawlReviewed":
            crawl_reviewed_count += 1
            assert post["itemId"] == webhooks_crawl_id

        elif event == "uploadFinished":
            upload_finished_count += 1
            assert post["itemId"]
            assert post["state"]
            assert post["resources"]
            assert post.get("downloadUrls") is None

        elif event == "uploadDeleted":
            upload_deleted_count += 1
            assert post["itemId"]

        elif event == "addedToCollection":
            added_to_collection_count += 1
            assert post["downloadUrl"]
            assert post.get("resources") is None
            assert post["itemIds"]
            assert post["collectionId"]

        elif event == "removedFromCollection":
            removed_from_collection_count += 1
            assert post["downloadUrl"]
            assert post.get("resources") is None
            assert post["itemIds"]
            assert post["collectionId"]

        elif event == "collectionDeleted":
            collection_deleted_count += 1
            assert post["collectionId"]

    # Allow for some variability here due to timing of crawls
    assert crawl_started_count >= 1
    assert crawl_finished_count >= 1
    assert crawl_deleted_count == 1
    assert qa_analysis_started_count == 1
    assert qa_analysis_finished_count == 1
    assert crawl_reviewed_count == 1
    assert upload_finished_count == 1
    assert upload_deleted_count == 1
    assert added_to_collection_count >= 2
    assert removed_from_collection_count == 2
    assert collection_deleted_count == 1

    # Check that we've had expected number of successful webhook notifications
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/webhooks?success=True",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["total"] >= 10
