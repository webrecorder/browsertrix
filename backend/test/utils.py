"""Test utilities."""

import ast
import asyncio

import requests

# Mirror of conftest HOST_PREFIX / API_PREFIX. Defined here (rather than
# imported from conftest) because conftest imports this module, so importing
# conftest back would be circular. Keep in sync with test/conftest.py.
HOST_PREFIX = "http://127.0.0.1:30870"
API_PREFIX = HOST_PREFIX + "/api"

def read_in_chunks(fh, blocksize=1024):
    """Lazy function (generator) to read a file piece by piece.
    Default chunk size: 1k."""
    while True:
        data = fh.read(blocksize)
        if not data:
            break
        yield data


def _get_log_event(caplog, event_name: str):
    """Find a structlog record by event name and return its parsed data dict."""
    for record in caplog.records:
        if event_name in record.getMessage():
            try:
                return record, ast.literal_eval(record.getMessage())
            except (ValueError, SyntaxError):
                pass
    return None, {}


# Terminal states for an archived item's post-processing. Mirrors the backend
# crawl states.
TERMINAL_UPLOAD_STATES = ("complete", "failed")

PROCESSING_MAX_ATTEMPTS = 180
PROCESSING_POLL_SECONDS = 1


async def wait_for_upload_processed(
    auth_headers, org_id, upload_id, expect_state="complete"
):
    """Wait for an upload's post-processing background job to finish.

    Upload post-processing runs in a background job; the upload stays in
    "processing-upload" (and replay.json returns no resources) until it
    completes. Polls until the upload reaches a terminal state and returns it.

    Raises AssertionError if it doesn't reach a terminal state in time, or if it
    reaches a terminal state other than `expect_state`.
    """
    state = None
    for _ in range(PROCESSING_MAX_ATTEMPTS):
        r = requests.get(
            f"{API_PREFIX}/orgs/{org_id}/uploads/{upload_id}",
            headers=auth_headers,
        )
        assert r.status_code == 200
        state = r.json().get("state")
        if state in TERMINAL_UPLOAD_STATES:
            break
        await asyncio.sleep(PROCESSING_POLL_SECONDS)
    else:
        raise AssertionError(
            f"Upload {upload_id} still processing after "
            f"{PROCESSING_MAX_ATTEMPTS * PROCESSING_POLL_SECONDS}s (state={state})"
        )
    assert state == expect_state, (
        f"Upload {upload_id}: expected state={expect_state}, got {state}"
    )
    return state


def wait_for_upload_processed_sync(
    auth_headers, org_id, upload_id, expect_state="complete"
):
    """Synchronous wrapper around wait_for_upload_processed for sync fixtures."""
    return asyncio.run(
        wait_for_upload_processed(auth_headers, org_id, upload_id, expect_state)
    )
