"""
Collections API
"""
import uuid
from typing import Optional, List

import pymongo
from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, UUID4

from .db import BaseMongoModel
from .orgs import Organization
from .pagination import DEFAULT_PAGE_SIZE, paginated_format


# ============================================================================
class Collection(BaseMongoModel):
    """Org collection structure"""

    name: str

    oid: UUID4

    description: Optional[str]


# ============================================================================
class CollIn(BaseModel):
    """Collection Passed in By User"""

    name: str
    description: Optional[str]


# ============================================================================
class CollOut(BaseMongoModel):
    """Collection API output model"""

    id: UUID4
    name: str


# ============================================================================
class CollectionOps:
    """ops for working with named collections of crawls"""

    def __init__(self, mdb, crawls, crawl_manager):
        self.collections = mdb["collections"]

        self.crawls = crawls
        self.crawl_manager = crawl_manager

    async def init_index(self):
        """init lookup index"""
        await self.collections.create_index(
            [("oid", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], unique=True
        )

    async def add_collection(self, oid: uuid.UUID, name: str, description=None):
        """add new collection"""
        coll = Collection(id=uuid.uuid4(), oid=oid, name=name, description=description)
        try:
            res = await self.collections.insert_one(coll.to_dict())
            return res.inserted_id

        except pymongo.errors.DuplicateKeyError:
            res = await self.collections.find_one_and_update(
                {"oid": oid, "name": name},
                {"$set": {"name": name, "description": description}},
            )
            return str(res["_id"])

    async def find_collection(self, oid: uuid.UUID, name: str):
        """find collection by org + name"""
        res = await self.collections.find_one({"org": oid, "name": name})
        return Collection.from_dict(res) if res else None

    async def find_collections(self, oid: uuid.UUID, names: List[str]):
        """find all collections for org given a list of names"""
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

        return [result["_id"] for result in results]

    async def list_collections(
        self, oid: uuid.UUID, page_size: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        """list all collections for org"""
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query = {"org": oid}

        total = await self.collections.count_documents(match_query)

        cursor = self.collections.find(
            match_query, projection=["_id", "name"], skip=skip, limit=page_size
        )
        results = await cursor.to_list(length=page_size)
        collections = [CollOut.from_dict(res) for res in results]

        return collections, total

    async def get_collection_crawls(self, oid: uuid.UUID, name: str = None):
        """find collection and get all crawls by collection name per org"""
        collid = None
        if name:
            coll = await self.find_collection(oid, name)
            if not coll:
                return None

            collid = coll.id

        crawls = await self.crawls.list_finished_crawls(oid=oid, collid=collid)
        all_files = []
        for crawl in crawls:
            if not crawl.files:
                continue

            for file_ in crawl.files:
                if file_.def_storage_name:
                    storage_prefix = (
                        await self.crawl_manager.get_default_storage_access_endpoint(
                            file_.def_storage_name
                        )
                    )
                    file_.filename = storage_prefix + file_.filename

                all_files.append(file_.dict(exclude={"def_storage_name"}))

        return {"resources": all_files}


# ============================================================================
def init_collections_api(mdb, crawls, orgs, crawl_manager):
    """init collections api"""
    # pylint: disable=invalid-name

    colls = CollectionOps(mdb, crawls, crawl_manager)

    org_crawl_dep = orgs.org_crawl_dep
    org_viewer_dep = orgs.org_viewer_dep

    router = APIRouter(
        prefix="/collections",
        dependencies=[Depends(org_crawl_dep)],
        responses={404: {"description": "Not found"}},
        tags=["collections"],
    )

    @router.post("")
    async def add_collection(
        new_coll: CollIn, org: Organization = Depends(org_crawl_dep)
    ):
        coll_id = None
        if new_coll.name == "$all":
            raise HTTPException(status_code=400, detail="Invalid Name")

        try:
            coll_id = await colls.add_collection(
                org.id, new_coll.name, new_coll.description
            )

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail=f"Error Updating Collection: {exc}"
            )

        return {"collection": coll_id}

    @router.get("")
    async def list_collection_all(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        collections, total = await colls.list_collections(
            org.id, page_size=pageSize, page=page
        )
        return paginated_format(collections, total, page, pageSize)

    @router.get("/$all")
    async def get_collection_all(org: Organization = Depends(org_viewer_dep)):
        try:
            results = await colls.get_collection_crawls(org.id)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail="Error Listing All Crawled Files: " + str(exc)
            )

        return results

    @router.get("/{coll_name}")
    async def get_collection(
        coll_name: str, org: Organization = Depends(org_viewer_dep)
    ):
        try:
            results = await colls.get_collection_crawls(org.id, coll_name)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail=f"Error Listing Collection: {exc}"
            )

        if not results:
            raise HTTPException(
                status_code=404, detail=f"Collection {coll_name} not found"
            )

        return results

    orgs.router.include_router(router)

    return colls
