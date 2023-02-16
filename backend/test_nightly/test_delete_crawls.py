import os
import requests
import time

from .conftest import API_PREFIX, HOST_PREFIX


def test_delete_crawls(
    tmp_path, admin_auth_headers, default_org_id, crawl_id_wr, crawl_id_wr_specs
):
    # Check that crawls have associated files
    crawl_resource_urls = []

    def _file_is_retrievable(url):
        """Attempt to retrieve file at url and return True or False."""
        file_path = str(tmp_path / "test_download")
        if os.path.exists(file_path):
            os.remove(file_path)

        r = requests.get(f"{HOST_PREFIX}{url}")
        if not r.status_code == 200:
            return False

        with open(file_path, "wb") as fd:
            fd.write(r.content)

        if not (os.path.isfile(file_path) and os.path.getsize(file_path) > 0):
            return False

        os.remove(file_path)
        return True

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    resources = data["resources"]
    assert resources
    for resource in resources:
        crawl_resource_urls.append(resource["path"])

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr_specs}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    resources = data["resources"]
    assert resources
    for resource in resources:
        crawl_resource_urls.append(resource["path"])

    # Test retrieving resources
    for url in crawl_resource_urls:
        assert _file_is_retrievable(url)

    # Delete crawls
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/delete",
        headers=admin_auth_headers,
        json={"crawl_ids": [crawl_id_wr, crawl_id_wr_specs]},
    )
    assert r.status_code == 200
    data = r.json()

    assert data["deleted"] == 2

    # Verify that crawls don't exist in db
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/crawls/{crawl_id_wr_specs}/replay.json",
        headers=admin_auth_headers,
    )
    assert r.status_code == 404

    # Give Minio time to delete the files
    time.sleep(120)

    # Verify that files are no longer retrievable from storage
    for url in crawl_resource_urls:
        assert not _file_is_retrievable(url)
