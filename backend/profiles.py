""" Profile Management """

from typing import Optional, List
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, UUID4
import aiohttp

from archives import Archive
from users import User

from db import BaseMongoModel


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

    url: str
    baseId: Optional[str]


# ============================================================================
class BrowserId(BaseModel):
    """ Profile id on newly created profile """

    profile: str


# ============================================================================
class ProfileCommitIn(BaseModel):
    """ Profile metadata for committing current profile """

    name: str
    description: Optional[str]


# ============================================================================
class ProfileOps:
    """ Profile management """

    def __init__(self, mdb, crawl_manager):
        self.profiles = mdb["profiles"]

        self.crawl_manager = crawl_manager

        self.router = APIRouter(
            prefix="/profiles",
            tags=["profiles"],
            responses={404: {"description": "Not found"}},
        )

    async def create_new_profile(
        self, archive: Archive, user: User, profile_launch: ProfileLaunchBrowserIn
    ):
        """ Create new profile """
        profile = await self.crawl_manager.run_profile_browser(
            str(user.id), str(archive.id), archive.storage, profile_launch.url
        )

        if not profile:
            raise HTTPException(status_code=400, detail="Profile could not be created")

        return BrowserId(profile=profile)

    async def get_profile_browser_url(self, browserid, headers):
        """ get profile browser url """
        browser_data = await self.crawl_manager.get_profile_browser_data(browserid)

        if not browser_data:
            raise HTTPException(
                status_code=404, detail=f"Profile not found: {browserid}"
            )

        browser_ip = browser_data["browser_ip"]

        async with aiohttp.ClientSession() as session:
            async with session.get(f"http://{browser_ip}:9223/target") as resp:
                json = await resp.json()
                target_id = json.get("targetId")

        if not target_id:
            raise HTTPException(status_code=500, detail="Profile browser not available")

        scheme = headers.get("X-Forwarded-Proto") or "http"
        host = headers.get("Host") or "localhost"
        ws_scheme = "wss" if scheme == "https" else "ws"

        prefix = f"{host}/profile/{browser_ip}/devtools"

        # pylint: disable=line-too-long
        return {
            "url": f"{scheme}://{prefix}/inspector.html?{ws_scheme}={prefix}/page/{target_id}&panel=resources"
        }

    async def ping_profile_browser(self, browserid):
        """ ping profile browser to keep it running """
        browser_data = await self.crawl_manager.get_profile_browser_data(browserid)

        browser_ip = browser_data["browser_ip"]

        if not browser_ip:
            raise HTTPException(
                status_code=404, detail=f"Profile not found: {browserid}"
            )

        async with aiohttp.ClientSession() as session:
            async with session.get(f"http://{browser_ip}:9223/ping") as resp:
                if resp.status == 200:
                    return {"success": True}

        raise HTTPException(status_code=500, detail="Profile browser not available")

    async def commit_profile(self, browserid, commit_metadata):
        """ commit profile and shutdown profile browser """
        browser_data = await self.crawl_manager.get_profile_browser_data(browserid)

        browser_ip = browser_data["browser_ip"]

        if not browser_ip:
            raise HTTPException(
                status_code=404, detail=f"Profile not found: {browserid}"
            )

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"http://{browser_ip}:9223/createProfileJS"
            ) as resp:
                json = await resp.json()

                resource = json["resource"]

                profile_file = ProfileFile(
                    hash=resource["hash"],
                    size=resource["bytes"],
                    filename=resource["path"],
                )

                baseid = browser_data.get("btrix.baseprofile")
                if baseid:
                    baseid = uuid.UUID(baseid)

                profile = Profile(
                    id=uuid.uuid4(),
                    name=commit_metadata.name,
                    description=commit_metadata.description,
                    created=datetime.utcnow().replace(microsecond=0, tzinfo=None),
                    origins=json["origins"],
                    resource=profile_file,
                    userid=uuid.UUID(browser_data.get("btrix.user")),
                    aid=uuid.UUID(browser_data.get("btrix.archive")),
                    baseid=baseid
                )

                await self.profiles.insert_one(profile.to_dict())

                return self.resolve_base_profile(profile)

        raise HTTPException(status_code=400, detail=f"Profile not valid: {browserid}")

    async def list_profiles(self, archive: Archive):
        """ list all profiles"""
        cursor = self.profiles.find({"aid": archive.id})
        results = await cursor.to_list(length=1000)
        return [ProfileOut.from_dict(res) for res in results]

    def resolve_base_profile(self, profile):
        """ resolve base profile name, if any """
        # TODO: implement support for base profiles
        return ProfileOut(**profile.serialize())


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_profiles_api(mdb, crawl_manager, archive_ops, user_dep):
    """ init profile ops system """
    ops = ProfileOps(mdb, crawl_manager)

    router = ops.router

    archive_crawl_dep = archive_ops.archive_crawl_dep

    @router.get("", response_model=List[ProfileOut])
    async def create_new(
        archive: Archive = Depends(archive_crawl_dep),
    ):
        return await ops.list_profiles(archive)

    @router.post("/", response_model=BrowserId)
    async def create_new(
        profile_launch: ProfileLaunchBrowserIn,
        archive: Archive = Depends(archive_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.create_new_profile(archive, user, profile_launch)

    @router.post("/{browserid}/ping")
    async def ping_browser(browserid: str):
        return await ops.ping_profile_browser(browserid)

    @router.post("/{browserid}/commit", response_model=ProfileOut)
    async def commit_profile(browserid: str, profile_commit: ProfileCommitIn):
        return await ops.commit_profile(browserid, profile_commit)

    @router.get("/{browserid}")
    async def get_profile_browser_url(browserid: str, request: Request):
        return await ops.get_profile_browser_url(browserid, request.headers)

    archive_ops.router.include_router(router)
