import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from btrixcloud.models import OrgQuotasIn, Organization, StorageRef, OrgQuotas
from btrixcloud.orgs import BaseOrgs, OrgOps
from btrixcloud.utils import dt_now

orgs = BaseOrgs()

base_quotas = OrgQuotas(
    storageQuota=500000000000,
    maxExecMinutesPerMonth=720,
    maxConcurrentCrawls=3,
    maxPagesPerCrawl=20000,
    extraExecMinutes=550,
    giftedExecMinutes=350,
)


@pytest.fixture(scope="session")
def org_ops():
    # Mock the mongo client & db
    mock_db_client = AsyncMock(spec=AsyncIOMotorClient)
    mock_db = MagicMock(spec=AsyncIOMotorDatabase)

    # Mock the organizations collection with async methods
    mock_orgs_collection = MagicMock()
    mock_orgs_collection.find_one = AsyncMock()
    mock_orgs_collection.find_one_and_update = AsyncMock()

    # Set up the database to return the mocked collection
    mock_db.__getitem__ = MagicMock(return_value=mock_orgs_collection)
    mock_db_client.__getitem__ = MagicMock(return_value=mock_db)

    # Mock start_session to return an async context manager
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)
    mock_db_client.start_session = AsyncMock(return_value=mock_session)

    mock_invites = MagicMock()

    mock_user_manager = MagicMock()

    mock_crawl_manager = MagicMock()

    org_ops = OrgOps(
        dbclient=mock_db_client,
        mdb=mock_db,
        invites=mock_invites,
        user_manager=mock_user_manager,
        crawl_manager=mock_crawl_manager,
    )

    return org_ops


def get_org(quotas: OrgQuotas, monthly=None, **kwargs):
    monthlyExecSeconds = {}
    if monthly:
        yymm = dt_now().strftime("%Y-%m")
        monthlyExecSeconds[yymm] = monthly * 60

    return Organization(
        id=uuid.uuid4(),
        name="Test Organization",
        slug="test-org",
        storage=StorageRef(name="test-storage"),
        quotas=quotas,
        monthlyExecSeconds=monthlyExecSeconds,
        **kwargs
    )


@pytest.mark.asyncio
async def test_update_quotas_mode_set(org_ops: OrgOps):
    # quota not reached
    org = get_org(base_quotas)
    assert org.quotas == base_quotas

    # Mock get_org_by_id to return the org
    org_ops.orgs.find_one = AsyncMock(return_value=org.to_dict())

    # Mock find_one_and_update to succeed
    org_ops.orgs.find_one_and_update = AsyncMock(return_value=org.to_dict())

    # update quotas
    new_quotas = OrgQuotasIn(
        maxExecMinutesPerMonth=320,
        maxConcurrentCrawls=5,
        maxPagesPerCrawl=10000,
    )
    await org_ops.update_quotas(org, new_quotas, "set")

    # Assert find_one was called with the org id
    org_ops.orgs.find_one.assert_called_once_with(
        {"_id": org.id}, session=org_ops.orgs.find_one.call_args[1].get("session")
    )

    # Assert find_one_and_update was called twice (once for mode="add" branch which doesn't execute, and once for the final update)
    assert org_ops.orgs.find_one_and_update.call_count == 1

    # Check the final update call
    final_update_call = org_ops.orgs.find_one_and_update.call_args
    assert final_update_call[0][0] == {"_id": org.id}
    update_dict = final_update_call[0][1]
    assert update_dict["$set"] == {
        "quotas.maxExecMinutesPerMonth": 320,
        "quotas.maxConcurrentCrawls": 5,
        "quotas.maxPagesPerCrawl": 10000,
    }
    assert (
        update_dict["$push"]["quotaUpdates"]["update"]["maxExecMinutesPerMonth"] == 320
    )
    assert update_dict["$push"]["quotaUpdates"]["update"]["maxConcurrentCrawls"] == 5
    assert update_dict["$push"]["quotaUpdates"]["update"]["maxPagesPerCrawl"] == 10000
    assert update_dict["$push"]["quotaUpdates"]["subEventId"] is None
    assert update_dict["$inc"] == {}


@pytest.mark.asyncio
async def test_update_quotas_add(org_ops: OrgOps):
    # quota not reached
    org = get_org(base_quotas)
    assert org.quotas == base_quotas

    # Mock get_org_by_id to return the org
    org_ops.orgs.find_one = AsyncMock(return_value=org.to_dict())

    # Mock find_one_and_update to succeed
    org_ops.orgs.find_one_and_update = AsyncMock(return_value=org.to_dict())

    # update quotas
    new_quotas = OrgQuotasIn(extraExecMinutes=500)
    await org_ops.update_quotas(org, new_quotas, "add")

    # Assert find_one was called with the org id
    org_ops.orgs.find_one.assert_called_once_with(
        {"_id": org.id}, session=org_ops.orgs.find_one.call_args[1].get("session")
    )

    # Assert find_one_and_update was called twice (once for mode="add" branch which doesn't execute, and once for the final update)
    assert org_ops.orgs.find_one_and_update.call_count == 2

    # Check the first update call
    first_update_call = org_ops.orgs.find_one_and_update.call_args_list[0]
    assert first_update_call[0][0] == {"_id": org.id}

    # # Check the first update call's update dict
    update_dict_1 = first_update_call[0][1]
    assert update_dict_1["$inc"] == {"quotas.extraExecMinutes": 500}

    # Check the second update call
    second_update_call = org_ops.orgs.find_one_and_update.call_args_list[1]
    assert second_update_call[0][0] == {"_id": org.id}

    # Check the second update call's update dict
    update_dict_2 = second_update_call[0][1]
    assert update_dict_2["$push"]["quotaUpdates"]["update"] == {
        "storageQuota": 500000000000,
        "maxExecMinutesPerMonth": 720,
        "maxConcurrentCrawls": 3,
        "maxPagesPerCrawl": 20000,
        "extraExecMinutes": 550,
        "giftedExecMinutes": 350,
    }
    assert update_dict_2["$push"]["quotaUpdates"]["subEventId"] is None
    assert update_dict_2["$inc"] == {}
