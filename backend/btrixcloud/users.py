"""
FastAPI user handling (via fastapi-users)
"""

import os
import uuid
import asyncio

from typing import Optional

from pydantic import UUID4
import passlib.pwd

from fastapi import Request, Response, HTTPException, Depends, WebSocket
from fastapi.security import OAuth2PasswordBearer

from pymongo.errors import DuplicateKeyError

from fastapi_users import FastAPIUsers, BaseUserManager
from fastapi_users.manager import UserAlreadyExists
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import MongoDBUserDatabase

from .models import (
    User,
    UserCreateIn,
    UserCreate,
    UserUpdate,
    UserDB,
    UserRole,
    PaginatedResponse,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format


# ============================================================================
PASSWORD_SECRET = os.environ.get("PASSWORD_SECRET", uuid.uuid4().hex)

JWT_TOKEN_LIFETIME = int(os.environ.get("JWT_TOKEN_LIFETIME_MINUTES", 60)) * 60


# ============================================================================
# pylint: disable=too-few-public-methods
class UserDBOps(MongoDBUserDatabase):
    """User DB Operations wrapper"""


# ============================================================================
class UserManager(BaseUserManager[UserCreate, UserDB]):
    """Browsertrix UserManager"""

    user_db_model = UserDB
    reset_password_token_secret = PASSWORD_SECRET
    verification_token_secret = PASSWORD_SECRET

    def __init__(self, user_db, email, invites):
        super().__init__(user_db)
        self.email = email
        self.invites = invites
        self.org_ops = None

        self.registration_enabled = os.environ.get("REGISTRATION_ENABLED") == "1"

    def set_org_ops(self, ops):
        """set org ops"""
        self.org_ops = ops

    async def create(
        self, user: UserCreate, safe: bool = False, request: Optional[Request] = None
    ):
        """override user creation to check if invite token is present"""
        user.name = user.name or user.email

        # if open registration not enabled, can only register with an invite
        if (
            not self.registration_enabled
            and not user.inviteToken
            and not user.is_verified
            and not user.is_superuser
        ):
            raise HTTPException(status_code=400, detail="Invite Token Required")

        if user.inviteToken and not await self.invites.get_valid_invite(
            user.inviteToken, user.email
        ):
            raise HTTPException(status_code=400, detail="Invalid Invite Token")

        # Don't create a new org for registered users.
        user.newOrg = False

        created_user = await super().create(user, safe, request)
        await self.on_after_register_custom(created_user, user, request)
        return created_user

    async def get_user_names_by_ids(self, user_ids):
        """return list of user names for given ids"""
        user_ids = [UUID4(id_) for id_ in user_ids]
        cursor = self.user_db.collection.find(
            {"id": {"$in": user_ids}}, projection=["id", "name", "email"]
        )
        return await cursor.to_list(length=1000)

    async def get_superuser(self):
        """return current superuser, if any"""
        return await self.user_db.collection.find_one({"is_superuser": True})

    async def create_super_user(self):
        """Initialize a super user from env vars"""
        email = os.environ.get("SUPERUSER_EMAIL")
        password = os.environ.get("SUPERUSER_PASSWORD")
        if not email:
            print("No superuser defined", flush=True)
            return

        if not password:
            password = passlib.pwd.genword()

        curr_superuser_res = await self.get_superuser()
        if curr_superuser_res:
            user = UserDB(**curr_superuser_res)
            update = {"password": password}
            if user.email != email:
                update["email"] = email

            try:
                await self._update(user, update)
                print("Superuser updated")
            except UserAlreadyExists:
                print(f"User {email} already exists", flush=True)

            return

        try:
            res = await self.create(
                UserCreate(
                    name="admin",
                    email=email,
                    password=password,
                    is_superuser=True,
                    newOrg=False,
                    is_verified=True,
                )
            )
            print(f"Super user {email} created", flush=True)
            print(res, flush=True)

        except (DuplicateKeyError, UserAlreadyExists):
            print(f"User {email} already exists", flush=True)

    async def create_non_super_user(
        self,
        email: str,
        password: str,
        name: str = "New user",
    ):
        """create a regular user with given credentials"""
        if not email:
            print("No user defined", flush=True)
            return

        if not password:
            password = passlib.pwd.genword()

        try:
            user_create = UserCreate(
                name=name,
                email=email,
                password=password,
                is_superuser=False,
                newOrg=False,
                is_verified=True,
            )
            created_user = await super().create(user_create, safe=False, request=None)
            await self.on_after_register_custom(created_user, user_create, request=None)
            return created_user

        except (DuplicateKeyError, UserAlreadyExists):
            print(f"User {email} already exists", flush=True)

    async def on_after_register_custom(
        self, user: UserDB, user_create: UserCreate, request: Optional[Request]
    ):
        """custom post registration callback, also receive the UserCreate object"""

        print(f"User {user.id} has registered.")
        add_to_default_org = False

        if user_create.newOrg is True:
            print(f"Creating new organization for {user.id}")

            org_name = (
                user_create.newOrgName or f"{user.name or user.email}'s Organization"
            )

            await self.org_ops.create_new_org_for_user(
                org_name=org_name,
                storage_name="default",
                user=user,
            )

        is_verified = hasattr(user_create, "is_verified") and user_create.is_verified

        if user_create.inviteToken:
            new_user_invite = None
            try:
                new_user_invite = await self.org_ops.handle_new_user_invite(
                    user_create.inviteToken, user
                )
            except HTTPException as exc:
                print(exc)

            if new_user_invite and not new_user_invite.oid:
                add_to_default_org = True

            if not is_verified:
                # if user has been invited, mark as verified immediately
                await self._update(user, {"is_verified": True})

        else:
            add_to_default_org = True
            if not is_verified:
                asyncio.create_task(self.request_verify(user, request))

        if add_to_default_org:
            default_org = await self.org_ops.get_default_org()
            if default_org:
                await self.org_ops.add_user_to_org(default_org, user.id)

    async def on_after_forgot_password(
        self, user: UserDB, token: str, request: Optional[Request] = None
    ):
        """callback after password forgot"""
        print(f"User {user.id} has forgot their password. Reset token: {token}")
        self.email.send_user_forgot_password(
            user.email, token, request and request.headers
        )

    async def on_after_request_verify(
        self, user: UserDB, token: str, request: Optional[Request] = None
    ):
        """callback after verification request"""

        self.email.send_user_validation(user.email, token, request and request.headers)

    async def format_invite(self, invite):
        """format an InvitePending to return via api, resolve name of inviter"""
        inviter = await self.get_by_email(invite.inviterEmail)
        result = invite.serialize()
        result["inviterName"] = inviter.name
        if invite.oid:
            org = await self.org_ops.get_org_for_user_by_id(invite.oid, inviter)
            result["orgName"] = org.name

        return result


# ============================================================================
def init_user_manager(mdb, emailsender, invites):
    """
    Load users table and init /users routes
    """

    user_collection = mdb.get_collection("users")

    user_db = UserDBOps(UserDB, user_collection)

    return UserManager(user_db, emailsender, invites)


# ============================================================================
class OA2BearerOrQuery(OAuth2PasswordBearer):
    """Override bearer check to also test query"""

    async def __call__(
        self, request: Request = None, websocket: WebSocket = None
    ) -> Optional[str]:
        param = None
        exc = None
        # use websocket as request if no request
        request = request or websocket
        try:
            param = await super().__call__(request)
            if param:
                return param

        # pylint: disable=broad-except
        except Exception as super_exc:
            exc = super_exc

        param = request.query_params.get("auth_bearer")

        if param:
            return param

        if exc:
            raise exc

        raise HTTPException(status_code=404, detail="Not Found")


# ============================================================================
class BearerOrQueryTransport(BearerTransport):
    """Bearer or Query Transport"""

    scheme: OA2BearerOrQuery

    # pylint: disable=invalid-name
    def __init__(self, tokenUrl: str):
        # pylint: disable=super-init-not-called
        self.scheme = OA2BearerOrQuery(tokenUrl, auto_error=False)


# ============================================================================
# pylint: disable=too-many-locals
def init_users_api(app, user_manager):
    """init fastapi_users"""
    # pylint: disable=invalid-name

    bearer_transport = BearerOrQueryTransport(tokenUrl="auth/jwt/login")

    def get_jwt_strategy() -> JWTStrategy:
        return JWTStrategy(secret=PASSWORD_SECRET, lifetime_seconds=JWT_TOKEN_LIFETIME)

    auth_backend = AuthenticationBackend(
        name="jwt",
        transport=bearer_transport,
        get_strategy=get_jwt_strategy,
    )

    fastapi_users = FastAPIUsers(
        lambda: user_manager,
        [auth_backend],
        User,
        UserCreateIn,
        UserUpdate,
        UserDB,
    )

    auth_router = fastapi_users.get_auth_router(auth_backend)

    current_active_user = fastapi_users.current_user(active=True)

    @auth_router.post("/refresh")
    async def refresh_jwt(response: Response, user=Depends(current_active_user)):
        return await auth_backend.login(get_jwt_strategy(), user, response)

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

    users_router = fastapi_users.get_users_router()

    @users_router.get("/me-with-orgs", tags=["users"])
    async def me_with_org_info(user: User = Depends(current_active_user)):
        """/users/me with orgs user belongs to."""
        user_info = {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "orgs": [],
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "is_verified": user.is_verified,
        }
        user_orgs, _ = await user_manager.org_ops.get_orgs_for_user(
            user,
            # Set high so that we get all orgs even after reducing default page size
            page_size=1_000,
            calculate_total=False,
        )
        if user_orgs:
            user_info["orgs"] = [
                {
                    "id": org.id,
                    "name": org.name,
                    "default": org.default,
                    "role": UserRole.SUPERADMIN
                    if user.is_superuser
                    else org.users.get(str(user.id)),
                }
                for org in user_orgs
            ]
        return user_info

    @users_router.get("/invite/{token}", tags=["invites"])
    async def get_invite_info(token: str, email: str):
        invite = await user_manager.invites.get_valid_invite(uuid.UUID(token), email)
        return await user_manager.format_invite(invite)

    @users_router.get("/me/invite/{token}", tags=["invites"])
    async def get_existing_user_invite_info(
        token: str, user: User = Depends(current_active_user)
    ):
        try:
            invite = user.invites[token]
        except:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        return await user_manager.format_invite(invite)

    @users_router.get("/invites", tags=["invites"], response_model=PaginatedResponse)
    async def get_pending_invites(
        user: User = Depends(current_active_user),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        pending_invites, total = await user_manager.invites.get_pending_invites(
            page_size=pageSize, page=page
        )
        return paginated_format(pending_invites, total, page, pageSize)

    app.include_router(users_router, prefix="/users", tags=["users"])

    return fastapi_users
