""" base crawl type """

import asyncio
import uuid
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List

from pydantic import BaseModel, UUID4
from fastapi import HTTPException
from .db import BaseMongoModel
from .orgs import Organization
from .storages import get_presigned_url, delete_crawl_file_object
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

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, int]]

    files: Optional[List[CrawlFile]] = []

    notes: Optional[str]

    errors: Optional[List[str]] = []

    stopping: Optional[bool] = False

    collections: Optional[List[UUID4]] = []

    fileSize: int = 0
    fileCount: int = 0


# ============================================================================
class DeleteCrawlList(BaseModel):
    """delete crawl list POST body"""

    crawl_ids: List[str]


# ============================================================================
class BaseCrawlOps:
    """operations that apply to all crawls"""

    def __init__(self, mdb, crawl_manager):
        self.crawls = mdb["crawls"]
        self.crawl_manager = crawl_manager

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

    async def delete_crawls(
        self, org: Organization, delete_list: DeleteCrawlList, type_=None
    ):
        """Delete a list of crawls by id for given org"""
        cids_to_update = set()

        size = 0

        for crawl_id in delete_list.crawl_ids:
            size += await self._delete_crawl_files(org, crawl_id)
            art = await self.get_crawl_raw(crawl_id, org)
            if art.get("cid"):
                cids_to_update.add(art.get("cid"))

        query = {"_id": {"$in": delete_list.crawl_ids}, "oid": org.id}
        if type_:
            query["type"] = type_

        res = await self.crawls.delete_many(query)

        return res.deleted_count, size, cids_to_update

    async def _delete_crawl_files(self, org: Organization, crawl_id: str):
        """Delete files associated with crawl from storage."""
        art_raw = await self.get_crawl_raw(crawl_id, org)
        crawl = BaseCrawl.from_dict(art_raw)
        size = 0
        for file_ in crawl.files:
            size += file_.size
            status_code = await delete_crawl_file_object(org, file_, self.crawl_manager)
            if status_code != 204:
                raise HTTPException(status_code=400, detail="file_deletion_error")

        return size

    async def _resolve_signed_urls(
        self, files, org: Organization, crawl_id: Optional[str] = None
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
