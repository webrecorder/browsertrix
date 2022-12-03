import requests

api_prefix = "http://127.0.0.1:30870/api"


def test_login_invalid():
    username = "admin@example.com"
    password = "invalid"
    r = requests.post(
        f"{api_prefix}/auth/jwt/login",
        data={"username": username, "password": password, "grant_type": "password"},
    )
    data = r.json()

    assert r.status_code == 400
    assert data["detail"] == "LOGIN_BAD_CREDENTIALS"


def test_login():
    username = "admin@example.com"
    password = "PASSW0RD!"
    r = requests.post(
        f"{api_prefix}/auth/jwt/login",
        data={"username": username, "password": password, "grant_type": "password"},
    )
    data = r.json()

    assert r.status_code == 200, data["detail"]
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    access_token = data["access_token"]
