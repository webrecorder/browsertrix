import json
import requests
import tempfile

import pytest

from .conftest import API_PREFIX


curr_dir = os.path.dirname(os.path.realpath(__file__))

ORG_EXPORT_FIXTURE = os.path.join(curr_dir, "data", "org-export.json")
ORG_FIXTURE_UUID = "4c880741-c1b7-47ae-b825-3fb15d52a760"


def test_export_org(admin_auth_headers, default_org_id):
    tf = tempfile.NamedTemporaryFile(delete=False)
    with open(tf, "wb") as json_export:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/export/json",
            headers=admin_auth_headers,
            stream=True,
        )
        assert r.status_code == 200
        for chunk in r.iter_lines():
            json_export.write(chunk)

    org_json = json.load(tf)
    org_data = org_json["data"]
    assert org_data

    # TODO: Check data more thoroughly
    assert org_data["dbVersion"]
    assert org_data["org"]
    assert org_data["profiles"]
    assert org_data["workflows"]
    assert org_data["workflowRevisions"]
    assert org_data["items"]
    assert org_data["pages"]
    assert org_data["collections"]

    tf.close()


def test_export_org_insufficient_credentials(crawler_auth_headers, default_org_id):
    with open(tf, "wb") as json_export:
        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/export/json",
            headers=crawler_auth_headers,
        )
        assert r.status_code == 403


def test_import_org(admin_auth_headers):
    # Import org through fixture
    with open(ORG_EXPORT_FIXTURE, "rb") as f:
        r = requests.post(
            f"{API_PREFIX}/orgs/import/json?ignoreVersion=true",
            headers=admin_auth_headers,
            data=f,
        )
        assert r.status_code == 200

    time.sleep(20)

    r = requests.get(
        f"{API_PREFIX}/orgs/{ORG_FIXTURE_UUID}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    # TODO: Check imported data more thoroughly
    assert data["name"] == "dev"
