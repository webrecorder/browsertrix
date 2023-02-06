import requests

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
        f"{API_PREFIX}/users/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"
    assert data["token"]

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


@pytest.mark.parametrize(
    "invite_email, expected_stored_email",
    [
        # Standard email
        ("invite-to-accept@example.com", "invite-to-accept@example.com"),
        # Email address with comments
        ("user+comment@example.com", "user+comment@example.com"),
        # URL encoded email address with comments
        ("user%2Bcomment-encoded%40example.com", "user+comment-encoded@example.com"),
        # User email with diacritic characters
        ("diacritic-tést@example.com", "diacritic-tést@example.com"),
        # User email with encoded diacritic characters
        (
            "diacritic-t%C3%A9st-encoded%40example.com",
            "diacritic-tést-encoded@example.com",
        ),
    ],
)
def test_send_and_accept_invite(
    admin_auth_headers, default_org_id, invite_email, expected_stored_email
):
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/users/invite",
        headers=admin_auth_headers,
        json={"email": invite_email},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    token = data["token"]
    assert token

    # Register user
    # Note: This will accept invitation without needing to call the
    # accept invite endpoint specifically due to post-registration hook.
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        headers=admin_auth_headers,
        json={
            "name": "accepted",
            "email": expected_stored_email,
            "password": "testpw",
            "inviteToken": token,
            "newOrg": False,
        },
    )
    assert r.status_code == 201

    # Verify user belongs to org
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    users = data["users"]
    users_with_invited_email = [
        user for user in users.values() if user["email"] == expected_stored_email
    ]
    assert len(users_with_invited_email) == 1
