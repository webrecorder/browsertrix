import time

import requests

from .conftest import API_PREFIX

_webhook_event_id = None


def test_list_webhook_events(admin_auth_headers, default_org_id):
    # Verify that webhook URLs have been set in previous tests
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    urls = data["webhookUrls"]
    assert urls["itemCreatedUrl"]
    assert urls["addedToCollectionUrl"]
    assert urls["removedFromCollectionUrl"]

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

    if event == "archived-item-created":
        assert len(body["downloadUrls"]) >= 1
        assert body["itemId"]

    elif event in ("added-to-collection", "removed-from-collection"):
        assert len(body["downloadUrls"]) == 1
        assert body["collectionId"]
        assert len(body["itemIds"]) >= 1
        assert body["type"] in ("added", "removed")


def test_retry_webhook_event(admin_auth_headers, default_org_id):
    # Expect to fail because we haven't set up URLs that accept webhooks
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/webhooks/{_webhook_event_id}/retry",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"]

    # Give it some time to run
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
