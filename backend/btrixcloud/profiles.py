"""Profile Management"""

from typing import Optional, TYPE_CHECKING, Any, cast, Dict, List, Tuple
from uuid import UUID, uuid4
import os

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, HTTPException
from starlette.requests import Headers
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
    PaginatedProfileResponse,
    StorageRef,
    EmptyResponse,
    SuccessResponse,
    AddedResponseIdQuota,
    UpdatedResponse,
    SuccessResponseStorageQuota,
    ProfilePingResponse,
    ProfileBrowserGetUrlResponse,
    CrawlConfigProfileOut,
)
from .utils import dt_now

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

    browser_fqdn_suffix: str
    router: APIRouter

    def __init__(self, mdb, orgs, crawl_manager, storage_ops, background_job_ops):
        self.profiles = mdb["profiles"]
        self.orgs = orgs
        self.background_job_ops = background_job_ops

        self.crawl_manager = crawl_manager
        self.storage_ops = storage_ops

        self.browser_fqdn_suffix = os.environ.get("CRAWLER_FQDN_SUFFIX", "")

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
    ) -> BrowserId:
        """Create new profile"""
        prev_profile_path = ""
        prev_profile_id = ""
        prev_proxy_id = ""
        if profile_launch.profileId:
            prev_profile_path, prev_proxy_id = (
                await self.get_profile_storage_path_and_proxy(
                    profile_launch.profileId, org
                )
            )

            if not prev_profile_path:
                raise HTTPException(status_code=400, detail="invalid_base_profile")

            prev_profile_id = str(profile_launch.profileId)

        crawler_image = self.crawlconfigs.get_channel_crawler_image(
            profile_launch.crawlerChannel
        )
        if not crawler_image:
            raise HTTPException(status_code=404, detail="crawler_not_found")

        image_pull_policy = self.crawlconfigs.get_channel_crawler_image_pull_policy(
            profile_launch.crawlerChannel
        )

        # use either specified proxyId or if none, use proxyId from existing profile
        proxy_id = profile_launch.proxyId or prev_proxy_id

        if proxy_id and not self.crawlconfigs.can_org_use_proxy(org, proxy_id):
            raise HTTPException(status_code=404, detail="proxy_not_found")

        browserid = await self.crawl_manager.run_profile_browser(
            str(user.id),
            str(org.id),
            url=str(profile_launch.url),
            storage=org.storage,
            crawler_image=crawler_image,
            image_pull_policy=image_pull_policy,
            baseprofile=prev_profile_id,
            profile_filename=prev_profile_path,
            proxy_id=proxy_id,
        )

        if not browserid:
            raise HTTPException(status_code=400, detail="browser_not_created")

        return BrowserId(browserid=browserid)

    async def get_profile_browser_url(
        self, browserid: str, oid: str, headers: Headers
    ) -> dict[str, str | int]:
        """get profile browser url"""
        json = await self._send_browser_req(browserid, "/vncpass")

        password = json.get("password")

        if not password:
            raise HTTPException(status_code=400, detail="browser_not_available")

        scheme = headers.get("X-Forwarded-Proto") or "http"
        host = headers.get("Host") or "localhost"
        # ws_scheme = "wss" if scheme == "https" else "ws"

        auth_bearer = headers.get("Authorization", "").split(" ")[1]

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

    async def ping_profile_browser(self, browserid: str) -> dict[str, Any]:
        """ping profile browser to keep it running"""
        await self.crawl_manager.ping_profile_browser(browserid)

        json = await self._send_browser_req(browserid, "/ping")

        return {"success": True, "origins": json.get("origins") or []}

    async def navigate_profile_browser(
        self, browserid: str, urlin: UrlIn
    ) -> dict[str, bool]:
        """ping profile browser to keep it running"""
        await self._send_browser_req(browserid, "/navigate", "POST", json=urlin.dict())

        return {"success": True}

    async def commit_to_profile(
        self,
        browser_commit: ProfileCreate,
        org: Organization,
        user: User,
        metadata: dict,
        existing_profile: Optional[Profile] = None,
    ) -> dict[str, Any]:
        """commit profile and shutdown profile browser"""
        # pylint: disable=too-many-locals

        now = dt_now()

        if existing_profile:
            profileid = existing_profile.id
            created = existing_profile.created
            created_by = existing_profile.createdBy
            created_by_name = existing_profile.createdByName
        else:
            profileid = uuid4()
            created = now
            created_by = user.id
            created_by_name = user.name if user.name else user.email

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
            storage=org.storage,
        )

        baseid = metadata.get("btrix.baseprofile")
        if baseid:
            print("baseid", baseid)
            baseid = UUID(baseid)

        self.orgs.can_write_data(org, include_time=False)

        profile = Profile(
            id=profileid,
            name=browser_commit.name,
            description=browser_commit.description,
            created=created,
            createdBy=created_by,
            createdByName=created_by_name,
            modified=now,
            modifiedBy=user.id,
            modifiedByName=user.name if user.name else user.email,
            origins=json["origins"],
            resource=profile_file,
            userid=UUID(metadata.get("btrix.user")),
            oid=org.id,
            baseid=baseid,
            crawlerChannel=browser_commit.crawlerChannel,
            proxyId=browser_commit.proxyId,
        )

        await self.profiles.find_one_and_update(
            {"_id": profile.id}, {"$set": profile.to_dict()}, upsert=True
        )

        await self.background_job_ops.create_replica_jobs(
            org.id, profile_file, str(profileid), "profile"
        )

        await self.orgs.inc_org_bytes_stored(org.id, file_size, "profile")

        return {
            "added": True,
            "id": str(profile.id),
            "storageQuotaReached": self.orgs.storage_quota_reached(org),
        }

    async def update_profile_metadata(
        self, profileid: UUID, update: ProfileUpdate, user: User
    ) -> dict[str, bool]:
        """Update name and description metadata only on existing profile"""
        query = {
            "name": update.name,
            "modified": dt_now(),
            "modifiedBy": user.id,
            "modifiedByName": user.name if user.name else user.email,
        }

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
        sort_by: str = "modified",
        sort_direction: int = -1,
    ) -> Tuple[list[Profile], int]:
        """list all profiles"""
        # pylint: disable=too-many-locals,duplicate-code

        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        match_query = {"oid": org.id}
        if userid:
            match_query["userid"] = userid

        aggregate: List[Dict[str, Any]] = [{"$match": match_query}]

        if sort_by:
            if sort_by not in ("modified", "created", "name", "url"):
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            if sort_by == "url":
                sort_by = "origins.0"

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        aggregate.extend(
            [
                {
                    "$facet": {
                        "items": [
                            {"$skip": skip},
                            {"$limit": page_size},
                        ],
                        "total": [{"$count": "count"}],
                    }
                },
            ]
        )

        cursor = self.profiles.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        profiles = [Profile.from_dict(res) for res in items]
        return profiles, total

    async def get_profile(
        self, profileid: UUID, org: Optional[Organization] = None
    ) -> Profile:
        """get profile by id and org"""
        query: dict[str, object] = {"_id": profileid}
        if org:
            query["oid"] = org.id

        res = await self.profiles.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="profile_not_found")

        return Profile.from_dict(res)

    async def get_profile_with_configs(
        self, profileid: UUID, org: Organization
    ) -> ProfileWithCrawlConfigs:
        """get profile for api output, with crawlconfigs"""

        profile = await self.get_profile(profileid, org)

        crawlconfigs = await self.get_crawl_configs_for_profile(profileid, org)

        return ProfileWithCrawlConfigs(crawlconfigs=crawlconfigs, **profile.dict())

    async def get_profile_storage_path_and_proxy(
        self, profileid: UUID, org: Optional[Organization] = None
    ) -> tuple[str, str]:
        """return profile path filename (relative path) for given profile id and org"""
        try:
            profile = await self.get_profile(profileid, org)
            storage_path = profile.resource.filename if profile.resource else ""
            return storage_path, profile.proxyId or ""
        # pylint: disable=bare-except
        except:
            pass

        return "", ""

    async def get_profile_name(
        self, profileid: UUID, org: Optional[Organization] = None
    ) -> str:
        """return profile for given profile id and org"""
        try:
            profile = await self.get_profile(profileid, org)
            return profile.name
        # pylint: disable=bare-except
        except:
            pass

        return ""

    async def get_crawl_configs_for_profile(
        self, profileid: UUID, org: Organization
    ) -> list[CrawlConfigProfileOut]:
        """Get list of crawl configs with basic info for that use a particular profile"""

        crawlconfig_info = await self.crawlconfigs.get_crawl_config_info_for_profile(
            profileid, org
        )

        return crawlconfig_info

    async def delete_profile(
        self, profileid: UUID, org: Organization
    ) -> dict[str, Any]:
        """delete profile, if not used in active crawlconfig"""
        profile = await self.get_profile_with_configs(profileid, org)

        if len(profile.crawlconfigs) > 0:
            return {"error": "in_use", "crawlconfigs": profile.crawlconfigs}

        query: dict[str, object] = {"_id": profileid}
        if org:
            query["oid"] = org.id

        # Delete file from storage
        if profile.resource:
            await self.storage_ops.delete_file_object(org, profile.resource)
            await self.orgs.inc_org_bytes_stored(
                org.id, -profile.resource.size, "profile"
            )
            await self.background_job_ops.create_delete_replica_jobs(
                org, profile.resource, str(profile.id), "profile"
            )

        res = await self.profiles.delete_one(query)
        if not res or res.deleted_count != 1:
            raise HTTPException(status_code=404, detail="profile_not_found")

        quota_reached = self.orgs.storage_quota_reached(org)

        return {"success": True, "storageQuotaReached": quota_reached}

    async def delete_profile_browser(self, browserid: str) -> dict[str, bool]:
        """delete profile browser immediately"""
        if not await self.crawl_manager.delete_profile_browser(browserid):
            raise HTTPException(status_code=404, detail="browser_not_found")

        return {"success": True}

    async def _send_browser_req(
        self,
        browserid: str,
        path: str,
        method: str = "GET",
        json: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
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

        return json or {}

    async def add_profile_file_replica(
        self, profileid: UUID, filename: str, ref: StorageRef
    ) -> dict[str, object]:
        """Add replica StorageRef to existing ProfileFile"""
        return await self.profiles.find_one_and_update(
            {"_id": profileid, "resource.filename": filename},
            {"$push": {"resource.replicas": {"name": ref.name, "custom": ref.custom}}},
        )

    async def calculate_org_profile_file_storage(self, oid: UUID) -> int:
        """Calculate and return total size of profile files in org"""
        total_size = 0

        cursor = self.profiles.find({"oid": oid})
        async for profile_dict in cursor:
            file_ = profile_dict.get("resource")
            if file_:
                total_size += file_.get("size", 0)

        return total_size


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_profiles_api(
    mdb,
    org_ops: OrgOps,
    crawl_manager: CrawlManager,
    storage_ops: StorageOps,
    background_job_ops: BackgroundJobOps,
    user_dep,
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

    @router.get("", response_model=PaginatedProfileResponse)
    async def list_profiles(
        org: Organization = Depends(org_crawl_dep),
        userid: Optional[UUID] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: str = "modified",
        sortDirection: int = -1,
    ):
        profiles, total = await ops.list_profiles(
            org,
            userid,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(profiles, total, page, pageSize)

    @router.post("", response_model=AddedResponseIdQuota)
    async def commit_browser_to_new(
        browser_commit: ProfileCreate,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        metadata = await browser_get_metadata(browser_commit.browserid, org)

        return await ops.commit_to_profile(browser_commit, org, user, metadata)

    @router.patch("/{profileid}", response_model=UpdatedResponse)
    async def commit_browser_to_existing(
        browser_commit: ProfileUpdate,
        profileid: UUID,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        if not browser_commit.browserid:
            await ops.update_profile_metadata(profileid, browser_commit, user)

        else:
            metadata = await browser_get_metadata(browser_commit.browserid, org)
            profile = await ops.get_profile(profileid)
            await ops.commit_to_profile(
                browser_commit=ProfileCreate(
                    browserid=browser_commit.browserid,
                    name=browser_commit.name,
                    description=browser_commit.description or profile.description,
                    crawlerChannel=profile.crawlerChannel,
                    proxyId=profile.proxyId,
                ),
                org=org,
                user=user,
                metadata=metadata,
                existing_profile=profile,
            )

        return {"updated": True}

    @router.get("/{profileid}", response_model=Profile)
    async def get_profile(
        profileid: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.get_profile(profileid, org)

    @router.delete("/{profileid}", response_model=SuccessResponseStorageQuota)
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

    @router.post("/browser/{browserid}/ping", response_model=ProfilePingResponse)
    async def ping_profile_browser(browserid: str = Depends(browser_dep)):
        return await ops.ping_profile_browser(browserid)

    @router.post("/browser/{browserid}/navigate", response_model=SuccessResponse)
    async def navigate_profile_browser(
        urlin: UrlIn, browserid: str = Depends(browser_dep)
    ):
        return await ops.navigate_profile_browser(browserid, urlin)

    @router.get("/browser/{browserid}", response_model=ProfileBrowserGetUrlResponse)
    async def get_profile_browser_url(
        request: Request,
        browserid: str = Depends(browser_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.get_profile_browser_url(
            browserid, str(org.id), request.headers
        )

    # pylint: disable=unused-argument
    @router.get("/browser/{browserid}/access", response_model=EmptyResponse)
    async def access_check(browserid: str = Depends(browser_dep)):
        return {}

    @router.delete("/browser/{browserid}", response_model=SuccessResponse)
    async def delete_profile_browser(browserid: str = Depends(browser_dep)):
        return await ops.delete_profile_browser(browserid)

    if org_ops.router:
        org_ops.router.include_router(router)

    return ops
