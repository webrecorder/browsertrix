"""
Collections API
"""
import uuid
from typing import Optional, List

import pymongo
from fastapi import Depends, HTTPException

from pydantic import BaseModel, UUID4

from .db import BaseMongoModel
from .orgs import Organization
from .pagination import DEFAULT_PAGE_SIZE, paginated_format


# ============================================================================
class Collection(BaseMongoModel):
    """Org collection structure"""

    name: str

    oid: UUID4

    crawlIds: Optional[List[str]] = []

    description: Optional[str]


# ============================================================================
class CollIn(BaseModel):
    """Collection Passed in By User"""

    name: str
    description: Optional[str]
    crawlIds: Optional[List[str]] = []


# ============================================================================
class UpdateColl(BaseModel):
    """Update collection"""

    crawlIds: Optional[List[str]] = []
    description: Optional[str]


# ============================================================================
class RenameColl(BaseModel):
    """Rename collection"""

    name: str


# ============================================================================
class CollectionOps:
    """ops for working with named collections of crawls"""

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

    async def add_collection(
        self,
        oid: uuid.UUID,
        name: str,
        crawl_ids: Optional[List[str]],
        description: str = None,
    ):
        """Add new collection"""
        crawl_ids = crawl_ids if crawl_ids else []
        coll = Collection(
            id=uuid.uuid4(),
            oid=oid,
            name=name,
            crawlIds=crawl_ids,
            description=description,
        )
        try:
            await self.collections.insert_one(coll.to_dict())
            return {"added": name}
        except pymongo.errors.DuplicateKeyError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="collection_already_exists")

    async def update_collection(self, oid: uuid.UUID, name: str, update: UpdateColl):
        """Update collection"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        result = await self.collections.find_one_and_update(
            {"name": name, "oid": oid},
            {"$set": query},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return result

    async def rename_collection(self, oid: uuid.UUID, name: str, new_name: str):
        """Rename collection"""
        result = await self.collections.find_one_and_update(
            {"name": name, "oid": oid},
            {"$set": {"name": new_name}},
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return new_name

    async def add_crawl_to_collection(self, oid: uuid.UUID, name: str, crawl_id: str):
        """Add crawl to collection"""
        result = await self.collections.find_one_and_update(
            {"name": name, "oid": oid},
            {"$push": {"crawlIds": crawl_id}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return result

    async def remove_crawl_from_collection(
        self, oid: uuid.UUID, name: str, crawl_id: str
    ):
        """Remove crawl from collection"""
        result = await self.collections.find_one_and_update(
            {"name": name, "oid": oid},
            {"$pull": {"crawlIds": crawl_id}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return result

    async def get_collection(self, oid: uuid.UUID, name: str):
        """Get collection by org + name"""
        res = await self.collections.find_one({"name": name, "oid": oid})
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
        self, oid: uuid.UUID, page_size: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        """List all collections for org"""
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query = {"oid": oid}

        total = await self.collections.count_documents(match_query)

        cursor = self.collections.find(match_query, skip=skip, limit=page_size)
        results = await cursor.to_list(length=page_size)
        collections = [Collection.from_dict(res) for res in results]

        return collections, total

    async def get_collection_crawls(self, oid: uuid.UUID, name: str):
        """Find collection and get all crawls by collection name per org"""

        coll = await self.get_collection(oid, name)
        if not coll:
            raise HTTPException(status_code=404, detail="collection_not_found")

        all_files = []

        for crawl_id in coll.crawlIds:
            org = await self.orgs.get_org_by_id(oid)
            crawl = await self.crawls.get_crawl(crawl_id, org)
            if not crawl.resources:
                continue

            for resource in crawl.resources:
                all_files.append(resource)

        return {"resources": all_files}


# ============================================================================
# pylint: disable=too-many-locals
def init_collections_api(app, mdb, crawls, orgs, crawl_manager):
    """init collections api"""
    # pylint: disable=invalid-name

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

    @app.get("/orgs/{oid}/collections", tags=["collections"])
    async def list_collection_all(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        collections, total = await colls.list_collections(
            org.id, page_size=pageSize, page=page
        )
        return paginated_format(collections, total, page, pageSize)

    @app.get("/orgs/{oid}/collections/$all", tags=["collections"])
    async def get_collection_all(org: Organization = Depends(org_viewer_dep)):
        results = {}
        try:
            all_collections, _ = colls.list_collections(org.id, page_size=10_000)
            for collection in all_collections:
                results[collection.name] = await colls.get_collection_crawls(
                    org.id, str(collection.id)
                )
        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail="Error Listing All Crawled Files: " + str(exc)
            )

        return results

    @app.get("/orgs/{oid}/collections/{name}", tags=["collections"])
    async def get_collection(name: str, org: Organization = Depends(org_viewer_dep)):
        try:
            results = await colls.get_collection_crawls(org.id, name)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail=f"Error Listing Collection: {exc}"
            )

        return results

    @app.post("/orgs/{oid}/collections/{name}/update", tags=["collections"])
    async def update_collection(
        name: str, update: UpdateColl, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.update_collection(org.id, name, update)

    @app.post("/orgs/{oid}/collections/{name}/rename", tags=["collections"])
    async def rename_collection(
        name: str, rename: RenameColl, org: Organization = Depends(org_crawl_dep)
    ):
        await colls.rename_collection(org.id, name, rename.name)
        return {"renamed": rename.name}

    @app.get("/orgs/{oid}/collections/{name}/add", tags=["collections"])
    async def add_crawl_to_collection(
        crawlId: str, name: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.add_crawl_to_collection(org.id, name, crawlId)

    @app.get("/orgs/{oid}/collections/{name}/remove", tags=["collections"])
    async def remove_crawl_from_collection(
        crawlId: str, name: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.remove_crawl_from_collection(org.id, name, crawlId)

    return colls
