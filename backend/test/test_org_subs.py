import requests

from .conftest import API_PREFIX
from uuid import uuid4


new_subs_oid = None
new_subs_oid_2 = None

new_user_invite_token = None
existing_user_invite_token = None

VALID_PASSWORD = "ValidPassW0rd!"

invite_email = "test-User@EXample.com"


def test_create_sub_org_invalid_auth(crawler_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/create",
        headers=crawler_auth_headers,
        json={
            "subId": "123",
            "status": "active",
            "firstAdminInviteEmail": invite_email,
            "quotas": {
                "maxPagesPerCrawl": 100,
                "maxConcurrentCrawls": 1,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
            },
        },
    )

    assert r.status_code == 403


def test_create_sub_org_and_invite_new_user(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/create",
        headers=admin_auth_headers,
        json={
            "subId": "123",
            "status": "active",
            "planId": "basic",
            "firstAdminInviteEmail": invite_email,
            "quotas": {
                "maxPagesPerCrawl": 100,
                "maxConcurrentCrawls": 1,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
            },
        },
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    org_id = data["id"]

    assert data["invited"] == "new_user"

    global new_user_invite_token
    new_user_invite_token = data["token"]

    global new_subs_oid
    new_subs_oid = org_id


def test_validate_new_org_not_activated(admin_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/subscriptions/is-activated/123",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"] is False


def test_validate_new_org_with_quotas_and_name_is_uid(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid}", headers=admin_auth_headers)
    assert r.status_code == 200

    data = r.json()
    assert data["slug"] == data["id"]
    assert data["name"] == data["name"]

    assert data["quotas"] == {
        "maxPagesPerCrawl": 100,
        "maxConcurrentCrawls": 1,
        "storageQuota": 1000000,
        "maxExecMinutesPerMonth": 1000,
        "extraExecMinutes": 0,
        "giftedExecMinutes": 0,
    }
    assert data["subscription"] == {
        "subId": "123",
        "status": "active",
        "planId": "basic",
        "futureCancelDate": None,
        "readOnlyOnCancel": False,
    }


def test_register_with_invite():
    # Create user with invite
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        json={
            "name": "Test User",
            "email": invite_email,
            "password": VALID_PASSWORD,
            "inviteToken": new_user_invite_token,
        },
    )
    assert r.status_code == 201


def test_validate_new_org_with_quotas_and_update_name(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid}", headers=admin_auth_headers)
    assert r.status_code == 200

    data = r.json()
    assert data["slug"] == "test-users-archive"
    assert data["name"] == "Test User’s Archive"

    assert data["quotas"] == {
        "maxPagesPerCrawl": 100,
        "maxConcurrentCrawls": 1,
        "storageQuota": 1000000,
        "maxExecMinutesPerMonth": 1000,
        "extraExecMinutes": 0,
        "giftedExecMinutes": 0,
    }
    assert "subscription" in data


def test_validate_new_org_is_activated(admin_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/subscriptions/is-activated/123",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_create_sub_org_and_invite_existing_user_dupe_sub(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/create",
        headers=admin_auth_headers,
        json={
            "subId": "123",
            "status": "test",
            "planId": "basic",
            "firstAdminInviteEmail": invite_email,
            "quotas": {
                "maxPagesPerCrawl": 100,
                "maxConcurrentCrawls": 1,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
            },
        },
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "duplicate_org_subscription.subId"


def test_create_sub_org_and_invite_existing_user(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/create",
        headers=admin_auth_headers,
        json={
            "subId": "234",
            "status": "active",
            "planId": "basic",
            "firstAdminInviteEmail": invite_email,
            "quotas": {
                "maxPagesPerCrawl": 100,
                "maxConcurrentCrawls": 1,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
            },
        },
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    org_id = data["id"]

    global new_subs_oid_2
    new_subs_oid_2 = org_id

    assert data["invited"] == "existing_user"

    global existing_user_invite_token
    existing_user_invite_token = data["token"]


def test_login_existing_user_for_invite():
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": invite_email,
            "password": VALID_PASSWORD,
            "grant_type": "password",
        },
    )
    data = r.json()
    assert r.status_code == 200
    login_token = data["access_token"]

    auth_headers = {"Authorization": "bearer " + login_token}

    # Get existing user invite to confirm it is valid
    r = requests.get(
        f"{API_PREFIX}/users/me/invite/{existing_user_invite_token}",
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["firstOrgAdmin"] == True
    assert data["orgName"] == data["oid"]
    assert data["orgName"] == data["orgSlug"]
    assert data["fromSuperuser"] == True
    assert not data["inviterEmail"]
    assert not data["inviterName"]

    # Accept existing user invite
    r = requests.post(
        f"{API_PREFIX}/orgs/invite-accept/{existing_user_invite_token}",
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    org = data["org"]

    assert org["id"] == new_subs_oid_2
    assert org["name"] == "Test User’s Archive 2"
    assert org["slug"] == "test-users-archive-2"

    assert org["quotas"] == {
        "maxPagesPerCrawl": 100,
        "maxConcurrentCrawls": 1,
        "storageQuota": 1000000,
        "maxExecMinutesPerMonth": 1000,
        "extraExecMinutes": 0,
        "giftedExecMinutes": 0,
    }
    assert "subscription" in org


def test_update_sub(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/update",
        headers=admin_auth_headers,
        json={
            "subId": "123",
            "status": "paused_payment_failed",
            "planId": "basic",
            "futureCancelDate": "2028-12-26T01:02:03Z",
        },
    )

    assert r.status_code == 200
    assert r.json() == {"updated": True}

    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid}", headers=admin_auth_headers)
    assert r.status_code == 200

    data = r.json()

    sub = data["subscription"]
    assert sub == {
        "subId": "123",
        "status": "paused_payment_failed",
        "planId": "basic",
        "futureCancelDate": "2028-12-26T01:02:03Z",
        "readOnlyOnCancel": False,
    }

    assert data["readOnly"] == True
    assert data["readOnlyReason"] == "subscriptionPaused"


def test_update_sub_2(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/update",
        headers=admin_auth_headers,
        json={
            "subId": "123",
            "status": "active",
            "planId": "basic2",
            "futureCancelDate": None,
            # not updateable here, only by superadmin
            "readOnlyOnCancel": True,
            "quotas": {
                "maxPagesPerCrawl": 50,
                "storageQuota": 500000,
            },
        },
    )

    assert r.status_code == 200
    assert r.json() == {"updated": True}

    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid}", headers=admin_auth_headers)
    assert r.status_code == 200

    data = r.json()

    sub = data["subscription"]
    assert sub == {
        "subId": "123",
        "status": "active",
        "planId": "basic2",
        "futureCancelDate": None,
        "readOnlyOnCancel": False,
    }

    assert data["readOnly"] == False
    assert data["readOnlyReason"] == ""


def test_get_billing_portal_url(admin_auth_headers, echo_server):
    r = requests.get(
        f"{API_PREFIX}/orgs/{new_subs_oid}/billing-portal", headers=admin_auth_headers
    )
    assert r.status_code == 200

    assert r.json() == {"portalUrl": "https://portal.example.com/path/"}


def test_get_addon_minutes_checkout_url(admin_auth_headers, echo_server):
    r = requests.get(
        f"{API_PREFIX}/orgs/{new_subs_oid}/checkout/execution-minutes",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200

    assert r.json() == {"checkoutUrl": "https://checkout.example.com/path/"}


def test_cancel_sub_and_delete_org(admin_auth_headers):
    # cancel, resulting in org deletion
    r = requests.post(
        f"{API_PREFIX}/subscriptions/cancel",
        headers=admin_auth_headers,
        json={
            "subId": "123",
        },
    )

    assert r.status_code == 200
    assert r.json() == {"canceled": True, "deleted": True}

    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid}", headers=admin_auth_headers)
    assert r.status_code == 404
    assert r.json()["detail"] == "org_not_found"


def test_cancel_sub_and_no_delete_org(admin_auth_headers):
    # mark org as read-only on cancel, then cancel to avoid deletion
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_subs_oid_2}/read-only-on-cancel",
        headers=admin_auth_headers,
        json={
            "readOnlyOnCancel": True,
        },
    )
    assert r.status_code == 200
    assert r.json() == {"updated": True}

    r = requests.post(
        f"{API_PREFIX}/subscriptions/cancel",
        headers=admin_auth_headers,
        json={
            "subId": "234",
        },
    )

    assert r.status_code == 200
    assert r.json() == {"canceled": True, "deleted": False}

    r = requests.get(f"{API_PREFIX}/orgs/{new_subs_oid_2}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["readOnly"] == True
    assert data["readOnlyReason"] == "subscriptionCanceled"

    r = requests.post(
        f"{API_PREFIX}/subscriptions/cancel",
        headers=admin_auth_headers,
        json={
            "subId": "234",
        },
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "org_for_subscription_not_found"}


def test_import_sub_invalid_org(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/import",
        headers=admin_auth_headers,
        json={
            "subId": "345",
            "planId": "basic",
            "status": "active",
            "oid": str(uuid4()),
        },
    )
    assert r.status_code == 400
    assert r.json() == {"detail": "invalid_org_id"}


def test_import_sub_existing_org(admin_auth_headers, non_default_org_id):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/import",
        headers=admin_auth_headers,
        json={
            "subId": "345",
            "planId": "basic",
            "status": "active",
            "oid": non_default_org_id,
        },
    )
    assert r.status_code == 200
    assert r.json() == {"added": True, "id": non_default_org_id}

    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["subscription"] == {
        "subId": "345",
        "status": "active",
        "planId": "basic",
        "futureCancelDate": None,
        "readOnlyOnCancel": False,
    }


def test_subscription_events_log(admin_auth_headers, non_default_org_id):
    r = requests.get(f"{API_PREFIX}/subscriptions/events", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    events = data["items"]
    total = data["total"]

    assert total == 7

    for event in events:
        assert event["timestamp"]
        del event["timestamp"]

    assert events == [
        {
            "type": "create",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic",
            "firstAdminInviteEmail": "test-user@example.com",
            "quotas": {
                "maxConcurrentCrawls": 1,
                "maxPagesPerCrawl": 100,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
                "extraExecMinutes": 0,
                "giftedExecMinutes": 0,
            },
        },
        {
            "type": "create",
            "subId": "234",
            "oid": new_subs_oid_2,
            "status": "active",
            "planId": "basic",
            "firstAdminInviteEmail": "test-user@example.com",
            "quotas": {
                "maxConcurrentCrawls": 1,
                "maxPagesPerCrawl": 100,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
                "extraExecMinutes": 0,
                "giftedExecMinutes": 0,
            },
        },
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "paused_payment_failed",
            "planId": "basic",
            "futureCancelDate": "2028-12-26T01:02:03Z",
            "quotas": None,
        },
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic2",
            "futureCancelDate": None,
            "quotas": {
                "maxPagesPerCrawl": 50,
                "storageQuota": 500000,
                "extraExecMinutes": None,
                "giftedExecMinutes": None,
                "maxConcurrentCrawls": None,
                "maxExecMinutesPerMonth": None,
            },
        },
        {"subId": "123", "oid": new_subs_oid, "type": "cancel"},
        {"subId": "234", "oid": new_subs_oid_2, "type": "cancel"},
        {
            "type": "import",
            "subId": "345",
            "oid": non_default_org_id,
            "status": "active",
            "planId": "basic",
        },
    ]


def test_subscription_events_log_filter_sub_id(admin_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?subId=123", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]
    total = data["total"]

    assert total == 4

    for event in events:
        del event["timestamp"]

    assert events == [
        {
            "type": "create",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic",
            "firstAdminInviteEmail": "test-user@example.com",
            "quotas": {
                "maxConcurrentCrawls": 1,
                "maxPagesPerCrawl": 100,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
                "extraExecMinutes": 0,
                "giftedExecMinutes": 0,
            },
        },
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "paused_payment_failed",
            "planId": "basic",
            "futureCancelDate": "2028-12-26T01:02:03Z",
            "quotas": None,
        },
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic2",
            "futureCancelDate": None,
            "quotas": {
                "maxPagesPerCrawl": 50,
                "storageQuota": 500000,
                "extraExecMinutes": None,
                "giftedExecMinutes": None,
                "maxConcurrentCrawls": None,
                "maxExecMinutesPerMonth": None,
            },
        },
        {"subId": "123", "oid": new_subs_oid, "type": "cancel"},
    ]


def test_subscription_events_log_filter_oid(admin_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?oid={new_subs_oid}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]
    total = data["total"]

    assert total == 4

    for event in events:
        del event["timestamp"]

    assert events == [
        {
            "type": "create",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic",
            "firstAdminInviteEmail": "test-user@example.com",
            "quotas": {
                "maxConcurrentCrawls": 1,
                "maxPagesPerCrawl": 100,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
                "extraExecMinutes": 0,
                "giftedExecMinutes": 0,
            },
        },
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "paused_payment_failed",
            "planId": "basic",
            "futureCancelDate": "2028-12-26T01:02:03Z",
            "quotas": None,
        },
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic2",
            "futureCancelDate": None,
            "quotas": {
                "maxPagesPerCrawl": 50,
                "storageQuota": 500000,
                "extraExecMinutes": None,
                "giftedExecMinutes": None,
                "maxConcurrentCrawls": None,
                "maxExecMinutesPerMonth": None,
            },
        },
        {"subId": "123", "oid": new_subs_oid, "type": "cancel"},
    ]


def test_subscription_events_log_filter_plan_id(admin_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?planId=basic2", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]
    total = data["total"]

    assert total == 1

    for event in events:
        del event["timestamp"]

    assert events == [
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic2",
            "futureCancelDate": None,
            "quotas": {
                "maxPagesPerCrawl": 50,
                "storageQuota": 500000,
                "extraExecMinutes": None,
                "giftedExecMinutes": None,
                "maxConcurrentCrawls": None,
                "maxExecMinutesPerMonth": None,
            },
        }
    ]


def test_subscription_events_log_filter_status(admin_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?subId=123&status=active",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]
    total = data["total"]

    assert total == 2

    for event in events:
        del event["timestamp"]

    assert events == [
        {
            "type": "create",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic",
            "firstAdminInviteEmail": "test-user@example.com",
            "quotas": {
                "maxConcurrentCrawls": 1,
                "maxPagesPerCrawl": 100,
                "storageQuota": 1000000,
                "maxExecMinutesPerMonth": 1000,
                "extraExecMinutes": 0,
                "giftedExecMinutes": 0,
            },
        },
        {
            "type": "update",
            "subId": "123",
            "oid": new_subs_oid,
            "status": "active",
            "planId": "basic2",
            "futureCancelDate": None,
            "quotas": {
                "maxPagesPerCrawl": 50,
                "storageQuota": 500000,
                "extraExecMinutes": None,
                "giftedExecMinutes": None,
                "maxConcurrentCrawls": None,
                "maxExecMinutesPerMonth": None,
            },
        },
    ]


def test_subscription_events_log_filter_sort(admin_auth_headers):
    # Timestamp, descending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=timestamp&sortDirection=-1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_timestamp = None
    for event in events:
        timestamp = event["timestamp"]
        if last_timestamp:
            assert last_timestamp >= timestamp
        last_timestamp = timestamp

    # subId, ascending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=subId&sortDirection=1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_id = None
    for event in events:
        sub_id = event["subId"]
        if last_id:
            assert last_id <= sub_id
        last_id = sub_id

    # subId, descending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=subId&sortDirection=-1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_id = None
    for event in events:
        sub_id = event["subId"]
        if last_id:
            assert last_id >= sub_id
        last_id = sub_id

    # oid, ascending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=oid&sortDirection=1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_id = None
    for event in events:
        oid = event["oid"]
        if last_id:
            assert last_id <= oid
        last_id = oid

    # oid, descending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=oid&sortDirection=-1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_id = None
    for event in events:
        oid = event["oid"]
        if last_id:
            assert last_id >= oid
        last_id = oid

    # Status, ascending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=status", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_status = None
    for event in events:
        event_status = event.get("status")
        if event_status and last_status:
            assert last_status <= event_status
        if event_status:
            last_status = event_status

    # Status, descending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=status&sortDirection=-1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_status = None
    for event in events:
        event_status = event.get("status")
        if event_status and last_status:
            assert last_status >= event_status
        if event_status:
            last_status = event_status

    # planId, ascending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=planId&sortDirection=1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_id = None
    for event in events:
        plan_id = event.get("planId")
        if plan_id and last_id:
            assert last_id <= plan_id
        if plan_id:
            last_id = plan_id

    # planId, descending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=planId&sortDirection=-1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_id = None
    for event in events:
        plan_id = event.get("planId")
        if plan_id and last_id:
            assert last_id >= plan_id
        if plan_id:
            last_id = plan_id

    # futureCancelDate, ascending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=futureCancelDate&sortDirection=1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_date = None
    for event in events:
        cancel_date = event.get("futureCancelDate")
        if cancel_date and last_date:
            assert last_id <= cancel_date
        if cancel_date:
            last_date = cancel_date

    # futureCancelDate, descending
    r = requests.get(
        f"{API_PREFIX}/subscriptions/events?sortBy=futureCancelDate&sortDirection=-1",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    events = data["items"]

    last_date = None
    for event in events:
        cancel_date = event.get("futureCancelDate")
        if cancel_date and last_date:
            assert last_id >= cancel_date
        if cancel_date:
            last_date = cancel_date


def test_subscription_add_minutes(admin_auth_headers):
    r = requests.post(
        f"{API_PREFIX}/subscriptions/add-minutes",
        headers=admin_auth_headers,
        json={
            "oid": str(new_subs_oid_2),
            "minutes": 75,
            "total_price": 350,
            "currency": "usd",
            "context": "addon",
        },
    )

    assert r.status_code == 200
    assert r.json() == {"updated": True}

    r = requests.post(
        f"{API_PREFIX}/orgs/{new_subs_oid_2}",
        headers=admin_auth_headers,
    )

    assert r.status_code == 200
    quota_updates = r.json()["quotaUpdates"]
    assert len(quota_updates)
    last_update = quota_updates[len(quota_updates) - 1]

    assert last_update["type"] == "add-minutes"
    assert last_update["context"] == "addon"
    assert last_update["update"] == {
        "maxPagesPerCrawl": 100,
        "storageQuota": 1000000,
        "extraExecMinutes": 75,  # only this value updated from previous
        "giftedExecMinutes": 0,
        "maxConcurrentCrawls": 1,
        "maxExecMinutesPerMonth": 1000,
    }
