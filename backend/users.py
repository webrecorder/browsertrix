"""
FastAPI user handling (via fastapi-users)
"""

import os
import uuid
from fastapi_users import FastAPIUsers, models
from fastapi_users.authentication import JWTAuthentication
from fastapi_users.db import MongoDBUserDatabase

PASSWORD_SECRET = os.environ.get("PASSWORD_SECRET", uuid.uuid4().hex)


# ============================================================================
class User(models.BaseUser):
    """
    Base User Model
    """


# ============================================================================
class UserCreate(models.BaseUserCreate):
    """
    User Creation Model
    """


# ============================================================================
class UserUpdate(User, models.BaseUserUpdate):
    """
    User Update Model
    """


# ============================================================================
class UserDB(User, models.BaseUserDB):
    """
    User in DB Model
    """


# ============================================================================
def init_users_api(
    app,
    mdb,
    on_after_register=None,
    on_after_forgot_password=None,
    after_verification_request=None,
):
    """
    Load users table and init /users routes
    """

    user_collection = mdb["users"]

    user_db = MongoDBUserDatabase(UserDB, user_collection)

    jwt_authentication = JWTAuthentication(
        secret=PASSWORD_SECRET, lifetime_seconds=3600, tokenUrl="/auth/jwt/login"
    )

    fastapi_users = FastAPIUsers(
        user_db,
        [jwt_authentication],
        User,
        UserCreate,
        UserUpdate,
        UserDB,
    )
    app.include_router(
        fastapi_users.get_auth_router(jwt_authentication),
        prefix="/auth/jwt",
        tags=["auth"],
    )
    app.include_router(
        fastapi_users.get_register_router(on_after_register),
        prefix="/auth",
        tags=["auth"],
    )
    app.include_router(
        fastapi_users.get_reset_password_router(
            PASSWORD_SECRET, after_forgot_password=on_after_forgot_password
        ),
        prefix="/auth",
        tags=["auth"],
    )
    app.include_router(
        fastapi_users.get_verify_router(
            PASSWORD_SECRET, after_verification_request=after_verification_request
        ),
        prefix="/auth",
        tags=["auth"],
    )
    app.include_router(
        fastapi_users.get_users_router(), prefix="/users", tags=["users"]
    )

    return fastapi_users
