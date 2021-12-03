"""
FastAPI user handling (via fastapi-users)
"""

import os
import uuid
import asyncio

from datetime import datetime

from typing import Dict, Optional
from enum import IntEnum

from pydantic import BaseModel, EmailStr, UUID4

from fastapi import Request, Response, HTTPException, Depends

from fastapi_users import FastAPIUsers, models, BaseUserManager
from fastapi_users.authentication import JWTAuthentication
from fastapi_users.db import MongoDBUserDatabase


# ============================================================================
PASSWORD_SECRET = os.environ.get("PASSWORD_SECRET", uuid.uuid4().hex)

JWT_TOKEN_LIFETIME = int(os.environ.get("JWT_TOKEN_LIFETIME_MINUTES", 60)) * 60


# ============================================================================
class UserRole(IntEnum):
    """User role"""

    VIEWER = 10
    CRAWLER = 20
    OWNER = 40


# ============================================================================
class InvitePending(BaseModel):
    """Pending Request to join an archive"""

    aid: str
    created: datetime
    role: UserRole = UserRole.VIEWER


# ============================================================================
class User(models.BaseUser):
    """
    Base User Model
    """

    name: Optional[str] = ""


# ============================================================================
# use custom model as model.BaseUserCreate includes is_* fields which should not be set
class UserCreate(models.CreateUpdateDictModel):
    """
    User Creation Model
    """

    email: EmailStr
    password: str

    name: Optional[str] = ""

    inviteToken: Optional[str]

    newArchive: bool
    newArchiveName: Optional[str] = ""


# ============================================================================
class UserUpdate(User, models.CreateUpdateDictModel):
    """
    User Update Model
    """

    password: Optional[str]
    email: Optional[EmailStr]


# ============================================================================
class UserDB(User, models.BaseUserDB):
    """
    User in DB Model
    """

    invites: Dict[str, InvitePending] = {}


# ============================================================================
# pylint: disable=too-few-public-methods
class UserDBOps(MongoDBUserDatabase):
    """ User DB Operations wrapper """


# ============================================================================
class UserManager(BaseUserManager[UserCreate, UserDB]):
    """ Browsertrix UserManager """

    user_db_model = UserDB
    reset_password_token_secret = PASSWORD_SECRET
    verification_token_secret = PASSWORD_SECRET

    def __init__(self, user_db, email):
        super().__init__(user_db)
        self.email = email
        self.archive_ops = None

    def set_archive_ops(self, ops):
        """ set archive ops """
        self.archive_ops = ops

    async def get_user_names_by_ids(self, user_ids):
        """ return list of user names for given ids """
        user_ids = [UUID4(id_) for id_ in user_ids]
        cursor = self.user_db.collection.find(
            {"id": {"$in": user_ids}}, projection=["id", "name"]
        )
        return await cursor.to_list(length=1000)

    # pylint: disable=no-self-use, unused-argument
    async def on_after_register(self, user: UserDB, request: Optional[Request] = None):
        """callback after registeration"""

        print(f"User {user.id} has registered.")

        req_data = await request.json()

        if req_data.get("newArchive"):
            print(f"Creating new archive for {user.id}")

            archive_name = req_data.get("newArchiveName") or f"{user.name}'s Archive"

            await self.archive_ops.create_new_archive_for_user(
                archive_name=archive_name,
                storage_name="default",
                user=user,
            )

        if req_data.get("inviteToken"):
            try:
                await self.archive_ops.handle_new_user_invite(
                    req_data.get("inviteToken"), user
                )
            except HTTPException as exc:
                print(exc)

        asyncio.create_task(self.request_verify(user, request))

    # pylint: disable=no-self-use, unused-argument
    async def on_after_forgot_password(
        self, user: UserDB, token: str, request: Optional[Request] = None
    ):
        """callback after password forgot"""
        print(f"User {user.id} has forgot their password. Reset token: {token}")
        self.email.send_user_forgot_password(user.email, token)

    # pylint: disable=no-self-use, unused-argument
    async def on_after_request_verify(
        self, user: UserDB, token: str, request: Optional[Request] = None
    ):
        """callback after verification request"""

        self.email.send_user_validation(user.email, token)


# ============================================================================
def init_user_manager(mdb, emailsender):
    """
    Load users table and init /users routes
    """

    user_collection = mdb.get_collection("users")

    user_db = UserDBOps(UserDB, user_collection)

    return UserManager(user_db, emailsender)


# ============================================================================
def init_users_api(app, user_manager):
    """ init fastapi_users """
    jwt_authentication = JWTAuthentication(
        secret=PASSWORD_SECRET,
        lifetime_seconds=JWT_TOKEN_LIFETIME,
        tokenUrl="/auth/jwt/login",
    )

    fastapi_users = FastAPIUsers(
        lambda: user_manager,
        [jwt_authentication],
        User,
        UserCreate,
        UserUpdate,
        UserDB,
    )

    auth_router = fastapi_users.get_auth_router(jwt_authentication)

    @auth_router.post("/refresh")
    async def refresh_jwt(
        response: Response, user=Depends(fastapi_users.current_user(active=True))
    ):
        return await jwt_authentication.get_login_response(user, response, user_manager)

    app.include_router(
        auth_router,
        prefix="/auth/jwt",
        tags=["auth"],
    )

    app.include_router(
        fastapi_users.get_register_router(),
        prefix="/auth",
        tags=["auth"],
    )
    app.include_router(
        fastapi_users.get_reset_password_router(),
        prefix="/auth",
        tags=["auth"],
    )
    app.include_router(
        fastapi_users.get_verify_router(),
        prefix="/auth",
        tags=["auth"],
    )

    app.include_router(
        fastapi_users.get_users_router(), prefix="/users", tags=["users"]
    )

    return fastapi_users
