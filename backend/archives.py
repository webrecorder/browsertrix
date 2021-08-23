"""
Archive API handling
"""
import os
import uuid
from datetime import datetime

from typing import Optional, Dict


from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from db import BaseMongoModel

from users import User, InvitePending, UserRole


# ============================================================================
class InviteRequest(BaseModel):
    """Request to invite another user to an archive"""

    email: str
    role: UserRole


# ============================================================================
class NewUserInvite(InvitePending, BaseMongoModel):
    """An invite for a new user, with an email and invite token as id"""

    email: str


# ============================================================================
class UpdateRole(InviteRequest):
    """Update existing role for user"""


# ============================================================================
class S3Storage(BaseModel):
    """S3 Storage Model"""

    type: str = "S3Storage"
    endpoint_url: str
    access_key: str
    secret_key: str
    is_public: Optional[bool]


# ============================================================================
class Archive(BaseMongoModel):
    """Archive Base Model"""

    name: str

    users: Dict[str, UserRole]

    storage: S3Storage

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
        res = self.users.get(str(user.id))
        if not res:
            return False

        return res >= value

    def serialize_for_user(self, user: User):
        """Serialize based on current user access"""
        exclude = set()
        if not self.is_owner(user):
            exclude = {"users", "storage"}

        if not self.is_crawler(user):
            exclude.add("usage")

        return self.dict(
            exclude_unset=True,
            exclude_defaults=True,
            exclude_none=True,
            exclude=exclude,
        )


# ============================================================================
class ArchiveOps:
    """Archive API operations"""

    def __init__(self, db, email):
        self.archives = db["archives"]

        self.invites = db["invites"]
        self.email = email

        self.router = None
        self.archive_crawl_dep = None

    async def add_archive(self, archive: Archive):
        """Add new archive"""
        return await self.archives.insert_one(archive.to_dict())

    @staticmethod
    def get_endpoint_url(base, id_):
        """Get endpoint for a specific archive from base"""
        return os.path.join(base, id_) + "/"

    async def create_new_archive_for_user(
        self,
        archive_name: str,
        base_endpoint_url: str,
        access_key: str,
        secret_key: str,
        user: User,
    ):
        # pylint: disable=too-many-arguments
        """Create new archive with default storage for new user"""

        id_ = str(uuid.uuid4())

        endpoint_url = self.get_endpoint_url(base_endpoint_url, id_)

        storage = S3Storage(
            endpoint_url=endpoint_url,
            access_key=access_key,
            secret_key=secret_key,
            name="default",
        )

        archive = Archive(
            id=id_,
            name=archive_name,
            users={str(user.id): UserRole.OWNER},
            storage=storage,
        )

        print(f"Created New Archive with storage at {endpoint_url}")
        await self.add_archive(archive)

    async def get_archives_for_user(self, user: User, role: UserRole = UserRole.VIEWER):
        """Get all archives a user is a member of"""
        query = {f"users.{user.id}": {"$gte": role.value}}
        cursor = self.archives.find(query)
        results = await cursor.to_list(length=1000)
        return [Archive.from_dict(res) for res in results]

    async def get_archive_for_user_by_id(
        self, uid: str, user: User, role: UserRole = UserRole.VIEWER
    ):
        """Get an archive for user by unique id"""
        query = {f"users.{user.id}": {"$gte": role.value}, "_id": uid}
        res = await self.archives.find_one(query)
        return Archive.from_dict(res)

    async def get_archive_by_id(self, aid: str):
        """Get an archive by id"""
        res = await self.archives.find_one({"_id": aid})
        return Archive.from_dict(res)

    async def update(self, archive: Archive):
        """Update existing archive"""
        self.archives.replace_one({"_id": archive.id}, archive.to_dict())

    async def add_new_user_invite(
        self, new_user_invite: NewUserInvite, inviter_email, archive_name
    ):
        """Add invite for new user"""

        res = await self.invites.find_one({"email": new_user_invite.email})
        if res:
            raise HTTPException(
                status_code=403, detail="This user has already been invited"
            )

        await self.invites.insert_one(new_user_invite.to_dict())

        self.email.send_new_user_invite(
            new_user_invite.email, inviter_email, archive_name, new_user_invite.id
        )

    async def handle_new_user_invite(self, invite_token: str, user: User):
        """Handle invite from a new user"""
        invite_data = await self.invites.find_one({"_id": invite_token})
        if not invite_data:
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        new_user_invite = NewUserInvite.from_dict(invite_data)

        if user.email != new_user_invite.email:
            raise HTTPException(
                status_code=400, detail="Invalid Invite Code for this user"
            )

        await self.add_user_by_invite(new_user_invite, user)
        await self.invites.delete_one({"_id": invite_token})
        return True

    async def add_user_by_invite(self, invite: InvitePending, user: User):
        """Add user to an Archive from an InvitePending"""
        archive = await self.get_archive_by_id(invite.aid)
        if not archive:
            raise HTTPException(
                status_code=400, detail="Invalid Invite Code, No Such Archive"
            )

        archive.users[str(user.id)] = invite.role
        await self.update(archive)
        return True

    async def inc_usage(self, aid, amount):
        """ Increment usage counter by month for this archive """
        yymm = datetime.utcnow().strftime("%Y-%m")
        res = await self.archives.find_one_and_update(
            {"_id": aid}, {"$inc": {f"usage.{yymm}": amount}}
        )
        print(res, flush=True)
        return res is not None


# ============================================================================
def init_archives_api(app, mdb, users, email, user_dep: User):
    """Init archives api router for /archives"""
    ops = ArchiveOps(mdb, email)

    async def archive_dep(aid: str, user: User = Depends(user_dep)):
        archive = await ops.get_archive_for_user_by_id(aid, user)
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

    router = APIRouter(
        prefix="/archives/{aid}",
        dependencies=[Depends(archive_dep)],
        responses={404: {"description": "Not found"}},
    )

    ops.router = router
    ops.archive_crawl_dep = archive_crawl_dep

    @app.get("/archives", tags=["archives"])
    async def get_archives(user: User = Depends(user_dep)):
        results = await ops.get_archives_for_user(user)
        return {"archives": [res.serialize_for_user(user) for res in results]}

    @router.get("", tags=["archives"])
    async def get_archive(
        archive: Archive = Depends(archive_dep), user: User = Depends(user_dep)
    ):
        return archive.serialize_for_user(user)

    @router.post("/invite", tags=["invites"])
    async def invite_user(
        invite: InviteRequest,
        archive: Archive = Depends(archive_dep),
        user: User = Depends(user_dep),
    ):

        if not archive.is_owner(user):
            raise HTTPException(
                status_code=403,
                detail="User does not have permission to invite other users",
            )

        invite_code = uuid.uuid4().hex

        invite_pending = InvitePending(
            aid=str(archive.id), created=datetime.utcnow(), role=invite.role
        )

        other_user = await users.db.get_by_email(invite.email)

        if not other_user:

            await ops.add_new_user_invite(
                NewUserInvite(
                    id=invite_code, email=invite.email, **invite_pending.dict()
                ),
                user.email,
                archive.name,
            )

            return {"invited": "new_user"}

        if other_user.email == user.email:
            raise HTTPException(status_code=400, detail="Can't invite ourselves!")

        if archive.users.get(str(other_user.id)):
            raise HTTPException(
                status_code=400, detail="User already a member of this archive."
            )

        other_user.invites[invite_code] = invite_pending

        await users.db.update(other_user)

        return {
            "invited": "existing_user",
        }

    @router.patch("/user-role", tags=["invites"])
    async def set_role(
        update: UpdateRole,
        archive: Archive = Depends(archive_dep),
        user: User = Depends(user_dep),
    ):

        if not archive.is_owner(user):
            raise HTTPException(
                status_code=403,
                detail="User does not have permission to invite other users",
            )

        other_user = await users.db.get_by_email(update.email)
        if not other_user:
            raise HTTPException(
                status_code=400, detail="No user found for specified e-mail"
            )

        if other_user.email == user.email:
            raise HTTPException(status_code=400, detail="Can't change own role!")

        archive.users[str(other_user.id)] = update.role
        await ops.update(archive)

        return {"updated": True}

    @app.get("/invite/accept/{token}", tags=["invites"])
    async def accept_invite(token: str, user: User = Depends(user_dep)):
        invite = user.invites.pop(token, "")
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        await ops.add_user_by_invite(invite, user)
        await users.db.update(user)
        return {"added": True}

    return ops
