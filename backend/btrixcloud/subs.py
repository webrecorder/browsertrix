"""
Subscription API handling
"""

from typing import Callable
import asyncio

from fastapi import Depends, HTTPException, Request
from pymongo.errors import DuplicateKeyError

from .orgs import OrgOps
from .users import UserManager
from .models import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionCancel,
    SubscriptionData,
    InviteToOrgRequest,
    User,
    UserRole,
)


# ============================================================================
class SubOps:
    """API for managing subscriptions. Only enabled if billing is enabled"""

    org_ops: OrgOps
    user_manager: UserManager

    def __init__(self, mdb, org_ops: OrgOps, user_manager: UserManager):
        self.subs = mdb["subscriptions"]
        self.org_ops = org_ops
        self.user_manager = user_manager

    async def create_new_subscription(
        self, create: SubscriptionCreate, user: User, request: Request
    ):
        """create org for new subscription"""
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        sub_data = SubscriptionData(
            subId=create.id, status=create.status, details=create.details
        )

        try:
            new_org = await self.org_ops.create_org(
                quotas=create.quotas, sub_data=sub_data
            )
        except DuplicateKeyError as exc:
            raise HTTPException(
                status_code=400, detail="subscription_already_exists"
            ) from exc

        result = {"added": True, "id": new_org.id}

        if create.firstAdminInviteEmail:
            is_new, token = await self.org_ops.invites.invite_user(
                InviteToOrgRequest(
                    email=create.firstAdminInviteEmail, role=UserRole.OWNER
                ),
                user,
                self.user_manager,
                org=new_org,
                headers=dict(request.headers),
            )
            if is_new:
                result["invited"] = "new_user"
            else:
                result["invited"] = "existing_user"
            result["token"] = token

        await self.subs.insert_one(create.to_dict())

        return result

    async def update_subscription(self, update: SubscriptionUpdate):
        """update subs"""

        result = await self.org_ops.update_subscription_data(update)

        if not result:
            raise HTTPException(
                status_code=404, detail="org_for_subscription_not_found"
            )

        await self.subs.insert_one(update.to_dict())
        return {"updated": True}

    async def cancel_subscription(self, cancel: SubscriptionCancel):
        """delete subscription data, and if deleteOnCancel is true, the entire org"""

        org = await self.org_ops.cancel_subscription_data(cancel)

        if not org:
            raise HTTPException(
                status_code=404, detail="org_for_subscription_not_found"
            )

        if org.subData and org.subData.deleteOnCancel:
            asyncio.create_task(
                self.org_ops.delete_org_and_data(org, self.user_manager)
            )
            deleted = True
        else:
            deleted = False

        await self.subs.insert_one(cancel.to_dict())
        return {"canceled": True, "deleted": deleted}


def init_subs_api(
    app,
    mdb,
    org_ops: OrgOps,
    user_manager: UserManager,
    user_or_shared_secret_dep: Callable,
):
    """init subs API"""
    ops = SubOps(mdb, org_ops, user_manager)

    @app.post("/subscriptions/create", tags=["subscriptions"])
    async def new_sub(
        create: SubscriptionCreate,
        request: Request,
        user: User = Depends(user_or_shared_secret_dep),
    ):
        return await ops.create_new_subscription(create, user, request)

    @app.post("/subscriptions/update", tags=["subscriptions"])
    async def update_subscription(
        update: SubscriptionUpdate,
        user: User = Depends(user_or_shared_secret_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.update_subscription(update)

    @app.post("/subscriptions/cancel", tags=["subscriptions"])
    async def cancel_subscription(
        cancel: SubscriptionCancel,
        user: User = Depends(user_or_shared_secret_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.cancel_subscription(cancel)

    return ops
