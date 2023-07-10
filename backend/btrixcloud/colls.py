"""
Collections API
"""
from collections import Counter
from datetime import datetime
from typing import Optional, List
import uuid
import asyncio
import json
import traceback

import pymongo
from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse

from .basecrawls import SUCCESSFUL_STATES
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    Collection,
    CollIn,
    CollOut,
    UpdateColl,
    AddRemoveCrawlList,
    CrawlOutWithResources,
    Organization,
    PaginatedResponse,
)


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

            return {"added": True, "id": coll_id, "name": name}
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
        result = CollOut.from_dict(result)
        if result and result.published:
            result.publishedUrl = "/data/" + self.get_published_path(coll_id, org)

        return result

    async def list_collections(
        self,
        oid: uuid.UUID,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = None,
        sort_direction: int = 1,
        name: Optional[str] = None,
        name_prefix: Optional[str] = None,
    ):
        """List all collections for org"""
        # pylint: disable=too-many-locals
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query = {"oid": oid}

        if name:
            match_query["name"] = name

        elif name_prefix:
            regex_pattern = f"^{name_prefix}"
            match_query["name"] = {"$regex": regex_pattern, "$options": "i"}

        aggregate = [{"$match": match_query}]

        if sort_by:
            if sort_by not in ("modified", "name", "description"):
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

        crawls, _ = await self.crawl_ops.list_all_base_crawls(
            collection_id=coll_id,
            states=SUCCESSFUL_STATES,
            page_size=10_000,
            cls_type=CrawlOutWithResources,
        )

        for crawl in crawls:
            if crawl.resources:
                all_files.extend(crawl.resources)

        return all_files

    async def get_collection_search_values(self, org: Organization):
        """Return list of collection names"""
        names = await self.collections.distinct("name", {"oid": org.id})
        # Remove empty strings
        names = [name for name in names if name]
        return {"names": names}

    async def delete_collection(self, coll_id: uuid.UUID, org: Organization):
        """Delete collection and remove from associated crawls."""
        await self.crawl_ops.remove_collection_from_all_crawls(coll_id)

        result = await self.collections.delete_one({"_id": coll_id, "oid": org.id})
        if result.deleted_count < 1:
            raise HTTPException(status_code=404, detail="collection_not_found")

        return {"success": True}

    async def download_collection(self, coll_id: uuid.UUID, org: Organization):
        """Download all WACZs in collection as streaming nested WACZ"""
        coll = await self.get_collection(coll_id, org, resources=True)

        s3_client_x = await get_sync_client(org, self.crawl_manager)

        loop = asyncio.get_event_loop()

        resp = await loop.run_in_executor(
            None, self.sync_dl, coll.resources, s3_client_x
        )

        headers = {"Content-Disposition": f'attachment; filename="{coll.name}.wacz"'}
        return StreamingResponse(
            resp, headers=headers, media_type="application/wacz+zip"
        )

    def get_published_path(self, coll_id: uuid.UUID, org: Organization):
        """return canonical path for collection wacz"""
        return f"{org.id}/public/{coll_id}.wacz"

    async def publish_collection(self, coll_id: uuid.UUID, org: Organization):
        """Publish streaming WACZ file to publicly accessible bucket"""
        coll = await self.get_collection(coll_id, org, resources=True)

        s3_client_x = await get_sync_client(org, self.crawl_manager, use_full=True)

        path = self.get_published_path(coll_id, org)

        loop = asyncio.get_event_loop()

        await loop.run_in_executor(
            None, self.sync_publish, coll.resources, s3_client_x, path
        )

        await self.update_collection(coll_id, org, UpdateColl(published=True))

        return {"published": True, "url": "/data/" + path}

    async def unpublish_collection(self, coll_id: uuid.UUID, org: Organization):
        """unpublish collection, removing it from public access"""
        coll = await self.get_collection(coll_id, org, resources=False)
        if not coll.published:
            return {"published": False}

        crawl_file = CrawlFile(
            filename=self.get_published_path(coll_id, org),
            def_storage_name="default",
            size=0,
            hash="",
        )

        await delete_crawl_file_object(org, crawl_file, self.crawl_manager)

        await self.update_collection(coll_id, org, UpdateColl(published=False))

        return {"published": False}

    def sync_publish(self, all_files, s3_data, path):
        """publish collection to public s3 path"""
        try:
            client, bucket, key, endpoint_url = s3_data

            print("endpoint_url", endpoint_url)
            print("key", key)
            print("path", path)

            path = key + path

            wacz_stream = self.sync_dl(all_files, s3_data)
            wacz_stream = to_file_like_obj(wacz_stream)

            def print_bytes(num):
                print(f"uploaded: {num}")

            client.upload_fileobj(
                Fileobj=wacz_stream, Bucket=bucket, Key=path, Callback=print_bytes
            )

            print("Published To: " + endpoint_url + path, flush=True)

            bucket_path = bucket + "/" + key if key else bucket
            print("Bucket Path", bucket_path)

            client.put_bucket_policy(
                Bucket=bucket, Policy=json.dumps(get_public_policy(bucket_path))
            )

        # pylint: disable=broad-exception-caught
        except Exception:
            traceback.print_exc()

        return path

    def sync_dl(self, all_files, s3_data):
        """generate streaming zip as sync"""
        client, bucket, key, _ = s3_data

        for file_ in all_files:
            file_.path = file_.name

        datapackage = {
            "profile": "multi-wacz-package",
            "resources": [file_.dict() for file_ in all_files],
        }
        datapackage = json.dumps(datapackage).encode("utf-8")

        def get_file(name):
            response = client.get_object(Bucket=bucket, Key=key + name)
            return response["Body"].iter_chunks()

        def member_files():
            modified_at = datetime.now()
            perms = 0o600
            for file_ in all_files:
                yield (
                    file_.name,
                    modified_at,
                    perms,
                    NO_COMPRESSION_64,
                    get_file(file_.name),
                )

            yield (
                "datapackage.json",
                modified_at,
                perms,
                NO_COMPRESSION_64,
                (datapackage,),
            )

        return stream_zip(member_files())


# ============================================================================
def to_file_like_obj(iterable):
    """iter to file like obj"""
    chunk = b""
    offset = 0
    # pylint: disable=invalid-name
    it = iter(iterable)

    def up_to_iter(size):
        nonlocal chunk, offset

        while size:
            if offset == len(chunk):
                try:
                    chunk = next(it)
                except StopIteration:
                    break
                else:
                    offset = 0
            to_yield = min(size, len(chunk) - offset)
            offset = offset + to_yield
            size -= to_yield
            yield chunk[offset - to_yield : offset]

    # pylint: disable=too-few-public-methods
    class FileLikeObj:
        """file-like obj wrapper for upload"""

        def read(self, size=-1):
            """read interface for file-like obj"""
            return b"".join(
                up_to_iter(float("inf") if size is None or size < 0 else size)
            )

    return FileLikeObj()


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
            page_count += crawl.get("stats", {}).get("done", 0)
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
    crawl_collections = crawl.get("collections")
    for collection_id in crawl_collections:
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
        response_model=PaginatedResponse,
    )
    async def list_collection_all(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: str = None,
        sortDirection: int = 1,
        name: Optional[str] = None,
        namePrefix: Optional[str] = None,
    ):
        collections, total = await colls.list_collections(
            org.id,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            name=name,
            name_prefix=namePrefix,
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

    @app.get("/orgs/{oid}/collections/search-values", tags=["collections"])
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

    @app.patch("/orgs/{oid}/collections/{coll_id}", tags=["collections"])
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

    @app.delete(
        "/orgs/{oid}/collections/{coll_id}",
        tags=["collections"],
    )
    async def delete_collection(
        coll_id: uuid.UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.delete_collection(coll_id, org)

    @app.get("/orgs/{oid}/collections/{coll_id}/download", tags=["collections"])
    async def download_collection(
        coll_id: uuid.UUID, org: Organization = Depends(org_viewer_dep)
    ):
        return await colls.download_collection(coll_id, org)

    @app.post("/orgs/{oid}/collections/{coll_id}/publish", tags=["collections"])
    async def publish_collection(
        coll_id: uuid.UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.publish_collection(coll_id, org)

    @app.post("/orgs/{oid}/collections/{coll_id}/unpublish", tags=["collections"])
    async def unpublish_collection(
        coll_id: uuid.UUID, org: Organization = Depends(org_crawl_dep)
    ):
        return await colls.unpublish_collection(coll_id, org)

    return colls
