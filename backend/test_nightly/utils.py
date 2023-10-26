"""nightly test utils"""

import requests

from .conftest import API_PREFIX


def get_crawl_status(org_id, crawl_id, headers):
    r = requests.get(
        f"{API_PREFIX}/orgs/{org_id}/crawls/{crawl_id}/replay.json",
        headers=headers,
    )
    data = r.json()
    return data["state"]
