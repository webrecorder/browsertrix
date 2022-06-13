"""
Archive API handling
"""
import uuid

from typing import Dict, Union, Literal, Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request

from .db import BaseMongoModel

from .users import User

from .invites import InvitePending, InviteToArchiveRequest, UserRole


# crawl scale for constraint
MAX_CRAWL_SCALE = 3


# ============================================================================
class UpdateRole(InviteToArchiveRequest):
    """Update existing role for user"""


# ============================================================================
class DefaultStorage(BaseModel):
    """ Storage reference """

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


# ============================================================================
class Archive(BaseMongoModel):
    """Archive Base Model"""

    name: str

    users: Dict[str, UserRole]

    storage: Union[S3Storage, DefaultStorage]

    usage: Dict[str, int] = {}

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

            for archive_user in user_list:
                id_ = str(archive_user["id"])
                role = result["users"].get(id_)
                if not role:
                    continue

                result["users"][id_] = {
                    "role": role,
                    "name": archive_user.get("name", ""),
                }

        return result


# ============================================================================
class ArchiveOps:
    """Archive API operations"""

    def __init__(self, mdb, invites):
        self.archives = mdb["archives"]

        self.router = None
        self.archive_viewer_dep = None
        self.archive_crawl_dep = None
        self.archive_owner_dep = None

        self.invites = invites

    async def add_archive(self, archive: Archive):
        """Add new archive"""
        return await self.archives.insert_one(archive.to_dict())

    async def create_new_archive_for_user(
        self,
        archive_name: str,
        storage_name,
        user: User,
    ):
        # pylint: disable=too-many-arguments
        """Create new archive with default storage for new user"""

        id_ = uuid.uuid4()

        storage_path = str(id_) + "/"

        archive = Archive(
            id=id_,
            name=archive_name,
            users={str(user.id): UserRole.OWNER},
            storage=DefaultStorage(name=storage_name, path=storage_path),
        )

        print(f"Created New Archive with storage {storage_name} / {storage_path}")
        await self.add_archive(archive)

    async def get_archives_for_user(self, user: User, role: UserRole = UserRole.VIEWER):
        """Get all archives a user is a member of"""
        if user.is_superuser:
            query = {}
        else:
            query = {f"users.{user.id}": {"$gte": role.value}}
        cursor = self.archives.find(query)
        results = await cursor.to_list(length=1000)
        return [Archive.from_dict(res) for res in results]

    async def get_archive_for_user_by_id(
        self, aid: uuid.UUID, user: User, role: UserRole = UserRole.VIEWER
    ):
        """Get an archive for user by unique id"""
        if user.is_superuser:
            query = {"_id": aid}
        else:
            query = {f"users.{user.id}": {"$gte": role.value}, "_id": aid}
        res = await self.archives.find_one(query)
        return Archive.from_dict(res)

    async def get_archive_by_id(self, aid: uuid.UUID):
        """Get an archive by id"""
        res = await self.archives.find_one({"_id": aid})
        return Archive.from_dict(res)

    async def update(self, archive: Archive):
        """Update existing archive"""
        self.archives.replace_one({"_id": archive.id}, archive.to_dict())

    async def update_storage(
        self, archive: Archive, storage: Union[S3Storage, DefaultStorage]
    ):
        """ Update storage on an existing archive """
        return await self.archives.find_one_and_update(
            {"_id": archive.id}, {"$set": {"storage": storage.dict()}}
        )

    async def handle_new_user_invite(self, invite_token: str, user: User):
        """Handle invite from a new user"""
        new_user_invite = await self.invites.get_valid_invite(invite_token, user.email)
        await self.add_user_by_invite(new_user_invite, user)
        await self.invites.remove_invite(invite_token)
        return True

    async def add_user_by_invite(self, invite: InvitePending, user: User):
        """Add user to an Archive from an InvitePending, if any"""

        # if no archive to add to (eg. superuser invite), just return
        if not invite.aid:
            return

        archive = await self.get_archive_by_id(invite.aid)
        if not archive:
            raise HTTPException(
                status_code=400, detail="Invalid Invite Code, No Such Archive"
            )

        archive.users[str(user.id)] = invite.role
        await self.update(archive)
        return True


# ============================================================================
def init_archives_api(app, mdb, user_manager, invites, user_dep: User):
    """Init archives api router for /archives"""
    ops = ArchiveOps(mdb, invites)

    async def archive_dep(aid: str, user: User = Depends(user_dep)):
        archive = await ops.get_archive_for_user_by_id(uuid.UUID(aid), user)
        if not archive:
            raise HTTPException(status_code=404, detail=f"Archive '{aid}' not found")

        return archive

    async def archive_crawl_dep(
        archive: Archive = Depends(archive_dep), user: User = Depends(user_dep)
    ):
        if not archive.is_crawler(user):
            raise HTTPException(
                status_code=403, detail="User does not have permission to modify crawls"
            )

        return archive

    async def archive_owner_dep(
        archive: Archive = Depends(archive_dep), user: User = Depends(user_dep)
    ):
        if not archive.is_owner(user):
            raise HTTPException(
                status_code=403,
                detail="User does not have permission to perform this action",
            )

        return archive

    router = APIRouter(
        prefix="/archives/{aid}",
        dependencies=[Depends(archive_dep)],
        responses={404: {"description": "Not found"}},
    )

    ops.router = router
    ops.archive_viewer_dep = archive_dep
    ops.archive_crawl_dep = archive_crawl_dep
    ops.archive_owner_dep = archive_owner_dep

    @app.get("/archives", tags=["archives"])
    async def get_archives(user: User = Depends(user_dep)):
        results = await ops.get_archives_for_user(user)
        return {
            "archives": [
                await res.serialize_for_user(user, user_manager) for res in results
            ]
        }

    @router.get("", tags=["archives"])
    async def get_archive(
        archive: Archive = Depends(archive_dep), user: User = Depends(user_dep)
    ):
        return await archive.serialize_for_user(user, user_manager)

    @router.patch("/user-role", tags=["archives"])
    async def set_role(
        update: UpdateRole,
        archive: Archive = Depends(archive_owner_dep),
        user: User = Depends(user_dep),
    ):

        other_user = await user_manager.user_db.get_by_email(update.email)
        if not other_user:
            raise HTTPException(
                status_code=400, detail="No user found for specified e-mail"
            )

        if other_user.email == user.email:
            raise HTTPException(status_code=400, detail="Can't change own role!")

        archive.users[str(other_user.id)] = update.role
        await ops.update(archive)

        return {"updated": True}

    @router.post("/invite", tags=["invites"])
    async def invite_user_to_archive(
        invite: InviteToArchiveRequest,
        request: Request,
        archive: Archive = Depends(archive_owner_dep),
        user: User = Depends(user_dep),
    ):

        if await invites.invite_user(
            invite,
            user,
            user_manager,
            archive=archive,
            allow_existing=True,
            headers=request.headers,
        ):
            return {"invited": "new_user"}

        return {"invited": "existing_user"}

    @app.post("/archives/invite-accept/{token}", tags=["invites"])
    async def accept_invite(token: str, user: User = Depends(user_dep)):
        invite = invites.accept_user_invite(user, token)

        await ops.add_user_by_invite(invite, user)
        await user_manager.user_db.update(user)
        return {"added": True}

    return ops
