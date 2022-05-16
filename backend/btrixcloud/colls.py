"""
Collections API
"""

import asyncio
import uuid
from typing import Optional, List

import pymongo
from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, UUID4

from .db import BaseMongoModel
from .archives import Archive


# ============================================================================
class Collection(BaseMongoModel):
    """ Archive collection structure """

    name: str

    aid: UUID4

    description: Optional[str]


# ============================================================================
class CollIn(BaseModel):
    """ Collection Passed in By User """

    name: str
    description: Optional[str]


# ============================================================================
class CollectionOps:
    """ ops for working with named collections of crawls """

    def __init__(self, mdb, crawls, crawl_manager):
        self.collections = mdb["collections"]

        self.crawls = crawls
        self.crawl_manager = crawl_manager

        asyncio.create_task(self.init_index())

    async def init_index(self):
        """ init lookup index """
        await self.collections.create_index(
            [("aid", pymongo.ASCENDING), ("name", pymongo.ASCENDING)], unique=True
        )

    async def add_collection(self, aid: uuid.UUID, name: str, description=None):
        """ add new collection """
        coll = Collection(id=uuid.uuid4(), aid=aid, name=name, description=description)
        try:
            res = await self.collections.insert_one(coll.to_dict())
            return res.inserted_id

        except pymongo.errors.DuplicateKeyError:
            res = await self.collections.find_one_and_update(
                {"aid": aid, "name": name},
                {"$set": {"name": name, "description": description}},
            )
            return str(res["_id"])

    async def find_collection(self, aid: uuid.UUID, name: str):
        """ find collection by archive + name """
        res = await self.collections.find_one({"archive": aid, "name": name})
        return Collection.from_dict(res) if res else None

    async def find_collections(self, aid: uuid.UUID, names: List[str]):
        """ find all collections for archive given a list of names """
        cursor = self.collections.find(
            {"aid": aid, "name": {"$in": names}}, projection=["_id", "name"]
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

    async def list_collections(self, aid: uuid.UUID):
        """ list all collections for archive """
        cursor = self.collections.find({"archive": aid}, projection=["_id", "name"])
        results = await cursor.to_list(length=1000)
        return {result["name"]: result["_id"] for result in results}

    async def get_collection_crawls(self, aid: uuid.UUID, name: str = None):
        """ fidn collection and get all crawls by collection name per archive """
        collid = None
        if name:
            coll = await self.find_collection(aid, name)
            if not coll:
                return None

            collid = coll.id

        crawls = await self.crawls.list_finished_crawls(aid=aid, collid=collid)
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
def init_collections_api(mdb, crawls, archives, crawl_manager):
    """ init collections api """
    colls = CollectionOps(mdb, crawls, crawl_manager)

    archive_crawl_dep = archives.archive_crawl_dep
    archive_viewer_dep = archives.archive_viewer_dep

    router = APIRouter(
        prefix="/collections",
        dependencies=[Depends(archive_crawl_dep)],
        responses={404: {"description": "Not found"}},
        tags=["collections"],
    )

    @router.post("")
    async def add_collection(
        new_coll: CollIn, archive: Archive = Depends(archive_crawl_dep)
    ):
        coll_id = None
        if new_coll.name == "$all":
            raise HTTPException(status_code=400, detail="Invalid Name")

        try:
            coll_id = await colls.add_collection(
                archive.id, new_coll.name, new_coll.description
            )

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail=f"Error Updating Collection: {exc}"
            )

        return {"collection": coll_id}

    @router.get("")
    async def list_collection_all(archive: Archive = Depends(archive_viewer_dep)):
        return await colls.list_collections(archive.id)

    @router.get("/$all")
    async def get_collection_all(archive: Archive = Depends(archive_viewer_dep)):
        try:
            results = await colls.get_collection_crawls(archive.id)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(
                status_code=400, detail="Error Listing All Crawled Files: " + str(exc)
            )

        return results

    @router.get("/{coll_name}")
    async def get_collection(
        coll_name: str, archive: Archive = Depends(archive_viewer_dep)
    ):
        try:
            results = await colls.get_collection_crawls(archive.id, coll_name)

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

    archives.router.include_router(router)

    return colls
