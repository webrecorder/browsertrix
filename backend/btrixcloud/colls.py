"""
Collections API
"""

# pylint: disable=too-many-lines
from datetime import datetime
from collections import Counter
from uuid import UUID, uuid4
from typing import Optional, List, TYPE_CHECKING, cast, Dict, Any, Union
import os

import asyncio
import pymongo
import aiohttp
from fastapi import Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from starlette.requests import Request

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    AnyHttpUrl,
    Collection,
    CollIn,
    CollOut,
    CollIdName,
    CollectionThumbnailSource,
    UpdateColl,
    AddRemoveCrawlList,
    BaseCrawl,
    CrawlFileOut,
    Organization,
    PaginatedCollOutResponse,
    SUCCESSFUL_STATES,
    AddedResponseIdName,
    EmptyResponse,
    UpdatedResponse,
    SuccessResponse,
    AddedResponse,
    DeletedResponse,
    CollectionSearchValuesResponse,
    CollectionAllResponse,
    OrgPublicCollections,
    PublicOrgDetails,
    CollAccessType,
    UpdateCollHomeUrl,
    User,
    UserFile,
    UserFilePreparer,
    MIN_UPLOAD_PART_SIZE,
    PublicCollOut,
)
from .utils import (
    dt_now,
    slug_from_name,
    get_duplicate_key_error_field,
    get_origin,
)

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .storages import StorageOps
    from .webhooks import EventWebhookOps
    from .crawls import CrawlOps
    from .pages import PageOps
else:
    OrgOps = StorageOps = EventWebhookOps = CrawlOps = PageOps = object


THUMBNAIL_MAX_SIZE = 2_000_000


# ============================================================================
class CollectionOps:
    """ops for working with named collections of crawls"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods

    orgs: OrgOps
    storage_ops: StorageOps
    event_webhook_ops: EventWebhookOps
    crawl_ops: CrawlOps
    page_ops: PageOps

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
        case_insensitive_collation = pymongo.collation.Collation(
            locale="en", strength=1
        )
        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("name", pymongo.ASCENDING)],
            unique=True,
            collation=case_insensitive_collation,
        )

        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("slug", pymongo.ASCENDING)],
            unique=True,
            collation=case_insensitive_collation,
        )

        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("description", pymongo.ASCENDING)]
        )

    async def add_collection(self, oid: UUID, coll_in: CollIn):
        """Add new collection"""
        crawl_ids = coll_in.crawlIds if coll_in.crawlIds else []
        coll_id = uuid4()
        created = dt_now()

        slug = coll_in.slug or slug_from_name(coll_in.name)

        coll = Collection(
            id=coll_id,
            oid=oid,
            name=coll_in.name,
            slug=slug,
            description=coll_in.description,
            caption=coll_in.caption,
            created=created,
            modified=created,
            access=coll_in.access,
            defaultThumbnailName=coll_in.defaultThumbnailName,
            allowPublicDownload=coll_in.allowPublicDownload,
        )
        try:
            await self.collections.insert_one(coll.to_dict())
            org = await self.orgs.get_org_by_id(oid)
            await self.clear_org_previous_slugs_matching_slug(slug, org)

            if crawl_ids:
                await self.crawl_ops.add_to_collection(crawl_ids, coll_id, org)
                await self.update_collection_counts_and_tags(coll_id)
                await self.update_collection_dates(coll_id, org.id)
                asyncio.create_task(
                    self.event_webhook_ops.create_added_to_collection_notification(
                        crawl_ids, coll_id, org
                    )
                )

            return {"added": True, "id": coll_id, "name": coll.name}
        except pymongo.errors.DuplicateKeyError as err:
            # pylint: disable=raise-missing-from
            field = get_duplicate_key_error_field(err)
            raise HTTPException(status_code=400, detail=f"collection_{field}_taken")

    async def update_collection(
        self, coll_id: UUID, org: Organization, update: UpdateColl
    ):
        """Update collection"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        name_update = query.get("name")
        slug_update = query.get("slug")

        previous_slug = None

        if name_update or slug_update:
            # If we're updating slug, save old one to previousSlugs to support redirects
            coll = await self.get_collection(coll_id, org.id)
            previous_slug = coll.slug

        if name_update and not slug_update:
            slug = slug_from_name(name_update)
            query["slug"] = slug
            slug_update = slug

        query["modified"] = dt_now()

        db_update = {"$set": query}
        if previous_slug:
            db_update["$push"] = {"previousSlugs": previous_slug}

        try:
            result = await self.collections.find_one_and_update(
                {"_id": coll_id, "oid": org.id},
                db_update,
                return_document=pymongo.ReturnDocument.AFTER,
            )
        except pymongo.errors.DuplicateKeyError as err:
            # pylint: disable=raise-missing-from
            field = get_duplicate_key_error_field(err)
            raise HTTPException(status_code=400, detail=f"collection_{field}_taken")

        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        if slug_update:
            await self.clear_org_previous_slugs_matching_slug(slug_update, org)

        return {"updated": True}

    async def clear_org_previous_slugs_matching_slug(
        self, slug: str, org: Organization
    ):
        """Clear new slug from previousSlugs array of other collections in same org"""
        await self.collections.update_many(
            {"oid": org.id, "previousSlugs": slug},
            {"$pull": {"previousSlugs": slug}},
        )

    async def add_crawls_to_collection(
        self,
        coll_id: UUID,
        crawl_ids: List[str],
        org: Organization,
        headers: Optional[dict] = None,
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
        await self.update_collection_dates(coll_id, org.id)

        asyncio.create_task(
            self.event_webhook_ops.create_added_to_collection_notification(
                crawl_ids, coll_id, org
            )
        )

        return await self.get_collection_out(coll_id, org, headers)

    async def remove_crawls_from_collection(
        self,
        coll_id: UUID,
        crawl_ids: List[str],
        org: Organization,
        headers: Optional[dict] = None,
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
        await self.update_collection_dates(coll_id, org.id)

        asyncio.create_task(
            self.event_webhook_ops.create_removed_from_collection_notification(
                crawl_ids, coll_id, org
            )
        )

        return await self.get_collection_out(coll_id, org, headers)

    async def get_collection_raw(
        self, coll_id: UUID, oid: UUID, public_or_unlisted_only: bool = False
    ) -> Dict[str, Any]:
        """Get collection by id as dict from database"""
        query: dict[str, object] = {"_id": coll_id, "oid": oid}
        if public_or_unlisted_only:
            query["access"] = {"$in": ["public", "unlisted"]}

        result = await self.collections.find_one(query)
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return result

    async def get_collection_raw_by_slug(
        self,
        coll_slug: str,
        oid: UUID,
        previous_slugs: bool = False,
        public_or_unlisted_only: bool = False,
    ) -> Dict[str, Any]:
        """Get collection by slug (current or previous) as dict from database"""
        query: dict[str, object] = {"oid": oid}
        if previous_slugs:
            query["previousSlugs"] = coll_slug
        else:
            query["slug"] = coll_slug
        if public_or_unlisted_only:
            query["access"] = {"$in": ["public", "unlisted"]}

        result = await self.collections.find_one(query)
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return result

    async def get_collection(
        self, coll_id: UUID, oid: UUID, public_or_unlisted_only: bool = False
    ) -> Collection:
        """Get collection by id"""
        result = await self.get_collection_raw(coll_id, oid, public_or_unlisted_only)
        return Collection.from_dict(result)

    async def get_collection_by_slug(
        self, coll_slug: str, oid: UUID, public_or_unlisted_only: bool = False
    ) -> Collection:
        """Get collection by slug"""
        try:
            result = await self.get_collection_raw_by_slug(
                coll_slug, oid, public_or_unlisted_only=public_or_unlisted_only
            )
            return Collection.from_dict(result)
        # pylint: disable=broad-exception-caught
        except Exception:
            pass

        result = await self.get_collection_raw_by_slug(
            coll_slug,
            oid,
            previous_slugs=True,
            public_or_unlisted_only=public_or_unlisted_only,
        )
        return Collection.from_dict(result)

    async def get_collection_out(
        self,
        coll_id: UUID,
        org: Organization,
        resources=False,
        public_or_unlisted_only=False,
        headers: Optional[dict] = None,
    ) -> CollOut:
        """Get CollOut by id"""
        # pylint: disable=too-many-locals
        result = await self.get_collection_raw(coll_id, org.id, public_or_unlisted_only)

        if resources:
            (
                result["resources"],
                crawl_ids,
                pages_optimized,
            ) = await self.get_collection_crawl_resources(coll_id, org)

            initial_pages, _ = await self.page_ops.list_pages(
                crawl_ids=crawl_ids,
                page_size=25,
            )

            public = "public/" if public_or_unlisted_only else ""

            origin = get_origin(headers)

            if public_or_unlisted_only:
                slug = result.get("slug")
                result["downloadUrl"] = (
                    origin + f"/api/{public}orgs/{org.slug}/collections/{slug}/download"
                )
            else:
                # disable download link, as not public without auth
                result["downloadUrl"] = None

            if pages_optimized:
                result["initialPages"] = initial_pages
                result["pagesQueryUrl"] = (
                    origin + f"/api/orgs/{org.id}/collections/{coll_id}/{public}pages"
                )

        thumbnail = result.get("thumbnail")
        if thumbnail:
            image_file = UserFile(**thumbnail)
            result["thumbnail"] = await image_file.get_file_out(
                org, self.storage_ops, headers
            )

        return CollOut.from_dict(result)

    async def get_public_collection_out(
        self,
        coll_id: UUID,
        org: Organization,
        headers: dict,
        allow_unlisted: bool = False,
    ) -> PublicCollOut:
        """Get PublicCollOut by id"""
        result = await self.get_collection_raw(coll_id, org.id)

        result["orgName"] = org.name
        result["orgPublicProfile"] = org.enablePublicProfile

        allowed_access = [CollAccessType.PUBLIC]
        if allow_unlisted:
            allowed_access.append(CollAccessType.UNLISTED)

        if result.get("access") not in allowed_access:
            raise HTTPException(status_code=404, detail="collection_not_found")

        result["resources"], _, _ = await self.get_collection_crawl_resources(
            coll_id, org
        )

        thumbnail = result.get("thumbnail")
        if thumbnail:
            image_file = UserFile(**thumbnail)
            result["thumbnail"] = await image_file.get_public_file_out(
                org, self.storage_ops, headers
            )

        return PublicCollOut.from_dict(result)

    async def get_public_thumbnail(
        self, slug: str, org: Organization, headers: dict
    ) -> StreamingResponse:
        """return thumbnail of public collection, if any"""
        result = await self.get_collection_raw_by_slug(
            slug, org.id, public_or_unlisted_only=True
        )

        thumbnail = result.get("thumbnail")
        if not thumbnail:
            raise HTTPException(status_code=404, detail="thumbnail_not_found")

        image_file = UserFile(**thumbnail)
        image_file_out = await image_file.get_public_file_out(
            org, self.storage_ops, headers
        )

        path = self.storage_ops.resolve_internal_access_path(image_file_out.path)

        async def reader():
            async with aiohttp.ClientSession() as session:
                async with session.get(path) as resp:
                    async for chunk in resp.content.iter_chunked(4096):
                        yield chunk

        headers = {
            "Cache-Control": "max-age=3600, stale-while-revalidate=86400",
            "Content-Length": f"{image_file.size}",
            "Etag": f'"{image_file.hash}"',
        }
        return StreamingResponse(reader(), media_type=image_file.mime, headers=headers)

    async def list_collections(
        self,
        org: Organization,
        public_colls_out: bool = False,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: int = 1,
        name: Optional[str] = None,
        name_prefix: Optional[str] = None,
        access: Optional[str] = None,
        headers: Optional[dict] = None,
    ):
        """List all collections for org"""
        # pylint: disable=too-many-locals, duplicate-code, too-many-branches
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query: Dict[str, Union[str, UUID, int, object]] = {"oid": org.id}

        if name:
            match_query["name"] = name
        elif name_prefix:
            regex_pattern = f"^{name_prefix}"
            match_query["name"] = {"$regex": regex_pattern, "$options": "i"}

        if public_colls_out:
            match_query["access"] = CollAccessType.PUBLIC
        elif access:
            match_query["access"] = access

        aggregate: List[Dict[str, Union[str, UUID, int, object]]] = [
            {"$match": match_query}
        ]

        if sort_by:
            if sort_by not in (
                "created",
                "modified",
                "dateLatest",
                "name",
                "crawlCount",
                "pageCount",
                "totalSize",
                "description",
                "caption",
            ):
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            sort_query = {sort_by: sort_direction}

            # add secondary sort keys:
            if sort_by == "dateLatest":
                sort_query["dateEarliest"] = sort_direction

            aggregate.extend([{"$sort": sort_query}])

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

        collections: List[Union[CollOut, PublicCollOut]] = []

        for res in items:
            thumbnail = res.get("thumbnail")
            if thumbnail:
                image_file = UserFile(**thumbnail)

                if public_colls_out:
                    res["thumbnail"] = await image_file.get_public_file_out(
                        org, self.storage_ops, headers
                    )
                else:
                    res["thumbnail"] = await image_file.get_file_out(
                        org, self.storage_ops, headers
                    )

            res["orgName"] = org.name
            res["orgPublicProfile"] = org.enablePublicProfile

            if public_colls_out:
                collections.append(PublicCollOut.from_dict(res))
            else:
                collections.append(CollOut.from_dict(res))

        return collections, total

    # pylint: disable=too-many-locals
    async def get_collection_crawl_resources(
        self, coll_id: Optional[UUID], org: Organization
    ) -> tuple[List[CrawlFileOut], List[str], bool]:
        """Return pre-signed resources for all collection crawl files."""
        match: dict[str, Any]

        if coll_id:
            crawl_ids = await self.get_collection_crawl_ids(coll_id, org.id)
            match = {"_id": {"$in": crawl_ids}}
        else:
            crawl_ids = []
            match = {"oid": org.id}

        resources, pages_optimized = await self.crawl_ops.get_presigned_files(
            match, org
        )

        return resources, crawl_ids, pages_optimized

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

    async def get_collection_crawl_ids(
        self,
        coll_id: UUID,
        oid: UUID,
        public_or_unlisted_only=False,
    ) -> List[str]:
        """Return list of crawl ids in collection, including only public collections"""
        crawl_ids = []
        # ensure collection is public or unlisted, else throw here
        if public_or_unlisted_only:
            await self.get_collection_raw(coll_id, oid, public_or_unlisted_only)

        async for crawl_raw in self.crawls.find(
            {"collectionIds": coll_id}, projection=["_id"]
        ):
            crawl_id = crawl_raw.get("_id")
            if crawl_id:
                crawl_ids.append(crawl_id)
        return crawl_ids

    async def delete_collection(self, coll_id: UUID, org: Organization):
        """Delete collection and remove from associated crawls."""
        await self.crawl_ops.remove_collection_from_all_crawls(coll_id, org)

        coll = await self.get_collection(coll_id, org.id)
        if coll.thumbnail:
            await self.delete_thumbnail(coll_id, org)

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

    async def recalculate_org_collection_stats(self, org: Organization):
        """recalculate counts, tags and dates for all collections in an org"""
        async for coll in self.collections.find({"oid": org.id}, projection={"_id": 1}):
            await self.update_collection_counts_and_tags(coll.get("_id"))
            await self.update_collection_dates(coll.get("_id"), org.id)

    async def update_collection_counts_and_tags(self, collection_id: UUID):
        """Set current crawl info in config when crawl begins"""
        # pylint: disable=too-many-locals
        crawl_count = 0
        page_count = 0
        total_size = 0
        tags = []

        crawl_ids = []
        preload_resources = []

        async for crawl_raw in self.crawls.find({"collectionIds": collection_id}):
            crawl = BaseCrawl.from_dict(crawl_raw)
            if crawl.state not in SUCCESSFUL_STATES:
                continue
            crawl_count += 1
            files = crawl.files or []
            for file in files:
                total_size += file.size

            try:
                crawl_page_count = await self.pages.count_documents(
                    {"crawl_id": crawl.id}
                )

                if crawl_page_count == 0:
                    for file in files:
                        preload_resources.append(
                            {
                                "name": os.path.basename(file.filename),
                                "crawlId": crawl.id,
                            }
                        )
                else:
                    page_count += crawl_page_count
            # pylint: disable=broad-exception-caught
            except Exception:
                pass

            if crawl.tags:
                tags.extend(crawl.tags)

            crawl_ids.append(crawl.id)

        sorted_tags = [tag for tag, count in Counter(tags).most_common()]

        unique_page_count = await self.page_ops.get_unique_page_count(crawl_ids)

        top_page_hosts = await self.page_ops.get_top_page_hosts(crawl_ids)

        await self.collections.find_one_and_update(
            {"_id": collection_id},
            {
                "$set": {
                    "crawlCount": crawl_count,
                    "pageCount": page_count,
                    "uniquePageCount": unique_page_count,
                    "totalSize": total_size,
                    "tags": sorted_tags,
                    "preloadResources": preload_resources,
                    "topPageHosts": top_page_hosts,
                }
            },
        )

    async def update_collection_dates(self, coll_id: UUID, oid: UUID):
        """Update collection earliest and latest dates from page timestamps"""
        # pylint: disable=too-many-locals
        coll = await self.get_collection(coll_id, oid)
        crawl_ids = await self.get_collection_crawl_ids(coll_id, oid)

        earliest_ts = None
        latest_ts = None

        match_query = {
            "oid": coll.oid,
            "crawl_id": {"$in": crawl_ids},
            "ts": {"$ne": None},
        }

        cursor = self.pages.find(match_query).sort("ts", 1).limit(1)
        pages = await cursor.to_list(length=1)
        try:
            earliest_page = pages[0]
            earliest_ts = earliest_page.get("ts")
        except IndexError:
            pass

        cursor = self.pages.find(match_query).sort("ts", -1).limit(1)
        pages = await cursor.to_list(length=1)
        try:
            latest_page = pages[0]
            latest_ts = latest_page.get("ts")
        except IndexError:
            pass

        await self.collections.find_one_and_update(
            {"_id": coll_id},
            {
                "$set": {
                    "dateEarliest": earliest_ts,
                    "dateLatest": latest_ts,
                }
            },
        )

    async def update_crawl_collections(self, crawl_id: str, oid: UUID):
        """Update counts, dates, and modified for all collections in crawl"""
        crawl = await self.crawls.find_one({"_id": crawl_id})
        crawl_coll_ids = crawl.get("collectionIds")
        modified = dt_now()

        for coll_id in crawl_coll_ids:
            await self.update_collection_counts_and_tags(coll_id)
            await self.update_collection_dates(coll_id, oid)
            await self.collections.find_one_and_update(
                {"_id": coll_id},
                {"$set": {"modified": modified}},
                return_document=pymongo.ReturnDocument.AFTER,
            )

    async def add_successful_crawl_to_collections(
        self, crawl_id: str, cid: UUID, oid: UUID
    ):
        """Add successful crawl to its auto-add collections."""
        workflow = await self.crawl_configs.find_one({"_id": cid})
        auto_add_collections = workflow.get("autoAddCollections")
        if auto_add_collections:
            await self.crawls.find_one_and_update(
                {"_id": crawl_id},
                {"$set": {"collectionIds": auto_add_collections}},
            )
            await self.update_crawl_collections(crawl_id, oid)

    async def get_org_public_collections(
        self,
        org_slug: str,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: int = 1,
        headers: Optional[dict] = None,
    ):
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
            org,
            page_size=page_size,
            page=page,
            sort_by=sort_by,
            sort_direction=sort_direction,
            public_colls_out=True,
            headers=headers,
        )

        public_org_details = PublicOrgDetails(
            name=org.name,
            description=org.publicDescription or "",
            url=org.publicUrl or "",
        )

        return OrgPublicCollections(org=public_org_details, collections=collections)

    async def set_home_url(
        self, coll_id: UUID, update: UpdateCollHomeUrl, org: Organization
    ) -> Dict[str, bool]:
        """Set home URL for collection and save thumbnail to database"""
        if update.pageId:
            page = await self.page_ops.get_page(update.pageId, org.id)
            update_query = {
                "homeUrl": page.url,
                "homeUrlTs": page.ts,
                "homeUrlPageId": page.id,
            }
        else:
            update_query = {
                "homeUrl": None,
                "homeUrlTs": None,
                "homeUrlPageId": None,
            }

        await self.collections.find_one_and_update(
            {"_id": coll_id, "oid": org.id},
            {"$set": update_query},
        )

        return {"updated": True}

    # pylint: disable=too-many-locals, duplicate-code
    async def upload_thumbnail_stream(
        self,
        stream,
        filename: str,
        coll_id: UUID,
        org: Organization,
        user: User,
        source_url: Optional[AnyHttpUrl] = None,
        source_ts: Optional[datetime] = None,
        source_page_id: Optional[UUID] = None,
    ) -> Dict[str, bool]:
        """Upload file as stream to use as collection thumbnail"""
        coll = await self.get_collection(coll_id, org.id)

        _, extension = os.path.splitext(filename)

        image_filename = f"thumbnail-{str(coll_id)}{extension}"

        prefix = org.storage.get_storage_extra_path(str(org.id)) + "images/"

        file_prep = UserFilePreparer(
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

        print("Collection thumbnail stream upload starting", flush=True)

        if not await self.storage_ops.do_upload_multipart(
            org,
            file_prep.upload_name,
            stream_iter(),
            MIN_UPLOAD_PART_SIZE,
            mime=file_prep.mime,
        ):
            print("Collection thumbnail stream upload failed", flush=True)
            raise HTTPException(status_code=400, detail="upload_failed")

        print("Collection thumbnail stream upload complete", flush=True)

        thumbnail_file = file_prep.get_user_file(org.storage)

        if thumbnail_file.size > THUMBNAIL_MAX_SIZE:
            print(
                "Collection thumbnail stream upload failed: max size (2 MB) exceeded",
                flush=True,
            )
            await self.storage_ops.delete_file_object(org, thumbnail_file)
            raise HTTPException(
                status_code=400,
                detail="max_thumbnail_size_2_mb_exceeded",
            )

        if coll.thumbnail:
            if not await self.storage_ops.delete_file_object(org, coll.thumbnail):
                print(
                    f"Unable to delete previous collection thumbnail: {coll.thumbnail.filename}"
                )

        coll.thumbnail = thumbnail_file

        if source_url and source_ts and source_page_id:
            coll.thumbnailSource = CollectionThumbnailSource(
                url=source_url,
                urlTs=source_ts,
                urlPageId=source_page_id,
            )

        # Update entire document to avoid bson.errors.InvalidDocument exception
        await self.collections.find_one_and_update(
            {"_id": coll_id, "oid": org.id},
            {"$set": coll.to_dict()},
        )

        await self.orgs.inc_org_bytes_stored_field(
            org.id, "bytesStoredThumbnails", thumbnail_file.size
        )

        return {"added": True}

    async def delete_thumbnail(self, coll_id: UUID, org: Organization):
        """Delete collection thumbnail"""
        coll = await self.get_collection(coll_id, org.id)

        if not coll.thumbnail:
            raise HTTPException(status_code=404, detail="thumbnail_not_found")

        if not await self.storage_ops.delete_file_object(org, coll.thumbnail):
            print(f"Unable to delete collection thumbnail: {coll.thumbnail.filename}")
            raise HTTPException(status_code=400, detail="file_deletion_error")

        # Delete from database
        await self.collections.find_one_and_update(
            {"_id": coll_id, "oid": org.id},
            {"$set": {"thumbnail": None}},
        )

        await self.orgs.inc_org_bytes_stored_field(
            org.id, "bytesStoredThumbnails", -coll.thumbnail.size
        )

        return {"deleted": True}

    async def calculate_thumbnail_storage(self, oid: UUID) -> int:
        """Calculate storage for thumbnails in org"""
        total_size = 0

        cursor = self.collections.find({"oid": oid})
        async for coll_dict in cursor:
            file_ = coll_dict.get("thumbnail")
            if file_:
                total_size += file_.get("size", 0)

        return total_size


# ============================================================================
# pylint: disable=too-many-locals
def init_collections_api(
    app, mdb, orgs, storage_ops, event_webhook_ops, user_dep
) -> CollectionOps:
    """init collections api"""
    # pylint: disable=invalid-name, unused-argument, too-many-arguments

    colls: CollectionOps = CollectionOps(mdb, storage_ops, orgs, event_webhook_ops)

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
        request: Request,
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: int = 1,
        name: Optional[str] = None,
        namePrefix: Optional[str] = None,
        access: Optional[str] = None,
    ):
        # pylint: disable=duplicate-code
        collections, total = await colls.list_collections(
            org,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            name=name,
            name_prefix=namePrefix,
            access=access,
            headers=dict(request.headers),
        )
        return paginated_format(collections, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/collections/$all",
        tags=["collections"],
        response_model=CollectionAllResponse,
    )
    async def get_collection_all(org: Organization = Depends(org_viewer_dep)):
        results = {}
        results["resources"] = await colls.get_collection_crawl_resources(None, org)
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
        coll_id: UUID, request: Request, org: Organization = Depends(org_viewer_dep)
    ):
        return await colls.get_collection_out(
            coll_id, org, headers=dict(request.headers)
        )

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/replay.json",
        tags=["collections"],
        response_model=CollOut,
    )
    async def get_collection_replay(
        request: Request, coll_id: UUID, org: Organization = Depends(org_viewer_dep)
    ):
        return await colls.get_collection_out(
            coll_id, org, resources=True, headers=dict(request.headers)
        )

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/public/replay.json",
        tags=["collections"],
        response_model=CollOut,
    )
    async def get_collection_public_replay(
        request: Request,
        response: Response,
        coll_id: UUID,
        org: Organization = Depends(org_public),
    ):
        coll = await colls.get_collection_out(
            coll_id,
            org,
            resources=True,
            public_or_unlisted_only=True,
            headers=dict(request.headers),
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
        request: Request,
        org: Organization = Depends(org_crawl_dep),
    ) -> CollOut:
        return await colls.add_crawls_to_collection(
            coll_id, crawlList.crawlIds, org, headers=dict(request.headers)
        )

    @app.post(
        "/orgs/{oid}/collections/{coll_id}/remove",
        tags=["collections"],
        response_model=CollOut,
    )
    async def remove_crawl_from_collection(
        crawlList: AddRemoveCrawlList,
        coll_id: UUID,
        request: Request,
        org: Organization = Depends(org_crawl_dep),
    ) -> CollOut:
        return await colls.remove_crawls_from_collection(
            coll_id, crawlList.crawlIds, org, headers=dict(request.headers)
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
        "/public/orgs/{org_slug}/collections",
        tags=["collections", "public"],
        response_model=OrgPublicCollections,
    )
    async def get_org_public_collections(
        org_slug: str,
        request: Request,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: int = 1,
    ):
        return await colls.get_org_public_collections(
            org_slug,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            headers=dict(request.headers),
        )

    @app.get(
        "/public/orgs/{org_slug}/collections/{coll_slug}",
        tags=["collections", "public"],
        response_model=PublicCollOut,
    )
    async def get_public_collection(
        org_slug: str,
        coll_slug: str,
        request: Request,
    ):
        try:
            org = await colls.orgs.get_org_by_slug(org_slug)
        # pylint: disable=broad-exception-caught
        except Exception:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=404, detail="collection_not_found")

        coll = await colls.get_collection_by_slug(coll_slug, org.id)

        return await colls.get_public_collection_out(
            coll.id, org, dict(request.headers), allow_unlisted=True
        )

    @app.get(
        "/public/orgs/{org_slug}/collections/{coll_slug}/download",
        tags=["collections", "public"],
        response_model=bytes,
    )
    async def download_public_collection(
        org_slug: str,
        coll_slug: str,
    ):
        try:
            org = await colls.orgs.get_org_by_slug(org_slug)
        # pylint: disable=broad-exception-caught
        except Exception:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=404, detail="collection_not_found")

        # Make sure collection exists and is public/unlisted
        coll = await colls.get_collection_by_slug(
            coll_slug, org.id, public_or_unlisted_only=True
        )

        if coll.allowPublicDownload is False:
            raise HTTPException(status_code=403, detail="not_allowed")

        return await colls.download_collection(coll.id, org)

    @app.get(
        "/public/orgs/{org_slug}/collections/{coll_slug}/thumbnail",
        tags=["collections", "public"],
        response_class=StreamingResponse,
    )
    async def get_public_thumbnail(org_slug: str, coll_slug: str, request: Request):
        try:
            org = await colls.orgs.get_org_by_slug(org_slug)
        # pylint: disable=broad-exception-caught
        except Exception:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=404, detail="collection_not_found")

        return await colls.get_public_thumbnail(coll_slug, org, dict(request.headers))

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
        "/orgs/{oid}/collections/{coll_id}/thumbnail",
        tags=["collections"],
        response_model=AddedResponse,
    )
    async def upload_thumbnail_stream(
        request: Request,
        filename: str,
        coll_id: UUID,
        sourceUrl: Optional[AnyHttpUrl],
        sourceTs: Optional[datetime],
        sourcePageId: Optional[UUID],
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await colls.upload_thumbnail_stream(
            request.stream(),
            filename,
            coll_id,
            org,
            user,
            sourceUrl,
            sourceTs,
            sourcePageId,
        )

    @app.delete(
        "/orgs/{oid}/collections/{coll_id}/thumbnail",
        tags=["collections"],
        response_model=DeletedResponse,
    )
    async def delete_thumbnail_stream(
        coll_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await colls.delete_thumbnail(coll_id, org)

    return colls
