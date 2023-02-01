import requests

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
    assert invite["_id"]
    assert invite["email"] == INVITE_EMAIL
    assert invite["oid"] == non_default_org_id
    assert invite["created"]
    assert invite["role"]
