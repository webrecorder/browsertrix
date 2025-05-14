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


def test_api_settings():
    r = requests.get(f"{API_PREFIX}/settings")
    assert r.status_code == 200

    data = r.json()

    assert data == {
        "registrationEnabled": False,
        "jwtTokenLifetime": 1440,
        "defaultBehaviorTimeSeconds": 300,
        "maxPagesPerCrawl": 4,
        "numBrowsers": 2,
        "maxScale": 3,
        "defaultPageLoadTimeSeconds": 120,
        "billingEnabled": True,
        "signUpUrl": "",
        "salesEmail": "",
        "supportEmail": "",
        "localesEnabled": None,
        "pausedExpiryMinutes": 10080,
    }
