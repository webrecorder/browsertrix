"""
FastAPI user handling (via fastapi-users)
"""

import os
import uuid
import asyncio

from typing import Optional

from pydantic import UUID4, EmailStr

from fastapi import (
    Request,
    HTTPException,
    Depends,
    APIRouter,
    Body,
)
from fastapi.security import OAuth2PasswordRequestForm

from pymongo.errors import DuplicateKeyError

# from fastapi_users import BaseUserManager
# from fastapi_users.db import MongoDBUserDatabase
# from .userdb import MongoDBUserDatabase

from .auth import (
    UserNotExists,
    UserInactive,
    UserAlreadyExists,
    UserAlreadyVerified,
    InvalidPasswordException,
    InvalidResetPasswordToken,
    InvalidVerifyToken,
)

from .models import (
    User,
    # UserCreateIn,
    UserCreate,
    UserUpdate,
    UserUpdatePassword,
    UserDB,
    UserRole,
    PaginatedResponse,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import is_bool

from .auth import (
    init_jwt_auth,
    ErrorCode,
    PASSWORD_SECRET,
    # verify_password,
    verify_and_update_password,
    get_password_hash,
    generate_password,
    generate_jwt,
    decode_jwt,
)


# ============================================================================
# pylint: disable=too-few-public-methods, raise-missing-from, too-many-public-methods
# class UserDBOps(MongoDBUserDatabase):
#    """User DB Operations wrapper"""


# ============================================================================
class UserManager:
    """Browsertrix UserManager"""

    # user_db_model = UserDB
    reset_password_token_secret = PASSWORD_SECRET
    verification_token_secret = PASSWORD_SECRET

    reset_password_token_lifetime_minutes: int = 60
    verification_token_lifetime_minutes: int = 60

    def __init__(self, mdb, email, invites):
        # self.user_db = user_db
        self.collection = mdb.get_collection("users")
        self.email = email
        self.invites = invites
        self.org_ops = None

        self.registration_enabled = is_bool(os.environ.get("REGISTRATION_ENABLED"))

    def set_org_ops(self, ops):
        """set org ops"""
        self.org_ops = ops

    async def init_index(self):
        """init lookup index"""
        await self.collection.create_index("email", unique=True)

    async def create(self, user: UserCreate, request: Optional[Request] = None):
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

        created_user = await self.create_base(user)
        await self.on_after_register_custom(created_user, user, request)
        return created_user

    async def validate_password(self, password: str, _) -> None:
        """
        Validate a password.

        Overloaded to set password requirements.

        :param password: The password to validate.
        :param user: The user associated to this password.
        :raises InvalidPasswordException: The password is invalid.
        :return: None if the password is valid.
        """
        pw_length = len(password)
        if not 8 <= pw_length <= 64:
            raise InvalidPasswordException(reason="invalid_password_length")

    async def check_password(self, user: UserDB, password: str) -> bool:
        """check if password is valid, also update hashed_password if needed"""
        verified, updated_password_hash = verify_and_update_password(
            password, user.hashed_password
        )

        if not verified:
            return False

        # Update password hash to a more robust one if needed
        if updated_password_hash:
            user.hashed_password = updated_password_hash
            # await self.user_db.update(user)
            await self.collection.find_one_and_update(
                {"_id": user.id}, {"$set": {"hashed_password": user.hashed_password}}
            )

        return True

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm
    ) -> Optional[User]:
        """authenticate user via login form"""
        user = await self.get_by_email(credentials.username)
        if not user:
            # Run the hasher to mitigate timing attack
            # Inspired from Django: https://code.djangoproject.com/ticket/20760
            get_password_hash(credentials.password)
            return None

        return user if self.check_password(user, credentials.password) else None

    async def get_user_names_by_ids(self, user_ids):
        """return list of user names for given ids"""
        print("user_ids", user_ids)
        user_ids = [UUID4(id_) for id_ in user_ids]
        cursor = self.collection.find(
            {"_id": {"$in": user_ids}}, projection=["_id", "name", "email"]
        )
        return await cursor.to_list(length=1000)

    async def get_superuser(self) -> Optional[UserDB]:
        """return current superuser, if any"""
        user_data = await self.collection.find_one({"is_superuser": True})
        if not user_data:
            return None

        return UserDB.from_dict(user_data)

    async def create_super_user(self):
        """Initialize a super user from env vars"""
        email = os.environ.get("SUPERUSER_EMAIL")
        password = os.environ.get("SUPERUSER_PASSWORD")
        if not email:
            print("No superuser defined", flush=True)
            return

        if not password:
            password = generate_password()

        superuser = await self.get_superuser()
        if superuser:
            if superuser.email != email:
                await self.update_email(superuser, EmailStr(email))
                print("Superuser email updated")

            if await self.update_password(superuser, password):
                print("Superuser password updated")

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
        # pylint: disable=raise-missing-from
        except InvalidPasswordException:
            raise HTTPException(status_code=422, detail="invalid_password")

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
            password = generate_password()

        try:
            user_create = UserCreate(
                name=name,
                email=email,
                password=password,
                is_superuser=False,
                newOrg=False,
                is_verified=True,
            )
            try:
                created_user = await self.create_base(user_create)
                await self.on_after_register_custom(
                    created_user, user_create, request=None
                )
                return created_user
            # pylint: disable=raise-missing-from
            except InvalidPasswordException:
                raise HTTPException(status_code=422, detail="invalid_password")

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
                user.is_verified = True
                await self.update_verified(user)

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

    async def request_verify(
        self, user: UserDB, request: Optional[Request] = None
    ) -> None:
        """
        Start a verification request.

        Triggers the on_after_request_verify handler on success.

        :param user: The user to verify.
        :param request: Optional FastAPI request that
        triggered the operation, defaults to None.
        :raises UserInactive: The user is inactive.
        :raises UserAlreadyVerified: The user is already verified.
        """
        if not user.is_active:
            raise UserInactive()
        if user.is_verified:
            raise UserAlreadyVerified()

        token_data = {
            "user_id": str(user.id),
            "email": user.email,
            # "aud": self.verification_token_audience,
        }
        token = generate_jwt(
            token_data,
            self.verification_token_lifetime_minutes,
        )
        await self.on_after_request_verify(user, token, request)

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

    async def create_base(self, create: UserCreate) -> UserDB:
        """create new user in db"""
        await self.validate_password(create.password, create)

        existing_user = await self.get_by_email(create.email)
        if existing_user is not None:
            raise UserAlreadyExists()

        hashed_password = get_password_hash(create.password)

        id_ = uuid.uuid4()

        db_user = UserDB(
            id=id_,
            email=create.email,
            name=create.name,
            hashed_password=hashed_password,
            is_superuser=create.is_superuser,
            is_verified=create.is_verified,
        )

        await self.collection.insert_one(db_user.to_dict())

        return db_user

    async def get_by_id(self, _id: UUID4) -> UserDB:
        """
        Get a user by id.

        :param id: Id. of the user to retrieve.
        :raises UserNotExists: The user does not exist.
        :return: A user.
        """
        user = await self.collection.find_one({"_id": _id})

        if user is None:
            raise UserNotExists()

        return User.from_dict(user)

    async def get_by_email(self, email: str) -> Optional[UserDB]:
        """
        Get a user by e-mail.

        :param user_email: E-mail of the user to retrieve.
        :raises UserNotExists: The user does not exist.
        :return: A user.
        """
        user = await self.collection.find_one({"email": email})
        if not user:
            return None

        return UserDB.from_dict(user)

    async def verify(self, token: str) -> UserDB:
        """
        Validate a verification request.

        Changes the is_verified flag of the user to True.

        Triggers the on_after_verify handler on success.

        :param token: The verification token generated by request_verify.
        :param request: Optional FastAPI request that
        triggered the operation, defaults to None.
        :raises InvalidVerifyToken: The token is invalid or expired.
        :raises UserAlreadyVerified: The user is already verified.
        :return: The verified user.
        """
        try:
            data = decode_jwt(token)
        except:
            raise InvalidVerifyToken()

        try:
            user_id = data["user_id"]
            email = data["email"]
        except KeyError:
            raise InvalidVerifyToken()

        user = await self.get_by_email(email)
        if not user:
            raise InvalidVerifyToken()

        try:
            user_uuid = UUID4(user_id)
        except ValueError:
            raise InvalidVerifyToken()

        if user_uuid != user.id:
            raise InvalidVerifyToken()

        if user.is_verified:
            raise UserAlreadyVerified()

        user.is_verified = True
        await self.update_verified(user)

        # await self.on_after_verify(verified_user, request)

        return user

    async def forgot_password(
        self, user: UserDB, request: Optional[Request] = None
    ) -> None:
        """
        Start a forgot password request.

        Triggers the on_after_forgot_password handler on success.

        :param user: The user that forgot its password.
        :param request: Optional FastAPI request that
        triggered the operation, defaults to None.
        :raises UserInactive: The user is inactive.
        """
        if not user.is_active:
            raise UserInactive()

        token_data = {
            "user_id": str(user.id),
            # "aud": self.reset_password_token_audience,
        }
        token = generate_jwt(
            token_data,
            self.reset_password_token_lifetime_minutes,
        )
        await self.on_after_forgot_password(user, token, request)

    async def reset_password(self, token: str, password: str) -> UserDB:
        """
        Reset the password of a user.

        Triggers the on_after_reset_password handler on success.

        :param token: The token generated by forgot_password.
        :param password: The new password to set.
        :param request: Optional FastAPI request that
        triggered the operation, defaults to None.
        :raises InvalidResetPasswordToken: The token is invalid or expired.
        :raises UserInactive: The user is inactive.
        :raises InvalidPasswordException: The password is invalid.
        :return: The user with updated password.
        """
        try:
            data = decode_jwt(
                token,
            )
        except:
            raise InvalidResetPasswordToken()

        user_id = data["user_id"]

        try:
            user_uuid = UUID4(user_id)
        except ValueError:
            raise InvalidResetPasswordToken()

        user = await self.get_by_id(user_uuid)

        if not user.is_active:
            raise UserInactive()

        await self.update_password(user, password)

        return user

    async def delete(self, user: UserDB) -> None:
        """
        Delete a user.

        :param user: The user to delete.
        """
        # await self.user_db.delete(user)

    async def update_verified(self, user: UserDB) -> None:
        """Update verified status for user"""
        await self.collection.find_one_and_update(
            {"_id": user.id}, {"$set": {"is_verified": user.is_verified}}
        )

    async def update_email(self, user: UserDB, email: EmailStr) -> None:
        """Update email for user"""
        await self.collection.find_one_and_update(
            {"_id": user.id}, {"$set": {"email": email}}
        )

    async def update_password(self, user: UserDB, new_password: str) -> bool:
        """Update password for user, update and store hashed password"""
        await self.validate_password(new_password, user)
        hashed_password = get_password_hash(new_password)
        if hashed_password == user.hashed_password:
            return False
        user.hashed_password = hashed_password
        await self.collection.find_one_and_update(
            {"_id": user.id}, {"$set": {"hashed_password": hashed_password}}
        )
        return True


# ============================================================================
def init_user_manager(mdb, emailsender, invites):
    """
    Load users table and init /users routes
    """

    # user_collection = mdb.get_collection("users")

    # user_db = UserDBOps(UserDB, user_collection)

    return UserManager(mdb, emailsender, invites)


# ============================================================================
# pylint: disable=too-many-locals, raise-missing-from
def init_users_api(app, user_manager: UserManager) -> APIRouter:
    """init fastapi_users"""

    auth_jwt_router, current_active_user = init_jwt_auth(user_manager)

    app.include_router(
        auth_jwt_router,
        prefix="/auth/jwt",
        tags=["auth"],
    )

    app.include_router(
        init_auth_router(user_manager),
        prefix="/auth",
        tags=["auth"],
    )

    app.include_router(
        init_users_router(current_active_user, user_manager),
        prefix="/users",
        tags=["users"],
    )

    return current_active_user


# ============================================================================
def init_auth_router(user_manager: UserManager) -> APIRouter:
    """/auth router"""

    auth_router = APIRouter()

    @auth_router.post("/register", status_code=201)
    async def register(request: Request, user: UserCreate):  # type: ignore
        try:
            created_user = await user_manager.create(user, request=request)
        except UserAlreadyExists:
            raise HTTPException(
                status_code=400,
                detail=ErrorCode.REGISTER_USER_ALREADY_EXISTS,
            )
        except InvalidPasswordException as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": ErrorCode.REGISTER_INVALID_PASSWORD,
                    "reason": e.reason,
                },
            )

        return created_user

    @auth_router.post(
        "/forgot-password",
        status_code=202,
    )
    async def forgot_password(
        request: Request,
        email: EmailStr = Body(..., embed=True),
    ):
        user = await user_manager.get_by_email(email)
        if not user:
            return None

        try:
            await user_manager.forgot_password(user, request)
        except UserInactive:
            pass

        return None

    @auth_router.post(
        "/reset-password",
    )
    async def reset_password(
        # request: Request,
        token: str = Body(...),
        password: str = Body(...),
    ):
        try:
            await user_manager.reset_password(token, password)
        except (InvalidResetPasswordToken, UserNotExists, UserInactive):
            raise HTTPException(
                status_code=400,
                detail=ErrorCode.RESET_PASSWORD_BAD_TOKEN,
            )
        except InvalidPasswordException as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": ErrorCode.RESET_PASSWORD_INVALID_PASSWORD,
                    "reason": e.reason,
                },
            )

    @auth_router.post("/request-verify-token", status_code=202)
    async def request_verify_token(
        request: Request,
        email: EmailStr = Body(..., embed=True),
    ):
        try:
            user = await user_manager.get_by_email(email)
            if not user:
                return None
            await user_manager.request_verify(user, request)
        except (UserNotExists, UserInactive, UserAlreadyVerified):
            pass

        return None

    @auth_router.post("/verify")
    async def verify(
        # request: Request,
        token: str = Body(..., embed=True),
    ):
        try:
            return await user_manager.verify(token)
        except (InvalidVerifyToken, UserNotExists):
            raise HTTPException(
                status_code=400,
                detail=ErrorCode.VERIFY_USER_BAD_TOKEN,
            )
        except UserAlreadyVerified:
            raise HTTPException(
                status_code=400,
                detail=ErrorCode.VERIFY_USER_ALREADY_VERIFIED,
            )

    return auth_router


# ============================================================================
def init_users_router(current_active_user, user_manager) -> APIRouter:
    """/users routes"""
    users_router = APIRouter()

    @users_router.get("/me", tags=["users"])
    async def me_with_org_info(user: User = Depends(current_active_user)):
        """/users/me with orgs user belongs to."""
        user_info: dict = {
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

    @users_router.put("/me/password-change", tags=["users"])
    async def change_my_password(
        request: Request,
        user_update: UserUpdatePassword,
        user: UserDB = Depends(current_active_user),
    ):
        """update password, requires current password"""
        if not user_manager.check_password(user, user_update.password):
            raise HTTPException(status_code=400, detail="invalid_current_password")

        update = UserUpdate(email=user_update.email, password=user_update.newPassword)
        try:
            # pylint: disable=line-too-long
            return await user_manager.update(update, user, request=request)  # type: ignore
        # pylint: disable=raise-missing-from
        except InvalidPasswordException as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "UPDATE_USER_INVALID_PASSWORD",
                    "reason": e.reason,
                },
            )
        except UserAlreadyExists:
            raise HTTPException(
                status_code=400,
                detail="UPDATE_USER_EMAIL_ALREADY_EXISTS",
            )

    @users_router.get("/me/invite/{token}", tags=["invites"])
    async def get_existing_user_invite_info(
        token: str, user: UserDB = Depends(current_active_user)
    ):
        try:
            invite = user.invites[token]
        except:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="Invalid Invite Code")

        return await user_manager.format_invite(invite)

    @users_router.get("/invite/{token}", tags=["invites"])
    async def get_invite_info(token: str, email: str):
        invite = await user_manager.invites.get_valid_invite(uuid.UUID(token), email)
        return await user_manager.format_invite(invite)

    # pylint: disable=invalid-name
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

    return users_router
