"""Profile Management"""

from typing import Optional, TYPE_CHECKING, Any, cast, Dict, List, Tuple
from uuid import UUID, uuid4
import os
import asyncio
import json

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, HTTPException
from starlette.requests import Headers
from pymongo import ReturnDocument
import aiohttp

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    Profile,
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
    ProfileBrowserMetadata,
)
from .utils import dt_now, str_to_date

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

    bg_tasks: set

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

        # to avoid background tasks being garbage collected
        # see: https://stackoverflow.com/a/74059981
        self.bg_tasks = set()

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
                await self.get_profile_filename_and_proxy(profile_launch.profileId, org)
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
            crawler_channel=profile_launch.crawlerChannel,
            crawler_image=crawler_image,
            image_pull_policy=image_pull_policy,
            baseprofile=prev_profile_id,
            profile_filename=prev_profile_path,
            proxy_id=proxy_id,
            profileid=str(uuid4()),
        )

        if not browserid:
            raise HTTPException(status_code=400, detail="browser_not_created")

        return BrowserId(browserid=browserid)

    async def get_profile_browser_url(
        self, browserid: str, oid: str, headers: Headers
    ) -> dict[str, str | int]:
        """get profile browser url"""
        data = await self._send_browser_req(browserid, "/vncpass")

        password = data.get("password")

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

    async def ping_profile_browser(
        self, metadata: ProfileBrowserMetadata, org: Organization
    ) -> dict[str, Any]:
        """ping profile browser to keep it running"""
        data = await self._send_browser_req(metadata.browser, "/ping")
        origins = data.get("origins") or []

        if metadata.baseprofile:
            base = await self.get_profile(metadata.baseprofile, org)
            for origin in base.origins:
                if origin not in origins:
                    origins.append(origin)

        return {"success": True, "origins": origins}

    async def navigate_profile_browser(
        self, browserid: str, urlin: UrlIn
    ) -> dict[str, bool]:
        """ping profile browser to keep it running"""
        await self._send_browser_req(
            browserid, "/navigate", "POST", post_data=urlin.dict()
        )

        return {"success": True}

    async def commit_to_profile(
        self,
        metadata: ProfileBrowserMetadata,
        browser_commit: ProfileCreate,
        org: Organization,
        user: User,
        existing_profile: Optional[Profile] = None,
    ) -> dict[str, Any]:
        """commit to profile async, returning if committed, or waiting"""
        if not metadata.profileid:
            raise HTTPException(status_code=400, detail="browser_not_valid")

        self.orgs.can_write_data(org, include_time=False)

        if not metadata.committing:
            self._run_task(
                self.do_commit_to_profile(
                    metadata=metadata,
                    browser_commit=browser_commit,
                    org=org,
                    user=user,
                    existing_profile=existing_profile,
                )
            )

        if metadata.committing == "done":
            await self.crawl_manager.delete_profile_browser(browser_commit.browserid)
            return {
                "added": True,
                "id": str(metadata.profileid),
                "storageQuotaReached": self.orgs.storage_quota_reached(org),
            }

        raise HTTPException(status_code=200, detail="waiting_for_browser")

    async def do_commit_to_profile(
        self,
        metadata: ProfileBrowserMetadata,
        browser_commit: ProfileCreate,
        org: Organization,
        user: User,
        existing_profile: Optional[Profile] = None,
    ) -> bool:
        """commit profile and shutdown profile browser"""
        # pylint: disable=too-many-locals
        try:
            now = dt_now()

            if existing_profile:
                profileid = existing_profile.id
                created = existing_profile.created
                created_by = existing_profile.createdBy
                created_by_name = existing_profile.createdByName
                prev_file_size = (
                    existing_profile.resource.size if existing_profile.resource else 0
                )
            else:
                profileid = metadata.profileid
                created = now
                created_by = user.id
                created_by_name = user.name if user.name else user.email
                prev_file_size = 0

            relative_filename = f"profiles/profile-{profileid}.tar.gz"
            full_filename = f"{str(org.id)}/{relative_filename}"

            data = await self._send_browser_req(
                browser_commit.browserid,
                "/createProfileJS",
                "POST",
                post_data={"filename": relative_filename},
                committing="committing",
            )
            resource = data["resource"]

            # backwards compatibility
            file_size = resource.get("size") or resource.get("bytes")

            profile_file = ProfileFile(
                hash=resource["hash"],
                size=file_size,
                filename=full_filename,
                storage=org.storage,
            )

            baseid = metadata.baseprofile

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
                origins=data["origins"],
                resource=profile_file,
                userid=metadata.userid,
                oid=org.id,
                baseid=baseid,
                crawlerChannel=metadata.crawlerChannel,
                proxyId=metadata.proxyid,
            )

            await self.profiles.find_one_and_update(
                {"_id": profile.id}, {"$set": profile.to_dict()}, upsert=True
            )

            await self.background_job_ops.create_replica_jobs(
                org.id, profile_file, str(profileid), "profile"
            )

            await self.orgs.inc_org_bytes_stored(
                org.id, file_size - prev_file_size, "profile"
            )

            await self.crawl_manager.keep_alive_profile_browser(
                browser_commit.browserid, committing="done"
            )

        # pylint: disable=broad-except
        except Exception as e:
            print("Profile commit failed", e)
            return False

        return True

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

    async def update_profile_from_crawl_upload(
        self,
        org_id: UUID,
        profileid: UUID,
        cid: UUID,
        crawl_id: str,
        profile_update: str,
    ) -> bool:
        """update profile based on stats from saved profile from a finished crawl"""
        try:
            data = json.loads(profile_update)
            size = data["size"]
            hash_ = data["hash"]
            modified = str_to_date(data["modified"])
        # pylint: disable=broad-exception-caught
        except Exception as exc:
            print(exc)
            return False

        res = await self.profiles.find_one_and_update(
            {"_id": profileid, "resource.filename": {"$exists": True}},
            {
                "$set": {
                    "resource.size": size,
                    "resource.hash": hash_,
                    "modifiedCrawlDate": modified,
                    "modifiedCrawlId": crawl_id,
                    "modifiedCrawlCid": cid,
                }
            },
            return_document=ReturnDocument.BEFORE,
        )
        if not res:
            return False

        prev_profile = Profile.from_dict(res)
        profile_file = prev_profile.resource
        if not profile_file:
            return False

        prev_file_size = profile_file.size
        profile_file.size = size
        profile_file.hash = hash_

        # update replica
        await self.background_job_ops.create_replica_jobs(
            org_id, profile_file, str(profileid), "profile"
        )

        # update stats
        await self.orgs.inc_org_bytes_stored(org_id, size - prev_file_size, "profile")

        return True

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

        profiles = await self.crawlconfigs.mark_profiles_in_use(profiles, org)

        return profiles, total

    async def get_profile(self, profileid: UUID, org: Organization) -> Profile:
        """get profile by id and org"""
        query: dict[str, object] = {"_id": profileid, "oid": org.id}

        res = await self.profiles.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="profile_not_found")

        profile = Profile.from_dict(res)
        profile.inUse = await self.crawlconfigs.is_profile_in_use(profileid, org)
        return profile

    async def get_profile_filename_and_proxy(
        self, profileid: Optional[UUID], org: Organization
    ) -> tuple[str, str]:
        """return profile path filename (relative path) for given profile id and org"""
        if not profileid:
            return "", ""

        try:
            profile = await self.get_profile(profileid, org)
            storage_path = profile.resource.filename if profile.resource else ""
            storage_path = storage_path.lstrip(f"{org.id}/")
            return storage_path, profile.proxyId or ""
        # pylint: disable=bare-except
        except:
            pass

        return "", ""

    async def get_profile_name(self, profileid: UUID, org: Organization) -> str:
        """return profile for given profile id and org"""
        try:
            profile = await self.get_profile(profileid, org)
            return profile.name
        # pylint: disable=bare-except
        except:
            pass

        return ""

    async def delete_profile(
        self, profileid: UUID, org: Organization
    ) -> dict[str, Any]:
        """delete profile, if not used in active crawlconfig"""
        profile = await self.get_profile(profileid, org)

        if profile.inUse:
            raise HTTPException(status_code=400, detail="profile_in_use")

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
        post_data: Optional[dict[str, Any]] = None,
        committing="",
    ) -> dict[str, Any]:
        """make request to browser api to get state"""
        await self.crawl_manager.keep_alive_profile_browser(
            browserid, committing=committing
        )

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method,
                    f"http://browser-{browserid}.browser{self.browser_fqdn_suffix}:9223{path}",
                    json=post_data,
                ) as resp:
                    data = await resp.json()

        except Exception as e:
            print(e)
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=200, detail="waiting_for_browser")

        return data or {}

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

    def _run_task(self, func) -> None:
        """add bg tasks to set to avoid premature garbage collection"""
        task = asyncio.create_task(func)
        self.bg_tasks.add(task)
        task.add_done_callback(self.bg_tasks.discard)


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
        browserid: str, org: Organization
    ) -> ProfileBrowserMetadata:
        # if await ops.redis.hget(f"br:{browserid}", "org") != str(org.id):
        metadata = None
        try:
            metadata = await crawl_manager.get_profile_browser_metadata(browserid)
        # pylint: disable=raise-missing-from
        except Exception as e:
            print(e)
            raise HTTPException(status_code=400, detail="invalid_profile_browser")

        if metadata.oid != str(org.id):
            raise HTTPException(status_code=404, detail="no_such_browser")

        return metadata

    async def browser_metadata_dep(
        browserid: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await browser_get_metadata(browserid, org)

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

        return await ops.commit_to_profile(
            browser_commit=browser_commit, org=org, user=user, metadata=metadata
        )

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
            profile = await ops.get_profile(profileid, org)
            await ops.commit_to_profile(
                browser_commit=ProfileCreate(
                    browserid=browser_commit.browserid,
                    name=browser_commit.name,
                    description=browser_commit.description or profile.description,
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
    async def ping_profile_browser(
        metadata: ProfileBrowserMetadata = Depends(browser_metadata_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.ping_profile_browser(metadata, org)

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
