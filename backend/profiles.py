""" Profile Management """

from typing import Optional, List
from datetime import datetime
import uuid
import asyncio
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, UUID4, HttpUrl
import aiohttp
from redis import asyncio as aioredis

from archives import Archive
from users import User

from db import BaseMongoModel


BROWSER_EXPIRE = 300

# ============================================================================
class ProfileFile(BaseModel):
    """ file from a crawl """

    filename: str
    hash: str
    size: int


# ============================================================================
class Profile(BaseMongoModel):
    """ Browser profile """

    name: str
    description: str

    userid: UUID4
    aid: UUID4

    origins: List[str]
    resource: Optional[ProfileFile]

    created: Optional[datetime]
    baseId: Optional[UUID4]


# ============================================================================
class ProfileOut(Profile):
    """ Profile for output serialization, adds name of base profile, if any """

    baseProfileName: Optional[str]


# ============================================================================
class ProfileLaunchBrowserIn(BaseModel):
    """ Request to launch new browser for creating profile """

    url: HttpUrl
    baseId: Optional[str]


# ============================================================================
class BrowserId(BaseModel):
    """ Profile id on newly created profile """

    browserid: str


# ============================================================================
class ProfileCommitIn(BaseModel):
    """ Profile metadata for committing current profile """

    name: str
    description: Optional[str]


# ============================================================================
class ProfileOps:
    """ Profile management """

    @staticmethod
    def get_command(url):
        """ Get Command for running profile browser """
        return [
            "create-login-profile",
            "--interactive",
            "--shutdownWait",
            str(BROWSER_EXPIRE),
            "--filename",
            "/tmp/profile.tar.gz",
            "--url",
            str(url),
        ]

    def __init__(self, mdb, redis_url, crawl_manager):
        self.profiles = mdb["profiles"]

        self.crawl_manager = crawl_manager

        self.router = APIRouter(
            prefix="/profiles",
            tags=["profiles"],
            responses={404: {"description": "Not found"}},
        )
        asyncio.create_task(self.init_redis(redis_url))

    async def init_redis(self, redis_url):
        """ init redis async """
        self.redis = await aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        )

    async def create_new_profile(
        self, archive: Archive, user: User, profile_launch: ProfileLaunchBrowserIn
    ):
        """ Create new profile """
        command = self.get_command(profile_launch.url)

        profileid = str(uuid.uuid4())

        browserid = await self.crawl_manager.run_profile_browser(
            profileid,
            str(user.id),
            str(archive.id),
            archive.storage,
            command,
            filename=f"profile-{profileid}.tar.gz",
        )

        if not browserid:
            raise HTTPException(status_code=400, detail="browser_not_created")

        await self.redis.hset(f"br:{browserid}", "archive", str(archive.id))
        await self.redis.expire(f"br:{browserid}", BROWSER_EXPIRE)

        return BrowserId(browserid=browserid)

    async def get_profile_browser_url(self, browserid, aid, headers):
        """ get profile browser url """
        json, browser_ip, _ = await self._get_browser_data(browserid, "/target")

        target_id = json.get("targetId")

        if not target_id:
            raise HTTPException(status_code=400, detail="browser_not_available")

        scheme = headers.get("X-Forwarded-Proto") or "http"
        host = headers.get("Host") or "localhost"
        ws_scheme = "wss" if scheme == "https" else "ws"

        prefix = f"{host}/loadbrowser/{browser_ip}/devtools"

        await self.redis.hset(f"br:{browserid}", "ip", browser_ip)

        auth_bearer = headers.get("Authorization").split(" ")[1]

        params = {"panel": "resources"}
        params[
            ws_scheme
        ] = f"{prefix}/page/{target_id}?browserid={browserid}&aid={aid}&auth_bearer={auth_bearer}"

        # pylint: disable=line-too-long
        return {"url": f"{scheme}://{prefix}/inspector.html?{urlencode(params)}"}

    async def ping_profile_browser(self, browserid):
        """ ping profile browser to keep it running """
        await self._get_browser_data(browserid, "/ping")

        await self.redis.expire(f"br:{browserid}", BROWSER_EXPIRE)

        return {"success": True}

    async def commit_profile(self, browserid, commit_metadata):
        """ commit profile and shutdown profile browser """
        json, _, browser_data = await self._get_browser_data(
            browserid, "/createProfileJS", "POST"
        )

        profileid = None

        try:
            resource = json["resource"]
            profileid = uuid.UUID(browser_data["btrix.profile"])
        except:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="browser_not_valid")

        profile_file = ProfileFile(
            hash=resource["hash"],
            size=resource["bytes"],
            filename=resource["path"],
        )

        baseid = browser_data.get("btrix.baseprofile")
        if baseid:
            baseid = uuid.UUID(baseid)

        profile = Profile(
            id=profileid,
            name=commit_metadata.name,
            description=commit_metadata.description,
            created=datetime.utcnow().replace(microsecond=0, tzinfo=None),
            origins=json["origins"],
            resource=profile_file,
            userid=uuid.UUID(browser_data.get("btrix.user")),
            aid=uuid.UUID(browser_data.get("btrix.archive")),
            baseid=baseid,
        )

        await self.profiles.insert_one(profile.to_dict())

        return self.resolve_base_profile(profile)

    async def list_profiles(self, archive: Archive):
        """ list all profiles"""
        cursor = self.profiles.find({"aid": archive.id})
        results = await cursor.to_list(length=1000)
        return [ProfileOut.from_dict(res) for res in results]

    async def get_profile(self, archive: Archive, profileid: uuid.UUID):
        """ get profile by id and archive """
        res = await self.profiles.find_one({"_id": profileid, "aid": archive.id})
        if not res:
            raise HTTPException(status_code=404, detail="browser_not_found")

        return ProfileOut.from_dict(res)

    async def delete_profile_browser(self, browserid):
        """ delete profile browser immediately """
        if not await self.crawl_manager.delete_profile_browser(browserid):
            raise HTTPException(status_code=404, detail="browser_not_found")

        await self.redis.delete(f"br:{browserid}")

        return {"success": True}

    async def ip_access_check(self, browserid, browser_ip):
        """ check if browser ip is valid for this browserid """
        if await self.redis.hget(f"br:{browserid}", "ip") == browser_ip:
            asyncio.create_task(self.ping_profile_browser(browserid))
            return {}

        raise HTTPException(status_code=403, detail="Unauthorized")

    # pylint: disable=no-self-use
    def resolve_base_profile(self, profile):
        """ resolve base profile name, if any """
        return ProfileOut(**profile.serialize())

    async def _get_browser_data(self, browserid, path, method="GET"):
        browser_data = await self.crawl_manager.get_profile_browser_data(browserid)

        if not browser_data:
            raise HTTPException(status_code=404, detail="browser_not_found")

        browser_ip = browser_data.get("browser_ip")

        if not browser_ip:
            raise HTTPException(status_code=200, detail="waiting_for_browser")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method, f"http://{browser_ip}:9223{path}"
                ) as resp:
                    json = await resp.json()

        except Exception:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=200, detail="waiting_for_browser")

        return json, browser_ip, browser_data


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_profiles_api(mdb, redis_url, crawl_manager, archive_ops, user_dep):
    """ init profile ops system """
    ops = ProfileOps(mdb, redis_url, crawl_manager)

    router = ops.router

    archive_crawl_dep = archive_ops.archive_crawl_dep

    async def browser_dep(
        browserid: str, archive: Archive = Depends(archive_crawl_dep)
    ):
        if await ops.redis.hget(f"br:{browserid}", "archive") != str(archive.id):
            raise HTTPException(status_code=403, detail="not_allowed")

        return browserid

    @router.get("", response_model=List[ProfileOut])
    async def list_profiles(
        archive: Archive = Depends(archive_crawl_dep),
    ):
        return await ops.list_profiles(archive)

    @router.get("/{profileid}", response_model=ProfileOut)
    async def get_profile(
        profileid: str,
        archive: Archive = Depends(archive_crawl_dep),
    ):
        return await ops.get_profile(archive, uuid.UUID(profileid))

    @router.post("/browser", response_model=BrowserId)
    async def create_new(
        profile_launch: ProfileLaunchBrowserIn,
        archive: Archive = Depends(archive_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.create_new_profile(archive, user, profile_launch)

    @router.post("/browser/{browserid}/ping")
    async def ping_profile_browser(browserid: str = Depends(browser_dep)):
        return await ops.ping_profile_browser(browserid)

    @router.post("/browser/{browserid}/commit", response_model=ProfileOut)
    async def commit_profile_browser(
        profile_commit: ProfileCommitIn, browserid: str = Depends(browser_dep)
    ):
        return await ops.commit_profile(browserid, profile_commit)

    @router.get("/browser/{browserid}")
    async def get_profile_browser_url(
        request: Request,
        browserid: str = Depends(browser_dep),
        archive: Archive = Depends(archive_crawl_dep),
    ):
        return await ops.get_profile_browser_url(
            browserid, str(archive.id), request.headers
        )

    @router.get("/browser/{browserid}/ipaccess/{browser_ip}")
    async def ip_access(browser_ip, browserid: str = Depends(browser_dep)):
        return await ops.ip_access_check(browserid, browser_ip)

    @router.delete("/browser/{browserid}")
    async def delete_profile_browser(browserid: str = Depends(browser_dep)):
        return await ops.delete_profile_browser(browserid)

    archive_ops.router.include_router(router)
