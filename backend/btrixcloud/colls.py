"""
Collections API
"""
from collections import Counter
from datetime import datetime
import uuid
from typing import Optional, List

import pymongo
from fastapi import Depends, HTTPException

from pydantic import BaseModel, UUID4, Field

from .crawls import CrawlFileOut, SUCCESSFUL_STATES
from .db import BaseMongoModel
from .orgs import Organization
from .pagination import DEFAULT_PAGE_SIZE, paginated_format


# ============================================================================
class Collection(BaseMongoModel):
    """Org collection structure"""

    name: str = Field(..., min_length=1)
    oid: UUID4
    description: Optional[str]
    modified: Optional[datetime]

    crawlCount: Optional[int] = 0
    pageCount: Optional[int] = 0

    # Sorted by count, descending
    tags: Optional[List[str]] = []


# ============================================================================
class CollIn(BaseModel):
    """Collection Passed in By User"""

    name: str = Field(..., min_length=1)
    description: Optional[str]
    crawlIds: Optional[List[str]] = []


# ============================================================================
class CollOut(Collection):
    """Collection output model with annotations."""

    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class UpdateColl(BaseModel):
    """Update collection"""

    name: Optional[str]
    description: Optional[str]


# ============================================================================
class AddRemoveCrawlList(BaseModel):
    """Update crawl config name, crawl schedule, or tags"""

    crawlIds: Optional[List[str]] = []


# ============================================================================
class CollectionOps:
    """ops for working with named collections of crawls"""

    # pylint: disable=too-many-arguments

    def __init__(self, mdb, crawls, crawl_manager, orgs):
        self.collections = mdb["collections"]
        self.crawls = mdb["crawls"]

        self.crawl_ops = crawls
        self.crawl_manager = crawl_manager
        self.orgs = orgs

    async def init_index(self):
        """init lookup index"""
        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], unique=True
        )

        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("description", pymongo.ASCENDING)]
        )

    async def add_collection(
        self,
        oid: uuid.UUID,
        name: str,
        crawl_ids: Optional[List[str]],
        description: str = None,
    ):
        """Add new collection"""
        crawl_ids = crawl_ids if crawl_ids else []
        coll_id = uuid.uuid4()
        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        coll = Collection(
            id=coll_id,
            oid=oid,
            name=name,
            description=description,
            modified=modified,
        )
        try:
            await self.collections.insert_one(coll.to_dict())
            org = await self.orgs.get_org_by_id(oid)
            if crawl_ids:
                await self.crawl_ops.add_to_collection(crawl_ids, coll_id, org)
                await update_collection_counts_and_tags(
                    self.collections, self.crawls, coll_id
                )

            return {"added": {"id": coll_id, "name": name}}
        except pymongo.errors.DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="collection_name_taken")

    async def update_collection(
        self, coll_id: uuid.UUID, org: Organization, update: UpdateColl
    ):
        """Update collection"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        query["modified"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        try:
            result = await self.collections.find_one_and_update(
                {"_id": coll_id},
                {"$set": query},
                return_document=pymongo.ReturnDocument.AFTER,
            )
        except pymongo.errors.DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="collection_name_taken")

        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return await self.get_collection(coll_id, org)

    async def add_crawls_to_collection(
        self, coll_id: uuid.UUID, crawl_ids: List[str], org: Organization
    ):
        """Add crawls to collection"""
        await self.crawl_ops.add_to_collection(crawl_ids, coll_id, org)

        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)
        result = await self.collections.find_one_and_update(
            {"_id": coll_id},
            {"$set": {"modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        await update_collection_counts_and_tags(self.collections, self.crawls, coll_id)

        return await self.get_collection(coll_id, org)

    async def remove_crawls_from_collection(
        self, coll_id: uuid.UUID, crawl_ids: List[str], org: Organization
    ):
        """Remove crawls from collection"""
        await self.crawl_ops.remove_from_collection(crawl_ids, coll_id)
        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)
        result = await self.collections.find_one_and_update(
            {"_id": coll_id},
            {"$set": {"modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        await update_collection_counts_and_tags(self.collections, self.crawls, coll_id)

        return await self.get_collection(coll_id, org)

    async def get_collection(
        self, coll_id: uuid.UUID, org: Organization, resources=False
    ):
        """Get collection by id"""
        result = await self.collections.find_one({"_id": coll_id})
        if resources:
            result["resources"] = await self.get_collection_crawl_resources(
                coll_id, org
            )
        return CollOut.from_dict(result)

    async def find_collections(self, oid: uuid.UUID, names: List[str]):
        """Find all collections for org given a list of names"""
        cursor = self.collections.find(
            {"oid": oid, "name": {"$in": names}}, projection=["_id", "name"]
        )
        results = await cursor.to_list(length=1000)
        if len(results) != len(names):
            for result in results:
                names.remove(result["name"])

            if names:
                raise HTTPException(
                    status_code=400,
                    detail=f"Specified collection(s) not found: {', '.join(names)}",
                )

        return [result["name"] for result in results]

    async def list_collections(
        self,
        oid: uuid.UUID,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = None,
        sort_direction: int = 1,
        name: Optional[str] = None,
    ):
        """List all collections for org"""
        # pylint: disable=too-many-locals
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query = {"oid": oid}

        if name:
            match_query["name"] = name

        aggregate = [{"$match": match_query}]

        if sort_by:
            if sort_by not in ("name", "description"):
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

    async def get_collection_crawl_resources(
        self, coll_id: uuid.UUID, org: Organization
    ):
        """Return pre-signed resources for all collection crawl files."""
        coll = await self.get_collection(coll_id, org)
        if not coll:
            raise HTTPException(status_code=404, detail="collection_not_found")

        all_files = []

        crawls, _ = await self.crawl_ops.list_crawls(
            collection_id=coll_id,
            state=SUCCESSFUL_STATES,
            page_size=10_000,
            resources=True,
        )

        for crawl in crawls:
            if crawl.resources:
                all_files.extend(crawl.resources)

        return all_files

    async def get_collection_names(self, org: Organization):
        """Return list of collection names"""
        return await self.collections.distinct("name", {"oid": org.id})

    async def delete_collection(self, coll_id: uuid.UUID, org: Organization):
        """Delete collection and remove from associated crawls."""
        await self.crawl_ops.remove_collection_from_all_crawls(coll_id)

        result = await self.collections.delete_one({"_id": coll_id, "oid": org.id})
        if result.deleted_count < 1:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return {"success": True}


# ============================================================================
async def update_collection_counts_and_tags(
    collections, crawls, collection_id: uuid.UUID
):
    """Set current crawl info in config when crawl begins"""
    crawl_count = 0
    page_count = 0
    tags = []

    cursor = crawls.find({"collections": collection_id})
    crawls = await cursor.to_list(length=10_000)
    for crawl in crawls:
        if crawl["state"] not in SUCCESSFUL_STATES:
            continue
        crawl_count += 1
        if crawl.get("stats"):
            page_count += crawl.get("stats").get("done", 0)
        if crawl.get("tags"):
            tags.extend(crawl.get("tags"))

    sorted_tags = [tag for tag, count in Counter(tags).most_common()]

    await collections.find_one_and_update(
        {"_id": collection_id},
        {
            "$set": {
                "crawlCount": crawl_count,
                "pageCount": page_count,
                "tags": sorted_tags,
            }
        },
    )


# ============================================================================
async def update_crawl_collections(collections, crawls, crawl_id: str):
    """Update counts and tags for all collections in crawl"""
    crawl = await crawls.find_one({"_id": crawl_id})
    collections = crawl.get("collections")
    for collection_id in collections:
        await update_collection_counts_and_tags(collections, crawls, collection_id)


# ============================================================================
async def add_successful_crawl_to_collections(
    crawls, crawl_configs, collections, crawl_id: str, cid: uuid.UUID
):
    """Add successful crawl to its auto-add collections."""
    workflow = await crawl_configs.find_one({"_id": cid})
    auto_add_collections = workflow.get("autoAddCollections")
    if auto_add_collections:
        await crawls.find_one_and_update(
            {"_id": crawl_id},
            {"$set": {"collections": auto_add_collections}},
        )
        await update_crawl_collections(collections, crawls, crawl_id)


# ============================================================================
# pylint: disable=too-many-locals
def init_collections_api(app, mdb, crawls, orgs, crawl_manager):
    """init collections api"""
    # pylint: disable=invalid-name, unused-argument, too-many-arguments

    colls = CollectionOps(mdb, crawls, crawl_manager, orgs)

    org_crawl_dep = orgs.org_crawl_dep
    org_viewer_dep = orgs.org_viewer_dep

    @app.post("/orgs/{oid}/collections", tags=["collections"])
    async def add_collection(
        new_coll: CollIn, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.add_collection(
            org.id, new_coll.name, new_coll.crawlIds, new_coll.description
        )

    @app.get(
        "/orgs/{oid}/collections",
        tags=["collections"],
    )
    async def list_collection_all(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: str = None,
        sortDirection: int = 1,
        name: Optional[str] = None,
    ):
        collections, total = await colls.list_collections(
            org.id,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            name=name,
        )
        return paginated_format(collections, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/collections/$all",
        tags=["collections"],
    )
    async def get_collection_all(org: Organization = Depends(org_viewer_dep)):
        results = {}
        try:
            all_collections, _ = colls.list_collections(org.id, page_size=10_000)
            for collection in all_collections:
                results[collection.name] = await colls.get_collection_crawl_resources(
                    org.id, str(collection.id)
                )
        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail="Error Listing All Crawled Files: " + str(exc)
            )

        return results

    @app.get("/orgs/{oid}/collections/names", tags=["collections"])
    async def get_collection_names(
        org: Organization = Depends(org_viewer_dep),
    ):
        return await colls.get_collection_names(org)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}",
        tags=["collections"],
        response_model=CollOut,
    )
    async def get_collection(
        coll_id: uuid.UUID, org: Organization = Depends(org_viewer_dep)
    ):
        coll = await colls.get_collection(coll_id, org)
        if not coll:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return coll

    @app.get("/orgs/{oid}/collections/{coll_id}/replay.json", tags=["collections"])
    async def get_collection_replay(
        coll_id: uuid.UUID, org: Organization = Depends(org_viewer_dep)
    ):
        coll = await colls.get_collection(coll_id, org, resources=True)
        if not coll:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return coll

    @app.post(
        "/orgs/{oid}/collections/{coll_id}/update",
        tags=["collections"],
        response_model=CollOut,
    )
    async def update_collection(
        coll_id: uuid.UUID,
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
        coll_id: uuid.UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await colls.add_crawls_to_collection(coll_id, crawlList.crawlIds, org)

    @app.post(
        "/orgs/{oid}/collections/{coll_id}/remove",
        tags=["collections"],
        response_model=CollOut,
    )
    async def remove_crawl_from_collection(
        crawlList: AddRemoveCrawlList,
        coll_id: uuid.UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await colls.remove_crawls_from_collection(
            coll_id, crawlList.crawlIds, org
        )

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/delete",
        tags=["collections"],
    )
    async def delete_collection(
        coll_id: uuid.UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.delete_collection(coll_id, org)

    return colls
