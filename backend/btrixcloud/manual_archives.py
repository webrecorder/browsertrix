""" Manual Archiving Session Management """

from typing import Optional
from datetime import datetime
import uuid
import os

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import UUID4
import aiohttp

from .basecrawls import BaseCrawlOps
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    ManualArchive,
    SessionCreateUpdate,
    PaginatedResponse,
    UrlIn,
    BrowserId,
    Organization,
    User,
    DeleteCrawlList,
    CrawlFile,
    CrawlOut,
    CrawlOutWithResources,
)
from .utils import from_k8s_date


BROWSER_EXPIRE = 300


# ============================================================================
class ManualArchivingOps(BaseCrawlOps):
    """Manual archiving session management"""

    # pylint: disable=duplicate-code

    def __init__(self, mdb, users, crawl_configs, crawl_manager):
        super().__init__(mdb, users, crawl_configs, crawl_manager)

        self.browser_fqdn_suffix = os.environ.get("CRAWLER_FQDN_SUFFIX")

        self.router = APIRouter(
            prefix="/manual-archives",
            tags=["manual-archives"],
            responses={404: {"description": "Not found"}},
        )

        self.shared_session_storage = os.environ.get("SHARED_MANUAL_ARCHIVING_STORAGE")

    async def create_new_browser(self, org: Organization, user: User, launch: UrlIn):
        """Create new manual archiving browser"""
        if self.shared_session_storage:
            storage_name = self.shared_session_storage
            storage = None
        elif org.storage and org.storage.type == "default":
            storage_name = None
            storage = org.storage
        else:
            storage_name = str(org.id)
            storage = None

        browserid = await self.crawl_manager.run_manual_archiving_browser(
            str(user.id),
            str(org.id),
            url=launch.url,
            storage=storage,
            storage_name=storage_name,
        )

        if not browserid:
            raise HTTPException(status_code=400, detail="browser_not_created")

        return BrowserId(browserid=browserid)

    async def get_browser_url(self, browserid, oid, headers):
        """get browser url"""
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

    async def get_manual_archive(
        self, crawl_id: uuid.UUID, org: Optional[Organization] = None
    ):
        """get manual crawl by id and org"""
        query = {"_id": crawl_id}
        if org:
            query["oid"] = org.id

        res = await self.crawls.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        del res["files"]

        return CrawlOut.from_dict(res)

    async def delete_manual_archives(
        self, delete_list: DeleteCrawlList, org: Optional[Organization] = None
    ):
        """delete manual archive BaseCrawl"""
        deleted_count, _, _ = await self.delete_crawls(org, delete_list, "manual")

        if deleted_count < 1:
            raise HTTPException(status_code=404, detail="manual_archive_not_found")

        return {"success": True}

    async def ping_browser(self, browserid):
        """ping browser to keep it running"""
        await self.crawl_manager.ping_manual_archiving_browser(browserid)

        json = await self._send_browser_req(browserid, "/ping")

        return {"success": True, "origins": json.get("origins") or []}

    async def navigate_browser(self, browserid, urlin: UrlIn):
        """send request to navigate browser to url"""
        await self._send_browser_req(browserid, "/navigate", "POST", json=urlin.dict())

        return {"success": True}

    async def commit_to_crawl(
        self, browser_commit: SessionCreateUpdate, metadata: dict
    ):
        """commit manual archiving session to BaseCrawl and shutdown profile browser"""

        manual_archive_id = uuid.uuid4()

        filename_data = {"filename": f"manual-{manual_archive_id}.wacz"}
        if browser_commit.wacz_filename_base:
            filename_data[
                "filename"
            ] = f"{browser_commit.wacz_filename_base}-{manual_archive_id}.wacz"

        json = await self._send_browser_req(
            browser_commit.browserid,
            "/createManualArchiveJS",
            "POST",
            json=filename_data,
        )

        try:
            resource = json["resource"]
        except:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="browser_not_valid")

        await self.crawl_manager.delete_manual_archiving_browser(
            browser_commit.browserid
        )

        manual_archive_file = CrawlFile(
            hash=resource["hash"],
            size=resource["bytes"],
            filename=resource["path"],
        )

        manual_archive = ManualArchive(
            id=manual_archive_id,
            name=browser_commit.name,
            notes=browser_commit.notes,
            files=[manual_archive_file],
            userid=uuid.UUID(metadata.get("btrix.user")),
            oid=uuid.UUID(metadata.get("btrix.org")),
            started=from_k8s_date(metadata.get("started")),
            finished=datetime.utcnow().replace(microsecond=0, tzinfo=None),
            state="complete",
        )

        await self.crawls.find_one_and_update(
            {"_id": manual_archive.id}, {"$set": manual_archive.to_dict()}, upsert=True
        )

        return {"added": True, "id": str(manual_archive.id)}

    async def delete_browser(self, browserid):
        """delete manual archiving browser immediately"""
        if not await self.crawl_manager.delete_manual_archiving_browser(browserid):
            raise HTTPException(status_code=404, detail="browser_not_found")

        return {"success": True}

    async def _send_browser_req(self, browserid, path, method="GET", json=None):
        """make request to browser api to get state"""
        browser_host = f"manualbrowser-{browserid}-0.manualbrowser-{browserid}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method,
                    f"http://{browser_host}{self.browser_fqdn_suffix}:9223{path}",
                    json=json,
                ) as resp:
                    json = await resp.json()

        except Exception:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=200, detail="waiting_for_browser")

        return json


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments,duplicate-code
def init_manual_archives_api(
    app, mdb, user_manager, crawl_manager, crawl_configs, org_ops, user_dep
):
    """init profile ops system"""
    ops = ManualArchivingOps(mdb, user_manager, crawl_configs, crawl_manager)

    router = ops.router

    org_viewer_dep = org_ops.org_viewer_dep
    org_crawl_dep = org_ops.org_crawl_dep

    async def browser_get_metadata(
        browserid: str, org: Organization = Depends(org_viewer_dep)
    ):
        # if await ops.redis.hget(f"br:{browserid}", "org") != str(org.id):
        metadata = await crawl_manager.get_manual_archiving_browser_metadata(browserid)
        if metadata.get("btrix.org") != str(org.id):
            raise HTTPException(status_code=404, detail="no_such_browser")

        return metadata

    async def browser_dep(browserid: str, org: Organization = Depends(org_viewer_dep)):
        await browser_get_metadata(browserid, org)
        return browserid

    @router.get("", response_model=PaginatedResponse)
    async def list_manual_archives(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID4] = None,
        name: Optional[str] = None,
        notes: Optional[str] = None,
        collectionId: Optional[UUID4] = None,
        sortBy: Optional[str] = "finished",
        sortDirection: Optional[int] = -1,
    ):
        archives, total = await ops.list_all_base_crawls(
            org,
            userid=userid,
            name=name,
            notes=notes,
            page_size=pageSize,
            page=page,
            collection_id=collectionId,
            sort_by=sortBy,
            sort_direction=sortDirection,
            type_="manual",
            cls_type=CrawlOut,
        )
        return paginated_format(archives, total, page, pageSize)

    @router.post("", tags=["manual-archives"])
    async def commit_browser_to_new(
        browser_commit: SessionCreateUpdate,
        org: Organization = Depends(org_crawl_dep),
    ):
        metadata = await browser_get_metadata(browser_commit.browserid, org)

        return await ops.commit_to_crawl(browser_commit, metadata)

    @router.get(
        "/{crawl_id}",
        tags=["manual-archives"],
        response_model=CrawlOut,
    )
    async def get_manual_archive(
        crawl_id: str, org: Organization = Depends(org_viewer_dep)
    ):
        res = await ops.get_manual_archive(crawl_id, org)
        return CrawlOut.from_dict(res)

    @app.get(
        "/orgs/all/manual-archives/{crawl_id}/replay.json",
        tags=["manual-archives"],
        response_model=CrawlOutWithResources,
    )
    async def get_manual_archive_replay_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl(crawl_id, None, "manual")

    @router.get(
        "/{crawl_id}/replay.json",
        tags=["manual-archives"],
        response_model=CrawlOutWithResources,
    )
    async def get_manual_archive_replay(
        crawl_id, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_crawl(crawl_id, org, "manual")

    @router.post("/delete", tags=["manual-archives"])
    async def delete_manual_archives(
        delete_list: DeleteCrawlList,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_manual_archives(delete_list, org)

    @router.post("/browser", tags=["manual-archives"], response_model=BrowserId)
    async def create_new(
        launch: UrlIn,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.create_new_browser(org, user, launch)

    @router.post("/browser/{browserid}/ping", tags=["manual-archives"])
    async def ping_browser(browserid: str = Depends(browser_dep)):
        return await ops.ping_browser(browserid)

    @router.post("/browser/{browserid}/navigate", tags=["manual-archives"])
    async def navigate_browser(urlin: UrlIn, browserid: str = Depends(browser_dep)):
        return await ops.navigate_browser(browserid, urlin)

    @router.get("/browser/{browserid}", tags=["manual-archives"])
    async def get_browser_url(
        request: Request,
        browserid: str = Depends(browser_dep),
        org: Organization = Depends(org_viewer_dep),
    ):
        return await ops.get_browser_url(browserid, str(org.id), request.headers)

    # pylint: disable=unused-argument
    @router.get("/browser/{browserid}/access", tags=["manual-archives"])
    async def access_check(browserid: str = Depends(browser_dep)):
        return {}

    @router.delete("/browser/{browserid}", tags=["manual-archives"])
    async def delete_browser(
        browserid: str = Depends(browser_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_browser(browserid)

    org_ops.router.include_router(router)

    return ops
