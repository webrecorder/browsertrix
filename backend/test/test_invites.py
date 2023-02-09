import requests
import time

import pytest

from .conftest import API_PREFIX


def test_pending_invites(admin_auth_headers, default_org_id):
    r = requests.get(f"{API_PREFIX}/users/invites", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["pending_invites"] == []

    # Add a pending invite and check it's returned
    INVITE_EMAIL = "invite-pending@example.com"

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    r = requests.get(f"{API_PREFIX}/users/invites", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    invites = data["pending_invites"]
    assert len(invites) == 1
    invite = invites[0]
    assert invite["id"]
    assert invite["email"] == INVITE_EMAIL
    assert invite["oid"] == default_org_id
    assert invite["created"]
    assert invite["role"]


def test_pending_invites_crawler(crawler_auth_headers, default_org_id):
    # Verify that only superusers can see pending invites
    r = requests.get(f"{API_PREFIX}/users/invites", headers=crawler_auth_headers)
    assert r.status_code == 403


def test_invites_expire(admin_auth_headers, default_org_id):
    """Note this test is dependent on chart/test/test.yaml settings.

    Namely, it expects `invite_expire_seconds: 10` to be set in chart.
    """
    # Send invite
    INVITE_EMAIL = "invite-expires@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL, "role": 10},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Verify invite exists
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite for invite in data["pending_invites"] if invite["email"] == INVITE_EMAIL
    ]
    assert len(invites_matching_email) == 1

    # Wait 90 seconds to give Mongo time to delete the invite
    # See: https://www.mongodb.com/docs/manual/core/index-ttl/#timing-of-the-delete-operation
    time.sleep(90)

    # Check invites again and verify invite has been removed
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite for invite in data["pending_invites"] if invite["email"] == INVITE_EMAIL
    ]
    assert len(invites_matching_email) == 0
