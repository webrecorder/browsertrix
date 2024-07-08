"""
Subscription API handling
"""

from typing import Callable, Union, Any, Optional
import os

from fastapi import Depends, HTTPException, Request
import aiohttp

from .orgs import OrgOps
from .users import UserManager
from .utils import dt_now
from .models import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionCancel,
    SubscriptionData,
    SubscriptionDataOut,
    SubscriptionPullUpdateRequest,
    SubscriptionPullUpdateResponse,
    Organization,
    InviteToOrgRequest,
    User,
    UserRole,
)


# if set, will lookup external portalUrl from this endpoint
external_subs_app_api_url = os.environ.get("BTRIX_SUBS_APP_URL")


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
    ) -> dict[str, Any]:
        """create org for new subscription"""
        sub_data = SubscriptionData(
            subId=create.subId, status=create.status, details=create.details
        )

        new_org = await self.org_ops.create_org(quotas=create.quotas, sub_data=sub_data)

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

        await self.add_sub_event(create)

        return result

    async def update_subscription(self, update: SubscriptionUpdate) -> dict[str, bool]:
        """update subs"""

        org = await self.org_ops.update_subscription_data(update)

        if not org:
            raise HTTPException(
                status_code=404, detail="org_for_subscription_not_found"
            )

        await self.add_sub_event(update)
        return {"updated": True}

    async def cancel_subscription(self, cancel: SubscriptionCancel) -> dict[str, bool]:
        """delete subscription data, and if readOnlyOnCancel is true, the entire org"""

        org = await self.org_ops.cancel_subscription_data(cancel)

        if not org:
            raise HTTPException(
                status_code=404, detail="org_for_subscription_not_found"
            )

        # extra sanity check, shouldn't ever be true
        if not org.subData or org.subData.subId != cancel.subId:
            return {"canceled": False, "deleted": False}

        # mark as read-only even if deleting, in case deletion
        # takes some time
        deleted = False

        await self.org_ops.update_read_only(
            org, readOnly=True, readOnlyReason="subscriptionCanceled"
        )

        if not org.subData.readOnlyOnCancel:
            await self.org_ops.delete_org_and_data(org, self.user_manager)
            deleted = True

        await self.add_sub_event(cancel)
        return {"canceled": True, "deleted": deleted}

    async def add_sub_event(
        self, event: Union[SubscriptionCreate, SubscriptionUpdate, SubscriptionCancel]
    ) -> None:
        """add a subscription event to the db"""
        data = event.dict(exclude_unset=True)
        data["timestamp"] = dt_now()
        await self.subs.insert_one(data)

    async def get_sub_info(
        self, org: Organization
    ) -> dict[str, Optional[SubscriptionDataOut]]:
        """Get subscription info, fetching portal url if available"""
        if not org.subData:
            return {"subscription": None}

        portal_url = ""

        if external_subs_app_api_url:
            try:
                req = SubscriptionPullUpdateRequest(
                    subId=org.subData.subId, details=org.subData.details
                )
                async with aiohttp.ClientSession() as session:
                    async with session.request(
                        "POST",
                        external_subs_app_api_url,
                        json=req.json(),
                    ) as resp:
                        json = await resp.json()
                        sub_resp = SubscriptionPullUpdateResponse(**json)
                        portal_url = sub_resp.portalUrl
            # pylint: disable=broad-exception-caught
            except Exception as exc:
                print("Error fetching portal url", exc)

        sub_out = SubscriptionDataOut(
            status=org.subData.status,
            futureCancelDate=org.subData.futureCancelDate,
            readOnlyOnCancel=org.subData.readOnlyOnCancel,
            portalUrl=portal_url,
        )

        return {"subscription": sub_out}


def init_subs_api(
    app,
    mdb,
    org_ops: OrgOps,
    user_manager: UserManager,
    user_or_shared_secret_dep: Callable,
) -> SubOps:
    """init subs API"""
    ops = SubOps(mdb, org_ops, user_manager)

    @app.post("/subscriptions/create", tags=["subscriptions"])
    async def new_sub(
        create: SubscriptionCreate,
        request: Request,
        user: User = Depends(user_or_shared_secret_dep),
    ):
        return await ops.create_new_subscription(create, user, request)

    @app.post(
        "/subscriptions/update",
        tags=["subscriptions"],
        dependencies=[Depends(user_or_shared_secret_dep)],
    )
    async def update_subscription(
        update: SubscriptionUpdate,
    ):
        return await ops.update_subscription(update)

    @app.post(
        "/subscriptions/cancel",
        tags=["subscriptions"],
        dependencies=[Depends(user_or_shared_secret_dep)],
    )
    async def cancel_subscription(
        cancel: SubscriptionCancel,
    ):
        return await ops.cancel_subscription(cancel)

    assert org_ops.router

    @org_ops.router.get("/subscription", tags=["organizations"])
    async def get_sub_info(org: Organization = Depends(org_ops.org_owner_dep)):
        return await ops.get_sub_info(org)

    return ops
