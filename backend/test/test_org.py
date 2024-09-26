import os
import requests
import uuid

import pytest

from .conftest import API_PREFIX, NON_DEFAULT_ORG_NAME, NON_DEFAULT_ORG_SLUG
from .utils import read_in_chunks

curr_dir = os.path.dirname(os.path.realpath(__file__))

new_oid = None

invite_email = "test-user@example.com"

CUSTOM_PRIMARY_STORAGE_NAME = "custom-primary"
CUSTOM_REPLICA_STORAGE_NAME = "custom-replica"


def test_ensure_only_one_default_org(admin_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()
    assert data["total"] == 2

    orgs = data["items"]
    default_orgs = [org for org in orgs if org["default"]]
    assert len(default_orgs) == 1

    default_org_name = default_orgs[0]["name"]
    orgs_with_same_name = [org for org in orgs if org["name"] == default_org_name]
    assert len(orgs_with_same_name) == 1


def test_get_org_admin(admin_auth_headers, default_org_id):
    """org owners should receive details on users."""
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == default_org_id
    assert data["name"]

    users = data["users"]
    assert users
    for _, value in users.items():
        assert value["name"]
        assert value["email"]
        assert value["role"]


def test_get_org_crawler(crawler_auth_headers, default_org_id):
    """non-owners should *not* receive details on users."""
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}", headers=crawler_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == default_org_id
    assert data["name"]
    assert data.get("users") == {}


def test_update_org_crawling_defaults(admin_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/defaults/crawling",
        headers=admin_auth_headers,
        json={
            "maxCrawlSize": 200000,
            "lang": "fr",
            "customBehaviors": ["git+https://github.com/webrecorder/custom-behaviors"],
        },
    )

    assert r.status_code == 200
    assert r.json()["updated"] == True

    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)

    data = r.json()
    assert data["crawlingDefaults"]
    assert data["crawlingDefaults"]["maxCrawlSize"] == 200000
    assert data["crawlingDefaults"]["lang"] == "fr"
    assert data["crawlingDefaults"]["customBehaviors"] == [
        "git+https://github.com/webrecorder/custom-behaviors"
    ]


def test_rename_org(admin_auth_headers, default_org_id):
    UPDATED_NAME = "updated org name"
    UPDATED_SLUG = "updated-org-name"
    rename_data = {"name": UPDATED_NAME, "slug": UPDATED_SLUG}
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 200
    data = r.json()
    assert data["updated"]

    # Verify that name and slug are now updated.
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == UPDATED_NAME
    assert data["slug"] == UPDATED_SLUG


def test_rename_org_invalid_slug(admin_auth_headers, default_org_id):
    UPDATED_NAME = "updated org name"
    UPDATED_SLUG = "not a valid slug"
    rename_data = {"name": UPDATED_NAME, "slug": UPDATED_SLUG}
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_slug"


@pytest.mark.parametrize(
    "name",
    [
        # Identical name
        (NON_DEFAULT_ORG_NAME),
        # Identical name, different case
        ("Non-Default Org"),
    ],
)
def test_rename_org_duplicate_name(
    admin_auth_headers, default_org_id, non_default_org_id, name
):
    rename_data = {"name": name, "slug": "this-slug-should-be-okay"}
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "duplicate_org_name"


@pytest.mark.parametrize(
    "slug",
    [
        # Identical slug
        (NON_DEFAULT_ORG_SLUG),
        # Identical slug, different case
        ("Non-Default-Org"),
    ],
)
def test_rename_org_duplicate_slug(
    admin_auth_headers, default_org_id, non_default_org_id, slug
):
    rename_data = {"name": "Should be okay", "slug": slug}
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/rename",
        headers=admin_auth_headers,
        json=rename_data,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "duplicate_org_slug"


def test_create_org(admin_auth_headers):
    NEW_ORG_NAME = "New Org"
    NEW_ORG_SLUG = "new-org"
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": NEW_ORG_NAME, "slug": NEW_ORG_SLUG},
    )

    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["id"]

    global new_oid
    new_oid = data["id"]

    # Verify that org exists.
    r = requests.get(f"{API_PREFIX}/orgs/{new_oid}", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == NEW_ORG_NAME
    assert data["slug"] == NEW_ORG_SLUG
    assert data["created"]


@pytest.mark.parametrize(
    "name",
    [
        # Identical name
        (NON_DEFAULT_ORG_NAME),
        # Identical name, different case
        ("Non-Default Org"),
    ],
)
def test_create_org_duplicate_name(admin_auth_headers, non_default_org_id, name):
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": name, "slug": "another-new-org"},
    )

    assert r.status_code == 400
    data = r.json()
    assert data["detail"] == "duplicate_org_name"


@pytest.mark.parametrize(
    "slug",
    [
        # Identical slug
        (NON_DEFAULT_ORG_SLUG),
        # Identical slug, different case
        ("Non-Default-Org"),
    ],
)
def test_create_org_duplicate_slug(admin_auth_headers, non_default_org_id, slug):
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": "Yet another new org", "slug": slug},
    )

    assert r.status_code == 400
    data = r.json()
    assert data["detail"] == "duplicate_org_slug"


def test_change_storage_invalid(admin_auth_headers):
    # try to change to invalid storage
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
        json={"storage": {"name": "invalid-storage", "custom": False}},
    )

    assert r.status_code == 400

    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
        json={"storage": {"name": "alt-storage", "custom": True}},
    )

    assert r.status_code == 400


def test_add_custom_storage(admin_auth_headers):
    # add custom storages
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/custom-storage",
        headers=admin_auth_headers,
        json={
            "name": CUSTOM_PRIMARY_STORAGE_NAME,
            "access_key": "ADMIN",
            "secret_key": "PASSW0RD",
            "bucket": CUSTOM_PRIMARY_STORAGE_NAME,
            "endpoint_url": "http://local-minio.default:9000/",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["name"] == CUSTOM_PRIMARY_STORAGE_NAME

    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/custom-storage",
        headers=admin_auth_headers,
        json={
            "name": CUSTOM_REPLICA_STORAGE_NAME,
            "access_key": "ADMIN",
            "secret_key": "PASSW0RD",
            "bucket": CUSTOM_REPLICA_STORAGE_NAME,
            "endpoint_url": "http://local-minio.default:9000/",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]
    assert data["name"] == CUSTOM_REPLICA_STORAGE_NAME

    # set org to use custom storage moving forward
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
        json={
            "storage": {"name": CUSTOM_PRIMARY_STORAGE_NAME, "custom": True},
        },
    )

    assert r.status_code == 200
    assert r.json()["updated"]

    # set org to use custom storage replica moving forward
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage-replicas",
        headers=admin_auth_headers,
        json={
            "storageReplicas": [{"name": CUSTOM_REPLICA_STORAGE_NAME, "custom": True}],
        },
    )

    # check org was updated as expected
    r = requests.get(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    storage = data["storage"]
    assert storage["name"] == CUSTOM_PRIMARY_STORAGE_NAME
    assert storage["custom"]

    replicas = data["storageReplicas"]
    assert len(replicas) == 1
    replica = replicas[0]
    assert replica["name"] == CUSTOM_REPLICA_STORAGE_NAME
    assert replica["custom"]


def test_remove_custom_storage(admin_auth_headers):
    # Try to remove in-use storages, verify we get expected 400 response
    r = requests.delete(
        f"{API_PREFIX}/orgs/{new_oid}/custom-storage/{CUSTOM_PRIMARY_STORAGE_NAME}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "storage_in_use"

    r = requests.delete(
        f"{API_PREFIX}/orgs/{new_oid}/custom-storage/{CUSTOM_REPLICA_STORAGE_NAME}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "storage_in_use"

    # Unset replica storage from org
    r = requests.post(
        f"{API_PREFIX}/orgs/{new_oid}/storage-replicas",
        headers=admin_auth_headers,
        json={
            "storageReplicas": [],
        },
    )

    # Delete no longer used replica storage location
    r = requests.delete(
        f"{API_PREFIX}/orgs/{new_oid}/custom-storage/{CUSTOM_REPLICA_STORAGE_NAME}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["deleted"]

    # Check org
    r = requests.get(
        f"{API_PREFIX}/orgs/{new_oid}/storage",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    storage = data["storage"]
    assert storage["name"] == CUSTOM_PRIMARY_STORAGE_NAME
    assert storage["custom"]

    assert data["storageReplicas"] == []


def test_remove_user_from_org(admin_auth_headers, default_org_id):
    # Add new user to org
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/add-user",
        json={
            "email": "toremove@example.com",
            "password": "PASSW0RD!",
            "name": "toremove",
            "role": 10,
        },
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["added"]

    # Remove user
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/remove",
        json={"email": "toremove@example.com"},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["removed"]


def test_remove_non_existent_user(admin_auth_headers, default_org_id):
    # Remove user
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/remove",
        json={"email": "toremove@example.com"},
        headers=admin_auth_headers,
    )
    assert r.status_code == 404
    data = r.json()
    assert data["detail"] == "no_such_org_user"


def test_get_pending_org_invites(
    admin_auth_headers, default_org_id, non_default_org_id
):
    # Invite user to non-default org
    NON_DEFAULT_INVITE_EMAIL = "non-default-invite@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": NON_DEFAULT_INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Invite user to default org
    DEFAULT_INVITE_EMAIL = "default-invite@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": DEFAULT_INVITE_EMAIL, "role": 10},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Check that only invite to non-default org is returned
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites = data["items"]
    assert len(invites) == 1
    assert data["total"] == 1
    invite = invites[0]
    assert invite["email"] == NON_DEFAULT_INVITE_EMAIL
    assert invite["oid"] == non_default_org_id
    assert invite["created"]
    assert invite["role"]
    assert invite["firstOrgAdmin"] == False

    # Delete Invites
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": NON_DEFAULT_INVITE_EMAIL},
    )
    assert r.status_code == 200

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": DEFAULT_INVITE_EMAIL},
    )
    assert r.status_code == 200


@pytest.mark.parametrize(
    "invite_email, expected_stored_email",
    [
        # Standard email
        ("invite-to-accept-org@example.com", "invite-to-accept-org@example.com"),
        # Email address with comments
        ("user+comment-org@example.com", "user+comment-org@example.com"),
        # URL encoded email address with comments
        (
            "user%2Bcomment-encoded-org@example.com",
            "user+comment-encoded-org@example.com",
        ),
        # User email with diacritic characters
        ("diacritic-tést-org@example.com", "diacritic-tést-org@example.com"),
        # User email with encoded diacritic characters
        (
            "diacritic-t%C3%A9st-encoded-org@example.com",
            "diacritic-tést-encoded-org@example.com",
        ),
        # User email with upper case characters, stored as all lowercase
        ("exampleName@EXAMple.com", "examplename@example.com"),
    ],
)
def test_send_and_accept_org_invite(
    admin_auth_headers, non_default_org_id, invite_email, expected_stored_email
):
    # Send invite
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": invite_email, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"
    token = data["token"]

    # Register user
    # Note: This will accept invitation without needing to call the
    # accept invite endpoint explicitly due to post-registration hook.
    r = requests.post(
        f"{API_PREFIX}/auth/register",
        headers=admin_auth_headers,
        json={
            "name": "accepted",
            "email": expected_stored_email,
            "password": "testingpassword",
            "inviteToken": token,
        },
    )
    assert r.status_code == 201

    # Verify user belongs to org
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}", headers=admin_auth_headers
    )
    assert r.status_code == 200
    data = r.json()
    users = data["users"]
    users_with_invited_email = [
        user for user in users.values() if user["email"] == expected_stored_email
    ]
    assert len(users_with_invited_email) == 1


def test_delete_invite_by_email(admin_auth_headers, non_default_org_id):
    # Invite user to non-default org
    INVITE_EMAIL = "new-non-default-org-invite-by-email@example.com"
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invite",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL, "role": 20},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["invited"] == "new_user"

    # Delete invite by email
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": INVITE_EMAIL},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["removed"]
    assert data["count"] == 1

    # Verify invite no longer exists
    r = requests.get(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    invites_matching_email = [
        invite for invite in data["items"] if invite["email"] == INVITE_EMAIL
    ]
    assert len(invites_matching_email) == 0

    # Try to delete non-existent email and test we get 404
    bad_token = str(uuid.uuid4())
    r = requests.post(
        f"{API_PREFIX}/orgs/{non_default_org_id}/invites/delete",
        headers=admin_auth_headers,
        json={"email": "not-a-valid-invite@example.com"},
    )
    assert r.status_code == 404
    data = r.json()
    assert data["detail"] == "invite_not_found"


def test_update_event_webhook_urls_org_admin(admin_auth_headers, default_org_id):
    # Verify no URLs are configured
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    if data.get("webhooks"):
        webhooks = data.get("webhooks")
        assert webhooks.get("crawlStarted") is None
        assert webhooks.get("crawlFinished") is None
        assert webhooks.get("crawlDeleted") is None
        assert webhooks.get("uploadFinished") is None
        assert webhooks.get("uploadDeleted") is None
        assert webhooks.get("addedToCollection") is None
        assert webhooks.get("removedFromCollection") is None
        assert webhooks.get("collectionDeleted") is None

    # Set URLs and verify
    CRAWL_STARTED_URL = "https://example.com/crawl/started"
    CRAWL_FINISHED_URL = "https://example.com/crawl/finished"
    CRAWL_DELETED_URL = "https://example.com/crawl/deleted"
    UPLOAD_FINISHED_URL = "https://example.com/upload/finished"
    UPLOAD_DELETED_URL = "https://example.com/upload/deleted"
    COLL_ADDED_URL = "https://example.com/coll/added"
    COLL_REMOVED_URL = "http://example.com/coll/removed"
    COLL_DELETED_URL = "http://example.com/coll/deleted"

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/event-webhook-urls",
        headers=admin_auth_headers,
        json={
            "crawlStarted": CRAWL_STARTED_URL,
            "crawlFinished": CRAWL_FINISHED_URL,
            "crawlDeleted": CRAWL_DELETED_URL,
            "uploadFinished": UPLOAD_FINISHED_URL,
            "uploadDeleted": UPLOAD_DELETED_URL,
            "addedToCollection": COLL_ADDED_URL,
            "removedFromCollection": COLL_REMOVED_URL,
            "collectionDeleted": COLL_DELETED_URL,
        },
    )
    assert r.status_code == 200
    assert r.json()["updated"]

    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    urls = data["webhookUrls"]
    assert urls["crawlStarted"] == CRAWL_STARTED_URL
    assert urls["crawlFinished"] == CRAWL_FINISHED_URL
    assert urls["crawlDeleted"] == CRAWL_DELETED_URL

    assert urls["uploadFinished"] == UPLOAD_FINISHED_URL
    assert urls["uploadDeleted"] == UPLOAD_DELETED_URL

    assert urls["addedToCollection"] == COLL_ADDED_URL
    assert urls["removedFromCollection"] == COLL_REMOVED_URL
    assert urls["collectionDeleted"] == COLL_DELETED_URL


def test_update_event_webhook_urls_org_crawler(crawler_auth_headers, default_org_id):
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/event-webhook-urls",
        headers=crawler_auth_headers,
        json={
            "crawlStarted": "https://example.com/crawlstarted",
            "crawlFinished": "https://example.com/crawlfinished",
            "uploadFinished": "https://example.com/uploadfinished",
            "addedToCollection": "https://example.com/added",
            "removedFromCollection": "https://example.com/removed",
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "User does not have permission to perform this action"


def test_org_metrics(crawler_auth_headers, default_org_id):
    r = requests.get(
        f"{API_PREFIX}/orgs/{default_org_id}/metrics",
        headers=crawler_auth_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert data["storageUsedBytes"] > 0
    assert data["storageUsedCrawls"] > 0
    assert data["storageUsedUploads"] >= 0
    assert data["storageUsedProfiles"] >= 0
    assert (
        data["storageUsedBytes"]
        == data["storageUsedCrawls"]
        + data["storageUsedUploads"]
        + data["storageUsedProfiles"]
    )
    assert data["storageQuotaBytes"] >= 0
    assert data["archivedItemCount"] > 0
    assert data["crawlCount"] > 0
    assert data["uploadCount"] >= 0
    assert data["archivedItemCount"] == data["crawlCount"] + data["uploadCount"]
    assert data["pageCount"] > 0
    assert data["profileCount"] >= 0
    assert data["workflowsRunningCount"] >= 0
    assert data["workflowsQueuedCount"] >= 0
    assert data["collectionsCount"] > 0
    assert data["publicCollectionsCount"] >= 0


def test_get_org_slugs(admin_auth_headers):
    # Fetch org count and slugs from /orgs
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    assert r.status_code == 200
    data = r.json()
    org_count = data["total"]
    org_slugs = [item["slug"] for item in data["items"]]

    # Fetch slugs from /orgs/slugs and verify data looks right
    r = requests.get(f"{API_PREFIX}/orgs/slugs", headers=admin_auth_headers)
    assert r.status_code == 200
    slugs = r.json()["slugs"]

    assert len(slugs) == org_count
    for slug in slugs:
        assert slug in org_slugs


def test_get_org_slugs_non_superadmin(crawler_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/slugs", headers=crawler_auth_headers)
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"


def test_get_org_slug_lookup(admin_auth_headers):
    # Build an expected return from /orgs list to compare against
    expected_return = {}
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    assert r.status_code == 200
    for org in r.json()["items"]:
        expected_return[org["id"]] = org["slug"]

    # Fetch data from /orgs/slug-lookup and verify data is correct
    r = requests.get(f"{API_PREFIX}/orgs/slug-lookup", headers=admin_auth_headers)
    assert r.status_code == 200
    assert r.json() == expected_return


def test_get_org_slug_lookup_non_superadmin(crawler_auth_headers):
    r = requests.get(f"{API_PREFIX}/orgs/slug-lookup", headers=crawler_auth_headers)
    assert r.status_code == 403
    assert r.json()["detail"] == "Not Allowed"


def test_update_read_only(admin_auth_headers, default_org_id):
    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    data = r.json()
    assert data["readOnly"] in (False, None)
    assert data["readOnlyReason"] in (None, "")

    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/read-only",
        headers=admin_auth_headers,
        json={"readOnly": True, "readOnlyReason": "Payment suspended"},
    )
    assert r.json()["updated"]

    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    data = r.json()
    assert data["readOnly"] is True
    assert data["readOnlyReason"] == "Payment suspended"

    # Try to start crawl from new workflow, should fail
    crawl_data = {
        "runNow": True,
        "name": "Read Only Test Crawl",
        "description": "Should not run now",
        "tags": [],
        "config": {
            "seeds": [{"url": "https://webrecorder.net/", "depth": 1}],
            "exclude": "community",
        },
    }
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    assert data["added"]
    assert data["run_now_job"] is None

    cid = data["id"]
    assert cid

    # Try to start crawl from existing workflow, should fail
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/crawlconfigs/{cid}/run",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "org_set_to_read_only"

    # Try to upload a WACZ, should fail
    with open(os.path.join(curr_dir, "data", "example.wacz"), "rb") as fh:
        r = requests.put(
            f"{API_PREFIX}/orgs/{default_org_id}/uploads/stream?filename=test.wacz&name=My%20New%20Upload&description=Should%20Fail&collections=&tags=",
            headers=admin_auth_headers,
            data=read_in_chunks(fh),
        )

    assert r.status_code == 403
    assert r.json()["detail"] == "org_set_to_read_only"

    # Reset back to False, future tests should be unaffected
    r = requests.post(
        f"{API_PREFIX}/orgs/{default_org_id}/read-only",
        headers=admin_auth_headers,
        json={"readOnly": False},
    )
    assert r.json()["updated"]

    r = requests.get(f"{API_PREFIX}/orgs/{default_org_id}", headers=admin_auth_headers)
    data = r.json()
    assert data["readOnly"] is False
    # Test that reason is unset when readOnly is set to false, even implicitly
    assert data["readOnlyReason"] == ""


def test_sort_orgs(admin_auth_headers):
    # Create a few new orgs for testing
    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": "abc", "slug": "abc"},
    )
    assert r.status_code == 200

    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": "Mno", "slug": "mno"},
    )
    assert r.status_code == 200

    r = requests.post(
        f"{API_PREFIX}/orgs/create",
        headers=admin_auth_headers,
        json={"name": "xyz", "slug": "xyz"},
    )
    assert r.status_code == 200

    # Check default sorting
    # Default org should come first, followed by alphabetical sorting ascending
    # Ensure org names are sorted lexically, not by character code
    r = requests.get(f"{API_PREFIX}/orgs", headers=admin_auth_headers)
    data = r.json()
    orgs = data["items"]

    assert orgs[0]["default"]

    other_orgs = orgs[1:]
    last_name = None
    for org in other_orgs:
        org_name = org["name"]
        org_name_lower = org_name.lower()
        if last_name:
            assert org_name_lower > last_name
        last_name = org_name_lower

    # Sort by name descending, ensure default org still first
    r = requests.get(
        f"{API_PREFIX}/orgs?sortBy=name&sortDirection=-1", headers=admin_auth_headers
    )
    data = r.json()
    orgs = data["items"]

    assert orgs[0]["default"]

    other_orgs = orgs[1:]
    last_name = None
    for org in other_orgs:
        org_name = org["name"]
        org_name_lower = org_name.lower()
        if last_name:
            assert org_name_lower < last_name
        last_name = org_name_lower

    # Sort desc by lastCrawlFinished, ensure default org still first
    r = requests.get(
        f"{API_PREFIX}/orgs?sortBy=lastCrawlFinished&sortDirection=-1",
        headers=admin_auth_headers,
    )
    data = r.json()
    orgs = data["items"]

    assert orgs[0]["default"]

    other_orgs = orgs[1:]
    last_last_crawl_finished = None
    for org in other_orgs:
        last_crawl_finished = org.get("lastCrawlFinished")
        if not last_crawl_finished:
            continue
        if last_last_crawl_finished:
            assert last_crawl_finished <= last_last_crawl_finished
        last_last_crawl_finished = last_crawl_finished
