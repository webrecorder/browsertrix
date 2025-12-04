"""
Organization API handling
"""

# pylint: disable=too-many-lines

import json
import math
import os
import time

from uuid import UUID, uuid4
from tempfile import NamedTemporaryFile

from typing import Optional, TYPE_CHECKING, Dict, Callable, List, AsyncGenerator, Any

from pydantic import ValidationError
from pymongo import ReturnDocument
from pymongo.errors import AutoReconnect, DuplicateKeyError

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
import json_stream
from aiostream import stream

from .models import (
    SUCCESSFUL_STATES,
    RUNNING_STATES,
    WAITING_STATES,
    BaseCrawl,
    Organization,
    PlansResponse,
    StorageRef,
    OrgQuotas,
    OrgQuotasIn,
    OrgQuotaUpdate,
    OrgReadOnlyUpdate,
    OrgReadOnlyOnCancel,
    OrgMetrics,
    OrgWebhookUrls,
    OrgCreate,
    OrgProxies,
    Subscription,
    SubscriptionUpdate,
    SubscriptionCancel,
    RenameOrg,
    UpdateRole,
    RemovePendingInvite,
    RemoveFromOrg,
    AddToOrgRequest,
    InvitePending,
    InviteToOrgRequest,
    UserRole,
    User,
    PaginatedInvitePendingResponse,
    PaginatedOrgOutResponse,
    CrawlConfig,
    Crawl,
    CrawlConfigDefaults,
    UploadedCrawl,
    ConfigRevision,
    Profile,
    Collection,
    OrgOut,
    OrgOutExport,
    PageWithAllQA,
    DeleteCrawlList,
    PAUSED_PAYMENT_FAILED,
    REASON_PAUSED,
    ACTIVE,
    DeletedResponseId,
    UpdatedResponse,
    AddedResponse,
    AddedResponseId,
    SuccessResponseId,
    OrgInviteResponse,
    OrgAcceptInviteResponse,
    OrgDeleteInviteResponse,
    RemovedResponse,
    OrgSlugsResponse,
    OrgImportResponse,
    OrgPublicProfileUpdate,
    MAX_BROWSER_WINDOWS,
    MAX_CRAWL_SCALE,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import (
    dt_now,
    slug_from_name,
    validate_slug,
    get_duplicate_key_error_field,
    validate_language_code,
    JSONSerializer,
    browser_windows_from_scale,
    case_insensitive_collation,
)

if TYPE_CHECKING:
    from .invites import InviteOps
    from .basecrawls import BaseCrawlOps
    from .colls import CollectionOps
    from .profiles import ProfileOps
    from .users import UserManager
    from .background_jobs import BackgroundJobOps
    from .pages import PageOps
    from .file_uploads import FileUploadOps
    from .crawlmanager import CrawlManager
else:
    InviteOps = BaseCrawlOps = ProfileOps = CollectionOps = object
    BackgroundJobOps = UserManager = PageOps = FileUploadOps = CrawlManager = object


DEFAULT_ORG = os.environ.get("DEFAULT_ORG", "My Organization")

# number of items to delete at a time
DEL_ITEMS = 1000


# ============================================================================
class BaseOrgs:
    """Base Organization operations not requing db access (eg. quotas)"""

    # pylint: disable=invalid-name
    def storage_quota_reached(self, org: Organization, extra_bytes: int = 0) -> bool:
        """Return boolean indicating if storage quota is met or exceeded."""
        if not org.quotas.storageQuota:
            return False

        if (org.bytesStored + extra_bytes) < org.quotas.storageQuota:
            return False

        return True

    def exec_mins_quota_reached(self, org: Organization) -> bool:
        """Return bool for if execution minutes quota is reached"""
        monthly_quota = org.quotas.maxExecMinutesPerMonth

        # if none of the 3 quotas set, then no quotas, always return false
        if (
            not monthly_quota
            and not org.quotas.giftedExecMinutes
            and not org.quotas.extraExecMinutes
        ):
            return False

        # otherwise, a '0' value for any is considered a quota of no minutes
        # for that category

        # gifted minutes available
        if org.quotas.giftedExecMinutes > 0 and org.giftedExecSecondsAvailable > 0:
            return False

        # exec minutes available
        if org.quotas.extraExecMinutes > 0 and org.extraExecSecondsAvailable > 0:
            return False

        if monthly_quota:
            monthly_exec_seconds = self.get_monthly_crawl_exec_seconds(org)
            monthly_exec_minutes = math.floor(monthly_exec_seconds / 60)
            if monthly_exec_minutes < monthly_quota:
                return False

        return True

    def get_monthly_crawl_exec_seconds(self, org: Organization) -> int:
        """Return monthlyExecSeconds for current month"""
        yymm = dt_now().strftime("%Y-%m")
        try:
            return org.monthlyExecSeconds[yymm]
        except KeyError:
            return 0


# ============================================================================
# pylint: disable=too-many-public-methods, too-many-instance-attributes, too-many-locals, too-many-arguments
class OrgOps(BaseOrgs):
    """Organization API operations"""

    invites: InviteOps
    user_manager: UserManager
    crawl_manager: CrawlManager
    register_to_org_id: Optional[str]
    base_crawl_ops: BaseCrawlOps
    default_primary: Optional[StorageRef]

    router: Optional[APIRouter]
    org_viewer_dep: Optional[Callable]
    org_crawl_dep: Optional[Callable]
    org_owner_dep: Optional[Callable]
    org_public: Optional[Callable]

    def __init__(
        self,
        mdb,
        invites: InviteOps,
        user_manager: UserManager,
        crawl_manager: CrawlManager,
    ):
        self.orgs = mdb["organizations"]
        self.crawls_db = mdb["crawls"]
        self.crawl_configs_db = mdb["crawl_configs"]
        self.configs_revs_db = mdb["configs_revs"]
        self.profiles_db = mdb["profiles"]
        self.colls_db = mdb["collections"]
        self.users_db = mdb["users"]
        self.pages_db = mdb["pages"]
        self.version_db = mdb["version"]
        self.invites_db = mdb["invites"]

        self.router = None
        self.org_viewer_dep = None
        self.org_crawl_dep = None
        self.org_owner_dep = None
        self.org_public = None

        self.default_primary = None

        self.invites = invites
        self.user_manager = user_manager
        self.crawl_manager = crawl_manager
        self.register_to_org_id = os.environ.get("REGISTER_TO_ORG_ID")

    def set_ops(
        self,
        base_crawl_ops: BaseCrawlOps,
        profile_ops: ProfileOps,
        coll_ops: CollectionOps,
        background_job_ops: BackgroundJobOps,
        page_ops: PageOps,
        file_ops: FileUploadOps,
    ) -> None:
        """Set additional ops classes"""
        # pylint: disable=attribute-defined-outside-init
        self.base_crawl_ops = base_crawl_ops
        self.profile_ops = profile_ops
        self.coll_ops = coll_ops
        self.background_job_ops = background_job_ops
        self.page_ops = page_ops
        self.file_ops = file_ops

    def set_default_primary_storage(self, storage: StorageRef):
        """set default primary storage"""
        self.default_primary = storage

    async def init_index(self) -> None:
        """init lookup index"""
        while True:
            try:
                await self.orgs.create_index(
                    "name", unique=True, collation=case_insensitive_collation
                )
                await self.orgs.create_index(
                    "subscription.subId", unique=True, sparse=True
                )
                await self.orgs.create_index(
                    "slug", unique=True, collation=case_insensitive_collation
                )
                break
            # pylint: disable=duplicate-code
            except AutoReconnect:
                print(
                    "Database connection unavailable to create index. Will try again in 5 scconds",
                    flush=True,
                )
                time.sleep(5)

    async def get_orgs_for_user(
        # pylint: disable=too-many-arguments
        self,
        user: User,
        role: UserRole = UserRole.VIEWER,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = "name",
        sort_direction: int = 1,
    ) -> tuple[List[Organization], int]:
        """Get all orgs a user is a member of"""
        # pylint: disable=duplicate-code,too-many-locals

        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query: Dict[str, Any] = {}
        if not user.is_superuser:
            query[f"users.{user.id}"] = {"$gte": role.value}

        aggregate: List[Dict[str, Any]] = [
            {"$match": query},
            {"$set": {"nameLower": {"$toLower": "$name"}}},
        ]

        # Ensure default org is always first, then sort on sort_by if set
        sort_query = {"default": -1}

        if sort_by:
            sort_fields = (
                "name",
                "slug",
                "readOnly",
                "lastCrawlFinished",
                "subscriptionStatus",
                "subscriptionPlan",
            )
            if sort_by not in sort_fields:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            if sort_by == "subscriptionStatus":
                sort_by = "subscription.status"

            if sort_by == "subscriptionPlan":
                sort_by = "subscription.planId"

            # Do lexical sort of names
            if sort_by == "name":
                sort_by = "nameLower"

            sort_query[sort_by] = sort_direction

        aggregate.extend([{"$sort": sort_query}, {"$unset": ["nameLower"]}])

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
        cursor = self.orgs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        return [Organization.from_dict(data) for data in items], total

    async def get_org_for_user_by_id(
        self, oid: UUID, user: Optional[User], role: UserRole = UserRole.VIEWER
    ) -> Optional[Organization]:
        """Get an org for user by unique id"""
        query: dict[str, object]
        if not user or user.is_superuser:
            query = {"_id": oid}
        else:
            query = {f"users.{user.id}": {"$gte": role.value}, "_id": oid}
        res = await self.orgs.find_one(query)
        if not res:
            return None

        return Organization.from_dict(res)

    async def get_users_for_org(
        self, org: Organization, min_role=UserRole.VIEWER
    ) -> List[User]:
        """get users for org"""
        uuid_ids = [UUID(id_) for id_, role in org.users.items() if role >= min_role]
        users: List[User] = []
        async for user_dict in self.users_db.find({"id": {"$in": uuid_ids}}):
            users.append(User(**user_dict))
        return users

    async def get_org_by_id(self, oid: UUID) -> Organization:
        """Get an org by id"""
        res = await self.orgs.find_one({"_id": oid})
        if not res:
            raise HTTPException(status_code=400, detail="invalid_org_id")

        return Organization.from_dict(res)

    async def get_org_by_slug(self, slug: str) -> Organization:
        """Get an org by id"""
        res = await self.orgs.find_one({"slug": slug})
        if not res:
            raise HTTPException(status_code=400, detail="invalid_org_slug")

        return Organization.from_dict(res)

    async def get_default_org(self) -> Organization:
        """Get default organization"""
        res = await self.orgs.find_one({"default": True})
        if not res:
            raise HTTPException(status_code=500, detail="default_org_missing")

        return Organization.from_dict(res)

    async def get_default_register_org(self) -> Organization:
        """Get default organiation for new user registration, or default org"""
        if self.register_to_org_id:
            try:
                return await self.get_org_by_id(UUID(self.register_to_org_id))
            except HTTPException as exc:
                raise HTTPException(
                    status_code=500, detail="default_register_org_not_found"
                ) from exc

        return await self.get_default_org()

    async def create_default_org(self) -> None:
        """Create default organization if doesn't exist."""
        await self.init_index()

        try:
            default_org = await self.get_default_org()
            if default_org.name == DEFAULT_ORG:
                print("Default organization already exists - skipping", flush=True)
            else:
                default_org.name = DEFAULT_ORG
                default_org.slug = slug_from_name(DEFAULT_ORG)
                await self.update_full(default_org)
                print(f'Default organization renamed to "{DEFAULT_ORG}"', flush=True)
            return
        except HTTPException:
            # default org does not exist, create below
            pass

        id_ = uuid4()
        org = Organization(
            id=id_,
            name=DEFAULT_ORG,
            slug=slug_from_name(DEFAULT_ORG),
            created=dt_now(),
            users={},
            storage=self.default_primary,
            default=True,
        )
        primary_name = self.default_primary and self.default_primary.name
        print(
            f'Creating Default Organization "{DEFAULT_ORG}". Storage: {primary_name}',
            flush=True,
        )
        try:
            await self.orgs.insert_one(org.to_dict())
        except DuplicateKeyError as err:
            field = get_duplicate_key_error_field(err)
            value = org.name
            if field == "slug":
                value = org.slug
            print(
                f"Organization {field} {value} already in use - skipping",
                flush=True,
            )

    async def create_org(
        self,
        name: Optional[str] = None,
        slug: Optional[str] = None,
        quotas: Optional[OrgQuotas] = None,
        subscription: Optional[Subscription] = None,
    ) -> Organization:
        """create new org"""
        id_ = uuid4()

        name = name or str(id_)

        if slug:
            validate_slug(slug)
        else:
            slug = slug_from_name(name)

        org = Organization(
            id=id_,
            name=name,
            slug=slug,
            created=dt_now(),
            storage=self.default_primary,
            quotas=quotas or OrgQuotas(),
            subscription=subscription,
        )

        if subscription and subscription.status == PAUSED_PAYMENT_FAILED:
            org.readOnly = True
            org.readOnlyReason = REASON_PAUSED

        try:
            await self.orgs.insert_one(org.to_dict())
        except DuplicateKeyError as dupe:
            field = get_duplicate_key_error_field(dupe)
            raise HTTPException(
                status_code=400, detail=f"duplicate_org_{field}"
            ) from dupe

        return org

    async def add_subscription_to_org(
        self, subscription: Subscription, oid: UUID
    ) -> None:
        """Add subscription to existing org"""
        org = await self.get_org_by_id(oid)

        org.subscription = subscription
        include = {"subscription"}

        if subscription.status == PAUSED_PAYMENT_FAILED:
            org.readOnly = True
            org.readOnlyReason = REASON_PAUSED
            include.add("readOnly")
            include.add("readOnlyReason")

        await self.orgs.find_one_and_update(
            {"_id": org.id}, {"$set": org.dict(include=include)}
        )

    async def check_all_org_default_storages(self, storage_ops) -> None:
        """ensure all default storages references by this org actually exist

        designed to help prevent removal of a 'storage' entry if
        an org is still referencing that storage"""
        storage_names = list(storage_ops.default_storages.keys())
        errors = 0

        async for org_data in self.orgs.find(
            {"storage.custom": False, "storage.name": {"$nin": storage_names}}
        ):
            org = Organization.from_dict(org_data)
            print(f"Org {org.slug} uses unknown primary storage {org.storage.name}")
            errors += 1

        async for org_data in self.orgs.find(
            {
                "storageReplicas.custom": False,
                "storageReplicas.name": {"$nin": storage_names},
            }
        ):
            org = Organization.from_dict(org_data)
            print(f"Org {org.slug} uses an unknown replica storage")
            errors += 1

        if errors:
            raise TypeError(
                f"{errors} orgs use undefined storages, exiting."
                + " Please check the 'storages' array in your config"
            )

    async def update_full(self, org: Organization) -> bool:
        """Update existing org"""
        res = await self.orgs.find_one_and_update(
            {"_id": org.id}, {"$set": org.to_dict()}, upsert=True
        )
        return res is not None

    async def update_users(self, org: Organization) -> bool:
        """Update org users"""
        res = await self.orgs.find_one_and_update(
            {"_id": org.id}, {"$set": org.dict(include={"users"})}
        )
        return res is not None

    async def update_slug_and_name(self, org: Organization) -> bool:
        """Update org slug"""
        res = await self.orgs.find_one_and_update(
            {"_id": org.id}, {"$set": {"slug": org.slug, "name": org.name}}
        )
        return res is not None

    async def update_storage_refs(self, org: Organization) -> bool:
        """Update storage + replicas for given org"""
        set_dict = org.dict(include={"storage": True, "storageReplicas": True})

        res = await self.orgs.find_one_and_update({"_id": org.id}, {"$set": set_dict})
        return res is not None

    async def update_subscription_data(
        self, update: SubscriptionUpdate
    ) -> Optional[Organization]:
        """Update subscription by id"""

        query: dict[str, Any] = {
            "subscription.status": update.status,
            "subscription.planId": update.planId,
            "subscription.futureCancelDate": update.futureCancelDate,
        }

        if update.status == PAUSED_PAYMENT_FAILED:
            query["readOnly"] = True
            query["readOnlyReason"] = REASON_PAUSED
        elif update.status == ACTIVE:
            query["readOnly"] = False
            query["readOnlyReason"] = ""

        org_data = await self.orgs.find_one_and_update(
            {"subscription.subId": update.subId},
            {"$set": query},
            return_document=ReturnDocument.BEFORE,
        )
        if not org_data:
            return None

        org = Organization.from_dict(org_data)
        if update.quotas:
            # don't change gifted minutes here
            update.quotas.giftedExecMinutes = None
            await self.update_quotas(org, update.quotas)

        return org

    async def cancel_subscription_data(
        self, cancel: SubscriptionCancel
    ) -> Optional[Organization]:
        """Find org by subscription by id and delete subscription data, return org"""
        org_data = await self.orgs.find_one_and_update(
            {"subscription.subId": cancel.subId},
            {"$set": {"subscription": None}},
            return_document=ReturnDocument.BEFORE,
        )
        return Organization.from_dict(org_data) if org_data else None

    async def find_org_by_subscription_id(self, sub_id: str) -> Optional[Organization]:
        """Find org by subscription id"""
        org_data = await self.orgs.find_one({"subscription.subId": sub_id})
        return Organization.from_dict(org_data) if org_data else None

    async def is_subscription_activated(self, sub_id: str) -> bool:
        """return true if subscription for this org was 'activated', eg. at least
        one user has signed up and changed the slug
        """
        org_data = await self.orgs.find_one({"subscription.subId": sub_id})
        if not org_data:
            return False

        org = Organization.from_dict(org_data)
        return len(org.users) > 0 and org.slug != str(org.id)

    async def update_custom_storages(self, org: Organization) -> bool:
        """Update storage on an existing organization"""

        set_dict = org.dict(include={"customStorages": True})

        res = await self.orgs.find_one_and_update({"_id": org.id}, {"$set": set_dict})
        return res is not None

    async def update_proxies(self, org: Organization, proxies: OrgProxies) -> None:
        """Update org proxy settings"""
        await self.orgs.find_one_and_update(
            {"_id": org.id},
            {
                "$set": {
                    "allowSharedProxies": proxies.allowSharedProxies,
                    "allowedProxies": proxies.allowedProxies,
                }
            },
        )

    async def update_quotas(self, org: Organization, quotas: OrgQuotasIn) -> None:
        """update organization quotas"""

        previous_extra_mins = (
            org.quotas.extraExecMinutes
            if (org.quotas and org.quotas.extraExecMinutes)
            else 0
        )
        previous_gifted_mins = (
            org.quotas.giftedExecMinutes
            if (org.quotas and org.quotas.giftedExecMinutes)
            else 0
        )

        update = quotas.dict(
            exclude_unset=True, exclude_defaults=True, exclude_none=True
        )

        quota_updates = []
        for prev_update in org.quotaUpdates or []:
            quota_updates.append(prev_update.dict())
        quota_updates.append(OrgQuotaUpdate(update=update, modified=dt_now()).dict())

        await self.orgs.find_one_and_update(
            {"_id": org.id},
            {
                "$set": {
                    "quotas": update,
                    "quotaUpdates": quota_updates,
                }
            },
        )

        # Inc org available fields for extra/gifted execution time as needed
        if quotas.extraExecMinutes is not None:
            extra_secs_diff = (quotas.extraExecMinutes - previous_extra_mins) * 60
            if org.extraExecSecondsAvailable + extra_secs_diff <= 0:
                await self.orgs.find_one_and_update(
                    {"_id": org.id},
                    {"$set": {"extraExecSecondsAvailable": 0}},
                )
            else:
                await self.orgs.find_one_and_update(
                    {"_id": org.id},
                    {"$inc": {"extraExecSecondsAvailable": extra_secs_diff}},
                )

        if quotas.giftedExecMinutes is not None:
            gifted_secs_diff = (quotas.giftedExecMinutes - previous_gifted_mins) * 60
            if org.giftedExecSecondsAvailable + gifted_secs_diff <= 0:
                await self.orgs.find_one_and_update(
                    {"_id": org.id},
                    {"$set": {"giftedExecSecondsAvailable": 0}},
                )
            else:
                await self.orgs.find_one_and_update(
                    {"_id": org.id},
                    {"$inc": {"giftedExecSecondsAvailable": gifted_secs_diff}},
                )

    async def update_event_webhook_urls(
        self, org: Organization, urls: OrgWebhookUrls
    ) -> bool:
        """Update organization event webhook URLs"""
        res = await self.orgs.find_one_and_update(
            {"_id": org.id},
            {"$set": {"webhookUrls": urls.dict(exclude_unset=True)}},
            return_document=ReturnDocument.AFTER,
        )
        return res is not None

    async def update_crawling_defaults(
        self, org: Organization, defaults: CrawlConfigDefaults
    ):
        """Update crawling defaults"""
        if defaults.lang:
            validate_language_code(defaults.lang)

        res = await self.orgs.find_one_and_update(
            {"_id": org.id},
            {"$set": {"crawlingDefaults": defaults.model_dump()}},
            return_document=ReturnDocument.AFTER,
        )
        return res is not None

    async def add_user_by_invite(
        self,
        invite: InvitePending,
        user: User,
        default_org: Optional[Organization] = None,
    ) -> Organization:
        """Lookup an invite by user email (if new) or userid (if existing)

        Remove invite after successful add
        """
        org = None
        if not invite.oid:
            org = default_org
        else:
            try:
                org = await self.get_org_by_id(invite.oid)
            except HTTPException:
                pass

        if not org:
            raise HTTPException(status_code=400, detail="invalid_invite")

        await self.add_user_to_org(org, user.id, invite.role)

        await self.invites.remove_invite(invite.id)

        # if just added first admin, and name == id, set default org name from user name
        if (
            len(org.users) == 1
            and invite.role == UserRole.OWNER
            and str(org.name) == str(org.id)
        ):
            await self.set_default_org_name_from_user_name(org, user.name)

        return org

    async def create_new_user_for_org(
        self, add: AddToOrgRequest, org: Organization
    ) -> User:
        """create a regular user with given credentials"""
        try:
            user = await self.user_manager.create_user(
                name=add.name, email=add.email, password=add.password, is_verified=True
            )
            await self.add_user_to_org(org, user.id, add.role)
            return user
        except HTTPException as exc:
            print("Error adding user to org", exc)
            raise exc

    async def set_default_org_name_from_user_name(
        self, org: Organization, user_name: str
    ) -> None:
        """set's the org name and slug as "<USERNAME>’s Archive", adding a suffix for duplicates"""
        suffix = ""
        count = 1

        while True:
            org.name = f"{user_name}’s Archive{suffix}"
            org.slug = slug_from_name(org.name)

            try:
                await self.update_slug_and_name(org)
                break
            except DuplicateKeyError:
                # pylint: disable=raise-missing-from
                count += 1
                suffix = f" {count}"

    async def add_user_to_org(
        self, org: Organization, userid: UUID, role: UserRole
    ) -> None:
        """Add user to organization with specified role"""
        if str(userid) in org.users:
            raise HTTPException(status_code=400, detail="user_already_is_org_member")

        org.users[str(userid)] = role
        await self.update_users(org)

    async def change_user_role(
        self, org: Organization, userid: UUID, role: UserRole
    ) -> None:
        """Change role of existing user in organization"""
        if str(userid) not in org.users:
            raise HTTPException(status_code=400, detail="no_such_user")

        org.users[str(userid)] = role
        await self.update_users(org)

    async def get_org_owners(self, org: Organization) -> List[str]:
        """Return list of org's Owner users."""
        org_owners = []
        for key, value in org.users.items():
            if value == UserRole.OWNER:
                org_owners.append(key)
        return org_owners

    async def inc_org_bytes_stored(self, oid: UUID, size: int, type_="crawl") -> None:
        """Increase org bytesStored count (pass negative value to subtract)."""
        if type_ == "crawl":
            await self.orgs.find_one_and_update(
                {"_id": oid},
                {"$inc": {"bytesStored": size, "bytesStoredCrawls": size}},
            )
        elif type_ == "upload":
            await self.orgs.find_one_and_update(
                {"_id": oid},
                {"$inc": {"bytesStored": size, "bytesStoredUploads": size}},
            )
        elif type_ == "profile":
            await self.orgs.find_one_and_update(
                {"_id": oid},
                {"$inc": {"bytesStored": size, "bytesStoredProfiles": size}},
            )

    def can_write_data(self, org: Organization, include_time=True) -> None:
        """check crawl quotas and readOnly state, throw if can not run"""
        if org.readOnly:
            raise HTTPException(status_code=403, detail="org_set_to_read_only")

        if self.storage_quota_reached(org):
            raise HTTPException(status_code=403, detail="storage_quota_reached")

        if include_time and self.exec_mins_quota_reached(org):
            raise HTTPException(status_code=403, detail="exec_minutes_quota_reached")

    async def set_origin(self, org: Organization, request: Request) -> None:
        """Get origin from request and store in db for use in event webhooks"""
        headers = request.headers
        scheme = headers.get("X-Forwarded-Proto")
        host = headers.get("Host")

        if not scheme or not host:
            origin = os.environ.get("APP_ORIGIN")
        else:
            origin = f"{scheme}://{host}"

        await self.orgs.find_one_and_update(
            {"_id": org.id}, {"$set": {"origin": origin}}
        )

    async def inc_org_time_stats(
        self, oid: UUID, duration: int, is_exec_time=False, is_qa=False
    ) -> None:
        """inc crawl duration stats for org

        Overage is applied only to crawlExecSeconds - monthlyExecSeconds,
        giftedExecSeconds, and extraExecSeconds are added to only up to quotas

        If is_qa is true, also update seperate qa only counter
        """
        # pylint: disable=too-many-return-statements, too-many-locals
        yymm = dt_now().strftime("%Y-%m")
        inc_query = {}

        if not is_qa:
            key = "crawlExecSeconds" if is_exec_time else "usage"
            inc_query[f"{key}.{yymm}"] = duration
        else:
            qa_key = "qaCrawlExecSeconds" if is_exec_time else "qaUsage"
            inc_query[f"{qa_key}.{yymm}"] = duration

        await self.orgs.find_one_and_update({"_id": oid}, {"$inc": inc_query})

        if not is_exec_time or is_qa:
            return

        org = await self.get_org_by_id(oid)

        monthly_exec_secs_used = self.get_monthly_crawl_exec_seconds(org)

        monthly_quota_mins = org.quotas.maxExecMinutesPerMonth or 0
        monthly_quota_secs = monthly_quota_mins * 60

        if (
            not monthly_quota_secs
            and not org.quotas.extraExecMinutes
            and not org.quotas.giftedExecMinutes
        ):
            return

        monthly_remaining_time = monthly_quota_secs - monthly_exec_secs_used

        # If adding duration won't pass monthly quota, add duration and return
        if duration <= monthly_remaining_time:
            await self.orgs.find_one_and_update(
                {"_id": oid}, {"$inc": {f"monthlyExecSeconds.{yymm}": duration}}
            )
            return

        # Otherwise, add execution seconds to monthlyExecSeconds up to quota
        await self.orgs.find_one_and_update(
            {"_id": oid},
            {"$inc": {f"monthlyExecSeconds.{yymm}": monthly_remaining_time}},
        )

        if not org.giftedExecSecondsAvailable and not org.extraExecSecondsAvailable:
            return

        secs_over_quota = duration - monthly_remaining_time

        # If we've surpassed monthly base quota, use gifted and extra exec minutes
        # in that order if available, track their usage per month, and recalculate
        # extraExecSecondsAvailable and giftedExecSecondsAvailable as needed
        gifted_secs_available = org.giftedExecSecondsAvailable
        if gifted_secs_available:
            if secs_over_quota <= gifted_secs_available:
                await self.orgs.find_one_and_update(
                    {"_id": oid},
                    {
                        "$inc": {
                            f"giftedExecSeconds.{yymm}": secs_over_quota,
                            "giftedExecSecondsAvailable": -secs_over_quota,
                        }
                    },
                )
                return

            # If seconds over quota is higher than gifted seconds available,
            # use remaining gifted gifted time and then move on
            await self.orgs.find_one_and_update(
                {"_id": oid},
                {
                    "$inc": {f"giftedExecSeconds.{yymm}": gifted_secs_available},
                    "$set": {"giftedExecSecondsAvailable": 0},
                },
            )
            secs_over_quota = secs_over_quota - gifted_secs_available

        # If we still have an overage, apply to extra up to quota
        secs_to_use = min(secs_over_quota, org.extraExecSecondsAvailable)
        if secs_to_use:
            await self.orgs.find_one_and_update(
                {"_id": oid},
                {
                    "$inc": {
                        f"extraExecSeconds.{yymm}": secs_to_use,
                        "extraExecSecondsAvailable": -secs_to_use,
                    }
                },
            )

    async def get_org_metrics(self, org: Organization) -> dict[str, int]:
        """Calculate and return org metrics"""
        # pylint: disable=too-many-locals
        storage_quota = org.quotas.storageQuota or 0
        max_concurrent_crawls = org.quotas.maxConcurrentCrawls or 0

        # Calculate these counts in loop to avoid having db iterate through
        # archived items several times.
        archived_item_count = 0
        crawl_count = 0
        upload_count = 0

        page_count = 0
        crawl_page_count = 0
        upload_page_count = 0

        async for item_data in self.crawls_db.find({"oid": org.id}):
            item = BaseCrawl.from_dict(item_data)
            if item.state not in SUCCESSFUL_STATES:
                continue
            archived_item_count += 1
            if item.type == "crawl":
                crawl_count += 1
                crawl_page_count += item.pageCount or 0
            if item.type == "upload":
                upload_count += 1
                upload_page_count += item.pageCount or 0
            if item.pageCount:
                page_count += item.pageCount

        profile_count = await self.profiles_db.count_documents({"oid": org.id})
        workflows_running_count = await self.crawls_db.count_documents(
            {"oid": org.id, "state": {"$in": RUNNING_STATES}}
        )
        workflows_queued_count = await self.crawls_db.count_documents(
            {"oid": org.id, "state": {"$in": WAITING_STATES}}
        )
        collections_count = await self.colls_db.count_documents({"oid": org.id})
        public_collections_count = await self.colls_db.count_documents(
            {"oid": org.id, "access": {"$in": ["public", "unlisted"]}}
        )

        return {
            "storageUsedBytes": org.bytesStored,
            "storageUsedCrawls": org.bytesStoredCrawls,
            "storageUsedUploads": org.bytesStoredUploads,
            "storageUsedProfiles": org.bytesStoredProfiles,
            "storageUsedSeedFiles": org.bytesStoredSeedFiles or 0,
            "storageUsedThumbnails": org.bytesStoredThumbnails or 0,
            "storageQuotaBytes": storage_quota,
            "archivedItemCount": archived_item_count,
            "crawlCount": crawl_count,
            "uploadCount": upload_count,
            "pageCount": page_count,
            "crawlPageCount": crawl_page_count,
            "uploadPageCount": upload_page_count,
            "profileCount": profile_count,
            "workflowsRunningCount": workflows_running_count,
            "maxConcurrentCrawls": max_concurrent_crawls,
            "workflowsQueuedCount": workflows_queued_count,
            "collectionsCount": collections_count,
            "publicCollectionsCount": public_collections_count,
        }

    async def get_all_org_slugs(self) -> dict[str, list[str]]:
        """Return list of all org slugs."""
        slugs = await self.orgs.distinct("slug", {})
        return {"slugs": slugs}

    async def get_org_slugs_by_ids(self) -> dict[UUID, str]:
        """Return dict with {id: slug} for all orgs."""
        slug_id_map = {}
        async for org in self.orgs.find({}):
            slug_id_map[org["_id"]] = org["slug"]
        return slug_id_map

    async def update_read_only(
        self, org: Organization, readOnly: bool, readOnlyReason=""
    ) -> bool:
        """Set readOnly field for Organization"""
        if not readOnly:
            # Set reason to empty string if readOnly is false
            readOnlyReason = ""

        res = await self.orgs.find_one_and_update(
            {"_id": org.id},
            {"$set": {"readOnly": readOnly, "readOnlyReason": readOnlyReason}},
        )
        return res is not None

    async def update_read_only_on_cancel(
        self, org: Organization, update: OrgReadOnlyOnCancel
    ) -> bool:
        """Set to readOnly on subscription cancelation, instead of deleting"""
        res = await self.orgs.find_one_and_update(
            {"_id": org.id, "subscription.readOnlyOnCancel": False},
            {"$set": {"subscription.readOnlyOnCancel": update.readOnlyOnCancel}},
        )
        return res is not None

    async def update_public_profile(
        self, org: Organization, update: OrgPublicProfileUpdate
    ):
        """Update or enable/disable organization's public profile"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        res = await self.orgs.find_one_and_update(
            {"_id": org.id},
            {"$set": query},
        )
        return res is not None

    async def export_org(
        self, org: Organization, user_manager: UserManager
    ) -> StreamingResponse:
        """Export all data related to org as JSON

        Append async generators to list in order that we want them to be
        exhausted in order to stream a semantically correct JSON document.
        """
        export_stream_generators: List[AsyncGenerator] = []

        oid_query = {"oid": org.id}

        org_out_export = OrgOutExport.from_dict(org.to_dict())
        org_serialized = await org_out_export.serialize_for_export(user_manager)

        version = await self.version_db.find_one()
        if not version:
            raise HTTPException(status_code=400, detail="invalid_db")

        async def json_opening_gen() -> AsyncGenerator:
            """Async generator that opens JSON document, writes dbVersion and org"""
            # pylint: disable=consider-using-f-string
            opening_section = '{{"data": {{\n"dbVersion": "{0}",\n"org": {1},\n'.format(
                version.get("version"),
                json.dumps(org_serialized.to_dict(), cls=JSONSerializer),
            )
            yield opening_section.encode("utf-8")

        async def json_items_gen(
            key: str,
            cursor,
            doc_count: int,
            skip_closing_comma=False,
        ) -> AsyncGenerator:
            """Async generator to add json items in list, keyed by supplied str"""
            yield f'"{key}": [\n'.encode("utf-8")

            doc_index = 1

            async for json_item in cursor:
                yield json.dumps(json_item, cls=JSONSerializer).encode("utf-8")
                if doc_index < doc_count:
                    yield b",\n"
                else:
                    yield b"\n"
                doc_index += 1

            yield f']{"" if skip_closing_comma else ","}\n'.encode("utf-8")

        async def json_closing_gen() -> AsyncGenerator:
            """Async generator to close JSON document"""
            yield b"}}"

        export_stream_generators.append(json_opening_gen())

        # Profiles
        count = await self.profiles_db.count_documents(oid_query)
        cursor = self.profiles_db.find(oid_query)
        export_stream_generators.append(json_items_gen("profiles", cursor, count))

        # Workflows
        count = await self.crawl_configs_db.count_documents(oid_query)
        cursor = self.crawl_configs_db.find(oid_query)
        export_stream_generators.append(json_items_gen("workflows", cursor, count))

        # Workflow IDs (needed for revisions)
        workflow_ids = []
        cursor = self.crawl_configs_db.find(oid_query, projection=["_id"])
        async for workflow_dict in cursor:
            workflow_ids.append(workflow_dict.get("_id"))

        # Workflow revisions
        workflow_revs_query = {"cid": {"$in": workflow_ids}}
        count = await self.configs_revs_db.count_documents(workflow_revs_query)
        cursor = self.configs_revs_db.find(workflow_revs_query)
        export_stream_generators.append(
            json_items_gen("workflowRevisions", cursor, count)
        )

        # Items
        count = await self.crawls_db.count_documents(oid_query)
        cursor = self.crawls_db.find(oid_query)
        export_stream_generators.append(json_items_gen("items", cursor, count))

        # Pages
        count = await self.pages_db.count_documents(oid_query)
        cursor = self.pages_db.find(oid_query)
        export_stream_generators.append(json_items_gen("pages", cursor, count))

        # Collections
        count = await self.colls_db.count_documents(oid_query)
        cursor = self.colls_db.find(oid_query)
        export_stream_generators.append(
            json_items_gen("collections", cursor, count, True)
        )

        export_stream_generators.append(json_closing_gen())

        return StreamingResponse(stream.chain(*export_stream_generators))

    async def import_org(
        self,
        stream_file_object,
        ignore_version: bool = False,
        storage_name: Optional[str] = None,
    ) -> None:
        """Import org from exported org JSON

        :param stream: Stream of org JSON export
        :param ignore_version: Ignore db version mismatch between JSON and db
        :param storage_name: Update storage refs to use new name if provided
        """
        # pylint: disable=too-many-branches, too-many-statements

        org_stream = json_stream.load(stream_file_object)
        org_data = org_stream["data"]

        # dbVersion
        version_res = await self.version_db.find_one()
        if not version_res:
            raise HTTPException(status_code=400, detail="invalid_db")

        version = version_res["version"]
        stream_db_version = org_data.get("dbVersion")
        if version != stream_db_version and not ignore_version:
            print(
                f"Export db version: {stream_db_version} doesn't match db: {version}, quitting",
                flush=True,
            )
            raise HTTPException(status_code=400, detail="db_version_mismatch")

        # org
        stream_org = org_data["org"]
        stream_org = json_stream.to_standard_types(stream_org)
        oid = UUID(stream_org["_id"])

        existing_org: Optional[Organization] = None
        try:
            existing_org = await self.get_org_by_id(oid)
        except HTTPException:
            pass

        if existing_org:
            print(f"Org {oid} already exists, quitting", flush=True)
            raise HTTPException(status_code=400, detail="org_already_exists")

        new_storage_ref = None
        if storage_name:
            new_storage_ref = StorageRef(name=storage_name, custom=False)

        org = Organization.from_dict(stream_org)
        if storage_name and new_storage_ref:
            org.storage = new_storage_ref
        await self.orgs.insert_one(org.to_dict())

        # Track old->new userids so that we can update as necessary in db docs
        user_id_map = {}

        # Users are imported with a random password and will need to go through
        # the reset password workflow using their email address after import.
        for user in stream_org.get("userDetails", []):  # type: ignore
            try:
                new_user = await self.user_manager.create_user(
                    email=user["email"],
                    name=user["name"],
                )
                user_id_map[user.get("id")] = new_user.id
            # pylint: disable=broad-exception-caught
            except Exception:
                maybe_user = await self.user_manager.get_by_email(user["email"])
                assert maybe_user
                new_user = maybe_user

            await self.add_user_to_org(
                org=org, userid=new_user.id, role=UserRole(int(user.get("role", 10)))
            )

        # profiles
        profile_userid_fields = ["userid", "createdBy", "modifiedBy"]
        for profile in org_data.get("profiles", []):
            profile = json_stream.to_standard_types(profile)

            # Update userid if necessary
            for userid_field in profile_userid_fields:
                old_userid = profile.get(userid_field)
                if old_userid and old_userid in user_id_map:
                    profile[userid_field] = user_id_map[old_userid]

            profile_obj = Profile.from_dict(profile)

            # Update storage ref if necessary
            if profile_obj.resource and storage_name and new_storage_ref:
                profile_obj.resource.storage = new_storage_ref

            await self.profiles_db.insert_one(profile_obj.to_dict())

        # workflows
        workflow_userid_fields = ["createdBy", "modifiedBy", "lastStartedBy"]
        for workflow in org_data.get("workflows", []):
            workflow = json_stream.to_standard_types(workflow)

            # Update userid fields if necessary
            for userid_field in workflow_userid_fields:
                old_userid = workflow.get(userid_field)
                if old_userid and old_userid in user_id_map:
                    workflow[userid_field] = user_id_map[old_userid]

            # Convert scale to browser windows and respect limits
            workflow_scale = max(workflow.get("scale", 1), MAX_CRAWL_SCALE)
            if workflow.get("browserWindows") is None:
                workflow_browser_windows = browser_windows_from_scale(workflow_scale)
                workflow["browserWindows"] = max(
                    workflow_browser_windows, MAX_BROWSER_WINDOWS
                )

            # Ensure crawlerChannel is set
            if not workflow.get("crawlerChannel"):
                workflow["crawlerChannel"] = "default"

            # Ensure proxyId is unset if profile is set
            if workflow.get("profileid"):
                workflow["proxyId"] = None

            crawl_config = CrawlConfig.from_dict(workflow)
            await self.crawl_configs_db.insert_one(crawl_config.to_dict())

        # workflowRevisions
        for rev in org_data.get("workflowRevisions", []):
            rev = json_stream.to_standard_types(rev)
            # Update userid if necessary
            old_userid = rev.get("modifiedBy")
            if old_userid and old_userid in user_id_map:
                rev["modifiedBy"] = user_id_map[old_userid]

            await self.configs_revs_db.insert_one(
                ConfigRevision.from_dict(rev).to_dict()
            )

        # archivedItems
        for item in org_data.get("items", []):
            item = json_stream.to_standard_types(item)
            item_id = str(item["_id"])

            item_obj = None
            if item["type"] == "crawl":
                # Ensure crawlerChannel is set
                if not item.get("crawlerChannel"):
                    item["crawlerChannel"] = "default"

                # Set browserWindows
                browser_windows = item.get("browserWindows")
                if browser_windows is None:
                    browser_windows = browser_windows_from_scale(item.get("scale", 1))
                item["browserWindows"] = max(browser_windows, MAX_BROWSER_WINDOWS)

                item_obj = Crawl.from_dict(item)
            if item["type"] == "upload":
                item_obj = UploadedCrawl.from_dict(item)  # type: ignore
            if not item_obj:
                print(f"Archived item {item_id} has no type, skipping", flush=True)
                continue

            # Update userid if necessary
            old_userid = item.get("modifiedBy")
            if old_userid and old_userid in user_id_map:
                item_obj.userid = user_id_map[old_userid]

            # Update storage refs if necessary
            if storage_name and new_storage_ref:
                for file_ in item_obj.files:
                    file_.storage = new_storage_ref

            await self.crawls_db.insert_one(item_obj.to_dict())

            # Regenerate presigned URLs
            await self.base_crawl_ops.resolve_signed_urls(
                item_obj.files, org, crawl_id=item_id, force_update=True
            )

        # pages
        for page in org_data.get("pages", []):
            page = json_stream.to_standard_types(page)
            await self.pages_db.insert_one(PageWithAllQA.from_dict(page).to_dict())

        # collections
        for coll_raw in org_data.get("collections", []):
            coll_raw = json_stream.to_standard_types(coll_raw)

            if not coll_raw.get("slug"):
                coll_raw["slug"] = slug_from_name(coll_raw["name"])

            collection = Collection.from_dict(coll_raw)
            await self.colls_db.insert_one(collection.to_dict())
            await self.coll_ops.update_collection_counts_and_tags(collection.id)

    async def delete_org_and_data(
        self, org: Organization, user_manager: UserManager
    ) -> None:
        """Delete org and all of its associated data."""
        print(f"Deleting org: {org.slug} {org.name} {org.id}")

        # Delete archived items
        cursor = self.crawls_db.find({"oid": org.id}, projection=["_id"])
        items = await cursor.to_list(length=DEL_ITEMS)
        while items:
            item_ids = [item["_id"] for item in items]

            await self.base_crawl_ops.delete_crawls_all_types(
                delete_list=DeleteCrawlList(crawl_ids=item_ids), org=org
            )

            items = await cursor.to_list(length=DEL_ITEMS)

        # Delete workflows and revisions
        cursor = self.crawl_configs_db.find({"oid": org.id}, projection=["_id"])
        workflows = await cursor.to_list(length=DEL_ITEMS)
        while workflows:
            workflow_ids = [workflow["_id"] for workflow in workflows]
            await self.configs_revs_db.delete_many({"cid": {"$in": workflow_ids}})

            workflows = await cursor.to_list(length=DEL_ITEMS)

        await self.crawl_configs_db.delete_many({"oid": org.id})

        # Delete seed files and other user-uploaded files from database and storage
        await self.file_ops.delete_org_files(org)

        # Delete profiles
        async for profile in self.profiles_db.find({"oid": org.id}, projection=["_id"]):
            await self.profile_ops.delete_profile(profile["_id"], org)

        # Delete collections
        async for coll in self.colls_db.find({"oid": org.id}, projection=["_id"]):
            await self.coll_ops.delete_collection(coll["_id"], org)

        # Delete users that only belong to this org
        for org_user_id in org.users.keys():
            user = await user_manager.get_by_id(UUID(org_user_id))
            if not user:
                continue
            orgs, total_orgs = await self.get_orgs_for_user(user)
            if total_orgs == 1:
                first_org = orgs[0]
                if first_org.id != org.id:
                    continue
                await self.users_db.delete_one({"id": user.id})

        # Delete invites
        await self.invites_db.delete_many({"oid": org.id})

        # Delete org
        await self.orgs.delete_one({"_id": org.id})

        # Delete related k8s objects
        await self.crawl_manager.delete_all_k8s_resources_for_org(str(org.id))

    async def recalculate_storage(self, org: Organization) -> dict[str, bool]:
        """Recalculate org storage use"""
        try:
            total_crawl_size, crawl_size, upload_size = (
                await self.base_crawl_ops.calculate_org_crawl_file_storage(
                    org.id,
                )
            )
            profile_size = await self.profile_ops.calculate_org_profile_file_storage(
                org.id
            )

            seed_file_size = await self.file_ops.calculate_seed_file_storage(org.id)

            thumbnail_size = await self.coll_ops.calculate_thumbnail_storage(org.id)

            user_file_size = seed_file_size + thumbnail_size

            org_size = total_crawl_size + profile_size + user_file_size

            await self.orgs.find_one_and_update(
                {"_id": org.id},
                {
                    "$set": {
                        "bytesStored": org_size,
                        "bytesStoredCrawls": crawl_size,
                        "bytesStoredUploads": upload_size,
                        "bytesStoredProfiles": profile_size,
                        "bytesStoredSeedFiles": seed_file_size,
                        "bytesStoredThumbnails": thumbnail_size,
                    }
                },
            )
        # pylint: disable=broad-exception-caught, raise-missing-from
        except Exception as err:
            raise HTTPException(
                status_code=400, detail=f"Error calculating size: {err}"
            )

        return {"success": True}

    async def set_last_crawl_finished(self, oid: UUID):
        """Recalculate and set lastCrawlFinished field on org"""
        last_crawl_finished = await self.base_crawl_ops.get_org_last_crawl_finished(oid)
        await self.orgs.find_one_and_update(
            {"_id": oid},
            {"$set": {"lastCrawlFinished": last_crawl_finished}},
        )

    async def inc_org_bytes_stored_field(self, oid: UUID, field: str, size: int):
        """Increment specific org bytesStored* field"""
        try:
            await self.orgs.find_one_and_update(
                {"_id": oid}, {"$inc": {field: size, "bytesStored": size}}
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(f"Error updating field {field} on org {oid}: {err}", flush=True)


# ============================================================================
# pylint: disable=too-many-statements, too-many-arguments
def init_orgs_api(
    app,
    mdb,
    user_manager: UserManager,
    crawl_manager: CrawlManager,
    invites: InviteOps,
    user_dep: Callable,
):
    """Init organizations api router for /orgs"""
    # pylint: disable=too-many-locals,invalid-name

    ops = OrgOps(mdb, invites, user_manager, crawl_manager)

    async def org_dep(oid: UUID, user: User = Depends(user_dep)):
        org = await ops.get_org_for_user_by_id(oid, user)
        if not org:
            raise HTTPException(status_code=404, detail="org_not_found")
        if not org.is_viewer(user):
            raise HTTPException(
                status_code=403,
                detail="User does not have permission to view this organization",
            )

        return org

    async def org_crawl_dep(
        org: Organization = Depends(org_dep), user: User = Depends(user_dep)
    ):
        if not org.is_crawler(user):
            raise HTTPException(
                status_code=403, detail="User does not have permission to modify crawls"
            )

        return org

    async def org_owner_dep(
        org: Organization = Depends(org_dep), user: User = Depends(user_dep)
    ):
        if not org.is_owner(user):
            raise HTTPException(
                status_code=403,
                detail="User does not have permission to perform this action",
            )

        return org

    async def org_public(oid: UUID):
        try:
            org = await ops.get_org_by_id(oid)
        except HTTPException as exc:
            raise HTTPException(status_code=404, detail="org_not_found") from exc

        return org

    router = APIRouter(
        prefix="/orgs/{oid}",
        dependencies=[Depends(org_dep)],
        responses={404: {"description": "Not found"}},
    )

    ops.router = router
    ops.org_viewer_dep = org_dep
    ops.org_crawl_dep = org_crawl_dep
    ops.org_owner_dep = org_owner_dep
    ops.org_public = org_public

    @app.get("/orgs", tags=["organizations"], response_model=PaginatedOrgOutResponse)
    async def get_orgs(
        user: User = Depends(user_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: str = "name",
        sortDirection: int = 1,
    ):
        results, total = await ops.get_orgs_for_user(
            user,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        serialized_results = [
            await res.serialize_for_user(user, user_manager) for res in results
        ]
        return paginated_format(serialized_results, total, page, pageSize)

    @app.post("/orgs/create", tags=["organizations"], response_model=AddedResponseId)
    async def create_org(
        new_org: OrgCreate,
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        org = await ops.create_org(new_org.name, new_org.slug)
        return {"added": True, "id": org.id}

    @router.get("", tags=["organizations"], response_model=OrgOut)
    async def get_org(
        org: Organization = Depends(org_dep), user: User = Depends(user_dep)
    ):
        org_out = await org.serialize_for_user(user, user_manager)
        org_out.storageQuotaReached = ops.storage_quota_reached(org)
        org_out.execMinutesQuotaReached = ops.exec_mins_quota_reached(org)
        return org_out

    @router.delete("", tags=["organizations"], response_model=DeletedResponseId)
    async def delete_org(
        org: Organization = Depends(org_dep), user: User = Depends(user_dep)
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        job_id = await ops.background_job_ops.create_delete_org_job(org)

        return {"deleted": True, "id": job_id}

    @router.post("/rename", tags=["organizations"], response_model=UpdatedResponse)
    async def rename_org(
        rename: RenameOrg,
        org: Organization = Depends(org_owner_dep),
    ):
        org.name = rename.name
        if rename.slug:
            validate_slug(rename.slug)
            org.slug = rename.slug
        else:
            org.slug = slug_from_name(rename.name)

        try:
            await ops.update_slug_and_name(org)
        except DuplicateKeyError as dupe:
            field = get_duplicate_key_error_field(dupe)
            raise HTTPException(
                status_code=400, detail=f"duplicate_org_{field}"
            ) from dupe

        return {"updated": True}

    @app.get("/orgs/plans", tags=["organizations"], response_model=PlansResponse)
    async def get_plans(user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")
        plans_json = os.environ.get("AVAILABLE_PLANS")
        if not plans_json:
            return PlansResponse(plans=[])
        try:
            plans = PlansResponse.model_validate_json(plans_json)
            return plans
        except ValidationError as err:
            raise HTTPException(status_code=400, detail="invalid_plans") from err

    @router.post("/quotas", tags=["organizations"], response_model=UpdatedResponse)
    async def update_quotas(
        quotas: OrgQuotasIn,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        await ops.update_quotas(org, quotas)

        return {"updated": True}

    @router.post("/proxies", tags=["organizations"], response_model=UpdatedResponse)
    async def update_proxies(
        proxies: OrgProxies,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        await ops.update_proxies(org, proxies)

        return {"updated": True}

    @router.post("/read-only", tags=["organizations"], response_model=UpdatedResponse)
    async def update_read_only(
        update: OrgReadOnlyUpdate,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        await ops.update_read_only(org, update.readOnly, update.readOnlyReason)

        return {"updated": True}

    @router.post(
        "/read-only-on-cancel", tags=["organizations"], response_model=UpdatedResponse
    )
    async def update_read_only_on_cancel(
        update: OrgReadOnlyOnCancel,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        await ops.update_read_only_on_cancel(org, update)

        return {"updated": True}

    @router.post(
        "/public-profile",
        tags=["organizations", "collections"],
        response_model=UpdatedResponse,
    )
    async def update_public_profile(
        update: OrgPublicProfileUpdate,
        org: Organization = Depends(org_owner_dep),
    ):
        await ops.update_public_profile(org, update)

        return {"updated": True}

    @router.post(
        "/event-webhook-urls", tags=["organizations"], response_model=UpdatedResponse
    )
    async def update_event_webhook_urls(
        urls: OrgWebhookUrls,
        request: Request,
        org: Organization = Depends(org_owner_dep),
    ):
        await ops.set_origin(org, request)
        result = await ops.update_event_webhook_urls(org, urls)

        if not result:
            return {"updated": False}

        return {"updated": True}

    @router.patch("/user-role", tags=["organizations"], response_model=UpdatedResponse)
    async def set_role(
        update: UpdateRole,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        other_user = await user_manager.get_by_email(update.email)
        if not other_user:
            raise HTTPException(
                status_code=400, detail="No user found for specified e-mail"
            )

        if other_user.email == user.email:
            raise HTTPException(status_code=400, detail="Can't change own role!")

        await ops.change_user_role(org, other_user.id, update.role)

        return {"updated": True}

    @router.post(
        "/defaults/crawling", tags=["organizations"], response_model=UpdatedResponse
    )
    async def update_crawling_defaults(
        defaults: CrawlConfigDefaults,
        org: Organization = Depends(org_owner_dep),
    ):
        await ops.update_crawling_defaults(org, defaults)
        return {"updated": True}

    @router.post(
        "/recalculate-storage",
        tags=["organizations"],
        response_model=SuccessResponseId,
    )
    async def recalculate_org_storage(org: Organization = Depends(org_owner_dep)):
        job_id = await ops.background_job_ops.create_recalculate_org_stats_job(org)
        return {"success": True, "id": job_id}

    @router.post("/invite", tags=["invites"], response_model=OrgInviteResponse)
    async def invite_user_to_org(
        invite: InviteToOrgRequest,
        request: Request,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        is_new, token = await invites.invite_user(
            invite,
            user,
            user_manager,
            org=org,
            headers=dict(request.headers),
        )
        if is_new:
            return {"invited": "new_user", "token": token}

        return {"invited": "existing_user", "token": token}

    @app.post(
        "/orgs/invite-accept/{token}",
        tags=["invites"],
        response_model=OrgAcceptInviteResponse,
    )
    async def accept_invite(token: UUID, user: User = Depends(user_dep)):
        invite = await ops.invites.get_valid_invite(
            token, email=user.email, userid=user.id
        )
        org = await ops.add_user_by_invite(invite, user)
        org_out = await org.serialize_for_user(user, user_manager)
        return {"added": True, "org": org_out}

    @router.get(
        "/invites", tags=["invites"], response_model=PaginatedInvitePendingResponse
    )
    async def get_pending_org_invites(
        org: Organization = Depends(org_owner_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        pending_invites, total = await user_manager.invites.get_pending_invites(
            user_manager, org, page_size=pageSize, page=page
        )
        return paginated_format(pending_invites, total, page, pageSize)

    @router.post(
        "/invites/delete", tags=["invites"], response_model=OrgDeleteInviteResponse
    )
    async def delete_invite(
        invite: RemovePendingInvite, org: Organization = Depends(org_owner_dep)
    ):
        result = await user_manager.invites.remove_invite_by_email(invite.email, org.id)
        if result.deleted_count > 0:
            return {
                "removed": True,
                "count": result.deleted_count,
            }
        raise HTTPException(status_code=404, detail="invite_not_found")

    @router.post("/remove", tags=["invites"], response_model=RemovedResponse)
    async def remove_user_from_org(
        remove: RemoveFromOrg, org: Organization = Depends(org_owner_dep)
    ) -> dict[str, bool]:
        other_user = await user_manager.get_by_email(remove.email)
        if not other_user:
            raise HTTPException(status_code=404, detail="no_such_org_user")

        if org.is_owner(other_user):
            org_owners = await ops.get_org_owners(org)
            if len(org_owners) == 1:
                raise HTTPException(
                    status_code=400, detail="Can't remove only owner from org"
                )
        try:
            del org.users[str(other_user.id)]
        except KeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=404, detail="no_such_org_user")

        await ops.update_users(org)
        return {"removed": True}

    @router.post("/add-user", tags=["invites"], response_model=AddedResponse)
    async def add_new_user_to_org(
        add_to_org: AddToOrgRequest,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        await ops.create_new_user_for_org(add_to_org, org)
        return {"added": True}

    @router.get("/metrics", tags=["organizations"], response_model=OrgMetrics)
    async def get_org_metrics(org: Organization = Depends(org_dep)):
        return await ops.get_org_metrics(org)

    @app.get("/orgs/slugs", tags=["organizations"], response_model=OrgSlugsResponse)
    async def get_all_org_slugs(user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")
        return await ops.get_all_org_slugs()

    @app.get(
        "/orgs/slug-lookup", tags=["organizations"], response_model=Dict[UUID, str]
    )
    async def get_all_org_slugs_with_ids(user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")
        return await ops.get_org_slugs_by_ids()

    @router.get("/export/json", tags=["organizations"], response_model=bytes)
    async def export_org(
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.export_org(org, user_manager)

    @app.post(
        "/orgs/import/json", tags=["organizations"], response_model=OrgImportResponse
    )
    async def import_org(
        request: Request,
        user: User = Depends(user_dep),
        ignoreVersion: bool = False,
        storageName: Optional[str] = None,
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        # pylint: disable=consider-using-with
        temp_file = NamedTemporaryFile(delete=False)
        async for chunk in request.stream():
            temp_file.write(chunk)
        temp_file.seek(0)

        with open(temp_file.name, "rb") as stream_file_object:
            await ops.import_org(
                stream_file_object,
                ignore_version=ignoreVersion,
                storage_name=storageName,
            )

        temp_file.close()

        return {"imported": True}

    return ops
