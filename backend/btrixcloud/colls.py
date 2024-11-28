"""
Collections API
"""

from collections import Counter
from uuid import UUID, uuid4
from typing import Optional, List, TYPE_CHECKING, cast, Dict, Tuple, Any
import os

import asyncio
import pymongo
from fastapi import Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from starlette.requests import Request

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    Collection,
    CollIn,
    CollOut,
    CollIdName,
    UpdateColl,
    AddRemoveCrawlList,
    BaseCrawl,
    CrawlOutWithResources,
    CrawlFileOut,
    Organization,
    PaginatedCollOutResponse,
    SUCCESSFUL_STATES,
    AddedResponseIdName,
    EmptyResponse,
    UpdatedResponse,
    SuccessResponse,
    AddedResponse,
    CollectionSearchValuesResponse,
    OrgPublicCollections,
    PublicOrgDetails,
    CollAccessType,
    PageUrlCount,
    PageIdTimestamp,
    PaginatedPageUrlCountResponse,
    UpdateCollHomeUrl,
    User,
    ImageFile,
    ImageFilePreparer,
    MIN_UPLOAD_PART_SIZE,
)
from .utils import dt_now

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .storages import StorageOps
    from .webhooks import EventWebhookOps
    from .crawls import CrawlOps
else:
    OrgOps = StorageOps = EventWebhookOps = CrawlOps = object


# ============================================================================
class CollectionOps:
    """ops for working with named collections of crawls"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods

    orgs: OrgOps
    storage_ops: StorageOps
    event_webhook_ops: EventWebhookOps
    crawl_ops: CrawlOps

    def __init__(self, mdb, storage_ops, orgs, event_webhook_ops):
        self.collections = mdb["collections"]
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]
        self.pages = mdb["pages"]
        self.crawl_ops = cast(CrawlOps, None)

        self.orgs = orgs
        self.storage_ops = storage_ops
        self.event_webhook_ops = event_webhook_ops

    def set_crawl_ops(self, ops):
        """set crawl ops"""
        self.crawl_ops = ops

    def set_page_ops(self, ops):
        """set page ops"""
        # pylint: disable=attribute-defined-outside-init
        self.page_ops = ops

    async def init_index(self):
        """init lookup index"""
        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], unique=True
        )

        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("description", pymongo.ASCENDING)]
        )

    async def add_collection(self, oid: UUID, coll_in: CollIn):
        """Add new collection"""
        crawl_ids = coll_in.crawlIds if coll_in.crawlIds else []
        coll_id = uuid4()
        modified = dt_now()

        coll = Collection(
            id=coll_id,
            oid=oid,
            name=coll_in.name,
            description=coll_in.description,
            modified=modified,
            access=coll_in.access,
        )
        try:
            await self.collections.insert_one(coll.to_dict())
            org = await self.orgs.get_org_by_id(oid)
            if crawl_ids:
                await self.crawl_ops.add_to_collection(crawl_ids, coll_id, org)
                await self.update_collection_counts_and_tags(coll_id)
                asyncio.create_task(
                    self.event_webhook_ops.create_added_to_collection_notification(
                        crawl_ids, coll_id, org
                    )
                )

            return {"added": True, "id": coll_id, "name": coll.name}
        except pymongo.errors.DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="collection_name_taken")

    async def update_collection(
        self, coll_id: UUID, org: Organization, update: UpdateColl
    ):
        """Update collection"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        query["modified"] = dt_now()

        try:
            result = await self.collections.find_one_and_update(
                {"_id": coll_id, "oid": org.id},
                {"$set": query},
                return_document=pymongo.ReturnDocument.AFTER,
            )
        except pymongo.errors.DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="collection_name_taken")

        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return {"updated": True}

    async def add_crawls_to_collection(
        self, coll_id: UUID, crawl_ids: List[str], org: Organization
    ) -> CollOut:
        """Add crawls to collection"""
        await self.crawl_ops.add_to_collection(crawl_ids, coll_id, org)

        modified = dt_now()
        result = await self.collections.find_one_and_update(
            {"_id": coll_id},
            {"$set": {"modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        await self.update_collection_counts_and_tags(coll_id)

        asyncio.create_task(
            self.event_webhook_ops.create_added_to_collection_notification(
                crawl_ids, coll_id, org
            )
        )

        return await self.get_collection_out(coll_id, org)

    async def remove_crawls_from_collection(
        self, coll_id: UUID, crawl_ids: List[str], org: Organization
    ) -> CollOut:
        """Remove crawls from collection"""
        await self.crawl_ops.remove_from_collection(crawl_ids, coll_id)
        modified = dt_now()
        result = await self.collections.find_one_and_update(
            {"_id": coll_id},
            {"$set": {"modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        await self.update_collection_counts_and_tags(coll_id)

        asyncio.create_task(
            self.event_webhook_ops.create_removed_from_collection_notification(
                crawl_ids, coll_id, org
            )
        )

        return await self.get_collection_out(coll_id, org)

    async def get_collection_raw(
        self, coll_id: UUID, public_only: bool = False
    ) -> Dict[str, Any]:
        """Get collection by id as dict from database"""
        query: dict[str, object] = {"_id": coll_id}
        if public_only:
            query["access"] = {"$in": ["public", "unlisted"]}

        result = await self.collections.find_one(query)
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return result

    async def get_collection(
        self, coll_id: UUID, public_only: bool = False
    ) -> Collection:
        """Get collection by id"""
        result = await self.get_collection_raw(coll_id, public_only)
        return Collection.from_dict(result)

    async def get_collection_out(
        self, coll_id: UUID, org: Organization, resources=False, public_only=False
    ) -> CollOut:
        """Get CollOut by id"""
        result = await self.get_collection_raw(coll_id, public_only)

        if resources:
            result["resources"] = await self.get_collection_crawl_resources(coll_id)

        thumbnail = result.get("thumbnail")
        if thumbnail:
            image_file = ImageFile(**thumbnail)
            result["thumbnail"] = await image_file.get_image_file_out(
                org, self.storage_ops
            )

        return CollOut.from_dict(result)

    async def list_collections(
        self,
        oid: UUID,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: int = 1,
        name: Optional[str] = None,
        name_prefix: Optional[str] = None,
        access: Optional[str] = None,
    ):
        """List all collections for org"""
        # pylint: disable=too-many-locals, duplicate-code
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query: dict[str, object] = {"oid": oid}

        if name:
            match_query["name"] = name

        elif name_prefix:
            regex_pattern = f"^{name_prefix}"
            match_query["name"] = {"$regex": regex_pattern, "$options": "i"}

        if access:
            match_query["access"] = access

        aggregate = [{"$match": match_query}]

        if sort_by:
            if sort_by not in ("modified", "name", "description", "totalSize"):
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

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

        cursor = self.collections.aggregate(
            aggregate, collation=pymongo.collation.Collation(locale="en")
        )
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        collections = [CollOut.from_dict(res) for res in items]

        return collections, total

    async def get_collection_crawl_resources(self, coll_id: UUID):
        """Return pre-signed resources for all collection crawl files."""
        # Ensure collection exists
        _ = await self.get_collection_raw(coll_id)

        all_files = []

        crawls, _ = await self.crawl_ops.list_all_base_crawls(
            collection_id=coll_id,
            states=list(SUCCESSFUL_STATES),
            page_size=10_000,
            cls_type=CrawlOutWithResources,
        )

        for crawl in crawls:
            if crawl.resources:
                all_files.extend(crawl.resources)

        return all_files

    async def get_collection_names(self, uuids: List[UUID]):
        """return object of {_id, names} given list of collection ids"""
        cursor = self.collections.find(
            {"_id": {"$in": uuids}}, projection=["_id", "name"]
        )
        names = await cursor.to_list(length=1000)
        names = [
            CollIdName(id=namedata["_id"], name=namedata["name"]) for namedata in names
        ]
        return names

    async def get_collection_search_values(self, org: Organization):
        """Return list of collection names"""
        names = await self.collections.distinct("name", {"oid": org.id})
        # Remove empty strings
        names = [name for name in names if name]
        return {"names": names}

    async def get_collection_crawl_ids(self, coll_id: UUID) -> List[str]:
        """Return list of crawl ids in collection"""
        crawl_ids = []
        async for crawl_raw in self.crawls.find(
            {"collectionIds": coll_id}, projection=["_id"]
        ):
            crawl_id = crawl_raw.get("_id")
            if crawl_id:
                crawl_ids.append(crawl_id)
        return crawl_ids

    async def delete_collection(self, coll_id: UUID, org: Organization):
        """Delete collection and remove from associated crawls."""
        await self.crawl_ops.remove_collection_from_all_crawls(coll_id)

        result = await self.collections.delete_one({"_id": coll_id, "oid": org.id})
        if result.deleted_count < 1:
            raise HTTPException(status_code=404, detail="collection_not_found")

        asyncio.create_task(
            self.event_webhook_ops.create_collection_deleted_notification(coll_id, org)
        )

        return {"success": True}

    async def download_collection(self, coll_id: UUID, org: Organization):
        """Download all WACZs in collection as streaming nested WACZ"""
        coll = await self.get_collection_out(coll_id, org, resources=True)

        metadata = {
            "type": "collection",
            "id": str(coll_id),
            "title": coll.name,
            "organization": org.slug,
        }
        if coll.description:
            metadata["description"] = coll.description

        resp = await self.storage_ops.download_streaming_wacz(metadata, coll.resources)

        headers = {"Content-Disposition": f'attachment; filename="{coll.name}.wacz"'}
        return StreamingResponse(
            resp, headers=headers, media_type="application/wacz+zip"
        )

    async def update_collection_counts_and_tags(self, collection_id: UUID):
        """Set current crawl info in config when crawl begins"""
        crawl_count = 0
        page_count = 0
        total_size = 0
        tags = []

        async for crawl_raw in self.crawls.find({"collectionIds": collection_id}):
            crawl = BaseCrawl.from_dict(crawl_raw)
            if crawl.state not in SUCCESSFUL_STATES:
                continue
            crawl_count += 1
            files = crawl.files or []
            for file in files:
                total_size += file.size
            if crawl.stats:
                page_count += crawl.stats.done
            if crawl.tags:
                tags.extend(crawl.tags)

        sorted_tags = [tag for tag, count in Counter(tags).most_common()]

        await self.collections.find_one_and_update(
            {"_id": collection_id},
            {
                "$set": {
                    "crawlCount": crawl_count,
                    "pageCount": page_count,
                    "totalSize": total_size,
                    "tags": sorted_tags,
                }
            },
        )

    async def update_crawl_collections(self, crawl_id: str):
        """Update counts and tags for all collections in crawl"""
        crawl = await self.crawls.find_one({"_id": crawl_id})
        crawl_coll_ids = crawl.get("collectionIds")
        for collection_id in crawl_coll_ids:
            await self.update_collection_counts_and_tags(collection_id)

    async def add_successful_crawl_to_collections(self, crawl_id: str, cid: UUID):
        """Add successful crawl to its auto-add collections."""
        workflow = await self.crawl_configs.find_one({"_id": cid})
        auto_add_collections = workflow.get("autoAddCollections")
        if auto_add_collections:
            await self.crawls.find_one_and_update(
                {"_id": crawl_id},
                {"$set": {"collectionIds": auto_add_collections}},
            )
            await self.update_crawl_collections(crawl_id)

    async def get_org_public_collections(self, org_slug: str):
        """List public collections for org"""
        try:
            org = await self.orgs.get_org_by_slug(org_slug)
        # pylint: disable=broad-exception-caught
        except Exception:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=404, detail="public_profile_not_found")

        if not org.enablePublicProfile:
            raise HTTPException(status_code=404, detail="public_profile_not_found")

        collections, _ = await self.list_collections(
            org.id, access=CollAccessType.PUBLIC
        )

        public_org_details = PublicOrgDetails(
            name=org.name,
            description=org.publicDescription or "",
            url=org.publicUrl or "",
        )

        return OrgPublicCollections(org=public_org_details, collections=collections)

    async def list_urls_in_collection(
        self,
        coll_id: UUID,
        oid: UUID,
        url_prefix: Optional[str] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ) -> Tuple[List[PageUrlCount], int]:
        """List all URLs in collection sorted desc by snapshot count"""
        # pylint: disable=duplicate-code, too-many-locals, too-many-branches, too-many-statements
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        crawl_ids = await self.get_collection_crawl_ids(coll_id)

        match_query: dict[str, object] = {"oid": oid, "crawl_id": {"$in": crawl_ids}}

        if url_prefix:
            regex_pattern = f"^{url_prefix}"
            match_query["url"] = {"$regex": regex_pattern, "$options": "i"}

        aggregate = [{"$match": match_query}]

        aggregate.extend(
            [
                {
                    "$group": {
                        "_id": "$url",
                        "pages": {"$push": "$$ROOT"},
                        "count": {"$sum": 1},
                    },
                },
                {"$sort": {"count": -1}},
                {"$set": {"url": "$_id"}},
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
        cursor = self.pages.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        return [
            PageUrlCount(
                url=data.get("url", ""),
                count=data.get("count", 0),
                snapshots=[
                    PageIdTimestamp(
                        pageId=p["_id"], ts=p.get("ts"), status=p.get("status", 200)
                    )
                    for p in data.get("pages", [])
                ],
            )
            for data in items
        ], total

    async def set_home_url(
        self, coll_id: UUID, update: UpdateCollHomeUrl, org: Organization
    ) -> Dict[str, bool]:
        """Set home URL for collection and save thumbnail to database"""
        page = await self.page_ops.get_page(update.pageId, org.id)

        update_query = {
            "homeUrl": page.url,
            "homeUrlTs": page.ts,
            "homeUrlPageId": page.id,
        }

        await self.collections.find_one_and_update(
            {"_id": coll_id, "oid": org.id},
            {"$set": update_query},
        )

        return {"updated": True}

    async def upload_thumbnail_stream(
        self, stream, filename: str, coll_id: UUID, org: Organization, user: User
    ) -> Dict[str, bool]:
        """Upload file as stream to use as collection thumbnail"""
        coll = await self.get_collection(coll_id)

        _, extension = os.path.splitext(filename)

        image_filename = f"thumbnail-{str(coll_id)}{extension}"

        prefix = org.storage.get_storage_extra_path(str(org.id)) + "images/"

        file_prep = ImageFilePreparer(
            prefix,
            image_filename,
            original_filename=filename,
            user=user,
            created=dt_now(),
        )

        async def stream_iter():
            """iterate over each chunk and compute and digest + total size"""
            async for chunk in stream:
                file_prep.add_chunk(chunk)
                yield chunk

        print("Collection Thumbnail Stream Upload Start", flush=True)

        if not await self.storage_ops.do_upload_multipart(
            org,
            file_prep.upload_name,
            stream_iter(),
            MIN_UPLOAD_PART_SIZE,
        ):
            print("Collection Thumbnail Stream Upload Failed", flush=True)
            raise HTTPException(status_code=400, detail="upload_failed")

        print("Collection Thumbnail Stream Upload Complete", flush=True)

        thumbnail_file = file_prep.get_image_file(org.storage)

        if coll.thumbnail:
            if not await self.storage_ops.delete_crawl_file_object(org, coll.thumbnail):
                print(
                    f"Unable to delete previous collection thumbnail: {coll.thumbnail.filename}"
                )

        await self.collections.find_one_and_update(
            {"_id": coll_id, "oid": org.id},
            {"$set": {"thumbnail": dict(thumbnail_file)}},
        )

        return {"added": True}


# ============================================================================
# pylint: disable=too-many-locals
def init_collections_api(app, mdb, orgs, storage_ops, event_webhook_ops, user_dep):
    """init collections api"""
    # pylint: disable=invalid-name, unused-argument, too-many-arguments

    colls = CollectionOps(mdb, storage_ops, orgs, event_webhook_ops)

    org_crawl_dep = orgs.org_crawl_dep
    org_viewer_dep = orgs.org_viewer_dep
    org_public = orgs.org_public

    @app.post(
        "/orgs/{oid}/collections",
        tags=["collections"],
        response_model=AddedResponseIdName,
    )
    async def add_collection(
        new_coll: CollIn, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.add_collection(org.id, new_coll)

    @app.get(
        "/orgs/{oid}/collections",
        tags=["collections"],
        response_model=PaginatedCollOutResponse,
    )
    async def list_collection_all(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: int = 1,
        name: Optional[str] = None,
        namePrefix: Optional[str] = None,
        access: Optional[str] = None,
    ):
        collections, total = await colls.list_collections(
            org.id,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            name=name,
            name_prefix=namePrefix,
            access=access,
        )
        return paginated_format(collections, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/collections/$all",
        tags=["collections"],
        response_model=Dict[str, List[CrawlFileOut]],
    )
    async def get_collection_all(org: Organization = Depends(org_viewer_dep)):
        results = {}
        try:
            all_collections, _ = await colls.list_collections(org.id, page_size=10_000)
            for collection in all_collections:
                results[collection.name] = await colls.get_collection_crawl_resources(
                    collection.id
                )
        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail="Error Listing All Crawled Files: " + str(exc)
            )

        return results

    @app.get(
        "/orgs/{oid}/collections/search-values",
        tags=["collections"],
        response_model=CollectionSearchValuesResponse,
    )
    async def get_collection_search_values(
        org: Organization = Depends(org_viewer_dep),
    ):
        return await colls.get_collection_search_values(org)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}",
        tags=["collections"],
        response_model=CollOut,
    )
    async def get_collection(
        coll_id: UUID, org: Organization = Depends(org_viewer_dep)
    ):
        return await colls.get_collection_out(coll_id, org)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/replay.json",
        tags=["collections"],
        response_model=CollOut,
    )
    async def get_collection_replay(
        coll_id: UUID, org: Organization = Depends(org_viewer_dep)
    ):
        return await colls.get_collection_out(coll_id, org, resources=True)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/public/replay.json",
        tags=["collections"],
        response_model=CollOut,
    )
    async def get_collection_public_replay(
        response: Response,
        coll_id: UUID,
        org: Organization = Depends(org_public),
    ):
        coll = await colls.get_collection_out(
            coll_id, org, resources=True, public_only=True
        )
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return coll

    @app.options(
        "/orgs/{oid}/collections/{coll_id}/public/replay.json",
        tags=["collections"],
        response_model=EmptyResponse,
    )
    async def get_replay_preflight(response: Response):
        response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return {}

    @app.patch(
        "/orgs/{oid}/collections/{coll_id}",
        tags=["collections"],
        response_model=UpdatedResponse,
    )
    async def update_collection(
        coll_id: UUID,
        update: UpdateColl,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await colls.update_collection(coll_id, org, update)

    @app.post(
        "/orgs/{oid}/collections/{coll_id}/add",
        tags=["collections"],
        response_model=CollOut,
    )
    async def add_crawl_to_collection(
        crawlList: AddRemoveCrawlList,
        coll_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ) -> CollOut:
        return await colls.add_crawls_to_collection(coll_id, crawlList.crawlIds, org)

    @app.post(
        "/orgs/{oid}/collections/{coll_id}/remove",
        tags=["collections"],
        response_model=CollOut,
    )
    async def remove_crawl_from_collection(
        crawlList: AddRemoveCrawlList,
        coll_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ) -> CollOut:
        return await colls.remove_crawls_from_collection(
            coll_id, crawlList.crawlIds, org
        )

    @app.delete(
        "/orgs/{oid}/collections/{coll_id}",
        tags=["collections"],
        response_model=SuccessResponse,
    )
    async def delete_collection(
        coll_id: UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.delete_collection(coll_id, org)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/download",
        tags=["collections"],
        response_model=bytes,
    )
    async def download_collection(
        coll_id: UUID, org: Organization = Depends(org_viewer_dep)
    ):
        return await colls.download_collection(coll_id, org)

    @app.get(
        "/public-collections/{org_slug}",
        tags=["collections"],
        response_model=OrgPublicCollections,
    )
    async def get_org_public_collections(org_slug: str):
        return await colls.get_org_public_collections(org_slug)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/urls",
        tags=["collections"],
        response_model=PaginatedPageUrlCountResponse,
    )
    async def get_collection_url_list(
        coll_id: UUID,
        oid: UUID,
        urlPrefix: Optional[str] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        """Retrieve paginated list of urls in collection sorted by snapshot count"""
        pages, total = await colls.list_urls_in_collection(
            coll_id=coll_id,
            oid=oid,
            url_prefix=urlPrefix,
            page_size=pageSize,
            page=page,
        )
        return paginated_format(pages, total, page, pageSize)

    @app.post(
        "/orgs/{oid}/collections/{coll_id}/home-url",
        tags=["collections"],
        response_model=UpdatedResponse,
    )
    async def set_collection_home_url(
        update: UpdateCollHomeUrl,
        coll_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await colls.set_home_url(coll_id, update, org)

    @app.put(
        "/orgs/{oid}/collections/{coll_id}/upload/thumbnail",
        tags=["collections"],
        response_model=AddedResponse,
    )
    async def upload_stream(
        request: Request,
        filename: str,
        coll_id: UUID,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await colls.upload_thumbnail_stream(
            request.stream(), filename, coll_id, org, user
        )

    return colls
