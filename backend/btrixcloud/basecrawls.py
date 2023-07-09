""" base crawl type """

import asyncio
import uuid
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List

from pydantic import BaseModel, UUID4
from fastapi import HTTPException, Depends
from .db import BaseMongoModel
from .orgs import Organization
from .pagination import PaginatedResponseModel, paginated_format, DEFAULT_PAGE_SIZE
from .storages import get_presigned_url, delete_crawl_file_object
from .users import User
from .utils import dt_now


# ============================================================================
class CrawlFile(BaseModel):
    """file from a crawl"""

    filename: str
    hash: str
    size: int
    def_storage_name: Optional[str]

    presignedUrl: Optional[str]
    expireAt: Optional[datetime]


# ============================================================================
class CrawlFileOut(BaseModel):
    """output for file from a crawl (conformance to Data Resource Spec)"""

    name: str
    path: str
    hash: str
    size: int
    crawlId: Optional[str]


# ============================================================================
class BaseCrawl(BaseMongoModel):
    """Base Crawl object (representing crawls, uploads and manual sessions)"""

    id: str

    userid: UUID4
    oid: UUID4

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, int]]

    files: Optional[List[CrawlFile]] = []

    notes: Optional[str]

    errors: Optional[List[str]] = []

    collections: Optional[List[UUID4]] = []

    fileSize: int = 0
    fileCount: int = 0


# ============================================================================
class BaseCrawlOut(BaseMongoModel):
    """Base crawl output model"""

    # pylint: disable=duplicate-code

    type: Optional[str]

    id: str

    userid: UUID4
    oid: UUID4

    userName: Optional[str]

    name: Optional[str]
    description: Optional[str]

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, int]]

    fileSize: int = 0
    fileCount: int = 0

    tags: Optional[List[str]] = []

    notes: Optional[str]

    errors: Optional[List[str]]

    collections: Optional[List[UUID4]] = []


# ============================================================================
class BaseCrawlOutWithResources(BaseCrawlOut):
    """includes resources"""

    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class UpdateCrawl(BaseModel):
    """Update crawl"""

    tags: Optional[List[str]] = []
    notes: Optional[str]


# ============================================================================
class DeleteCrawlList(BaseModel):
    """delete crawl list POST body"""

    crawl_ids: List[str]


# ============================================================================
class BaseCrawlOps:
    """operations that apply to all crawls"""

    # pylint: disable=duplicate-code, too-many-arguments, too-many-locals

    def __init__(self, mdb, users, crawl_manager):
        self.crawls = mdb["crawls"]
        self.crawl_manager = crawl_manager
        self.user_manager = users

        self.presign_duration_seconds = (
            int(os.environ.get("PRESIGN_DURATION_MINUTES", 60)) * 60
        )

    async def get_crawl_raw(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
        type_: Optional[str] = None,
    ):
        """Get data for single crawl"""

        query = {"_id": crawlid}
        if org:
            query["oid"] = org.id

        if type_:
            query["type"] = type_

        res = await self.crawls.find_one(query)

        if not res:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawlid}")

        return res

    async def get_crawl(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
        type_: Optional[str] = None,
    ):
        """Get data for single base crawl"""

        res = await self.get_crawl_raw(crawlid, org, type_)

        if res.get("files"):
            files = [CrawlFile(**data) for data in res["files"]]

            del res["files"]

            res["resources"] = await self._resolve_signed_urls(files, org, crawlid)

        del res["errors"]

        crawl = BaseCrawlOutWithResources.from_dict(res)

        user = await self.user_manager.get(crawl.userid)
        if user:
            # pylint: disable=invalid-name
            crawl.userName = user.name

        return crawl

    async def get_resource_resolved_raw_crawl(
        self, crawlid: str, org: Organization, type_=None
    ):
        """return single base crawl with resources resolved"""
        res = await self.get_crawl_raw(crawlid=crawlid, type_=type_, org=org)
        files = [CrawlFile(**data) for data in res["files"]]
        res["resources"] = await self._resolve_signed_urls(files, org, res["_id"])
        return res

    async def update_crawl(
        self, crawl_id: str, org: Organization, update: UpdateCrawl, type_=None
    ):
        """Update existing crawl (tags and notes only for now)"""
        update_values = update.dict(exclude_unset=True)
        if len(update_values) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        query = {"_id": crawl_id, "oid": org.id}
        if type_:
            query["type"] = type_

        # update in db
        result = await self.crawls.find_one_and_update(
            query,
            {"$set": update_values},
        )

        if not result:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return {"updated": True}

    async def delete_crawls(
        self, org: Organization, delete_list: DeleteCrawlList, type_=None
    ):
        """Delete a list of crawls by id for given org"""
        cids_to_update = set()

        size = 0

        for crawl_id in delete_list.crawl_ids:
            crawl = await self.get_crawl_raw(crawl_id, org)
            size += await self._delete_crawl_files(crawl, org)
            if crawl.get("cid"):
                cids_to_update.add(crawl.get("cid"))

        query = {"_id": {"$in": delete_list.crawl_ids}, "oid": org.id}
        if type_:
            query["type"] = type_

        res = await self.crawls.delete_many(query)

        return res.deleted_count, size, cids_to_update

    async def _delete_crawl_files(self, crawl, org: Organization):
        """Delete files associated with crawl from storage."""
        crawl = BaseCrawl.from_dict(crawl)
        size = 0
        for file_ in crawl.files:
            size += file_.size
            status_code = await delete_crawl_file_object(org, file_, self.crawl_manager)
            if status_code != 204:
                raise HTTPException(status_code=400, detail="file_deletion_error")

        return size

    async def _resolve_signed_urls(
        self, files: List[CrawlFile], org: Organization, crawl_id: Optional[str] = None
    ):
        if not files:
            print("no files")
            return

        delta = timedelta(seconds=self.presign_duration_seconds)

        updates = []
        out_files = []

        for file_ in files:
            presigned_url = file_.presignedUrl
            now = dt_now()

            if not presigned_url or now >= file_.expireAt:
                exp = now + delta
                presigned_url = await get_presigned_url(
                    org, file_, self.crawl_manager, self.presign_duration_seconds
                )
                updates.append(
                    (
                        {"files.filename": file_.filename},
                        {
                            "$set": {
                                "files.$.presignedUrl": presigned_url,
                                "files.$.expireAt": exp,
                            }
                        },
                    )
                )

            out_files.append(
                CrawlFileOut(
                    name=file_.filename,
                    path=presigned_url,
                    hash=file_.hash,
                    size=file_.size,
                    crawlId=crawl_id,
                )
            )

        if updates:
            asyncio.create_task(self._update_presigned(updates))

        # print("presigned", out_files)

        return out_files

    async def _update_presigned(self, updates):
        for update in updates:
            await self.crawls.find_one_and_update(*update)

    async def add_to_collection(
        self, crawl_ids: List[uuid.UUID], collection_id: uuid.UUID, org: Organization
    ):
        """Add crawls to collection."""
        for crawl_id in crawl_ids:
            crawl_raw = await self.get_crawl_raw(crawl_id, org)
            crawl_collections = crawl_raw.get("collections")
            if crawl_collections and crawl_id in crawl_collections:
                raise HTTPException(
                    status_code=400, detail="crawl_already_in_collection"
                )

            await self.crawls.find_one_and_update(
                {"_id": crawl_id},
                {"$push": {"collections": collection_id}},
            )

    async def remove_from_collection(
        self, crawl_ids: List[uuid.UUID], collection_id: uuid.UUID
    ):
        """Remove crawls from collection."""
        for crawl_id in crawl_ids:
            await self.crawls.find_one_and_update(
                {"_id": crawl_id},
                {"$pull": {"collections": collection_id}},
            )

    async def remove_collection_from_all_crawls(self, collection_id: uuid.UUID):
        """Remove collection id from all crawls it's currently in."""
        await self.crawls.update_many(
            {"collections": collection_id},
            {"$pull": {"collections": collection_id}},
        )

    # pylint: disable=too-many-branches
    async def list_all_base_crawls(
        self,
        org: Optional[Organization] = None,
        userid: uuid.UUID = None,
        name: str = None,
        description: str = None,
        collection_id: str = None,
        states: Optional[List[str]] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = None,
        sort_direction: int = -1,
        cls_type: type[BaseCrawlOut] = BaseCrawlOut,
        type_=None,
    ):
        """List crawls of all types from the db"""
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        oid = org.id if org else None

        query = {}
        if type_:
            query["type"] = type_
        if oid:
            query["oid"] = oid

        if userid:
            query["userid"] = userid

        if states:
            # validated_states = [value for value in state if value in ALL_CRAWL_STATES]
            query["state"] = {"$in": states}

        aggregate = [{"$match": query}]

        if name:
            aggregate.extend([{"$match": {"name": name}}])

        if description:
            aggregate.extend([{"$match": {"description": description}}])

        if collection_id:
            aggregate.extend([{"$match": {"collections": {"$in": [collection_id]}}}])

        if sort_by:
            if sort_by not in ("started", "finished"):
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        aggregate.extend(
            [
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "userid",
                        "foreignField": "id",
                        "as": "userName",
                    },
                },
                {"$set": {"userName": {"$arrayElemAt": ["$userName.name", 0]}}},
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

        # Get total
        cursor = self.crawls.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        crawls = []
        for res in items:
            files = None
            if res.get("files"):
                files = [CrawlFile(**data) for data in res["files"]]
                del res["files"]

            crawl = cls_type.from_dict(res)
            if hasattr(crawl, "resources"):
                # pylint: disable=attribute-defined-outside-init
                crawl.resources = await self._resolve_signed_urls(files, org, crawl.id)

            crawls.append(crawl)

        return crawls, total

    async def delete_crawls_all_types(
        self, delete_list: DeleteCrawlList, org: Optional[Organization] = None
    ):
        """Delete uploaded crawls"""
        deleted_count, _, _ = await self.delete_crawls(org, delete_list)

        if deleted_count < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return {"deleted": True}


# ============================================================================
def init_base_crawls_api(app, mdb, users, crawl_manager, orgs, user_dep):
    """base crawls api"""
    # pylint: disable=invalid-name, duplicate-code, too-many-arguments

    ops = BaseCrawlOps(mdb, users, crawl_manager)

    org_viewer_dep = orgs.org_viewer_dep
    org_crawl_dep = orgs.org_crawl_dep

    @app.get(
        "/orgs/{oid}/all-crawls",
        tags=["all-crawls"],
        response_model=PaginatedResponseModel,
    )
    async def list_all_base_crawls(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID4] = None,
        name: Optional[str] = None,
        state: Optional[str] = None,
        description: Optional[str] = None,
        collectionId: Optional[UUID4] = None,
        sortBy: Optional[str] = "finished",
        sortDirection: Optional[int] = -1,
    ):
        states = state.split(",") if state else None
        crawls, total = await ops.list_all_base_crawls(
            org,
            userid=userid,
            name=name,
            description=description,
            collection_id=collectionId,
            states=states,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/all-crawls/{crawlid}",
        tags=["all-crawls"],
        response_model=BaseCrawlOutWithResources,
    )
    async def get_base_crawl(crawlid: str, org: Organization = Depends(org_crawl_dep)):
        res = await ops.get_resource_resolved_raw_crawl(crawlid, org)
        return BaseCrawlOutWithResources.from_dict(res)

    @app.get(
        "/orgs/all/all-crawls/{crawl_id}/replay.json",
        tags=["all-crawls"],
        response_model=BaseCrawlOutWithResources,
    )
    async def get_base_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl(crawl_id, None)

    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}/replay.json",
        tags=["all-crawls"],
        response_model=BaseCrawlOutWithResources,
    )
    async def get_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl(crawl_id, org)

    @app.post("/orgs/{oid}/all-crawls/delete", tags=["all-crawls"])
    async def delete_crawls_all_types(
        delete_list: DeleteCrawlList,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_crawls_all_types(delete_list, org)
