import requests
import time

from .conftest import API_PREFIX


def test_invites_expire(admin_auth_headers, default_org_id):
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

    # Wait two minutes to give Mongo sufficient time to delete the invite
    # See: https://www.mongodb.com/docs/manual/core/index-ttl/#timing-of-the-delete-operation
    time.sleep(120)

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
