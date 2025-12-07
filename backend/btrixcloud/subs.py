"""
Subscription API handling
"""

from typing import Awaitable, Callable, Union, Any, Optional, Tuple, List, Annotated
import os
import asyncio
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Query
import aiohttp
from motor.motor_asyncio import AsyncIOMotorDatabase

from .orgs import OrgOps
from .users import UserManager
from .utils import is_bool, get_origin
from .models import (
    AddonMinutesPricing,
    CheckoutAddonMinutesRequest,
    CheckoutAddonMinutesResponse,
    SubscriptionCreate,
    SubscriptionImport,
    SubscriptionUpdate,
    SubscriptionCancel,
    SubscriptionAddMinutes,
    SubscriptionCreateOut,
    SubscriptionImportOut,
    SubscriptionUpdateOut,
    SubscriptionCancelOut,
    SubscriptionAddMinutesOut,
    SubscriptionEventType,
    Subscription,
    SubscriptionPortalUrlRequest,
    SubscriptionPortalUrlResponse,
    SubscriptionCanceledResponse,
    SubscriptionTrialEndReminder,
    Organization,
    OrgQuotasIn,
    InviteToOrgRequest,
    InviteAddedResponse,
    User,
    UserRole,
    AddedResponseId,
    UpdatedResponse,
    SuccessResponse,
    PaginatedSubscriptionEventResponse,
    REASON_CANCELED,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import dt_now


# if set, will enable this api
subscriptions_enabled = is_bool(os.environ.get("BILLING_ENABLED"))


# if set, will lookup external portalUrl from this endpoint
external_subs_app_api_url = os.environ.get("BTRIX_SUBS_APP_URL")

# with this key
external_subs_app_api_key = os.environ.get("BTRIX_SUBS_APP_API_KEY", "")


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
        subscription = Subscription(
            subId=create.subId, status=create.status, planId=create.planId
        )

        new_org = await self.org_ops.create_org(
            quotas=create.quotas, subscription=subscription
        )

        is_new, token = await self.org_ops.invites.invite_user(
            InviteToOrgRequest(email=create.firstAdminInviteEmail, role=UserRole.OWNER),
            user,
            self.user_manager,
            org=new_org,
            headers=dict(request.headers),
        )
        if is_new:
            invited = "new_user"
        else:
            invited = "existing_user"

        await self.add_sub_event("create", create, new_org.id)

        return {"added": True, "id": new_org.id, "invited": invited, "token": token}

    async def import_subscription(
        self, sub_import: SubscriptionImport
    ) -> dict[str, Any]:
        """import subscription to existing org"""
        subscription = Subscription(
            subId=sub_import.subId, status=sub_import.status, planId=sub_import.planId
        )
        await self.org_ops.add_subscription_to_org(subscription, sub_import.oid)

        await self.add_sub_event("import", sub_import, sub_import.oid)

        return {"added": True, "id": sub_import.oid}

    async def update_subscription(self, update: SubscriptionUpdate) -> dict[str, bool]:
        """update subs"""

        org = await self.org_ops.update_subscription_data(update)

        if not org:
            raise HTTPException(
                status_code=404, detail="org_for_subscription_not_found"
            )

        await self.add_sub_event("update", update, org.id)

        if update.futureCancelDate and self.should_send_cancel_email(org, update):
            asyncio.create_task(self.send_cancel_emails(update.futureCancelDate, org))

        return {"updated": True}

    def should_send_cancel_email(self, org: Organization, update: SubscriptionUpdate):
        """Should we sent a cancellation email"""
        if not update.futureCancelDate:
            return False

        if not org.subscription:
            return False

        # new cancel date, send
        if update.futureCancelDate != org.subscription.futureCancelDate:
            return True

        # if 'trialing_canceled', send
        if update.status == "trialing_canceled":
            return True

        return False

    async def send_cancel_emails(self, cancel_date: datetime, org: Organization):
        """Asynchronously send cancellation emails to all org admins"""
        users = await self.org_ops.get_users_for_org(org, UserRole.OWNER)
        await asyncio.gather(
            *[
                self.user_manager.email.send_subscription_will_be_canceled(
                    cancel_date, user.name, user.email, org
                )
                for user in users
            ]
        )

    async def cancel_subscription(self, cancel: SubscriptionCancel) -> dict[str, bool]:
        """delete subscription data, and unless if readOnlyOnCancel is true, the entire org"""

        org = await self.org_ops.cancel_subscription_data(cancel)

        if not org:
            raise HTTPException(
                status_code=404, detail="org_for_subscription_not_found"
            )

        # extra sanity check, shouldn't ever be true
        if not org.subscription or org.subscription.subId != cancel.subId:
            return {"canceled": False, "deleted": False}

        # mark as read-only even if deleting, in case deletion
        # takes some time
        deleted = False

        await self.org_ops.update_read_only(
            org, readOnly=True, readOnlyReason=REASON_CANCELED
        )

        if not org.subscription.readOnlyOnCancel:
            await self.org_ops.delete_org_and_data(org, self.user_manager)
            deleted = True

        await self.add_sub_event("cancel", cancel, org.id)
        return {"canceled": True, "deleted": deleted}

    async def send_trial_end_reminder(
        self,
        reminder: SubscriptionTrialEndReminder,
    ):
        """Send a trial end reminder email to the organization admins"""

        org = await self.org_ops.find_org_by_subscription_id(reminder.subId)

        if not org:
            print(f"Organization not found for subscription ID {reminder.subId}")
            raise HTTPException(
                status_code=404, detail="org_for_subscription_not_found"
            )

        assert org.subscription

        if not org.subscription.futureCancelDate:
            print(f"Future cancel date not found for subscription ID {reminder.subId}")
            raise HTTPException(status_code=400, detail="future_cancel_date_not_found")

        users = await self.org_ops.get_users_for_org(org, UserRole.OWNER)

        if len(users) == 0:
            print(f"No admin users found for organization ID {org.id}")
            raise HTTPException(status_code=400, detail="no_admin_users_found")

        await asyncio.gather(
            *[
                self.user_manager.email.send_subscription_trial_ending_soon(
                    trial_end_date=org.subscription.futureCancelDate,
                    user_name=user.name,
                    receiver_email=user.email,
                    org=org,
                    behavior_on_trial_end=reminder.behavior_on_trial_end,
                )
                for user in users
            ]
        )

        return SuccessResponse(success=True)

    async def add_sub_minutes(self, add_min: SubscriptionAddMinutes):
        """add extra minutes for subscription"""
        org = await self.org_ops.get_org_by_id(add_min.oid)
        quotas = OrgQuotasIn(extraExecMinutes=add_min.minutes)
        await self.org_ops.update_quotas(
            org, quotas, mode="add", context=add_min.context
        )

        await self.add_sub_event("add-minutes", add_min, add_min.oid)

        return {"updated": True}

    async def add_sub_event(
        self,
        type_: SubscriptionEventType,
        event: Union[
            SubscriptionCreate,
            SubscriptionImport,
            SubscriptionUpdate,
            SubscriptionCancel,
            SubscriptionAddMinutes,
        ],
        oid: UUID,
    ) -> None:
        """add a subscription event to the db"""
        data = event.dict(exclude_unset=True)
        data["type"] = type_
        data["timestamp"] = dt_now()
        data["oid"] = oid
        await self.subs.insert_one(data)

    def _get_sub_by_type_from_data(self, data: dict[str, object]) -> Union[
        SubscriptionCreateOut,
        SubscriptionImportOut,
        SubscriptionUpdateOut,
        SubscriptionCancelOut,
        SubscriptionAddMinutesOut,
    ]:
        """convert dict to propert background job type"""
        if data["type"] == "create":
            return SubscriptionCreateOut(**data)
        if data["type"] == "import":
            return SubscriptionImportOut(**data)
        if data["type"] == "update":
            return SubscriptionUpdateOut(**data)
        if data["type"] == "add-minutes":
            return SubscriptionAddMinutesOut(**data)
        if data["type"] == "cancel":
            return SubscriptionCancelOut(**data)

        raise HTTPException(status_code=500, detail="unknown sub event")

    # pylint: disable=too-many-arguments
    async def list_sub_events(
        self,
        status: Optional[str] = None,
        sub_id: Optional[str] = None,
        oid: Optional[UUID] = None,
        plan_id: Optional[str] = None,
        type_: Optional[SubscriptionEventType] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
    ) -> Tuple[
        List[
            Union[
                SubscriptionCreateOut,
                SubscriptionImportOut,
                SubscriptionUpdateOut,
                SubscriptionCancelOut,
                SubscriptionAddMinutesOut,
            ]
        ],
        int,
    ]:
        """list subscription events"""
        # pylint: disable=duplicate-code, too-many-locals, too-many-branches, too-many-statements
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query: dict[str, object] = {}
        if status:
            query["status"] = status
        if sub_id:
            query["subId"] = sub_id
        if plan_id:
            query["planId"] = plan_id
        if oid:
            query["oid"] = oid
        if type_:
            query["type"] = type_

        aggregate = [{"$match": query}]

        if sort_by:
            sort_fields = (
                "timestamp",
                "subId",
                "oid",
                "status",
                "planId",
                "futureCancelDate",
            )
            if sort_by not in sort_fields:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        aggregate.extend(
            [
                {
                    "$facet": {
                        "items": [
                            {"$skip": skip},
                            {"$limit": page_size},
                        ],
                        "total": [{"$count": "count"}],
                    }
                },
            ]
        )

        # Get total
        cursor = self.subs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        subs = [self._get_sub_by_type_from_data(data) for data in items]

        return subs, total

    async def get_billing_portal_url(
        self, org: Organization, headers: dict[str, str]
    ) -> SubscriptionPortalUrlResponse:
        """Get subscription info, fetching portal url if available"""
        if not org.subscription:
            return SubscriptionPortalUrlResponse()

        return_url = f"{get_origin(headers)}/orgs/{org.slug}/settings/billing"

        if external_subs_app_api_url:
            try:
                req = SubscriptionPortalUrlRequest(
                    subId=org.subscription.subId,
                    planId=org.subscription.planId,
                    bytesStored=org.bytesStored,
                    execSeconds=self.org_ops.get_monthly_crawl_exec_seconds(org),
                    returnUrl=return_url,
                )
                async with aiohttp.ClientSession() as session:
                    async with session.request(
                        "POST",
                        f"{external_subs_app_api_url}/portalUrl",
                        headers={
                            "Authorization": "bearer " + external_subs_app_api_key
                        },
                        json=req.model_dump(),
                        raise_for_status=True,
                    ) as resp:
                        json = await resp.json()
                        return SubscriptionPortalUrlResponse(**json)
            # pylint: disable=broad-exception-caught
            except Exception as exc:
                print("Error fetching portal url", exc)

        return SubscriptionPortalUrlResponse()

    async def get_execution_minutes_price(self, org: Organization):
        """Fetch price for addon execution minutes from external subscription app"""
        if not org.subscription:
            raise HTTPException(
                status_code=404, detail="Organization has no subscription"
            )
        if external_subs_app_api_url:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.request(
                        "GET",
                        f"{external_subs_app_api_url}/prices/additionalMinutes",
                        headers={
                            "Authorization": "bearer " + external_subs_app_api_key,
                        },
                        raise_for_status=True,
                    ) as resp:
                        json = await resp.json()
                        return AddonMinutesPricing(**json)
            # pylint: disable=broad-exception-caught
            except Exception as exc:
                print("Error fetching execution minutes price", exc)

    async def get_checkout_url(
        self,
        org: Organization,
        headers: dict[str, str],
        minutes: int | None,
    ):
        """Create checkout url for additional minutes"""
        if not org.subscription:
            raise HTTPException(
                status_code=404, detail="Organization has no subscription"
            )
        subscription_id = org.subscription.subId
        return_url = f"{get_origin(headers)}/orgs/{org.slug}/settings/billing"

        if external_subs_app_api_url:
            try:
                req = CheckoutAddonMinutesRequest(
                    orgId=str(org.id),
                    subId=subscription_id,
                    minutes=minutes,
                    return_url=return_url,
                )
                async with aiohttp.ClientSession() as session:
                    async with session.request(
                        "POST",
                        f"{external_subs_app_api_url}/checkout/additionalMinutes",
                        headers={
                            "Authorization": "bearer " + external_subs_app_api_key,
                            "Content-Type": "application/json",
                        },
                        json=req.model_dump(),
                        raise_for_status=True,
                    ) as resp:
                        json = await resp.json()
                        print(f"get_checkout_url got response: {json}")
                        return CheckoutAddonMinutesResponse(**json)
            # pylint: disable=broad-exception-caught
            except Exception as exc:
                print("Error fetching checkout url", exc)


# pylint: disable=invalid-name,too-many-arguments,too-many-locals
def init_subs_api(
    app: APIRouter,
    mdb: AsyncIOMotorDatabase[Any],
    org_ops: OrgOps,
    user_manager: UserManager,
    superuser_or_shared_secret_dep: Callable[[str], Awaitable[User]],
) -> Optional[SubOps]:
    """init subs API"""

    if not subscriptions_enabled:
        return None

    ops = SubOps(mdb, org_ops, user_manager)

    @app.post(
        "/subscriptions/create",
        tags=["subscriptions"],
        response_model=InviteAddedResponse,
    )
    async def new_sub(
        create: SubscriptionCreate,
        request: Request,
        user: User = Depends(superuser_or_shared_secret_dep),
    ):
        return await ops.create_new_subscription(create, user, request)

    @app.post(
        "/subscriptions/import",
        tags=["subscriptions"],
        dependencies=[Depends(superuser_or_shared_secret_dep)],
        response_model=AddedResponseId,
    )
    async def import_sub(sub_import: SubscriptionImport):
        return await ops.import_subscription(sub_import)

    @app.post(
        "/subscriptions/update",
        tags=["subscriptions"],
        dependencies=[Depends(superuser_or_shared_secret_dep)],
        response_model=UpdatedResponse,
    )
    async def update_subscription(
        update: SubscriptionUpdate,
    ):
        return await ops.update_subscription(update)

    @app.post(
        "/subscriptions/cancel",
        tags=["subscriptions"],
        dependencies=[Depends(superuser_or_shared_secret_dep)],
        response_model=SubscriptionCanceledResponse,
    )
    async def cancel_subscription(
        cancel: SubscriptionCancel,
    ):
        return await ops.cancel_subscription(cancel)

    @app.post(
        "/subscriptions/send-trial-end-reminder",
        tags=["subscriptions"],
        dependencies=[Depends(superuser_or_shared_secret_dep)],
        response_model=SuccessResponse,
    )
    async def send_trial_end_reminder(
        reminder: SubscriptionTrialEndReminder,
    ):
        return await ops.send_trial_end_reminder(reminder)

    @app.post(
        "/subscriptions/add-minutes",
        tags=["subscriptions"],
        dependencies=[Depends(superuser_or_shared_secret_dep)],
        response_model=UpdatedResponse,
    )
    async def add_sub_minutes(add_min: SubscriptionAddMinutes):
        return await ops.add_sub_minutes(add_min)

    assert org_ops.router

    @app.get(
        "/subscriptions/is-activated/{sub_id}",
        tags=["subscriptions"],
        dependencies=[Depends(superuser_or_shared_secret_dep)],
        response_model=SuccessResponse,
    )
    async def is_subscription_activated(
        sub_id: str,
    ):
        result = await org_ops.is_subscription_activated(sub_id)
        return {"success": result}

    @app.get(
        "/subscriptions/events",
        tags=["subscriptions"],
        dependencies=[Depends(superuser_or_shared_secret_dep)],
        response_model=PaginatedSubscriptionEventResponse,
    )
    async def get_sub_events(
        status: Optional[str] = None,
        subId: Optional[str] = None,
        oid: Optional[UUID] = None,
        planId: Optional[str] = None,
        type_: Annotated[Optional[SubscriptionEventType], Query(alias="type")] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = "timestamp",
        sortDirection: Optional[int] = 1,
    ):
        events, total = await ops.list_sub_events(
            status=status,
            sub_id=subId,
            oid=oid,
            plan_id=planId,
            page_size=pageSize,
            type_=type_,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(events, total, page, pageSize)

    @org_ops.router.get(
        "/billing-portal",
        tags=["organizations"],
        response_model=SubscriptionPortalUrlResponse,
    )
    async def get_billing_portal_url(
        request: Request,
        org: Organization = Depends(org_ops.org_owner_dep),
    ):
        return await ops.get_billing_portal_url(org, dict(request.headers))

    @org_ops.router.get(
        "/price/execution-minutes",
        tags=["organizations"],
        response_model=AddonMinutesPricing,
    )
    async def get_execution_minutes_price(
        org: Organization = Depends(org_ops.org_owner_dep),
    ):
        return await ops.get_execution_minutes_price(org)

    @org_ops.router.get(
        "/checkout/execution-minutes",
        tags=["organizations"],
        response_model=CheckoutAddonMinutesResponse,
    )
    async def get_execution_minutes_checkout_url(
        request: Request,
        minutes: int | None = None,
        org: Organization = Depends(org_ops.org_owner_dep),
    ):
        return await ops.get_checkout_url(org, dict(request.headers), minutes)

    return ops
