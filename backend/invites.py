""" Invite system management """

from datetime import datetime
from enum import IntEnum
from typing import Optional
import uuid

from pydantic import BaseModel
from fastapi import HTTPException


from db import BaseMongoModel


# ============================================================================
class UserRole(IntEnum):
    """User role"""

    VIEWER = 10
    CRAWLER = 20
    OWNER = 40


# ============================================================================
class InvitePending(BaseModel):
    """Pending Request to join"""

    created: datetime
    aid: Optional[str]
    role: Optional[UserRole] = UserRole.VIEWER


# ============================================================================
class InviteRequest(BaseModel):
    """Request to invite another user"""

    email: str


# ============================================================================
class InviteToArchiveRequest(InviteRequest):
    """Request to invite another user to an archive"""

    role: UserRole


# ============================================================================
class NewUserInvite(InvitePending, BaseMongoModel):
    """An invite for a new user, with an email and invite token as id"""

    email: str


# ============================================================================
class InviteOps:
    """ invite users (optionally to an archive), send emails and delete invites """

    def __init__(self, db, email):
        self.invites = db["invites"]
        self.email = email

    async def add_new_user_invite(
        self,
        new_user_invite: NewUserInvite,
        inviter_email: str,
        archive_name: Optional[str],
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

    async def get_valid_invite(self, invite_token: str, user):
        """ Retrieve a valid invite data from db, or throw if invalid"""
        invite_data = await self.invites.find_one({"_id": invite_token})
        if not invite_data:
            print("NO DATA", flush=True)
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        new_user_invite = NewUserInvite.from_dict(invite_data)
        print(new_user_invite, flush=True)

        if user.email != new_user_invite.email:
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        return new_user_invite

    async def remove_invite(self, invite_token: str):
        """ remove invite from invite list """
        await self.invites.delete_one({"_id": invite_token})

    # pylint: disable=no-self-use
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
            aid=aid,
            created=datetime.utcnow(),
            role=invite.role if hasattr(invite, "role") else None,
        )

        other_user = await user_manager.user_db.get_by_email(invite.email)

        if not other_user:
            await self.add_new_user_invite(
                NewUserInvite(
                    id=invite_code, email=invite.email, **invite_pending.dict()
                ),
                user.email,
                archive_name,
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

        other_user.invites[invite_code] = invite_pending

        await user_manager.user_db.update(other_user)

        self.email.send_existing_user_invite(
            other_user.email, user.name, archive_name,invite_code
        )

        return False


def init_invites(mdb, email):
    """ init InviteOps"""
    return InviteOps(mdb, email)
