""" auth functions for login """

import os
from uuid import UUID, uuid4
import asyncio
from datetime import datetime, timedelta
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
    Header,
)

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from typing import Dict, Any 
from fastapi_sso.sso.generic import create_provider
from fastapi_sso.sso.base import OpenID

from .models import User, UserRole


# ============================================================================
PASSWORD_SECRET = os.environ.get("PASSWORD_SECRET", uuid4().hex)

JWT_TOKEN_LIFETIME = int(os.environ.get("JWT_TOKEN_LIFETIME_MINUTES", 60)) * 60

ALGORITHM = "HS256"

RESET_VERIFY_TOKEN_LIFETIME_MINUTES = 60

PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")

SSO_HEADER_ENABLED = bool(int(os.environ.get("SSO_HEADER_ENABLED", 0)))
SSO_HEADER_GROUPS_SEPARATOR = os.environ.get("SSO_HEADER_GROUPS_SEPARATOR", ";")
SSO_HEADER_EMAIL_FIELD = os.environ.get("SSO_HEADER_EMAIL_FIELD", "x-remote-email")
SSO_HEADER_USERNAME_FIELD = os.environ.get("SSO_HEADER_USERNAME_FIELD", "x-remote-user")
SSO_HEADER_GROUPS_FIELD = os.environ.get("SSO_HEADER_GROUPS_FIELD", "x-remote-groups")


SSO_OIDC_ENABLED = bool(int(os.environ.get("SSO_OIDC_ENABLED", 0)))
SSO_OIDC_AUTH_ENDPOINT = os.environ.get("SSO_OIDC_AUTH_ENDPOINT", "")
SSO_OIDC_TOKEN_ENDPOINT = os.environ.get("SSO_OIDC_TOKEN_ENDPOINT", "")
SSO_OIDC_USERINFO_ENDPOINT = os.environ.get("SSO_OIDC_USERINFO_ENDPOINT", "")
SSO_OIDC_CLIENT_ID = os.environ.get("SSO_OIDC_CLIENT_ID", "")
SSO_OIDC_CLIENT_SECRET = os.environ.get("SSO_OIDC_CLIENT_SECRET", "")
SSO_OIDC_REDIRECT_URL = os.environ.get("SSO_OIDC_REDIRECT_URL", "")
SSO_OIDC_ALLOW_HTTP_INSECURE = bool(int(os.environ.get("SSO_OIDC_ALLOW_HTTP_INSECURE", 0)))
SSO_OIDC_USERINFO_EMAIL_FIELD = os.environ.get("SSO_OIDC_USERINFO_EMAIL_FIELD", "email")
SSO_OIDC_USERINFO_USERNAME_FIELD = os.environ.get("SSO_OIDC_USERINFO_USERNAME_FIELD", "preferred_username")
SSO_OIDC_USERINFO_GROUPS_FIELD = os.environ.get("SSO_OIDC_USERINFO_GROUPS_FIELD", "isMemberOf")

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

class LoginMethodsInquiryResponse(BaseModel):
    login_methods: dict

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
    """generate JWT token with expiration time (in minutes)"""
    expires_delta = timedelta(minutes=minutes)
    expire = datetime.utcnow() + expires_delta
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
) -> Tuple[bool, str]:
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
def openid_convertor(response: Dict[str, Any], session = None) -> OpenID:
    
    email = response.get("SSO_OIDC_USERINFO_EMAIL_FIELD", None)
    username = response.get("SSO_OIDC_USERINFO_USERNAME_FIELD", None)
    groups = response.get("SSO_OIDC_USERINFO_GROUPS_FIELD", None)

    if email is None or username is None or groups is None or not isinstance(groups, list):
        raise HTTPException(
                status_code=500,
                detail="error_processing_sso_response",
            )

    return OpenID(
        email=email,
        display_name=username,  # Abusing variable names to match what we need
        id=";".join(groups)     # Abusing variable names to match what we need
    )

if SSO_OIDC_ENABLED:
    discovery = {
        "authorization_endpoint": SSO_OIDC_AUTH_ENDPOINT,
        "token_endpoint": SSO_OIDC_TOKEN_ENDPOINT,
        "userinfo_endpoint": SSO_OIDC_USERINFO_ENDPOINT,
    }

    SSOProvider = create_provider(name="oidc", discovery_document=discovery, response_convertor=openid_convertor)
    sso = SSOProvider(
        client_id=SSO_OIDC_CLIENT_ID,
        client_secret=SSO_OIDC_CLIENT_SECRET,
        redirect_uri=SSO_OIDC_REDIRECT_URL,
        allow_insecure_http=SSO_OIDC_ALLOW_HTTP_INSECURE
    )

# ============================================================================
async def update_user_orgs(groups: [str], user, ops):
    orgs = await ops.get_org_slugs_by_ids()
    user_orgs, _ = await ops.get_orgs_for_user(user)
    for org_id, slug in orgs.items():
        if slug.lower() in groups:
            already_in_org = False
            for user_org in user_orgs:
                if user_org.slug == slug:
                    # User is already in org, no need to add
                    already_in_org = True
            if not already_in_org:
                org = await ops.get_org_by_id(org_id)
                await ops.add_user_to_org(org, user.id, UserRole.CRAWLER)

    for org in user_orgs:
        if org.slug.lower() not in groups:
            del org.users[str(user.id)]
            await ops.update_users(org)

async def process_sso_user_login(user_manager, login_email, login_name, groups) -> User:
    user = await user_manager.get_by_email(login_email)
    ops = user_manager.org_ops

    if user:
        await update_user_orgs(groups, user, ops)
        # User exist, and correct orgs have been set, proceed to login
        return user
    else:
        # Create verified user
        await user_manager.create_non_super_user(login_email, None, login_name)
        user = await user_manager.get_by_email(login_email)
        if user:
            await update_user_orgs(groups, user, ops)
            # User has been created and correct orgs have been set, proceed to login
            return user
        else:
            raise HTTPException(
                status_code=500,
                detail="user_creation_failed",
            )

# ============================================================================
# pylint: disable=raise-missing-from
def init_jwt_auth(user_manager):
    """init jwt auth router + current_active_user dependency"""
    oauth2_scheme = OA2BearerOrQuery(tokenUrl="/api/auth/jwt/login", auto_error=False)

    async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
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

    current_active_user = get_current_user

    auth_jwt_router = APIRouter()

    def get_bearer_response(user: User):
        """get token, return bearer response for user"""
        token = create_access_token(user)
        return BearerResponse(access_token=token, token_type="bearer")

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
        return get_bearer_response(user)
    
    @auth_jwt_router.get("/login/header", response_model=BearerResponse)
    async def login_header(
        request: Request
    ) -> BearerResponse:

        x_remote_email = request.headers.get(SSO_HEADER_EMAIL_FIELD, None)
        x_remote_user = request.headers.get(SSO_HEADER_USERNAME_FIELD, None)
        x_remote_groups = request.headers.get(SSO_HEADER_GROUPS_FIELD, None)

        if not SSO_HEADER_ENABLED:
            raise HTTPException(
                status_code=405,
                detail="sso_is_disabled",
            )

        if not (x_remote_user is not None and x_remote_email is not None and x_remote_groups is not None):
            raise HTTPException(
                status_code=500,
                detail="invalid_parameters_for_login",
            )

        login_email = x_remote_email
        login_name = x_remote_user
        groups = [group.lower() for group in x_remote_groups.split(SSO_HEADER_GROUPS_SEPARATOR)] 

        user = await process_sso_user_login(user_manager, login_email, login_name, groups)
        return get_bearer_response(user)

    @auth_jwt_router.get("/login/oidc")
    async def login_header():
        if not SSO_OIDC_ENABLED:
            raise HTTPException(
                status_code=405,
                detail="sso_is_disabled",
            )
        
        """Redirect the user to the OIDC login page."""
        with sso:
            return await sso.get_login_redirect()
    
    @auth_jwt_router.get("/login/oidc/callback", response_model=BearerResponse)
    async def login_header(request: Request) -> BearerResponse:
        if not SSO_OIDC_ENABLED:
            raise HTTPException(
                status_code=405,
                detail="sso_is_disabled",
            )

        with sso:
            openid = await sso.verify_and_process(request)
            if not openid:
                raise HTTPException(status_code=401, detail="Authentication failed")
            login_email = openid.email
            login_name = openid.display_name                                # Abusing variable names, see openid convertor above
            groups = [group.lower() for group in openid.id.split(";")]      # Abusing variable names, see openid convertor above

            user = await process_sso_user_login(user_manager, login_email, login_name, groups)
            return get_bearer_response(user)
    
    @auth_jwt_router.get("/login/methods", response_model=LoginMethodsInquiryResponse)
    async def login_header() -> LoginMethodsInquiryResponse:
        enabled_login_methods = {
            'password': True,
            'sso_header': False,
            'sso_oidc': False
        }

        if SSO_HEADER_ENABLED:
            enabled_login_methods['sso_header'] = True

        if SSO_OIDC_ENABLED:
            enabled_login_methods['sso_oidc'] = True

        return LoginMethodsInquiryResponse(login_methods=enabled_login_methods)

    @auth_jwt_router.post("/refresh", response_model=BearerResponse)
    async def refresh_jwt(user=Depends(current_active_user)):
        return get_bearer_response(user)

    return auth_jwt_router, current_active_user
