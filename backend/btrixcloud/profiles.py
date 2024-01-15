""" Profile Management """

from typing import Optional, TYPE_CHECKING, Any, cast
from datetime import datetime
from uuid import UUID, uuid4
import os

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, HTTPException
import aiohttp

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    Profile,
    ProfileWithCrawlConfigs,
    ProfileFile,
    UrlIn,
    ProfileLaunchBrowserIn,
    BrowserId,
    ProfileCreate,
    ProfileUpdate,
    Organization,
    User,
    PaginatedResponse,
    StorageRef,
)

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .crawlmanager import CrawlManager
    from .storages import StorageOps
    from .crawlconfigs import CrawlConfigOps
    from .background_jobs import BackgroundJobOps
else:
    OrgOps = CrawlManager = StorageOps = CrawlConfigOps = BackgroundJobOps = object


BROWSER_EXPIRE = 300


# ============================================================================
# pylint: disable=too-many-instance-attributes, too-many-arguments
class ProfileOps:
    """Profile management"""

    orgs: OrgOps
    crawl_manager: CrawlManager
    storage_ops: StorageOps

    crawlconfigs: CrawlConfigOps
    background_job_ops: BackgroundJobOps

    def __init__(self, mdb, orgs, crawl_manager, storage_ops, background_job_ops):
        self.profiles = mdb["profiles"]
        self.orgs = orgs
        self.background_job_ops = background_job_ops

        self.crawl_manager = crawl_manager
        self.storage_ops = storage_ops

        self.browser_fqdn_suffix = os.environ.get("CRAWLER_FQDN_SUFFIX")

        self.router = APIRouter(
            prefix="/profiles",
            tags=["profiles"],
            responses={404: {"description": "Not found"}},
        )

        self.crawlconfigs = cast(CrawlConfigOps, None)

    def set_crawlconfigs(self, crawlconfigs):
        """set crawlconfigs ops"""
        self.crawlconfigs = crawlconfigs

    async def create_new_browser(
        self, org: Organization, user: User, profile_launch: ProfileLaunchBrowserIn
    ):
        """Create new profile"""
        prev_profile = ""
        prev_profile_id = ""
        if profile_launch.profileId:
            prev_profile = await self.get_profile_storage_path(
                profile_launch.profileId, org
            )

            if not prev_profile:
                raise HTTPException(status_code=400, detail="invalid_base_profile")

            prev_profile_id = str(profile_launch.profileId)

        crawler_image = self.crawlconfigs.get_channel_crawler_image(
            profile_launch.crawlerChannel
        )
        if not crawler_image:
            raise HTTPException(status_code=404, detail="crawler_not_found")

        browserid = await self.crawl_manager.run_profile_browser(
            str(user.id),
            str(org.id),
            url=profile_launch.url,
            storage=org.storage,
            crawler_image=crawler_image,
            baseprofile=prev_profile_id,
            profile_filename=prev_profile,
        )

        if not browserid:
            raise HTTPException(status_code=400, detail="browser_not_created")

        return BrowserId(browserid=browserid)

    async def get_profile_browser_url(self, browserid, oid, headers):
        """get profile browser url"""
        json = await self._send_browser_req(browserid, "/vncpass")

        password = json.get("password")

        if not password:
            raise HTTPException(status_code=400, detail="browser_not_available")

        scheme = headers.get("X-Forwarded-Proto") or "http"
        host = headers.get("Host") or "localhost"
        # ws_scheme = "wss" if scheme == "https" else "ws"

        auth_bearer = headers.get("Authorization").split(" ")[1]

        params = {
            "path": f"browser/{browserid}/ws?oid={oid}&auth_bearer={auth_bearer}",
            "password": password,
            "oid": oid,
            "auth_bearer": auth_bearer,
            "scale": 0.75,
        }

        url = f"{scheme}://{host}/browser/{browserid}/?{urlencode(params)}"
        params["url"] = url
        return params

    async def ping_profile_browser(self, browserid):
        """ping profile browser to keep it running"""
        await self.crawl_manager.ping_profile_browser(browserid)

        json = await self._send_browser_req(browserid, "/ping")

        return {"success": True, "origins": json.get("origins") or []}

    async def navigate_profile_browser(self, browserid, urlin: UrlIn):
        """ping profile browser to keep it running"""
        await self._send_browser_req(browserid, "/navigate", "POST", json=urlin.dict())

        return {"success": True}

    async def commit_to_profile(
        self,
        browser_commit: ProfileCreate,
        storage: StorageRef,
        metadata: dict,
        profileid: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """commit profile and shutdown profile browser"""
        if not profileid:
            profileid = uuid4()

        filename_data = {"filename": f"profiles/profile-{profileid}.tar.gz"}

        json = await self._send_browser_req(
            browser_commit.browserid, "/createProfileJS", "POST", json=filename_data
        )

        try:
            resource = json["resource"]
        except:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="browser_not_valid")

        await self.crawl_manager.delete_profile_browser(browser_commit.browserid)

        # backwards compatibility
        file_size = resource.get("size") or resource.get("bytes")

        profile_file = ProfileFile(
            hash=resource["hash"],
            size=file_size,
            filename=resource["path"],
            storage=storage,
        )

        baseid = metadata.get("btrix.baseprofile")
        if baseid:
            print("baseid", baseid)
            baseid = UUID(baseid)

        oid = UUID(metadata.get("btrix.org"))

        if await self.orgs.storage_quota_reached(oid):
            raise HTTPException(status_code=403, detail="storage_quota_reached")

        profile = Profile(
            id=profileid,
            name=browser_commit.name,
            description=browser_commit.description,
            created=datetime.utcnow().replace(microsecond=0, tzinfo=None),
            origins=json["origins"],
            resource=profile_file,
            userid=UUID(metadata.get("btrix.user")),
            oid=oid,
            baseid=baseid,
            crawlerChannel=browser_commit.crawlerChannel,
        )

        await self.profiles.find_one_and_update(
            {"_id": profile.id}, {"$set": profile.to_dict()}, upsert=True
        )

        await self.background_job_ops.create_replica_jobs(
            oid, profile_file, str(profileid), "profile"
        )

        quota_reached = await self.orgs.inc_org_bytes_stored(oid, file_size, "profile")

        return {
            "added": True,
            "id": str(profile.id),
            "storageQuotaReached": quota_reached,
        }

    async def update_profile_metadata(self, profileid: UUID, update: ProfileUpdate):
        """Update name and description metadata only on existing profile"""
        query = {"name": update.name}
        if update.description is not None:
            query["description"] = update.description

        if not await self.profiles.find_one_and_update(
            {"_id": profileid}, {"$set": query}
        ):
            raise HTTPException(status_code=404, detail="profile_not_found")

        return {"updated": True}

    async def list_profiles(
        self,
        org: Organization,
        userid: Optional[UUID] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        """list all profiles"""
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query = {"oid": org.id}
        if userid:
            query["userid"] = userid

        total = await self.profiles.count_documents(query)

        cursor = self.profiles.find(query, skip=skip, limit=page_size)
        results = await cursor.to_list(length=page_size)
        profiles = [Profile.from_dict(res) for res in results]

        return profiles, total

    async def get_profile(self, profileid: UUID, org: Optional[Organization] = None):
        """get profile by id and org"""
        query: dict[str, object] = {"_id": profileid}
        if org:
            query["oid"] = org.id

        res = await self.profiles.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="profile_not_found")

        return Profile.from_dict(res)

    async def get_profile_with_configs(
        self, profileid: UUID, org: Optional[Organization] = None
    ):
        """get profile for api output, with crawlconfigs"""

        profile = await self.get_profile(profileid, org)

        crawlconfigs = await self.get_crawl_configs_for_profile(profileid, org)

        return ProfileWithCrawlConfigs(crawlconfigs=crawlconfigs, **profile.dict())

    async def get_profile_storage_path(
        self, profileid: UUID, org: Optional[Organization] = None
    ):
        """return profile path filename (relative path) for given profile id and org"""
        try:
            profile = await self.get_profile(profileid, org)
            return profile.resource.filename
        # pylint: disable=bare-except
        except:
            return None

    async def get_profile_name(
        self, profileid: UUID, org: Optional[Organization] = None
    ):
        """return profile for given profile id and org"""
        try:
            profile = await self.get_profile(profileid, org)
            return profile.name
        # pylint: disable=bare-except
        except:
            return None

    async def get_crawl_configs_for_profile(
        self, profileid: UUID, org: Optional[Organization] = None
    ):
        """Get list of crawl config id, names for that use a particular profile"""

        crawlconfig_names = await self.crawlconfigs.get_crawl_config_ids_for_profile(
            profileid, org
        )

        return crawlconfig_names

    async def delete_profile(self, profileid: UUID, org: Organization):
        """delete profile, if not used in active crawlconfig"""
        profile = await self.get_profile_with_configs(profileid, org)

        if len(profile.crawlconfigs) > 0:
            return {"error": "in_use", "crawlconfigs": profile.crawlconfigs}

        query: dict[str, object] = {"_id": profileid}
        if org:
            query["oid"] = org.id

        # Delete file from storage
        if profile.resource:
            await self.storage_ops.delete_crawl_file_object(org, profile.resource)
            await self.orgs.inc_org_bytes_stored(
                org.id, -profile.resource.size, "profile"
            )

        res = await self.profiles.delete_one(query)
        if not res or res.deleted_count != 1:
            raise HTTPException(status_code=404, detail="profile_not_found")

        await self.background_job_ops.create_delete_replica_jobs(
            org, profile.resource, profile.id, "profile"
        )

        quota_reached = await self.orgs.storage_quota_reached(org.id)

        return {"success": True, "storageQuotaReached": quota_reached}

    async def delete_profile_browser(self, browserid):
        """delete profile browser immediately"""
        if not await self.crawl_manager.delete_profile_browser(browserid):
            raise HTTPException(status_code=404, detail="browser_not_found")

        return {"success": True}

    async def _send_browser_req(self, browserid, path, method="GET", json=None):
        """make request to browser api to get state"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method,
                    f"http://browser-{browserid}.browser{self.browser_fqdn_suffix}:9223{path}",
                    json=json,
                ) as resp:
                    json = await resp.json()

        except Exception:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=200, detail="waiting_for_browser")

        return json

    async def add_profile_file_replica(
        self, profileid: UUID, filename: str, ref: StorageRef
    ) -> dict[str, object]:
        """Add replica StorageRef to existing ProfileFile"""
        return await self.profiles.find_one_and_update(
            {"_id": profileid, "resource.filename": filename},
            {"$push": {"resource.replicas": {"name": ref.name, "custom": ref.custom}}},
        )


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_profiles_api(
    mdb, org_ops, crawl_manager, storage_ops, background_job_ops, user_dep
):
    """init profile ops system"""
    ops = ProfileOps(mdb, org_ops, crawl_manager, storage_ops, background_job_ops)

    router = ops.router

    org_crawl_dep = org_ops.org_crawl_dep

    async def browser_get_metadata(
        browserid: str, org: Organization = Depends(org_crawl_dep)
    ):
        # if await ops.redis.hget(f"br:{browserid}", "org") != str(org.id):
        metadata = await crawl_manager.get_profile_browser_metadata(browserid)
        if metadata.get("btrix.org") != str(org.id):
            raise HTTPException(status_code=404, detail="no_such_browser")

        return metadata

    async def browser_dep(browserid: str, org: Organization = Depends(org_crawl_dep)):
        await browser_get_metadata(browserid, org)
        return browserid

    @router.get("", response_model=PaginatedResponse)
    async def list_profiles(
        org: Organization = Depends(org_crawl_dep),
        userid: Optional[UUID] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        profiles, total = await ops.list_profiles(
            org, userid, page_size=pageSize, page=page
        )
        return paginated_format(profiles, total, page, pageSize)

    @router.post("")
    async def commit_browser_to_new(
        browser_commit: ProfileCreate,
        org: Organization = Depends(org_crawl_dep),
    ):
        metadata = await browser_get_metadata(browser_commit.browserid, org)

        return await ops.commit_to_profile(browser_commit, org.storage, metadata)

    @router.patch("/{profileid}")
    async def commit_browser_to_existing(
        browser_commit: ProfileUpdate,
        profileid: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        if not browser_commit.browserid:
            await ops.update_profile_metadata(profileid, browser_commit)

        else:
            metadata = await browser_get_metadata(browser_commit.browserid, org)
            profile = await ops.get_profile(profileid)
            await ops.commit_to_profile(
                browser_commit=ProfileCreate(
                    browserid=browser_commit.browserid,
                    name=browser_commit.name,
                    description=browser_commit.description or profile.description,
                    crawlerChannel=profile.crawlerChannel,
                ),
                storage=org.storage,
                metadata=metadata,
                profileid=profileid,
            )

        return {"updated": True}

    @router.get("/{profileid}", response_model=ProfileWithCrawlConfigs)
    async def get_profile(
        profileid: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.get_profile_with_configs(profileid, org)

    @router.delete("/{profileid}")
    async def delete_profile(
        profileid: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_profile(profileid, org)

    @router.post("/browser", response_model=BrowserId)
    async def create_new(
        profile_launch: ProfileLaunchBrowserIn,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.create_new_browser(org, user, profile_launch)

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
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.get_profile_browser_url(
            browserid, str(org.id), request.headers
        )

    # pylint: disable=unused-argument
    @router.get("/browser/{browserid}/access")
    async def access_check(browserid: str = Depends(browser_dep)):
        return {}

    @router.delete("/browser/{browserid}")
    async def delete_profile_browser(browserid: str = Depends(browser_dep)):
        return await ops.delete_profile_browser(browserid)

    org_ops.router.include_router(router)

    return ops
