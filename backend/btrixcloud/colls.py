"""
Collections API
"""
import uuid
from typing import Optional, List

import pymongo
from fastapi import Depends, HTTPException

from pydantic import BaseModel, UUID4, Field

from .db import BaseMongoModel
from .orgs import Organization
from .pagination import DEFAULT_PAGE_SIZE, paginated_format


# ============================================================================
class Collection(BaseMongoModel):
    """Org collection structure"""

    name: str = Field(..., min_length=1)

    oid: UUID4

    description: Optional[str]


# ============================================================================
class CollIn(BaseModel):
    """Collection Passed in By User"""

    name: str = Field(..., min_length=1)
    description: Optional[str]
    crawlIds: Optional[List[str]] = []


# ============================================================================
class UpdateColl(BaseModel):
    """Update collection"""

    name: Optional[str]
    description: Optional[str]


# ============================================================================
class CollectionOps:
    """ops for working with named collections of crawls"""

    # pylint: disable=too-many-arguments

    def __init__(self, mdb, crawls, crawl_manager, orgs):
        self.collections = mdb["collections"]

        self.crawls = crawls
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
        coll = Collection(
            id=coll_id,
            oid=oid,
            name=name,
            description=description,
        )
        try:
            await self.collections.insert_one(coll.to_dict())
            org = await self.orgs.get_org_by_id(oid)
            for crawl_id in crawl_ids:
                await self.crawls.add_to_collection(crawl_id, coll_id, org)

            return {"added": {"id": coll_id, "name": name}}
        except pymongo.errors.DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="collection_name_taken")

    async def update_collection(self, coll_id: uuid.UUID, update: UpdateColl):
        """Update collection"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

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

        return Collection.from_dict(result)

    async def add_crawl_to_collection(
        self, coll_id: uuid.UUID, crawl_id: str, org: Organization
    ):
        """Add crawl to collection"""
        await self.crawls.add_to_collection(crawl_id, coll_id, org)
        return {"success": True}

    async def remove_crawl_from_collection(self, coll_id: uuid.UUID, crawl_id: str):
        """Remove crawl from collection"""
        await self.crawls.remove_from_collection(crawl_id, coll_id)
        return {"success": True}

    async def get_collection(self, coll_id: uuid.UUID):
        """Get collection by id"""
        res = await self.collections.find_one({"_id": coll_id})
        return Collection.from_dict(res) if res else None

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

        collections = [Collection.from_dict(res) for res in items]

        return collections, total

    async def get_collection_crawl_resources(self, coll_id: uuid.UUID, oid: uuid.UUID):
        """Find collection and get all crawl resources"""

        coll = await self.get_collection(coll_id)
        if not coll:
            raise HTTPException(status_code=404, detail="collection_not_found")

        all_files = []

        crawl_ids = await self.crawls.get_crawls_in_collection(coll_id)
        for crawl_id in crawl_ids:
            org = await self.orgs.get_org_by_id(oid)
            crawl = await self.crawls.get_crawl(crawl_id, org)
            if not crawl.resources:
                continue

            for resource in crawl.resources:
                all_files.append(resource)

        return {"resources": all_files}

    async def get_collection_names(self, org: Organization):
        """Return list of collection names"""
        return await self.collections.distinct("name", {"oid": org.id})


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
        response_model=Collection,
    )
    async def get_collection(
        coll_id: uuid.UUID, org: Organization = Depends(org_viewer_dep)
    ):
        coll = await colls.get_collection(coll_id)
        if not coll:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return coll

    @app.get("/orgs/{oid}/collections/{coll_id}/crawl-resources", tags=["collections"])
    async def get_collection_crawl_resources(
        coll_id: uuid.UUID, org: Organization = Depends(org_viewer_dep)
    ):
        try:
            results = await colls.get_collection_crawl_resources(coll_id, org.id)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail=f"Error Listing Collection: {exc}"
            )

        return results

    @app.post(
        "/orgs/{oid}/collections/{coll_id}/update",
        tags=["collections"],
        response_model=Collection,
    )
    async def update_collection(
        coll_id: uuid.UUID,
        update: UpdateColl,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await colls.update_collection(coll_id, update)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/add",
        tags=["collections"],
    )
    async def add_crawl_to_collection(
        crawlId: str, coll_id: uuid.UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.add_crawl_to_collection(coll_id, crawlId, org)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/remove",
        tags=["collections"],
    )
    async def remove_crawl_from_collection(
        crawlId: str, coll_id: uuid.UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.remove_crawl_from_collection(coll_id, crawlId)

    return colls
