""" base crawl type """

import asyncio
import uuid
import os
from datetime import timedelta
from typing import Optional, List, Union
import urllib.parse
import contextlib

from pydantic import UUID4
from fastapi import HTTPException, Depends
from redis import exceptions

from .models import (
    CrawlFile,
    CrawlFileOut,
    BaseCrawl,
    CrawlOut,
    CrawlOutWithResources,
    UpdateCrawl,
    DeleteCrawlList,
    Organization,
    PaginatedResponse,
    User,
)
from .pagination import paginated_format, DEFAULT_PAGE_SIZE
from .storages import get_presigned_url, delete_crawl_file_object
from .utils import dt_now, get_redis_crawl_stats


RUNNING_STATES = ("running", "pending-wait", "generate-wacz", "uploading-wacz")

STARTING_STATES = ("starting", "waiting_capacity", "waiting_org_limit")

FAILED_STATES = ("canceled", "failed")

SUCCESSFUL_STATES = ("complete", "partial_complete")

RUNNING_AND_STARTING_STATES = (*STARTING_STATES, *RUNNING_STATES)

RUNNING_AND_STARTING_ONLY = ("starting", *RUNNING_STATES)

NON_RUNNING_STATES = (*FAILED_STATES, *SUCCESSFUL_STATES)

ALL_CRAWL_STATES = (*RUNNING_AND_STARTING_STATES, *NON_RUNNING_STATES)


# ============================================================================
class BaseCrawlOps:
    """operations that apply to all crawls"""

    # pylint: disable=duplicate-code, too-many-arguments, too-many-locals

    def __init__(self, mdb, users, crawl_configs, crawl_manager):
        self.crawls = mdb["crawls"]
        self.crawl_configs = crawl_configs
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

    async def _files_to_resources(self, files, org, crawlid):
        if files:
            crawl_files = [CrawlFile(**data) for data in files]

            return await self._resolve_signed_urls(crawl_files, org, crawlid)

    async def get_crawl(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
        type_: Optional[str] = None,
        cls_type: Union[CrawlOut, CrawlOutWithResources] = CrawlOutWithResources,
    ):
        """Get data for single base crawl"""
        res = await self.get_crawl_raw(crawlid, org, type_)

        if cls_type == CrawlOutWithResources:
            res["resources"] = await self._files_to_resources(
                res.get("files"), org, crawlid
            )

        del res["files"]
        del res["errors"]

        crawl = cls_type.from_dict(res)

        if crawl.type == "crawl":
            crawl = await self._resolve_crawl_refs(crawl, org)

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
        res["resources"] = await self._files_to_resources(
            res.get("files"), org, res["_id"]
        )
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
            if not await delete_crawl_file_object(org, file_, self.crawl_manager):
                raise HTTPException(status_code=400, detail="file_deletion_error")

        return size

    async def _resolve_crawl_refs(
        self,
        crawl: Union[CrawlOut, CrawlOutWithResources],
        org: Optional[Organization],
        add_first_seed: bool = True,
        files: Optional[list[dict]] = None,
    ):
        """Resolve running crawl data"""
        # pylint: disable=too-many-branches
        config = await self.crawl_configs.get_crawl_config(
            crawl.cid, org, active_only=False
        )
        if config and config.config.seeds:
            if add_first_seed:
                first_seed = config.config.seeds[0]
                crawl.firstSeed = first_seed.url
            crawl.seedCount = len(config.config.seeds)

        if hasattr(crawl, "profileid") and crawl.profileid:
            crawl.profileName = await self.crawl_configs.profiles.get_profile_name(
                crawl.profileid, org
            )

        user = await self.user_manager.get(crawl.userid)
        if user:
            crawl.userName = user.name

        # if running, get stats directly from redis
        # more responsive, saves db update in operator
        if crawl.state in RUNNING_STATES:
            try:
                async with self.get_redis(crawl.id) as redis:
                    crawl.stats = await get_redis_crawl_stats(redis, crawl.id)
            # redis not available, ignore
            except exceptions.ConnectionError:
                pass

        if files and crawl.state in SUCCESSFUL_STATES:
            crawl.resources = await self._files_to_resources(files, org, crawl.id)

        return crawl

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

    @contextlib.asynccontextmanager
    async def get_redis(self, crawl_id):
        """get redis url for crawl id"""
        redis_url = self.crawl_manager.get_redis_url(crawl_id)

        redis = await self.crawl_manager.get_redis_client(redis_url)

        try:
            yield redis
        finally:
            await redis.close()

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

    # pylint: disable=too-many-branches, invalid-name
    async def list_all_base_crawls(
        self,
        org: Optional[Organization] = None,
        userid: uuid.UUID = None,
        name: str = None,
        description: str = None,
        collection_id: str = None,
        states: Optional[List[str]] = None,
        first_seed: Optional[str] = None,
        type_: Optional[str] = None,
        cid: Optional[UUID4] = None,
        cls_type: Union[CrawlOut, CrawlOutWithResources] = CrawlOut,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = None,
        sort_direction: int = -1,
    ):
        """List crawls of all types from the db"""
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        oid = org.id if org else None

        resources = False
        if cls_type == CrawlOutWithResources:
            resources = True

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

        if cid:
            query["cid"] = cid

        aggregate = [
            {"$match": query},
            {"$set": {"firstSeedObject": {"$arrayElemAt": ["$config.seeds", 0]}}},
            {"$set": {"firstSeed": "$firstSeedObject.url"}},
            {"$unset": ["firstSeedObject", "errors"]},
        ]

        if not resources:
            aggregate.extend([{"$unset": ["files"]}])

        if name:
            aggregate.extend([{"$match": {"name": name}}])

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if description:
            aggregate.extend([{"$match": {"description": description}}])

        if collection_id:
            aggregate.extend([{"$match": {"collections": {"$in": [collection_id]}}}])

        if sort_by:
            if sort_by not in ("started", "finished", "fileSize"):
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
            crawl = cls_type.from_dict(res)

            if resources or crawl.type == "crawl":
                # pass files only if we want to include resolved resources
                files = res.get("files") if resources else None
                crawl = await self._resolve_crawl_refs(crawl, org, files=files)

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

    async def get_all_crawl_search_values(
        self, org: Organization, type_: Optional[str] = None
    ):
        """List unique names, first seeds, and descriptions from all captures in org"""
        match_query = {"oid": org.id}
        if type_:
            match_query["type"] = type_

        names = await self.crawls.distinct("name", match_query)
        descriptions = await self.crawls.distinct("description", match_query)
        cids = (
            await self.crawls.distinct("cid", match_query)
            if not type_ or type_ == "crawl"
            else []
        )

        # Remove empty strings
        names = [name for name in names if name]
        descriptions = [description for description in descriptions if description]

        first_seeds = set()
        for cid in cids:
            if not cid:
                continue
            config = await self.crawl_configs.get_crawl_config(cid, org)
            first_seed = config.config.seeds[0]
            first_seeds.add(first_seed.url)

        return {
            "names": names,
            "descriptions": descriptions,
            "firstSeeds": list(first_seeds),
        }


# ============================================================================
def init_base_crawls_api(
    app, mdb, users, crawl_manager, crawl_config_ops, orgs, user_dep
):
    """base crawls api"""
    # pylint: disable=invalid-name, duplicate-code, too-many-arguments, too-many-locals

    ops = BaseCrawlOps(mdb, users, crawl_config_ops, crawl_manager)

    org_viewer_dep = orgs.org_viewer_dep
    org_crawl_dep = orgs.org_crawl_dep

    @app.get(
        "/orgs/{oid}/all-crawls",
        tags=["all-crawls"],
        response_model=PaginatedResponse,
    )
    async def list_all_base_crawls(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID4] = None,
        name: Optional[str] = None,
        state: Optional[str] = None,
        firstSeed: Optional[str] = None,
        description: Optional[str] = None,
        collectionId: Optional[UUID4] = None,
        crawlType: Optional[str] = None,
        cid: Optional[UUID4] = None,
        sortBy: Optional[str] = "finished",
        sortDirection: Optional[int] = -1,
    ):
        states = state.split(",") if state else None

        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        if crawlType and crawlType not in ("crawl", "upload"):
            raise HTTPException(status_code=400, detail="invalid_crawl_type")

        crawls, total = await ops.list_all_base_crawls(
            org,
            userid=userid,
            name=name,
            description=description,
            collection_id=collectionId,
            states=states,
            first_seed=firstSeed,
            type_=crawlType,
            cid=cid,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.get("/orgs/{oid}/all-crawls/search-values", tags=["all-crawls"])
    async def get_all_crawls_search_values(
        org: Organization = Depends(org_viewer_dep),
        crawlType: Optional[str] = None,
    ):
        if crawlType and crawlType not in ("crawl", "upload"):
            raise HTTPException(status_code=400, detail="invalid_crawl_type")

        return await ops.get_all_crawl_search_values(org, type_=crawlType)

    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}",
        tags=["all-crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_base_crawl(crawl_id: str, org: Organization = Depends(org_crawl_dep)):
        return await ops.get_crawl(crawl_id, org)

    @app.get(
        "/orgs/all/all-crawls/{crawl_id}/replay.json",
        tags=["all-crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_base_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl(crawl_id, None)

    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}/replay.json",
        tags=["all-crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl(crawl_id, org)

    @app.post("/orgs/{oid}/all-crawls/delete", tags=["all-crawls"])
    async def delete_crawls_all_types(
        delete_list: DeleteCrawlList,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_crawls_all_types(delete_list, org)
