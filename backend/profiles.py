""" Profile Management """

from typing import Optional, List
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, UUID4, HttpUrl
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

    url: HttpUrl
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

    @staticmethod
    def get_command(url):
        """ Get Command for running profile browser """
        return [
            "create-login-profile",
            "--interactive",
            "--shutdownWait",
            "300",
            "--filename",
            "/tmp/profile.tar.gz",
            "--url",
            str(url),
        ]

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
        command = self.get_command(profile_launch.url)

        profile = await self.crawl_manager.run_profile_browser(
            str(user.id),
            str(archive.id),
            archive.storage,
            command,
        )

        if not profile:
            raise HTTPException(status_code=400, detail="browser_not_created")

        return BrowserId(profile=profile)

    async def get_profile_browser_url(self, browserid, headers):
        """ get profile browser url """
        browser_ip, _ = await self._get_browser_data(browserid)

        async with aiohttp.ClientSession() as session:
            async with session.get(f"http://{browser_ip}:9223/target") as resp:
                json = await resp.json()
                target_id = json.get("targetId")

        if not target_id:
            raise HTTPException(status_code=400, detail="browser_not_available")

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
        browser_ip, _ = await self._get_browser_data(browserid)

        async with aiohttp.ClientSession() as session:
            async with session.get(f"http://{browser_ip}:9223/ping") as resp:
                if resp.status == 200:
                    return {"success": True}

        raise HTTPException(status_code=400, detail="browser_not_available")

    async def commit_profile(self, browserid, commit_metadata):
        """ commit profile and shutdown profile browser """
        browser_ip, browser_data = await self._get_browser_data(browserid)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"http://{browser_ip}:9223/createProfileJS"
                ) as resp:
                    json = await resp.json()

                    resource = json["resource"]

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
            id=uuid.uuid4(),
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

        return {"success": True}

    # pylint: disable=no-self-use
    def resolve_base_profile(self, profile):
        """ resolve base profile name, if any """
        return ProfileOut(**profile.serialize())

    async def _get_browser_data(self, browserid):
        browser_data = await self.crawl_manager.get_profile_browser_data(browserid)

        if not browser_data:
            raise HTTPException(status_code=404, detail="browser_not_found")

        browser_ip = browser_data["browser_ip"]

        if not browser_ip:
            raise HTTPException(status_code=503, detail="browser_not_available")

        return browser_ip, browser_data


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_profiles_api(mdb, crawl_manager, archive_ops, user_dep):
    """ init profile ops system """
    ops = ProfileOps(mdb, crawl_manager)

    router = ops.router

    archive_crawl_dep = archive_ops.archive_crawl_dep

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
    async def ping_profile_browser(browserid: str):
        return await ops.ping_profile_browser(browserid)

    @router.post("/browser/{browserid}/commit", response_model=ProfileOut)
    async def commit_profile_browser(browserid: str, profile_commit: ProfileCommitIn):
        return await ops.commit_profile(browserid, profile_commit)

    @router.get("/browser/{browserid}")
    async def get_profile_browser_url(browserid: str, request: Request):
        return await ops.get_profile_browser_url(browserid, request.headers)

    @router.delete("/browser/{browserid}")
    async def delete_profile_browser(browserid: str):
        return await ops.delete_profile_browser(browserid)

    archive_ops.router.include_router(router)
