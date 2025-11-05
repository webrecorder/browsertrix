"""auth functions for login"""

import os
from uuid import UUID, uuid4
import asyncio
from datetime import timedelta
from typing import Optional, Tuple, List
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

from .models import User, UserOut
from .utils import dt_now


# ============================================================================
PASSWORD_SECRET = os.environ.get("PASSWORD_SECRET", uuid4().hex)

JWT_TOKEN_LIFETIME = int(os.environ.get("JWT_TOKEN_LIFETIME_MINUTES", 60))

BTRIX_SUBS_APP_API_KEY = os.environ.get("BTRIX_SUBS_APP_API_KEY", "")

ALGORITHM = "HS256"

RESET_VERIFY_TOKEN_LIFETIME_MINUTES = 60

PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Audiences
AUTH_AUD = "btrix:auth"
RESET_AUD = "btrix:reset"
VERIFY_AUD = "btrix:verify"

# include fastapi-users audiences for backwards compatibility
AUTH_ALLOW_AUD = [AUTH_AUD, "fastapi-users:auth"]
RESET_ALLOW_AUD = [RESET_AUD, "fastapi-users:reset"]
VERIFY_ALLOW_AUD = [VERIFY_AUD, "fastapi-users:verify"]

MAX_FAILED_LOGINS = 5


# ============================================================================
class BearerResponse(BaseModel):
    """JWT Login Response"""

    access_token: str
    token_type: str
    user_info: UserOut


# ============================================================================
# pylint: disable=too-few-public-methods
class OA2BearerOrQuery(OAuth2PasswordBearer):
    """Override bearer check to also test query"""

    async def __call__(
        self,
        request: Request = None,
        websocket: WebSocket = None,  # type: ignore
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
    """generate JWT token with expiration time (in minutes)"""
    expires_delta = timedelta(minutes=minutes)
    expire = dt_now() + expires_delta
    payload = data.copy()
    payload["exp"] = expire
    return jwt.encode(payload, PASSWORD_SECRET, algorithm=ALGORITHM)


# ============================================================================
def decode_jwt(token: str, audience: Optional[List[str]] = None) -> dict:
    """decode JWT token"""
    return jwt.decode(token, PASSWORD_SECRET, algorithms=[ALGORITHM], audience=audience)


# ============================================================================
def create_access_token(user: User) -> str:
    """get jwt token"""
    return generate_jwt({"sub": str(user.id), "aud": AUTH_AUD}, JWT_TOKEN_LIFETIME)


# ============================================================================
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """verify password by hash"""
    return PWD_CONTEXT.verify(plain_password, hashed_password)


# ============================================================================
def verify_and_update_password(
    plain_password: str, hashed_password: str
) -> Tuple[bool, Optional[str]]:
    """verify password and return updated hash, if any"""
    return PWD_CONTEXT.verify_and_update(plain_password, hashed_password)


# ============================================================================
def get_password_hash(password: str) -> str:
    """generate hash for password"""
    return PWD_CONTEXT.hash(password)


# ============================================================================
def generate_password() -> str:
    """generate new secure password"""
    return pwd.genword()


# ============================================================================
# pylint: disable=raise-missing-from
def init_jwt_auth(user_manager):
    """init jwt auth router + current_active_user dependency"""
    oauth2_scheme = OA2BearerOrQuery(tokenUrl="/api/auth/jwt/login", auto_error=False)

    async def get_current_user(
        token: str = Depends(oauth2_scheme),
    ) -> User:
        try:
            payload = decode_jwt(token, AUTH_ALLOW_AUD)
            uid: Optional[str] = payload.get("sub") or payload.get("user_id")
            user = await user_manager.get_by_id(UUID(uid))
            assert user
            return user
        except:
            raise HTTPException(
                status_code=401,
                detail="invalid_credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def shared_secret_or_superuser(
        token: str = Depends(oauth2_scheme),
    ) -> User:
        # allow superadmin access if token matches the known shared secret
        # if the shared secret is set
        # ensure using a long shared secret (eg. uuid4)
        if BTRIX_SUBS_APP_API_KEY and token == BTRIX_SUBS_APP_API_KEY:
            return await user_manager.get_superuser()

        user = await get_current_user(token)
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="not_allowed")

        return user

    current_active_user = get_current_user

    auth_jwt_router = APIRouter()

    def get_bearer_response(user: User, user_info: UserOut):
        """get token, return bearer response for user"""
        token = create_access_token(user)
        return BearerResponse(
            access_token=token, token_type="bearer", user_info=user_info
        )

    @auth_jwt_router.post("/login", response_model=BearerResponse)
    async def login(
        credentials: OAuth2PasswordRequestForm = Depends(),
    ) -> BearerResponse:
        """Prevent brute force password attacks.

        After 5 or more consecutive failed login attempts for the same user,
        lock the user account and send an email to reset their password.
        On successful login when user is not already locked, reset count to 0.
        """
        login_email = credentials.username

        failed_count = await user_manager.get_failed_logins_count(login_email)

        if failed_count > 0:
            print(
                f"Consecutive failed login count for {login_email}: {failed_count}",
                flush=True,
            )

        # first, check if failed count exceeds max failed logins
        # if so, don't try logging in
        if failed_count >= MAX_FAILED_LOGINS:
            # only send reset email on first failure to avoid spamming user
            if failed_count == MAX_FAILED_LOGINS:
                # do this async to avoid hinting at any delay if user exists
                async def send_reset_if_needed():
                    attempted_user = await user_manager.get_by_email(login_email)
                    if attempted_user:
                        await user_manager.forgot_password(attempted_user)
                        print(
                            f"Password reset email sent after too many attempts for {login_email}",
                            flush=True,
                        )

                asyncio.create_task(send_reset_if_needed())

            # any further attempt is a failure, increment to track further attempts
            # and avoid sending email again
            await user_manager.inc_failed_logins(login_email)

            raise HTTPException(
                status_code=429,
                detail="too_many_login_attempts",
            )

        # attempt login
        user = await user_manager.authenticate(login_email, credentials.password)

        if not user:
            print(f"Failed login attempt for {login_email}", flush=True)
            await user_manager.inc_failed_logins(login_email)

            raise HTTPException(
                status_code=400,
                detail="login_bad_credentials",
            )

        # successfully logged in, reset failed logins, return user
        await user_manager.reset_failed_logins(login_email)
        user_info = await user_manager.get_user_info_with_orgs(user)
        return get_bearer_response(user, user_info)

    @auth_jwt_router.post("/refresh", response_model=BearerResponse)
    async def refresh_jwt(user=Depends(current_active_user)):
        user_info = await user_manager.get_user_info_with_orgs(user)
        return get_bearer_response(user, user_info)

    return auth_jwt_router, current_active_user, shared_secret_or_superuser
