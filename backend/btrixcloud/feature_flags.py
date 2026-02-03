from typing import Awaitable, Callable
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorClientSession,
    AsyncIOMotorDatabase,
)

from .users import UserManager
from .models import (
    FLAG_METADATA,
    FeatureFlagOrgUpdate,
    FeatureFlagOrgsUpdate,
    FeatureFlagOut,
    FeatureFlagUpdatedResponse,
    FeatureFlags,
    Organization,
    User,
)
from .orgs import OrgOps


class FeatureFlagOps:
    """Feature flag operations"""

    router: APIRouter

    def __init__(
        self,
        dbclient: AsyncIOMotorClient,
        mdb: AsyncIOMotorDatabase,
    ):
        self.orgs = mdb["organizations"]

    async def set_feature_flag_for_org(
        self,
        org_id: UUID,
        feature_name: FeatureFlags,
        value: bool,
        session: AsyncIOMotorClientSession | None = None,
    ):
        """Set a feature flag for an organization"""
        await self.orgs.update_one(
            {"_id": org_id},
            {"$set": {f"featureFlags.{feature_name}": value}},
            session=session,
        )

    async def set_orgs_for_feature_flag(
        self,
        org_ids: list[UUID],
        feature_name: FeatureFlags,
        session: AsyncIOMotorClientSession | None = None,
    ):
        """Set a feature flag for all organizations in a list, and unset it for all others"""
        await self.orgs.update_many(
            {"_id": {"$in": org_ids}, f"featureFlags.{feature_name}": {"$ne": True}},
            {"$set": {f"featureFlags.{feature_name}": True}},
            session=session,
        )
        await self.orgs.update_many(
            {"_id": {"$nin": org_ids}, f"featureFlags.{feature_name}": True},
            {"$unset": {f"featureFlags.{feature_name}": ""}},
            session=session,
        )

    async def get_orgs_for_feature_flag(
        self,
        feature_name: FeatureFlags,
        session: AsyncIOMotorClientSession | None = None,
    ):
        """Get all organizations that have a feature flag set"""
        orgs = await self.orgs.find(
            {f"featureFlags.{feature_name}": True},
            session=session,
        ).to_list(None)
        return [Organization.from_dict(data) for data in orgs]

    async def get_org_counts_for_flags(
        self,
        session: AsyncIOMotorClientSession | None = None,
    ):
        """Get the number of organizations that have each feature flag enabled"""
        counts = await self.orgs.aggregate(
            [
                {"$match": {"featureFlags": {"$exists": True, "$ne": {}}}},
                {"$project": {"flags": {"$objectToArray": "$featureFlags"}}},
                {"$unwind": "$flags"},
                {"$match": {"flags.v": True}},
                {"$group": {"_id": "$flags.k", "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ],
            session=session,
        ).to_list(None)
        return {count["_id"]: count["count"] for count in counts}


def init_feature_flags_api(
    app: APIRouter,
    dbclient: AsyncIOMotorClient,
    mdb: AsyncIOMotorDatabase,
    user_dep: Callable[[str], Awaitable[User]],
    org_ops: OrgOps,
    user_manager: UserManager,
):
    """Initialize feature flags for all organizations"""

    ops = FeatureFlagOps(dbclient, mdb)

    async def superuser_dep(user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not a superuser")
        return user

    async def org_dep(org_id: UUID, user: User = Depends(superuser_dep)):
        org = await org_ops.get_org_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        return org

    router = APIRouter(
        prefix="/flags",
        dependencies=[Depends(superuser_dep)],
        responses={404: {"description": "Not found"}},
        tags=["Feature Flags"],
    )

    ops.router = router

    @router.get("/metadata")
    async def get_metadata():
        # get number of organizations that have each feature flag enabled
        org_counts = await ops.get_org_counts_for_flags()
        # omit owner and expiry from metadata
        return [
            FeatureFlagOut(
                name=name, count=org_counts.get(name, 0), **flag.model_dump()
            )
            for name, flag in FLAG_METADATA.items()
        ]

    @router.get("/{feature}/org/{org_id}")
    async def get_feature_flag(
        feature: FeatureFlags, org: Organization = Depends(org_dep)
    ):
        return org.has_feature(feature)

    @router.patch("/{feature}/org/{org_id}", response_model=FeatureFlagUpdatedResponse)
    async def set_feature_flag(
        feature: FeatureFlags,
        update: FeatureFlagOrgUpdate,
        org: Organization = Depends(org_dep),
    ):
        await ops.set_feature_flag_for_org(org.id, feature, update.value)
        return FeatureFlagUpdatedResponse(feature=feature, updated=True)

    @router.get("/{feature}/orgs")
    async def get_orgs_for_feature_flag(
        feature: FeatureFlags, user: User = Depends(superuser_dep)
    ):
        results = await ops.get_orgs_for_feature_flag(feature)
        serialized_results = [
            await res.serialize_for_user(user, user_manager) for res in results
        ]

        return serialized_results

    @router.patch("/{feature}/orgs", response_model=FeatureFlagUpdatedResponse)
    async def set_orgs_for_feature_flag(
        feature: FeatureFlags, update: FeatureFlagOrgsUpdate
    ):
        await ops.set_orgs_for_feature_flag(update.orgs, feature)
        return FeatureFlagUpdatedResponse(feature=feature, updated=True)

    return ops
