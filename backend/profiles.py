""" Profile Management """

from typing import Optional, List
from datetime import datetime
import uuid
import asyncio
import os

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, UUID4, HttpUrl
import aiohttp
from redis import asyncio as aioredis

from archives import Archive
from users import User

from db import BaseMongoModel
from crawlconfigs import CrawlConfigIdNameOut


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
    description: Optional[str] = ""

    userid: UUID4
    aid: UUID4

    origins: List[str]
    resource: Optional[ProfileFile]

    created: Optional[datetime]


# ============================================================================
class ProfileWithCrawlConfigs(Profile):
    """ Profile with list of crawlconfigs useing this profile """

    crawlconfigs: List[CrawlConfigIdNameOut] = []


# ============================================================================
class UrlIn(BaseModel):
    """ Request to set url """

    url: HttpUrl


# ============================================================================
class ProfileLaunchBrowserIn(UrlIn):
    """ Request to launch new browser for creating profile """

    profileId: Optional[UUID4]


# ============================================================================
class BrowserId(BaseModel):
    """ Profile id on newly created profile """

    browserid: str


# ============================================================================
class ProfileCreateUpdate(BaseModel):
    """ Profile metadata for committing current browser to profile """

    browserid: Optional[str]
    name: str
    description: Optional[str] = ""


# ============================================================================
class ProfileOps:
    """ Profile management """

    def __init__(self, mdb, redis_url, crawl_manager):
        self.profiles = mdb["profiles"]

        self.crawl_manager = crawl_manager

        self.router = APIRouter(
            prefix="/profiles",
            tags=["profiles"],
            responses={404: {"description": "Not found"}},
        )
        asyncio.create_task(self.init_redis(redis_url))

        self.crawlconfigs = None

        self.shared_profile_storage = os.environ.get("SHARED_PROFILE_STORAGE")

    def set_crawlconfigs(self, crawlconfigs):
        """ set crawlconfigs ops """
        self.crawlconfigs = crawlconfigs

    async def init_redis(self, redis_url):
        """ init redis async """
        self.redis = await aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        )

    async def create_new_browser(
        self, archive: Archive, user: User, profile_launch: ProfileLaunchBrowserIn
    ):
        """ Create new profile """
        command = await self.get_command(profile_launch, archive)

        if self.shared_profile_storage:
            storage_name = self.shared_profile_storage
            storage = None
        elif archive.storage and archive.storage.type == "default":
            storage_name = None
            storage = archive.storage
        else:
            storage_name = str(archive.id)
            storage = None

        browserid = await self.crawl_manager.run_profile_browser(
            str(user.id),
            str(archive.id),
            command,
            storage=storage,
            storage_name=storage_name,
            baseprofile=profile_launch.profileId,
        )

        if not browserid:
            raise HTTPException(status_code=400, detail="browser_not_created")

        await self.redis.hset(f"br:{browserid}", "archive", str(archive.id))
        await self.redis.expire(f"br:{browserid}", BROWSER_EXPIRE)

        return BrowserId(browserid=browserid)

    async def get_command(
        self, profile_launch: ProfileLaunchBrowserIn, archive: Optional[Archive] = None
    ):
        """ Get Command for running profile browser """
        command = [
            "create-login-profile",
            "--interactive",
            "--shutdownWait",
            str(BROWSER_EXPIRE),
            "--filename",
            "/tmp/profile.tar.gz",
            "--url",
            str(profile_launch.url),
        ]
        if not profile_launch.profileId:
            return command

        path = await self.get_profile_storage_path(profile_launch.profileId, archive)

        if not path:
            raise HTTPException(status_code=400, detail="invalid_base_profile")

        command.append("--profile")
        command.append(f"@{path}")
        return command

    async def get_profile_browser_url(self, browserid, aid, headers):
        """ get profile browser url """
        json, browser_ip, _ = await self._req_browser_data(browserid, "/target")

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
        json, _, _2 = await self._req_browser_data(browserid, "/ping")

        await self.redis.expire(f"br:{browserid}", BROWSER_EXPIRE)

        return {"success": True, "origins": json.get("origins") or []}

    async def navigate_profile_browser(self, browserid, urlin: UrlIn):
        """ ping profile browser to keep it running """
        await self._req_browser_data(browserid, "/navigate", "POST", json=urlin.dict())

        await self.redis.expire(f"br:{browserid}", BROWSER_EXPIRE)

        return {"success": True}

    async def commit_profile(
        self, browser_commit: ProfileCreateUpdate, profileid: uuid.UUID = None
    ):
        """ commit profile and shutdown profile browser """

        if not profileid:
            profileid = uuid.uuid4()

        filename_data = {"filename": f"profile-{profileid}.tar.gz"}

        json, _, browser_data = await self._req_browser_data(
            browser_commit.browserid, "/createProfileJS", "POST", json=filename_data
        )

        try:
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
            id=profileid,
            name=browser_commit.name,
            description=browser_commit.description,
            created=datetime.utcnow().replace(microsecond=0, tzinfo=None),
            origins=json["origins"],
            resource=profile_file,
            userid=uuid.UUID(browser_data.get("btrix.user")),
            aid=uuid.UUID(browser_data.get("btrix.archive")),
            baseid=baseid,
        )

        # await self.profiles.insert_one(profile.to_dict())
        await self.profiles.find_one_and_update(
            {"_id": profile.id}, {"$set": profile.to_dict()}, upsert=True
        )

        return profile

    async def update_profile_metadata(
        self, profileid: UUID4, update: ProfileCreateUpdate
    ):
        """ Update name and description metadata only on existing profile """
        query = {"name": update.name}
        if update.description is not None:
            query["description"] = update.description

        if not await self.profiles.find_one_and_update(
            {"_id": profileid}, {"$set": query}
        ):
            raise HTTPException(status_code=404, detail="profile_not_found")

        return {"success": True}

    async def list_profiles(self, archive: Archive):
        """ list all profiles"""
        cursor = self.profiles.find({"aid": archive.id})
        results = await cursor.to_list(length=1000)
        return [Profile.from_dict(res) for res in results]

    async def get_profile(
        self, profileid: uuid.UUID, archive: Optional[Archive] = None
    ):
        """ get profile by id and archive """
        query = {"_id": profileid}
        if archive:
            query["aid"] = archive.id

        res = await self.profiles.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="profile_not_found")

        return Profile.from_dict(res)

    async def get_profile_with_configs(
        self, profileid: uuid.UUID, archive: Optional[Archive] = None
    ):
        """ get profile for api output, with crawlconfigs """

        profile = await self.get_profile(profileid, archive)

        crawlconfigs = await self.get_crawl_configs_for_profile(profileid, archive)

        return ProfileWithCrawlConfigs(crawlconfigs=crawlconfigs, **profile.dict())

    async def get_profile_storage_path(
        self, profileid: uuid.UUID, archive: Optional[Archive] = None
    ):
        """ return profile path filename (relative path) for given profile id and archive """
        try:
            profile = await self.get_profile(profileid, archive)
            return profile.resource.filename
        # pylint: disable=bare-except
        except:
            return None

    async def get_profile_name(
        self, profileid: uuid.UUID, archive: Optional[Archive] = None
    ):
        """ return profile for given profile id and archive """
        try:
            profile = await self.get_profile(profileid, archive)
            return profile.name
        # pylint: disable=bare-except
        except:
            return None

    async def get_crawl_configs_for_profile(
        self, profileid: uuid.UUID, archive: Optional[Archive] = None
    ):
        """ Get list of crawl config id, names for that use a particular profile """

        crawlconfig_names = await self.crawlconfigs.get_crawl_config_ids_for_profile(
            profileid, archive
        )

        return crawlconfig_names

    async def delete_profile(
        self, profileid: uuid.UUID, archive: Optional[Archive] = None
    ):
        """ delete profile, if not used in active crawlconfig """
        profile = await self.get_profile_with_configs(profileid, archive)

        if len(profile.crawlconfigs) > 0:
            return {"error": "in_use", "crawlconfigs": profile.crawlconfigs}

        query = {"_id": profileid}
        if archive:
            query["aid"] = archive.id

        # todo: delete the file itself!
        # delete profile.pathname

        res = await self.profiles.delete_one(query)
        if not res or res.deleted_count != 1:
            raise HTTPException(status_code=404, detail="profile_not_found")

        return {"success": True}

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

    async def _req_browser_data(self, browserid, path, method="GET", json=None):
        browser_data = await self.crawl_manager.get_profile_browser_data(browserid)

        if not browser_data:
            raise HTTPException(status_code=404, detail="browser_not_found")

        browser_ip = browser_data.get("browser_ip")

        if not browser_ip:
            raise HTTPException(status_code=200, detail="waiting_for_browser")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method, f"http://{browser_ip}:9223{path}", json=json
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
            raise HTTPException(status_code=404, detail="no_such_browser")

        return browserid

    @router.get("", response_model=List[Profile])
    async def list_profiles(
        archive: Archive = Depends(archive_crawl_dep),
    ):
        return await ops.list_profiles(archive)

    @router.post("", response_model=Profile)
    async def commit_browser_to_new(
        browser_commit: ProfileCreateUpdate,
        archive: Archive = Depends(archive_crawl_dep),
    ):
        await browser_dep(browser_commit.browserid, archive)

        return await ops.commit_profile(browser_commit)

    @router.patch("/{profileid}")
    async def commit_browser_to_existing(
        browser_commit: ProfileCreateUpdate,
        profileid: UUID4,
        archive: Archive = Depends(archive_crawl_dep),
    ):
        if not browser_commit.browserid:
            await ops.update_profile_metadata(profileid, browser_commit)

        else:
            await browser_dep(browser_commit.browserid, archive)

            await ops.commit_profile(browser_commit, profileid)

        return {"success": True}

    @router.get("/{profileid}", response_model=ProfileWithCrawlConfigs)
    async def get_profile(
        profileid: UUID4,
        archive: Archive = Depends(archive_crawl_dep),
    ):
        return await ops.get_profile_with_configs(profileid, archive)

    @router.delete("/{profileid}")
    async def delete_profile(
        profileid: UUID4,
        archive: Archive = Depends(archive_crawl_dep),
    ):
        return await ops.delete_profile(profileid, archive)

    @router.post("/browser", response_model=BrowserId)
    async def create_new(
        profile_launch: ProfileLaunchBrowserIn,
        archive: Archive = Depends(archive_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.create_new_browser(archive, user, profile_launch)

    @router.post("/browser/{browserid}/ping")
    async def ping_profile_browser(browserid: str = Depends(browser_dep)):
        return await ops.ping_profile_browser(browserid)

    @router.post("/browser/{browserid}/navigate")
    async def navigate_profile_browser(
        urlin: UrlIn, browserid: str = Depends(browser_dep)
    ):
        return await ops.navigate_profile_browser(browserid, urlin)

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

    return ops
