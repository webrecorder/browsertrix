"""In-process tests for the storage add-on admin notification (AC.15) and the
revert-marker persistence (AC.15 idempotency half).

These must run in-process: `test_org_subs.py` drives a separate backend
process, so monkeypatching `user_manager.email` there would have no effect on
the fan-out.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import aiohttp
import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from btrixcloud.models import (
    Organization,
    OrgQuotas,
    Plan,
    StorageRef,
    Subscription,
    SubscriptionCreate,
    SubscriptionStatus,
    SubscriptionUpdate,
    User,
)
from btrixcloud.orgs import BaseOrgs, OrgOps
from btrixcloud.subs import SubOps
from btrixcloud.utils import bg_tasks

orgs = BaseOrgs()

base_quotas = OrgQuotas(
    storageQuota=500_000_000_000,
    extraStorageQuota=200_000_000_000,
    maxExecMinutesPerMonth=720,
    maxConcurrentCrawls=3,
    maxPagesPerCrawl=20000,
)


def get_org(
    revert_marker: int | None = None,
    pending_gb: int | None = None,
) -> Organization:
    return Organization(
        id=uuid4(),
        name="Test Organization",
        slug="test-org",
        storage=StorageRef(name="test-storage"),
        quotas=base_quotas,
        subscription=Subscription(
            subId="stripe:sub_test",
            status=SubscriptionStatus.ACTIVE,
            planId="basic",
            storageAddonPendingGB=pending_gb,
            storageAddonRevertedRequestedGB=revert_marker,
        ),
    )


@pytest.fixture
def mocks():
    mock_db_client = AsyncMock(spec=AsyncIOMotorClient)
    mock_db = MagicMock(spec=AsyncIOMotorDatabase)
    mock_collection = MagicMock()
    mock_collection.find_one = AsyncMock()
    mock_collection.find_one_and_update = AsyncMock()
    # add_sub_event awaits `self.subs.insert_one(...)`
    mock_collection.insert_one = AsyncMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    mock_db_client.__getitem__ = MagicMock(return_value=mock_db)

    org_ops = MagicMock(spec=OrgOps)
    user_manager = MagicMock()
    user_manager.email.send_storage_addon_change_reverted = AsyncMock()

    user_1 = MagicMock(spec=User)
    user_1.name = "Alice"
    user_1.email = "alice@example.com"
    user_2 = MagicMock(spec=User)
    user_2.name = "Bob"
    user_2.email = "bob@example.com"
    org_ops.get_users_for_org = AsyncMock(return_value=[user_1, user_2])

    return {
        "db": mock_db,
        "collection": mock_collection,
        "org_ops": org_ops,
        "user_manager": user_manager,
        "users": [user_1, user_2],
    }


async def _drain_bg_tasks():
    """Await every task scheduled via run_async_task.

    `run_async_task` holds each task in `bg_tasks` until it completes, which is
    the only handle on it (the email fan-out is deliberately fire-and-forget so
    the webhook response is not blocked).
    """
    await asyncio.gather(*bg_tasks)


def make_revert_update(requested_gb: int = 50) -> SubscriptionUpdate:
    return SubscriptionUpdate(
        subId="stripe:sub_test",
        status=SubscriptionStatus.ACTIVE,
        planId="basic",
        storageAddonGB=200,
        storageAddonPendingGB=None,
        storageAddonReverted=True,
        storageAddonRequestedGB=requested_gb,
    )


@pytest.mark.asyncio
async def test_update_sub_storage_addon_reverted_emails_admins(mocks):
    """A first-time revert (no stored marker, and no pending state - the
    realistic first sight of an out-of-band reduction) emails every owner."""
    ops = SubOps(mocks["db"], mocks["org_ops"], mocks["user_manager"])
    # org returned is the pre-update image
    mocks["org_ops"].update_subscription_data = AsyncMock(
        return_value=get_org(revert_marker=None, pending_gb=None)
    )

    await ops.update_subscription(make_revert_update(50))

    # the email fires via run_async_task; wait for the background tasks to run
    await _drain_bg_tasks()

    send = mocks["user_manager"].email.send_storage_addon_change_reverted
    assert send.await_count == len(mocks["users"])
    for call, user in zip(send.await_args_list, mocks["users"]):
        args = call.args
        assert args[0] == user.name
        assert args[1] == user.email
        assert args[2] == 50  # attempted size
        assert args[3] == 200  # retained size


@pytest.mark.asyncio
async def test_update_sub_storage_addon_reverted_email_idempotent(mocks):
    """A retry of the same cancellation does not send a second email.

    We already recorded that we told admins about a reduction to 50GB, so the
    same size again is skipped.
    """
    ops = SubOps(mocks["db"], mocks["org_ops"], mocks["user_manager"])
    mocks["org_ops"].update_subscription_data = AsyncMock(
        return_value=get_org(revert_marker=50)
    )

    await ops.update_subscription(make_revert_update(50))

    await _drain_bg_tasks()

    send = mocks["user_manager"].email.send_storage_addon_change_reverted
    assert send.await_count == 0


def make_org_ops(org: Organization) -> tuple[OrgOps, MagicMock]:
    """An OrgOps whose collection returns the mongo-shaped `org` document."""
    mock_db_client = AsyncMock(spec=AsyncIOMotorClient)
    mock_db = MagicMock(spec=AsyncIOMotorDatabase)
    mock_collection = MagicMock()
    mock_collection.find_one = AsyncMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    mock_db_client.__getitem__ = MagicMock(return_value=mock_db)
    mock_db_client.start_session = AsyncMock()

    # from_dict() expects the mongo shape (_id)
    org_data = org.dict()
    org_data.pop("id", None)
    org_data["_id"] = org.id
    mock_collection.find_one_and_update = AsyncMock(return_value=org_data)

    org_ops = OrgOps(
        dbclient=mock_db_client,
        mdb=mock_db,
        invites=MagicMock(),
        user_manager=MagicMock(),
        crawl_manager=MagicMock(),
    )
    return org_ops, mock_collection


@pytest.mark.asyncio
async def test_update_subscription_data_sets_revert_marker():
    """The size from a cancelled reduction is saved, so the email is not sent
    twice for the same one."""
    org_ops, collection = make_org_ops(get_org())

    await org_ops.update_subscription_data(make_revert_update(50))

    set_dict = collection.find_one_and_update.call_args[0][1]["$set"]
    assert set_dict["subscription.storageAddonRevertedRequestedGB"] == 50


@pytest.mark.asyncio
async def test_update_subscription_data_clears_revert_marker():
    """An ordinary update with no cancellation clears the saved size, so a
    later cancellation of the same size emails again."""
    org_ops, collection = make_org_ops(get_org(revert_marker=50))

    await org_ops.update_subscription_data(
        SubscriptionUpdate(
            subId="stripe:sub_test",
            status=SubscriptionStatus.ACTIVE,
            planId="basic",
        )
    )

    set_dict = collection.find_one_and_update.call_args[0][1]["$set"]
    assert set_dict["subscription.storageAddonRevertedRequestedGB"] is None


@pytest.mark.asyncio
async def test_storage_addon_state_helpers_removed():
    """AC.9: the dead add-on state-read chain is gone on both surfaces."""
    import btrixcloud.models as models
    import btrixcloud.subs as subs

    assert not hasattr(subs.SubOps, "get_storage_addon_state")
    assert not hasattr(models, "StorageAddonStateResponse")


@pytest.mark.asyncio
@pytest.mark.parametrize("requested_gb", [300, 0])
async def test_update_subscription_converges_addon_quota(mocks, requested_gb):
    """AC.5 (locally runnable half): `storageAddonGB=N` sets
    `extraStorageQuota` to N * 1e9, including a genuine 0. The end-to-end
    version (incl. the OrgQuotaUpdate short-circuit) is in test_org_subs.py,
    which needs a live backend, so this pins the arithmetic in CI and locally.
    """
    ops = SubOps(mocks["db"], mocks["org_ops"], mocks["user_manager"])
    # pre-update image has the add-on at 200GB
    mocks["org_ops"].update_subscription_data = AsyncMock(return_value=get_org())
    mocks["org_ops"].update_quotas = AsyncMock()

    await ops.update_subscription(
        SubscriptionUpdate(
            subId="stripe:sub_test",
            status=SubscriptionStatus.ACTIVE,
            planId="basic",
            storageAddonGB=requested_gb,
        )
    )

    mocks["org_ops"].update_quotas.assert_awaited_once()
    quotas_in = mocks["org_ops"].update_quotas.await_args.args[1]
    assert quotas_in.extraStorageQuota == requested_gb * 1_000_000_000


def make_create(**extra) -> SubscriptionCreate:
    """A create event as sent for a plan payment-link checkout."""
    return SubscriptionCreate(
        subId="stripe:sub_create",
        status=SubscriptionStatus.ACTIVE,
        planId="basic",
        firstAdminInviteEmail="admin@example.com",
        **extra,
    )


async def _run_create(ops, mocks, create) -> None:
    mocks["org_ops"].create_org = AsyncMock(return_value=get_org())
    mocks["org_ops"].update_quotas = AsyncMock()
    # `invites` is only an annotation on OrgOps, so the spec'd mock doesn't have
    # it; attach it manually
    invites = MagicMock()
    invites.invite_user = AsyncMock(return_value=(True, "tok"))
    mocks["org_ops"].invites = invites
    await ops.create_new_subscription(create, MagicMock(spec=User), MagicMock())


@pytest.mark.asyncio
async def test_create_subscription_applies_storage_and_minutes_addons(mocks):
    """Both add-ons land in one call: storage in `extraStorageQuota`, minutes in
    `extraExecMinutes`."""
    ops = SubOps(mocks["db"], mocks["org_ops"], mocks["user_manager"])

    await _run_create(
        ops, mocks, make_create(storageAddonGB=400, additionalMinutes=600)
    )

    mocks["org_ops"].update_quotas.assert_awaited_once()
    quotas_in = mocks["org_ops"].update_quotas.await_args.args[1]
    assert quotas_in.extraStorageQuota == 400_000_000_000
    assert quotas_in.extraExecMinutes == 600


@pytest.mark.asyncio
async def test_create_subscription_applies_minutes_without_storage(mocks):
    """Subscription with add-on minutes: ensure they apply, and the extra
    storage field stays None so `update_quotas` doesn't write a stray 0."""
    ops = SubOps(mocks["db"], mocks["org_ops"], mocks["user_manager"])

    await _run_create(ops, mocks, make_create(additionalMinutes=600))

    mocks["org_ops"].update_quotas.assert_awaited_once()
    quotas_in = mocks["org_ops"].update_quotas.await_args.args[1]
    assert quotas_in.extraStorageQuota is None
    assert quotas_in.extraExecMinutes == 600


@pytest.mark.asyncio
async def test_create_subscription_without_addons_writes_no_quota(mocks):
    ops = SubOps(mocks["db"], mocks["org_ops"], mocks["user_manager"])

    await _run_create(ops, mocks, make_create())

    mocks["org_ops"].update_quotas.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_subscription_unchanged_addon_is_a_noop(mocks):
    """Repeating the current add-on size writes no quota (the app emits the
    field on every event, so this is the common case)."""
    ops = SubOps(mocks["db"], mocks["org_ops"], mocks["user_manager"])
    mocks["org_ops"].update_subscription_data = AsyncMock(return_value=get_org())
    mocks["org_ops"].update_quotas = AsyncMock()

    await ops.update_subscription(
        SubscriptionUpdate(
            subId="stripe:sub_test",
            status=SubscriptionStatus.ACTIVE,
            planId="basic",
            storageAddonGB=200,  # already the value on get_org()
        )
    )

    mocks["org_ops"].update_quotas.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_subscription_data_sets_billing_interval():
    """When the external subscription app sends the billing interval, both
    fields are persisted."""
    org_ops, collection = make_org_ops(get_org())

    await org_ops.update_subscription_data(
        SubscriptionUpdate(
            subId="stripe:sub_test",
            status=SubscriptionStatus.ACTIVE,
            planId="basic",
            billingInterval="month",
            billingIntervalCount=3,
        )
    )

    set_dict = collection.find_one_and_update.call_args[0][1]["$set"]
    assert set_dict["subscription.billingInterval"] == "month"
    assert set_dict["subscription.billingIntervalCount"] == 3


@pytest.mark.asyncio
async def test_update_subscription_data_sets_pending_plan():
    """A scheduled plan change is stored on the subscription."""
    org_ops, collection = make_org_ops(get_org())

    await org_ops.update_subscription_data(
        SubscriptionUpdate(
            subId="stripe:sub_test",
            status=SubscriptionStatus.ACTIVE,
            planId="basic",
            pendingPlanId="starter",
        )
    )

    set_dict = collection.find_one_and_update.call_args[0][1]["$set"]
    assert set_dict["subscription.pendingPlanId"] == "starter"


@pytest.mark.asyncio
async def test_update_subscription_data_clears_pending_plan():
    """An update with nothing pending clears the stored plan: the subscription
    app leaves the field out of the JSON when there is no pending change."""
    org_ops, collection = make_org_ops(get_org())

    await org_ops.update_subscription_data(
        SubscriptionUpdate(
            subId="stripe:sub_test",
            status=SubscriptionStatus.ACTIVE,
            planId="basic",
        )
    )

    set_dict = collection.find_one_and_update.call_args[0][1]["$set"]
    assert set_dict["subscription.pendingPlanId"] is None


