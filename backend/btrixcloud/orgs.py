"""
Organization API handling
"""
import os
import time
import urllib.parse
import uuid
from datetime import datetime

from typing import Union, Optional

from pymongo import ReturnDocument
from pymongo.errors import AutoReconnect, DuplicateKeyError
from fastapi import APIRouter, Depends, HTTPException, Request

from .basecrawls import SUCCESSFUL_STATES, RUNNING_STATES, STARTING_STATES
from .models import (
    Organization,
    DefaultStorage,
    S3Storage,
    OrgQuotas,
    OrgMetrics,
    OrgWebhookUrls,
    RenameOrg,
    UpdateRole,
    RemovePendingInvite,
    RemoveFromOrg,
    AddToOrgRequest,
    InvitePending,
    InviteToOrgRequest,
    UserRole,
    User,
    PaginatedResponse,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import slug_from_name


DEFAULT_ORG = os.environ.get("DEFAULT_ORG", "My Organization")


# ============================================================================
# pylint: disable=too-many-public-methods, too-many-instance-attributes
class OrgOps:
    """Organization API operations"""

    def __init__(self, mdb, invites):
        self.orgs = mdb["organizations"]
        self.crawls_db = mdb["crawls"]
        self.profiles_db = mdb["profiles"]
        self.colls_db = mdb["collections"]

        self.router = None
        self.org_viewer_dep = None
        self.org_crawl_dep = None
        self.org_owner_dep = None
        self.org_public = None

        self.invites = invites

    async def init_index(self):
        """init lookup index"""
        while True:
            try:
                await self.orgs.create_index("name", unique=True)
                return await self.orgs.create_index("slug", unique=True)
            # pylint: disable=duplicate-code
            except AutoReconnect:
                print(
                    "Database connection unavailable to create index. Will try again in 5 scconds",
                    flush=True,
                )
                time.sleep(5)

    async def add_org(self, org: Organization):
        """Add new org"""
        try:
            return await self.orgs.insert_one(org.to_dict())
        except DuplicateKeyError:
            print(f"Organization name {org.name} already in use - skipping", flush=True)

    async def create_new_org_for_user(
        self,
        org_name: str,
        storage_name,
        user: User,
    ):
        # pylint: disable=too-many-arguments
        """Create new organization with default storage for new user"""
        id_ = uuid.uuid4()

        storage_path = str(id_) + "/"

        org = Organization(
            id=id_,
            name=org_name,
            slug=slug_from_name(org_name),
            users={str(user.id): UserRole.OWNER},
            storage=DefaultStorage(name=storage_name, path=storage_path),
        )

        storage_info = f"storage {storage_name} / {storage_path}"
        print(f"Creating new org {org_name} with {storage_info}", flush=True)
        await self.add_org(org)

    async def get_orgs_for_user(
        # pylint: disable=too-many-arguments
        self,
        user: User,
        role: UserRole = UserRole.VIEWER,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        calculate_total=True,
    ):
        """Get all orgs a user is a member of"""
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        if user.is_superuser:
            query = {}
        else:
            query = {f"users.{user.id}": {"$gte": role.value}}

        total = 0
        if calculate_total:
            total = await self.orgs.count_documents(query)

        cursor = self.orgs.find(query, skip=skip, limit=page_size)
        results = await cursor.to_list(length=page_size)
        orgs = [Organization.from_dict(res) for res in results]

        return orgs, total

    async def get_org_for_user_by_id(
        self, oid: uuid.UUID, user: User, role: UserRole = UserRole.VIEWER
    ):
        """Get an org for user by unique id"""
        query: dict[str, object]
        if user.is_superuser:
            query = {"_id": oid}
        else:
            query = {f"users.{user.id}": {"$gte": role.value}, "_id": oid}
        res = await self.orgs.find_one(query)
        return Organization.from_dict(res)

    async def get_org_by_id(self, oid: uuid.UUID):
        """Get an org by id"""
        res = await self.orgs.find_one({"_id": oid})
        return Organization.from_dict(res)

    async def get_default_org(self):
        """Get default organization"""
        res = await self.orgs.find_one({"default": True})
        if res:
            return Organization.from_dict(res)

    async def create_default_org(self, storage_name="default"):
        """Create default organization if doesn't exist."""
        await self.init_index()

        default_org = await self.get_default_org()
        if default_org:
            if default_org.name == DEFAULT_ORG:
                print("Default organization already exists - skipping", flush=True)
            else:
                default_org.name = DEFAULT_ORG
                default_org.slug = slug_from_name(DEFAULT_ORG)
                await self.update(default_org)
                print(f'Default organization renamed to "{DEFAULT_ORG}"', flush=True)
            return

        id_ = uuid.uuid4()
        storage_path = str(id_) + "/"
        org = Organization(
            id=id_,
            name=DEFAULT_ORG,
            slug=slug_from_name(DEFAULT_ORG),
            users={},
            storage=DefaultStorage(name=storage_name, path=storage_path),
            default=True,
        )
        storage_info = f"Storage: {storage_name} / {storage_path}"
        print(
            f'Creating Default Organization "{DEFAULT_ORG}". Storage: {storage_info}',
            flush=True,
        )
        await self.add_org(org)

    async def update(self, org: Organization):
        """Update existing org"""
        return await self.orgs.find_one_and_update(
            {"_id": org.id}, {"$set": org.to_dict()}, upsert=True
        )

    async def update_storage(
        self, org: Organization, storage: Union[S3Storage, DefaultStorage]
    ):
        """Update storage on an existing organization"""
        return await self.orgs.find_one_and_update(
            {"_id": org.id}, {"$set": {"storage": storage.dict()}}
        )

    async def update_quotas(self, org: Organization, quotas: OrgQuotas):
        """update organization quotas"""
        return await self.orgs.find_one_and_update(
            {"_id": org.id},
            {
                "$set": {
                    "quotas": quotas.dict(
                        exclude_unset=True, exclude_defaults=True, exclude_none=True
                    )
                }
            },
        )

    async def update_event_webhook_urls(self, org: Organization, urls: OrgWebhookUrls):
        """Update organization event webhook URLs"""
        return await self.orgs.find_one_and_update(
            {"_id": org.id},
            {"$set": {"webhookUrls": urls.dict(exclude_unset=True)}},
            return_document=ReturnDocument.AFTER,
        )

    async def handle_new_user_invite(self, invite_token: str, user: User):
        """Handle invite from a new user"""
        new_user_invite = await self.invites.get_valid_invite(invite_token, user.email)
        await self.add_user_by_invite(new_user_invite, user)
        await self.invites.remove_invite(invite_token)
        return new_user_invite

    async def add_user_by_invite(self, invite: InvitePending, user: User):
        """Add user to an org from an InvitePending, if any.

        If there's no org to add to (eg. superuser invite), just return.
        """
        if not invite.oid:
            return

        org = await self.get_org_by_id(invite.oid)
        if not org:
            raise HTTPException(
                status_code=400, detail="Invalid Invite Code, No Such Organization"
            )

        await self.add_user_to_org(org, user.id, invite.role)
        return True

    async def add_user_to_org(
        self, org: Organization, userid: uuid.UUID, role: Optional[UserRole] = None
    ):
        """Add user to organization with specified role"""
        org.users[str(userid)] = role or UserRole.OWNER
        await self.update(org)

    async def get_org_owners(self, org: Organization):
        """Return list of org's Owner users."""
        org_owners = []
        for key, value in org.users.items():
            if value == UserRole.OWNER:
                org_owners.append(key)
        return org_owners

    async def get_max_pages_per_crawl(self, oid: uuid.UUID):
        """Return org-specific max pages per crawl setting or 0."""
        org = await self.orgs.find_one({"_id": oid})
        if org:
            org = Organization.from_dict(org)
            return org.quotas.maxPagesPerCrawl
        return 0

    async def inc_org_bytes_stored(self, oid: uuid.UUID, size: int, type_="crawl"):
        """Increase org bytesStored count (pass negative value to subtract)."""
        if type_ == "crawl":
            await self.orgs.find_one_and_update(
                {"_id": oid}, {"$inc": {"bytesStored": size, "bytesStoredCrawls": size}}
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
        return await self.storage_quota_reached(oid)

    # pylint: disable=invalid-name
    async def storage_quota_reached(self, oid: uuid.UUID):
        """Return boolean indicating if storage quota is met or exceeded."""
        quota = await self.get_org_storage_quota(oid)
        if not quota:
            return False

        org = await self.orgs.find_one({"_id": oid})
        org = Organization.from_dict(org)

        if org.bytesStored >= quota:
            return True

        return False

    async def get_org_storage_quota(self, oid):
        """return max allowed concurrent crawls, if any"""
        org = await self.orgs.find_one({"_id": oid})
        if org:
            org = Organization.from_dict(org)
            return org.quotas.storageQuota
        return 0

    async def set_origin(self, org: Organization, request: Request):
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

    async def inc_org_time_stats(self, oid, duration, is_exec_time=False):
        """inc crawl duration stats for org oid"""
        # init org crawl stats
        key = "crawlExecSeconds" if is_exec_time else "usage"
        yymm = datetime.utcnow().strftime("%Y-%m")
        await self.orgs.find_one_and_update(
            {"_id": oid}, {"$inc": {f"{key}.{yymm}": duration}}
        )

    async def get_max_concurrent_crawls(self, oid):
        """return max allowed concurrent crawls, if any"""
        org = await self.orgs.find_one({"_id": oid})
        if org:
            org = Organization.from_dict(org)
            return org.quotas.maxConcurrentCrawls
        return 0

    async def get_org_metrics(self, org: Organization):
        """Calculate and return org metrics"""
        # pylint: disable=too-many-locals
        storage_quota = await self.get_org_storage_quota(org.id)
        max_concurrent_crawls = await self.get_max_concurrent_crawls(org.id)

        # Calculate these counts in loop to avoid having db iterate through
        # archived items several times.
        archived_item_count = 0
        crawl_count = 0
        upload_count = 0
        page_count = 0

        async for item in self.crawls_db.find({"oid": org.id}):
            if item["state"] not in SUCCESSFUL_STATES:
                continue
            archived_item_count += 1
            type_ = item.get("type")
            if type_ == "crawl":
                crawl_count += 1
            if type_ == "upload":
                upload_count += 1
            if item.get("stats"):
                page_count += item.get("stats", {}).get("done", 0)

        profile_count = await self.profiles_db.count_documents({"oid": org.id})
        workflows_running_count = await self.crawls_db.count_documents(
            {"oid": org.id, "state": {"$in": list(RUNNING_STATES)}}
        )
        workflows_queued_count = await self.crawls_db.count_documents(
            {"oid": org.id, "state": {"$in": list(STARTING_STATES)}}
        )
        collections_count = await self.colls_db.count_documents({"oid": org.id})
        public_collections_count = await self.colls_db.count_documents(
            {"oid": org.id, "isPublic": True}
        )

        return {
            "storageUsedBytes": org.bytesStored,
            "storageUsedCrawls": org.bytesStoredCrawls,
            "storageUsedUploads": org.bytesStoredUploads,
            "storageUsedProfiles": org.bytesStoredProfiles,
            "storageQuotaBytes": storage_quota,
            "archivedItemCount": archived_item_count,
            "crawlCount": crawl_count,
            "uploadCount": upload_count,
            "pageCount": page_count,
            "profileCount": profile_count,
            "workflowsRunningCount": workflows_running_count,
            "maxConcurrentCrawls": max_concurrent_crawls,
            "workflowsQueuedCount": workflows_queued_count,
            "collectionsCount": collections_count,
            "publicCollectionsCount": public_collections_count,
        }

    async def get_all_org_slugs(self):
        """Return list of all org slugs."""
        slugs = await self.orgs.distinct("slug", {})
        return {"slugs": slugs}


# ============================================================================
# pylint: disable=too-many-statements
def init_orgs_api(app, mdb, user_manager, invites, user_dep):
    """Init organizations api router for /orgs"""
    # pylint: disable=too-many-locals,invalid-name

    ops = OrgOps(mdb, invites)

    async def org_dep(oid: str, user: User = Depends(user_dep)):
        org = await ops.get_org_for_user_by_id(uuid.UUID(oid), user)
        if not org:
            raise HTTPException(
                status_code=404, detail=f"Organization '{oid}' not found"
            )
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

    async def org_public(oid: str):
        org = await ops.get_org_by_id(uuid.UUID(oid))
        if not org:
            raise HTTPException(status_code=404, detail="org_not_found")

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

    @app.get("/orgs", tags=["organizations"], response_model=PaginatedResponse)
    async def get_orgs(
        user: User = Depends(user_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        results, total = await ops.get_orgs_for_user(
            user, page_size=pageSize, page=page
        )
        serialized_results = [
            await res.serialize_for_user(user, user_manager) for res in results
        ]
        return paginated_format(serialized_results, total, page, pageSize)

    @app.post("/orgs/create", tags=["organizations"])
    async def create_org(
        new_org: RenameOrg,
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        id_ = uuid.uuid4()
        storage_path = str(id_) + "/"

        slug = new_org.slug
        if not slug:
            slug = slug_from_name(new_org.name)

        org = Organization(
            id=id_,
            name=new_org.name,
            slug=slug,
            users={},
            storage=DefaultStorage(name="default", path=storage_path),
        )
        if not await ops.add_org(org):
            return {"added": False, "error": "already_exists"}

        return {"id": id_, "added": True}

    @router.get("", tags=["organizations"])
    async def get_org(
        org: Organization = Depends(org_dep), user: User = Depends(user_dep)
    ):
        return await org.serialize_for_user(user, user_manager)

    @router.post("/rename", tags=["organizations"])
    async def rename_org(
        rename: RenameOrg,
        org: Organization = Depends(org_owner_dep),
    ):
        org.name = rename.name
        if rename.slug:
            org.slug = rename.slug
        else:
            org.slug = slug_from_name(rename.name)

        try:
            await ops.update(org)
        except DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="duplicate_org_name")

        return {"updated": True}

    @router.post("/quotas", tags=["organizations"])
    async def update_quotas(
        quotas: OrgQuotas,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        await ops.update_quotas(org, quotas)

        return {"updated": True}

    @router.post("/event-webhook-urls", tags=["organizations"])
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

    @router.patch("/user-role", tags=["organizations"])
    async def set_role(
        update: UpdateRole,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        other_user = await user_manager.user_db.get_by_email(update.email)
        if not other_user:
            raise HTTPException(
                status_code=400, detail="No user found for specified e-mail"
            )

        if other_user.email == user.email:
            raise HTTPException(status_code=400, detail="Can't change own role!")

        await ops.add_user_to_org(org, other_user.id, update.role)

        return {"updated": True}

    @router.post("/invite", tags=["invites"])
    async def invite_user_to_org(
        invite: InviteToOrgRequest,
        request: Request,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if await invites.invite_user(
            invite,
            user,
            user_manager,
            org=org,
            allow_existing=True,
            headers=request.headers,
        ):
            return {"invited": "new_user"}

        return {"invited": "existing_user"}

    @app.post("/orgs/invite-accept/{token}", tags=["invites"])
    async def accept_invite(token: str, user: User = Depends(user_dep)):
        invite = invites.accept_user_invite(user, token)

        await ops.add_user_by_invite(invite, user)
        await user_manager.user_db.update(user)
        return {"added": True}

    @router.get("/invites", tags=["invites"])
    async def get_pending_org_invites(
        org: Organization = Depends(org_owner_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        pending_invites, total = await user_manager.invites.get_pending_invites(
            org, page_size=pageSize, page=page
        )
        return paginated_format(pending_invites, total, page, pageSize)

    @router.post("/invites/delete", tags=["invites"])
    async def delete_invite(
        invite: RemovePendingInvite, org: Organization = Depends(org_owner_dep)
    ):
        # URL decode email just in case
        email = urllib.parse.unquote(invite.email)
        result = await user_manager.invites.remove_invite_by_email(email, org.id)
        if result.deleted_count > 0:
            return {
                "removed": True,
                "count": result.deleted_count,
            }
        raise HTTPException(status_code=404, detail="invite_not_found")

    @router.post("/remove", tags=["invites"])
    async def remove_user_from_org(
        remove: RemoveFromOrg, org: Organization = Depends(org_owner_dep)
    ):
        other_user = await user_manager.user_db.get_by_email(remove.email)

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

        await ops.update(org)
        return {"removed": True}

    @router.post("/add-user", tags=["invites"])
    async def add_new_user_to_org(
        invite: AddToOrgRequest,
        org: Organization = Depends(org_owner_dep),
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        await user_manager.create_non_super_user(
            invite.email, invite.password, invite.name
        )
        update_role = UpdateRole(role=invite.role, email=invite.email)
        await set_role(update_role, org, user)
        return {"added": True}

    @router.get("/metrics", tags=["organizations"], response_model=OrgMetrics)
    async def get_org_metrics(org: Organization = Depends(org_dep)):
        return await ops.get_org_metrics(org)

    @app.get("/orgs/slugs", tags=["organizations"])
    async def get_all_org_slugs():
        return await ops.get_all_org_slugs()

    return ops
