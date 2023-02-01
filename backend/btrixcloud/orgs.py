"""
Organization API handling
"""
import os
import time
import uuid

from typing import Dict, Union, Literal, Optional

from pydantic import BaseModel
from pymongo.errors import AutoReconnect, DuplicateKeyError
from fastapi import APIRouter, Depends, HTTPException, Request

from .db import BaseMongoModel

from .users import User

from .invites import (
    AddToOrgRequest,
    InvitePending,
    InviteRequest,
    InviteToOrgRequest,
    UserRole,
)

# crawl scale for constraint
MAX_CRAWL_SCALE = 3

DEFAULT_ORG = os.environ.get("DEFAULT_ORG", "My Organization")


# ============================================================================
class UpdateRole(InviteToOrgRequest):
    """Update existing role for user"""


# ============================================================================
class RemoveFromOrg(InviteRequest):
    """Remove this user from org"""


# ============================================================================
class RenameOrg(BaseModel):
    """Request to invite another user"""

    name: str


# ============================================================================
class DefaultStorage(BaseModel):
    """Storage reference"""

    type: Literal["default"] = "default"
    name: str
    path: str = ""


# ============================================================================
class S3Storage(BaseModel):
    """S3 Storage Model"""

    type: Literal["s3"] = "s3"

    endpoint_url: str
    access_key: str
    secret_key: str
    access_endpoint_url: Optional[str]
    region: Optional[str] = ""
    use_access_for_presign: Optional[bool] = True


# ============================================================================
class Organization(BaseMongoModel):
    """Organization Base Model"""

    name: str

    users: Dict[str, UserRole]

    storage: Union[S3Storage, DefaultStorage]

    usage: Dict[str, int] = {}

    default: bool = False

    def is_owner(self, user):
        """Check if user is owner"""
        return self._is_auth(user, UserRole.OWNER)

    def is_crawler(self, user):
        """Check if user can crawl (write)"""
        return self._is_auth(user, UserRole.CRAWLER)

    def is_viewer(self, user):
        """Check if user can view (read)"""
        return self._is_auth(user, UserRole.VIEWER)

    def _is_auth(self, user, value):
        """Check if user has at least specified permission level"""
        if user.is_superuser:
            return True

        res = self.users.get(str(user.id))
        if not res:
            return False

        return res >= value

    async def serialize_for_user(self, user: User, user_manager):
        """Serialize based on current user access"""
        exclude = {"storage"}

        if not self.is_owner(user):
            exclude.add("users")

        if not self.is_crawler(user):
            exclude.add("usage")

        result = self.dict(
            exclude_unset=True,
            exclude_defaults=True,
            exclude_none=True,
            exclude=exclude,
        )

        if self.is_owner(user):
            keys = list(result["users"].keys())
            user_list = await user_manager.get_user_names_by_ids(keys)

            for org_user in user_list:
                id_ = str(org_user["id"])
                role = result["users"].get(id_)
                if not role:
                    continue

                result["users"][id_] = {
                    "role": role,
                    "name": org_user.get("name", ""),
                    "email": org_user.get("email", ""),
                }

        return result


# ============================================================================
class OrgOps:
    """Organization API operations"""

    def __init__(self, mdb, invites):
        self.orgs = mdb["organizations"]

        self.router = None
        self.org_viewer_dep = None
        self.org_crawl_dep = None
        self.org_owner_dep = None

        self.invites = invites

    async def init_index(self):
        """init lookup index"""
        while True:
            try:
                return await self.orgs.create_index("name", unique=True)
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
            users={str(user.id): UserRole.OWNER},
            storage=DefaultStorage(name=storage_name, path=storage_path),
        )

        storage_info = f"storage {storage_name} / {storage_path}"
        print(f"Creating new org {org_name} with {storage_info}", flush=True)
        await self.add_org(org)

    async def get_orgs_for_user(self, user: User, role: UserRole = UserRole.VIEWER):
        """Get all orgs a user is a member of"""
        if user.is_superuser:
            query = {}
        else:
            query = {f"users.{user.id}": {"$gte": role.value}}
        cursor = self.orgs.find(query)
        results = await cursor.to_list(length=1000)
        return [Organization.from_dict(res) for res in results]

    async def get_org_for_user_by_id(
        self, oid: uuid.UUID, user: User, role: UserRole = UserRole.VIEWER
    ):
        """Get an org for user by unique id"""
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
                await self.update(default_org)
                print(f'Default organization renamed to "{DEFAULT_ORG}"', flush=True)
            return

        id_ = uuid.uuid4()
        storage_path = str(id_) + "/"
        org = Organization(
            id=id_,
            name=DEFAULT_ORG,
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
        self, org: Organization, userid: uuid.UUID, role: UserRole = UserRole.OWNER
    ):
        """Add user to organization with specified role"""
        org.users[str(userid)] = role
        await self.update(org)

    async def get_org_owners(self, org: Organization):
        """Return list of org's Owner users."""
        org_owners = []
        for key, value in org.users.items():
            if value == UserRole.OWNER:
                org_owners.append(key)
        return org_owners


# ============================================================================
# pylint: disable=too-many-statements
def init_orgs_api(app, mdb, user_manager, invites, user_dep: User):
    """Init organizations api router for /orgs"""
    # pylint: disable=too-many-locals

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

    router = APIRouter(
        prefix="/orgs/{oid}",
        dependencies=[Depends(org_dep)],
        responses={404: {"description": "Not found"}},
    )

    ops.router = router
    ops.org_viewer_dep = org_dep
    ops.org_crawl_dep = org_crawl_dep
    ops.org_owner_dep = org_owner_dep

    @app.get("/orgs", tags=["organizations"])
    async def get_orgs(user: User = Depends(user_dep)):
        results = await ops.get_orgs_for_user(user)
        return {
            "orgs": [
                await res.serialize_for_user(user, user_manager) for res in results
            ]
        }

    @app.post("/orgs/create", tags=["organizations"])
    async def create_org(
        new_org: RenameOrg,
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        id_ = uuid.uuid4()
        storage_path = str(id_) + "/"
        org = Organization(
            id=id_,
            name=new_org.name,
            users={},
            storage=DefaultStorage(name="default", path=storage_path),
        )
        await ops.add_org(org)

        return {"added": True}

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
        try:
            await ops.update(org)
        except DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="duplicate_org_name")

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
    async def get_pending_org_invites(org: Organization = Depends(org_owner_dep)):
        pending_invites = await user_manager.invites.get_pending_invites(org)
        return {"pending_invites": pending_invites}

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

        del org.users[str(other_user.id)]
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

    return ops
