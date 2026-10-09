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


