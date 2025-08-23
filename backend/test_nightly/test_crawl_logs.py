import json
import requests
import time

import pytest

from .conftest import API_PREFIX


LINES_TO_TEST = 10


@pytest.mark.parametrize(
    "log_level, context",
    [
        # No filtering
        (None, None),
        # Filter log level
        ("info", None),
        ("info,debug", None),
        # Filter context
        (None, "general"),
        (None, "general,worker"),
        # Filter both
        ("info,debug", "general,worker"),
    ],
)
@pytest.mark.timeout(1800)
def test_stream_crawl_logs_wacz(
    admin_auth_headers,
    default_org_id,
    large_crawl_id,
    large_crawl_finished,
    log_level,
    context,
):
    """Test that streaming logs after crawl concludes from WACZs works."""
    api_url = f"{API_PREFIX}/orgs/{default_org_id}/crawls/{large_crawl_id}/logs"
    if log_level and context:
        api_url = api_url + f"?logLevel={log_level}&context={context}"
    elif log_level:
        api_url = api_url + f"?logLevel={log_level}"
    elif context:
        api_url = api_url + f"?context={context}"

    log_levels = []
    contexts = []
    if log_level:
        log_levels = log_level.split(",")
    if context:
        contexts = context.split(",")

    with requests.get(api_url, headers=admin_auth_headers, stream=True) as r:
        assert r.status_code == 200

        last_timestamp = None
        line_index = 0

        # Wait for stream content
        if not r.content:
            while True:
                if r.content:
                    break
                time.sleep(5)

        for line in r.iter_lines():
            if line_index >= LINES_TO_TEST:
                r.close()
                return

            line = line.decode("utf-8")
            log_line_dict = json.loads(line)

            assert log_line_dict["logLevel"]
            if log_level:
                assert log_line_dict["logLevel"] in log_levels

            assert log_line_dict["context"]
            if context:
                assert log_line_dict["context"] in contexts
            assert log_line_dict["details"] or log_line_dict["details"] == {}

            timestamp = log_line_dict["timestamp"]
            assert timestamp
            if last_timestamp:
                assert timestamp >= last_timestamp
            last_timestamp = timestamp

            line_index += 1
