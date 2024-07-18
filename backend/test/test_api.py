import requests

from .conftest import API_PREFIX


def test_api_docs():
    r = requests.get(f"{API_PREFIX}/docs")
    assert r.status_code == 200

    text = r.text
    assert "<title>Browsertrix API</title>" in text
    assert "/favicon.ico" in text
    assert "/api/openapi.json" in text


def test_api_redoc():
    r = requests.get(f"{API_PREFIX}/redoc")
    assert r.status_code == 200

    text = r.text
    assert "<title>Browsertrix API</title>" in text
    assert "/favicon.ico" in text
    assert "/api/openapi.json" in text


def test_api_openapi():
    r = requests.get(f"{API_PREFIX}/openapi.json")
    assert r.status_code == 200

    json = r.json()
    assert json["info"]["title"] == "Browsertrix"
    assert json["info"]["x-logo"]["url"] == "/docs-logo.svg"
