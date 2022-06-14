""" Invite system management """

from datetime import datetime
from enum import IntEnum
from typing import Optional
import uuid

from pydantic import BaseModel, UUID4
from fastapi import HTTPException


from .db import BaseMongoModel


# ============================================================================
class UserRole(IntEnum):
    """User role"""

    VIEWER = 10
    CRAWLER = 20
    OWNER = 40


# ============================================================================
class InvitePending(BaseMongoModel):
    """An invite for a new user, with an email and invite token as id"""

    created: datetime
    inviterEmail: str
    aid: Optional[UUID4]
    role: Optional[UserRole] = UserRole.VIEWER
    email: Optional[str]


# ============================================================================
class InviteRequest(BaseModel):
    """Request to invite another user"""

    email: str


# ============================================================================
class InviteToArchiveRequest(InviteRequest):
    """Request to invite another user to an archive"""

    role: UserRole


# ============================================================================
class InviteOps:
    """ invite users (optionally to an archive), send emails and delete invites """

    def __init__(self, mdb, email):
        self.invites = mdb["invites"]
        self.email = email

    async def add_new_user_invite(
        self,
        new_user_invite: InvitePending,
        archive_name: Optional[str],
        headers: Optional[dict],
    ):
        """Add invite for new user"""

        res = await self.invites.find_one({"email": new_user_invite.email})
        if res:
            raise HTTPException(
                status_code=403, detail="This user has already been invited"
            )

        await self.invites.insert_one(new_user_invite.to_dict())

        self.email.send_new_user_invite(
            new_user_invite.email,
            new_user_invite.inviterEmail,
            archive_name,
            new_user_invite.id,
            headers,
        )

    async def get_valid_invite(self, invite_token: uuid.UUID, email):
        """ Retrieve a valid invite data from db, or throw if invalid"""
        invite_data = await self.invites.find_one({"_id": invite_token})
        if not invite_data:
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        new_user_invite = InvitePending.from_dict(invite_data)

        if email != new_user_invite.email:
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        return new_user_invite

    async def remove_invite(self, invite_token: str):
        """ remove invite from invite list """
        await self.invites.delete_one({"_id": invite_token})

    def accept_user_invite(self, user, invite_token: str):
        """ remove invite from user, if valid token, throw if not """
        invite = user.invites.pop(invite_token, "")
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        return invite

    # pylint: disable=too-many-arguments
    async def invite_user(
        self,
        invite: InviteRequest,
        user,
        user_manager,
        archive=None,
        allow_existing=False,
        headers: dict = None,
    ):
        """create new invite for user to join, optionally an archive.
        if allow_existing is false, don't allow invites to existing users"""
        invite_code = uuid.uuid4().hex

        aid = None
        archive_name = None
        if archive:
            aid = archive.id
            archive_name = archive.name

        invite_pending = InvitePending(
            id=invite_code,
            aid=aid,
            created=datetime.utcnow(),
            role=invite.role if hasattr(invite, "role") else None,
            email=invite.email,
            inviterEmail=user.email,
        )

        other_user = await user_manager.user_db.get_by_email(invite.email)

        if not other_user:
            await self.add_new_user_invite(
                invite_pending,
                archive_name,
                headers,
            )
            return True

        if not allow_existing:
            raise HTTPException(status_code=400, detail="User already registered")

        if other_user.email == user.email:
            raise HTTPException(status_code=400, detail="Can't invite ourselves!")

        if archive.users.get(str(other_user.id)):
            raise HTTPException(
                status_code=400, detail="User already a member of this archive."
            )

        # no need to store our own email as adding invite to user
        invite_pending.email = None
        other_user.invites[invite_code] = invite_pending

        await user_manager.user_db.update(other_user)

        self.email.send_existing_user_invite(
            other_user.email, user.name, archive_name, invite_code, headers
        )

        return False


def init_invites(mdb, email):
    """ init InviteOps"""
    return InviteOps(mdb, email)
