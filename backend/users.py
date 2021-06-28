import os
import uuid
from fastapi import Request
from fastapi_users import FastAPIUsers, models
from fastapi_users.authentication import JWTAuthentication
from fastapi_users.db import MongoDBUserDatabase

PASSWORD_SECRET = os.environ.get("PASSWORD_SECRET", uuid.uuid4().hex)


class User(models.BaseUser):
    pass


class UserCreate(models.BaseUserCreate):
    pass


class UserUpdate(User, models.BaseUserUpdate):
    pass


class UserDB(User, models.BaseUserDB):
    pass


def on_after_register(user: UserDB, request: Request):
    print(f"User {user.id} has registered.")


def on_after_forgot_password(user: UserDB, token: str, request: Request):
    print(f"User {user.id} has forgot their password. Reset token: {token}")


def after_verification_request(user: UserDB, token: str, request: Request):
    print(f"Verification requested for user {user.id}. Verification token: {token}")


def init_users_api(app, db):
    user_collection = db["users"]

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
