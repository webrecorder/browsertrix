import requests

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

    r = requests.get(f"{API_PREFIX}/users/invites", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    invites = data["pending_invites"]
    assert len(invites) == 1
    invite = invites[0]
    assert invite["_id"]
    assert invite["email"] == INVITE_EMAIL
    assert invite["oid"] == default_org_id
    assert invite["created"]
    assert invite["role"]


def test_pending_invites_crawler(crawler_auth_headers, default_org_id):
    # Verify that only superusers can see pending invites
    r = requests.get(f"{API_PREFIX}/users/invites", headers=crawler_auth_headers)
    assert r.status_code == 403
