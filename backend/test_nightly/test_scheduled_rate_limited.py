import time
import os
import pytest
import requests
import subprocess
import structlog

from .conftest import API_PREFIX

curr_dir = os.path.dirname(os.path.realpath(__file__))

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# Every two minutes
SCHEDULE = "*/2 * * * *"

# Pull address to echo server running on host from CI env var.
# If not set, default to host.docker.internal (for local testing with
# Docker Desktop).
ECHO_SERVER_URL = os.environ.get(
    "ECHO_SERVER_HOST_URL", "http://host.docker.internal:18080"
) + "/index.html"

@pytest.fixture(scope="function")
def echo_server():
    logger.info("echo_server_starting", unstructured_message="Echo server starting")
    p = subprocess.Popen(["python3", os.path.join(curr_dir, "echo_server.py")])
    logger.info("echo_server_started", unstructured_message="Echo server started")
    time.sleep(1)
    yield p
    time.sleep(10)
    logger.info(
        "echo_server_terminating", unstructured_message="Echo server terminating"
    )
    p.terminate()
    logger.info("echo_server_terminated", unstructured_message="Echo server terminated")


@pytest.fixture(scope="session")
def rl_config_id(admin_auth_headers, default_org_id):
    # Start crawl
    crawl_data = {
        "runNow": False,
        "schedule": SCHEDULE,
        "name": "Rate Limited Scheduled crawl",
        "config": {
            "seeds": [{"url": ECHO_SERVER_URL}],
            "scopeType": "prefix",
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()
    print(data, flush=True)
    return data["id"]


@pytest.mark.timeout(600)
def test_rate_limited_scheduled_crawl(admin_auth_headers, default_org_id, rl_config_id, echo_server):
    # Ensure workflow exists with correct schedule, no crawls yet
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{rl_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["schedule"] == SCHEDULE

    # Wait until a crawl completes (up to 20 minutes)
    attempts = 0
    max_attempts = 120

    while True:
        attempts += 1

        if attempts > max_attempts:
            break

        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{rl_config_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()

        last_crawl_id = data.get("lastCrawlId")
        last_crawl_state = data.get("lastCrawlState")

        if not last_crawl_id or last_crawl_state not in ("failed", "stopped_for_next_scheduled_crawl"):
            time.sleep(10)

    # Recheck workflow stats
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{rl_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["schedule"] == SCHEDULE

    assert data["crawlCount"] == 1
    assert data["crawlAttemptCount"] == 1
    assert data["crawlSuccessfulCount"] == 1

    assert data["lastCrawlId"]
    assert data["lastCrawlState"] == "stopped_for_next_scheduled_crawl"


def test_ensure_crawl_started(admin_auth_headers, default_org_id, rl_config_id):
    # Wait until a crawl completes (up to 20 minutes)
    attempts = 0
    max_attempts = 120

    while True:
        attempts += 1

        if attempts > max_attempts:
            break

        r = requests.get(
            f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{rl_config_id}",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200
        data = r.json()

        last_crawl_state = data.get("lastCrawlState")

        if last_crawl_state in ("failed", "stopped_for_next_scheduled_crawl"):
            time.sleep(10)
        else:
            break

    # Recheck workflow stats
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{rl_config_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["crawlAttemptCount"] == 2
