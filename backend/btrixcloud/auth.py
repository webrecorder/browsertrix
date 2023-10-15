""" auth functions for login """

import os
import uuid
from enum import Enum
from datetime import datetime, timedelta
from typing import Optional, Tuple
from passlib import pwd
from passlib.context import CryptContext

from pydantic import BaseModel
import jwt

from fastapi import (
    Request,
    HTTPException,
    Depends,
    WebSocket,
    APIRouter,
)

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from .models import User


# pylint: disable=missing-class-docstring, missing-function-docstring
class UserAlreadyExists(Exception):
    pass


class UserNotExists(Exception):
    pass


class UserInactive(Exception):
    pass


class UserAlreadyVerified(Exception):
    pass


class InvalidVerifyToken(Exception):
    pass


class InvalidResetPasswordToken(Exception):
    pass


class InvalidPasswordException(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason


# ============================================================================
PASSWORD_SECRET = os.environ.get("PASSWORD_SECRET", uuid.uuid4().hex)

JWT_TOKEN_LIFETIME = int(os.environ.get("JWT_TOKEN_LIFETIME_MINUTES", 60)) * 60

ALGORITHM = "HS256"


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ============================================================================
class ErrorCode(str, Enum):
    """Auth Error Codes"""

    REGISTER_INVALID_PASSWORD = "REGISTER_INVALID_PASSWORD"
    REGISTER_USER_ALREADY_EXISTS = "REGISTER_USER_ALREADY_EXISTS"
    LOGIN_BAD_CREDENTIALS = "LOGIN_BAD_CREDENTIALS"
    LOGIN_USER_NOT_VERIFIED = "LOGIN_USER_NOT_VERIFIED"
    RESET_PASSWORD_BAD_TOKEN = "RESET_PASSWORD_BAD_TOKEN"
    RESET_PASSWORD_INVALID_PASSWORD = "RESET_PASSWORD_INVALID_PASSWORD"
    VERIFY_USER_BAD_TOKEN = "VERIFY_USER_BAD_TOKEN"
    VERIFY_USER_ALREADY_VERIFIED = "VERIFY_USER_ALREADY_VERIFIED"
    UPDATE_USER_EMAIL_ALREADY_EXISTS = "UPDATE_USER_EMAIL_ALREADY_EXISTS"
    UPDATE_USER_INVALID_PASSWORD = "UPDATE_USER_INVALID_PASSWORD"


# ============================================================================
class BearerResponse(BaseModel):
    """JWT Login Response"""

    access_token: str
    token_type: str


# ============================================================================
# pylint: disable=too-few-public-methods
class OA2BearerOrQuery(OAuth2PasswordBearer):
    """Override bearer check to also test query"""

    async def __call__(
        self, request: Request = None, websocket: WebSocket = None  # type: ignore
    ) -> str:
        param = None
        exc = None
        # use websocket as request if no request
        request = request or websocket  # type: ignore
        try:
            param = await super().__call__(request)  # type: ignore
            if param:
                return param

        # pylint: disable=broad-except
        except Exception as super_exc:
            exc = super_exc

        if request:
            param = request.query_params.get("auth_bearer")

        if param:
            return param

        if exc:
            raise exc

        raise HTTPException(status_code=404, detail="Not Found")


# ============================================================================
def generate_jwt(data: dict, minutes: int) -> str:
    expires_delta = timedelta(minutes=minutes)
    expire = datetime.utcnow() + expires_delta
    payload = data.copy()
    payload["exp"] = expire
    return jwt.encode(payload, PASSWORD_SECRET, algorithm=ALGORITHM)


# ============================================================================
def decode_jwt(token: str) -> dict:
    return jwt.decode(token, PASSWORD_SECRET, algorithms=[ALGORITHM])


# ============================================================================
def create_access_token(user: User):
    """get jwt token"""
    return generate_jwt({"sub": str(user.id)}, JWT_TOKEN_LIFETIME)


# ============================================================================
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ============================================================================
def verify_and_update_password(
    plain_password: str, hashed_password: str
) -> Tuple[bool, str]:
    return pwd_context.verify_and_update(plain_password, hashed_password)


# ============================================================================
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ============================================================================
def generate_password() -> str:
    return pwd.genword()


# ============================================================================
# pylint: disable=raise-missing-from
def init_jwt_auth(user_manager):
    """init jwt auth router + current_active_user dependency"""
    oauth2_scheme = OA2BearerOrQuery(tokenUrl="/api/auth/jwt/login", auto_error=False)

    async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
        credentials_exception = HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        try:
            payload = decode_jwt(token)
            uid: Optional[str] = payload.get("sub")
            if uid is None:
                raise credentials_exception
        except Exception:
            raise credentials_exception
        user = await user_manager.get_by_id(uuid.UUID(uid))
        if user is None:
            raise credentials_exception
        return user

    current_active_user = get_current_user

    auth_jwt_router = APIRouter()

    @auth_jwt_router.post("/login")
    async def login(
        credentials: OAuth2PasswordRequestForm = Depends(),
    ):
        user = await user_manager.authenticate(credentials)

        if user is None:
            raise HTTPException(
                status_code=400,
                detail=ErrorCode.LOGIN_BAD_CREDENTIALS,
            )
        # if requires_verification and not user.is_verified:
        #    raise HTTPException(
        #        status_code=400,
        #        detail=ErrorCode.LOGIN_USER_NOT_VERIFIED,
        #    )
        # return await backend.login(strategy, user, response)
        token = create_access_token(user)
        return BearerResponse(access_token=token, token_type="bearer")

    @auth_jwt_router.post("/refresh")
    async def refresh_jwt(user=Depends(current_active_user)):
        token = create_access_token(user)
        return BearerResponse(access_token=token, token_type="bearer")

    return auth_jwt_router, current_active_user
