import requests

from .conftest import API_PREFIX, ADMIN_USERNAME, ADMIN_PW


def test_login_invalid():
    password = "invalid"
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={"username": ADMIN_USERNAME, "password": password, "grant_type": "password"},
    )
    data = r.json()

    assert r.status_code == 400
    assert data["detail"] == "LOGIN_BAD_CREDENTIALS"


def test_login():
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={"username": ADMIN_USERNAME, "password": ADMIN_PW, "grant_type": "password"},
    )
    data = r.json()

    assert r.status_code == 200, data["detail"]
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    access_token = data["access_token"]
