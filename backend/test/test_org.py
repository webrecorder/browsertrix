import requests

from .conftest import API_PREFIX


def test_ensure_only_one_default_org(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/archives", headers=admin_auth_headers)
    data = r.json()

    orgs = data["archives"]
    default_orgs = [org for org in orgs if org["default"]]
    assert len(default_orgs) == 1

    default_org_name = default_orgs[1]["name"]
    orgs_with_same_name = [org for org in orgs if org["name"] == default_org_name]
    assert len(orgs_with_same_name) == 1
    

def test_rename_org(admin_auth_headers, admin_aid):
    UPDATED_NAME = "updated org name"
    rename_data = {"name": UPDATED_NAME}
    r = requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify that name is now updated.
    r = requests.get(f"{API_PREFIX}/archives/{admin_aid}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == UPDATED_NAME
