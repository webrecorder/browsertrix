import requests
import hashlib
import time

host_prefix = "http://127.0.0.1:30870"
api_prefix = f"{host_prefix}/api"


access_token = None
headers = None
archive_id = None

crawl_id = None

wacz_path = None
wacz_size = None
wacz_hash = None


def test_login():
    username = "admin@example.com"
    password = "PASSW0RD!"
    r = requests.post(
        f"{api_prefix}/auth/jwt/login",
        data={"username": username, "password": password, "grant_type": "password"},
    )
    assert r.status_code == 200
    data = r.json()

    assert data["token_type"] == "bearer"

    global access_token
    access_token = data["access_token"]

    global headers
    headers = {"Authorization": f"Bearer {access_token}"}

def test_list_archives():
    r = requests.get(f"{api_prefix}/archives", headers=headers)
    data = r.json()

    assert len(data["archives"]) == 1
    assert data["archives"][0]["id"]

    global archive_id
    archive_id = data["archives"][0]["id"]

    assert data["archives"][0]["name"] == "admin's Archive"

def test_create_new_config():
    crawl_data = {
        "runNow": True,
        "name": "Test Crawl",
        "config": {
            "seeds": ["https://example.com/"]
        }
    }
    r = requests.post(f"{api_prefix}/archives/{archive_id}/crawlconfigs/", headers=headers, json=crawl_data)

    assert r.status_code == 200

    data = r.json()
    assert data["added"]
    assert data["run_now_job"]

    global crawl_id
    crawl_id = data["run_now_job"]

def test_wait_for_complete():
    while True:
        r = requests.get(f"{api_prefix}/archives/{archive_id}/crawls/{crawl_id}.json", headers=headers)
        data = r.json()
        assert data["state"] == "starting" or data["state"] == "running" or data["state"] == "complete", data["state"]
        if data["state"] == "complete":
            break

        time.sleep(5)

    assert len(data["resources"]) == 1
    assert data["resources"][0]["path"]

    global wacz_path
    global wacz_size
    global wacz_hash
    wacz_path = data["resources"][0]["path"]
    wacz_size = data["resources"][0]["size"]
    wacz_hash = data["resources"][0]["hash"]

def test_download_wacz():
    r = requests.get(host_prefix + wacz_path)
    assert r.status_code == 200
    assert len(r.content) == wacz_size

    h = hashlib.sha256()
    h.update(r.content)
    assert h.hexdigest() == wacz_hash, (h.hexdigest(), wacz_hash)
