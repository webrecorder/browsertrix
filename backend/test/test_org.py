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
