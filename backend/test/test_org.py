import requests
import uuid

import pytest

from .conftest import API_PREFIX


def test_ensure_only_one_default_org(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()

    orgs = data["orgs"]
    default_orgs = [org for org in orgs if org["default"]]
    assert len(default_orgs) == 1

    default_org_name = default_orgs[0]["name"]
    orgs_with_same_name = [org for org in orgs if org["name"] == default_org_name]
    assert len(orgs_with_same_name) == 1


def test_get_org_admin(admin_auth_headers, default_org_id):
    """org owners should receive details on users."""
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == default_org_id
    assert data["name"]

    users = data["users"]
    assert users
    for _, value in users.items():
        assert value["name"]
        assert value["email"]
        assert value["role"]


def test_get_org_crawler(crawler_auth_headers, default_org_id):
    """non-owners should *not* receive details on users."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=crawler_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == default_org_id
    assert data["name"]
    assert data.get("users") is None


def test_rename_org(admin_auth_headers, default_org_id):
    UPDATED_NAME = "updated org name"
    rename_data = {"name": UPDATED_NAME}
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify that name is now updated.
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == UPDATED_NAME


def test_create_org(admin_auth_headers):
    NEW_ORG_NAME = "New Org"
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": NEW_ORG_NAME},
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    # Verify that org exists.
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    org_names = []
    for org in data["orgs"]:
        org_names.append(org["name"])
    assert NEW_ORG_NAME in org_names


def test_remove_user_from_org(admin_auth_headers, default_org_id):
    # Add new user to org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": "toremove@example.com",
            "password": "PASSW0RD!",
            "name": "toremove",
            "role": 10,
        },
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    # Remove user
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/remove",
        json={"email": "toremove@example.com"},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["removed"]


def test_get_pending_org_invites(
    admin_auth_headers, default_org_id, non_default_org_id
):
    # Invite user to non-default org
    INVITE_EMAIL = "non-default-invite@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Invite user to default org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": "default-invite@example.com", "role": 10},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Check that only invite to non-default org is returned
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites = data["pending_invites"]
    assert len(invites) == 1
    invite = invites[0]
    assert invite["id"]
    assert invite["email"] == INVITE_EMAIL
    assert invite["oid"] == non_default_org_id
    assert invite["created"]
    assert invite["role"]


@pytest.mark.parametrize(
    "invite_email, expected_stored_email",
    [
        # Standard email
        ("invite-to-accept-org@example.com", "invite-to-accept-org@example.com"),
        # Email address with comments
        ("user+comment-org@example.com", "user+comment-org@example.com"),
        # URL encoded email address with comments
        (
            "user%2Bcomment-encoded-org%40example.com",
            "user+comment-encoded-org@example.com",
        ),
        # User email with diacritic characters
        ("diacritic-tést-org@example.com", "diacritic-tést-org@example.com"),
        # User email with encoded diacritic characters
        (
            "diacritic-t%C3%A9st-encoded-org%40example.com",
            "diacritic-tést-encoded-org@example.com",
        ),
    ],
)
def test_send_and_accept_org_invite(
    admin_auth_headers, non_default_org_id, invite_email, expected_stored_email
):
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": invite_email, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Look up token
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite
        for invite in data["pending_invites"]
        if invite["email"] == expected_stored_email
    ]
    token = invites_matching_email[0]["id"]

    # Register user
    # Note: This will accept invitation without needing to call the
    # accept invite endpoint explicitly due to post-registration hook.
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
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    users = data["users"]
    users_with_invited_email = [
        user for user in users.values() if user["email"] == expected_stored_email
    ]
    assert len(users_with_invited_email) == 1


def test_delete_invite_by_email(admin_auth_headers, non_default_org_id):
    # Invite user to non-default org
    INVITE_EMAIL = "new-non-default-org-invite-by-email@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Delete invite by email
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["removed"]
    assert data["count"] == 1

    # Verify invite no longer exists
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite for invite in data["pending_invites"] if invite["email"] == INVITE_EMAIL
    ]
    assert len(invites_matching_email) == 0

    # Try to delete non-existent email and test we get 404
    bad_token = str(uuid.uuid4())
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": "not-a-valid-invite@example.com"},
    )
    assert r.status_code == 404
    data = r.json()
    assert data["detail"] == "invite_not_found"
