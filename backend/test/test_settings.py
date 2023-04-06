import requests

from .conftest import API_PREFIX


def test_settings():
    r = requests.get(f"{API_PREFIX}/settings")
    assert r.status_code == 200

    data = r.json()

    assert data == {
        "registrationEnabled": False,
        "jwtTokenLifetime": 86400,
        "defaultBehaviorTimeSeconds": 300,
        "maxPagesPerCrawl": 2,
        "defaultPageLoadTimeSeconds": 120,
    }
