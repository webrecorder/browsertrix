import requests

from .conftest import API_PREFIX


new_subs_oid = None
new_subs_oid_2 = None

new_user_invite_token = None
existing_user_invite_token = None

VALID_PASSWORD = "ValidPassW0rd!"

invite_email = "test-user@example.com"


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
    assert data["name"] == "Test User's Archive"

    assert data["quotas"] == {
        "maxPagesPerCrawl": 100,
        "maxConcurrentCrawls": 1,
        "storageQuota": 1000000,
        "maxExecMinutesPerMonth": 1000,
        "extraExecMinutes": 0,
        "giftedExecMinutes": 0,
    }
    assert "subscription" in data


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
    assert r.json()["detail"] == "already_exists"


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
    assert data["firstOrgOwner"] == True
    assert data["orgName"] == data["oid"]
    assert data["orgName"] == data["orgSlug"]

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
    assert org["name"] == "Test User's Archive 2"
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
            "status": "payment-failed",
        },
    )

    assert r.status_code == 200
    assert r.json() == {"updated": True}


def test_get_sub_info(admin_auth_headers):
    r = requests.get(
        f"{API_PREFIX}/orgs/{new_subs_oid}/subscription", headers=admin_auth_headers
    )
    assert r.status_code == 200

    sub = r.json()["subscription"]
    assert sub["status"] == "payment-failed"
    assert sub["readOnlyOnCancel"] == False
    assert sub["futureCancelDate"] == None


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
