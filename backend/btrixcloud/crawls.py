""" Crawl API """
# pylint: disable=too-many-lines

import asyncio
import heapq
import uuid
import os
import json
import re
import urllib.parse

from typing import Optional, List, Dict, Union
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, UUID4, conint, HttpUrl
from redis import asyncio as aioredis, exceptions
import pymongo

from .crawlconfigs import Seed, CrawlConfigCore, CrawlConfig
from .db import BaseMongoModel
from .orgs import Organization, MAX_CRAWL_SCALE
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .storages import get_presigned_url, delete_crawl_file_object, get_wacz_logs
from .users import User


CRAWL_STATES = (
    "starting",
    "running",
    "stopping",
    "complete",
    "canceled",
    "partial_complete",
    "timed_out",
    "failed",
)


# ============================================================================
class DeleteCrawlList(BaseModel):
    """delete crawl list POST body"""

    crawl_ids: List[str]


# ============================================================================
class CrawlScale(BaseModel):
    """scale the crawl to N parallel containers"""

    scale: conint(ge=1, le=MAX_CRAWL_SCALE) = 1


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
class Crawl(CrawlConfigCore):
    """Store State of a Crawl (Finished or Running)"""

    id: str

    userid: UUID4
    cid: UUID4

    cid_rev: int = 0

    # schedule: Optional[str]
    manual: Optional[bool]

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, str]]

    files: Optional[List[CrawlFile]] = []

    notes: Optional[str]


# ============================================================================
class CrawlOut(Crawl):
    """Output for single crawl, with additional fields"""

    userName: Optional[str]
    name: Optional[str]
    description: Optional[str]
    profileName: Optional[str]
    resources: Optional[List[CrawlFileOut]] = []
    firstSeed: Optional[str]
    seedCount: Optional[int] = 0
    collections: Optional[List[str]] = []


# ============================================================================
class ListCrawlOut(BaseMongoModel):
    """Crawl output model for list view"""

    id: str

    userid: UUID4
    userName: Optional[str]

    oid: UUID4
    cid: UUID4
    name: Optional[str]
    description: Optional[str]

    manual: Optional[bool]

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, str]]

    fileSize: int = 0
    fileCount: int = 0

    collections: Optional[List[str]] = []
    tags: Optional[List[str]] = []

    notes: Optional[str]

    firstSeed: Optional[str]
    seedCount: Optional[int] = 0


# ============================================================================
class CrawlCompleteIn(BaseModel):
    """Completed Crawl Webhook POST message"""

    id: str

    user: str

    filename: str
    size: int
    hash: str

    completed: Optional[bool] = True


# ============================================================================
class UpdateCrawl(BaseModel):
    """Update crawl"""

    tags: Optional[List[str]] = []
    notes: Optional[str]


# ============================================================================
class CrawlOps:
    """Crawl Ops"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes
    def __init__(self, mdb, users, crawl_manager, crawl_configs, orgs):
        self.crawls = mdb["crawls"]
        self.collections = mdb["collections"]
        self.crawl_manager = crawl_manager
        self.crawl_configs = crawl_configs
        self.user_manager = users
        self.orgs = orgs
        self.namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"

        self.crawl_configs.set_crawl_ops(self)

        self.presign_duration = int(os.environ.get("PRESIGN_DURATION_SECONDS", 3600))

    async def list_crawls(
        self,
        org: Optional[Organization] = None,
        cid: uuid.UUID = None,
        userid: uuid.UUID = None,
        crawl_id: str = None,
        running_only=False,
        state: Optional[List[str]] = None,
        first_seed: str = None,
        name: str = None,
        description: str = None,
        collection_name: str = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = None,
        sort_direction: int = -1,
    ):
        """List all finished crawls from the db"""
        # pylint: disable=too-many-locals,too-many-branches
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        oid = org.id if org else None

        query = {}
        if oid:
            query["oid"] = oid

        if cid:
            query["cid"] = cid

        if userid:
            query["userid"] = userid

        if running_only:
            query["state"] = {"$in": ["running", "starting", "stopping"]}

        # Override running_only if state list is explicitly passed
        if state:
            validated_states = [value for value in state if value in CRAWL_STATES]
            query["state"] = {"$in": validated_states}

        if crawl_id:
            query["_id"] = crawl_id

        # pylint: disable=duplicate-code
        aggregate = [
            {"$match": query},
            {"$set": {"fileSize": {"$sum": "$files.size"}}},
            {"$set": {"fileCount": {"$size": "$files"}}},
            {"$unset": ["files"]},
            {"$set": {"firstSeedObject": {"$arrayElemAt": ["$config.seeds", 0]}}},
            {"$set": {"firstSeed": "$firstSeedObject.url"}},
            {"$unset": ["firstSeedObject"]},
            {
                "$lookup": {
                    "from": "crawl_configs",
                    "localField": "cid",
                    "foreignField": "_id",
                    "as": "crawlConfig",
                },
            },
            {"$set": {"name": {"$arrayElemAt": ["$crawlConfig.name", 0]}}},
            {
                "$set": {
                    "description": {"$arrayElemAt": ["$crawlConfig.description", 0]}
                }
            },
            {
                "$lookup": {
                    "from": "collections",
                    "let": {"crawl_id": {"$toString": "$_id"}},
                    "pipeline": [
                        {"$match": {"$expr": {"$in": ["$$crawl_id", "$crawl_ids"]}}}
                    ],
                    "as": "colls",
                },
            },
            {
                "$set": {
                    "collections": {
                        "$map": {
                            "input": "$colls",
                            "as": "coll",
                            "in": {"$getField": {"field": "name", "input": "$$coll"}},
                        }
                    }
                }
            },
        ]

        if name:
            aggregate.extend([{"$match": {"name": name}}])

        if description:
            aggregate.extend([{"$match": {"description": description}}])

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if collection_name:
            aggregate.extend([{"$match": {"collections": {"$in": [collection_name]}}}])

        if sort_by:
            if sort_by not in ("started, finished, fileSize, firstSeed"):
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
        for result in items:
            crawl = ListCrawlOut.from_dict(result)
            crawl = await self._resolve_crawl_refs(crawl, org, add_first_seed=False)
            crawls.append(crawl)

        return crawls, total

    async def get_crawl_raw(self, crawlid: str, org: Organization):
        """Get data for single crawl"""

        query = {"_id": crawlid}
        if org:
            query["oid"] = org.id

        res = await self.crawls.find_one(query)

        if not res:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawlid}")

        return res

    async def get_crawl(self, crawlid: str, org: Organization):
        """Get data for single crawl"""

        res = await self.get_crawl_raw(crawlid, org)

        if res.get("files"):
            files = [CrawlFile(**data) for data in res["files"]]

            del res["files"]

            res["resources"] = await self._resolve_signed_urls(files, org, crawlid)

        crawl = CrawlOut.from_dict(res)

        return await self._resolve_crawl_refs(crawl, org)

    async def get_latest_crawl_and_count_by_config(self, cid: str):
        """Get crawl statistics for a crawl_config with id cid."""
        stats = {
            "crawl_count": 0,
            "last_crawl_id": None,
            "last_crawl_finished": None,
            "last_crawl_state": None,
        }

        match_query = {"cid": cid, "finished": {"$ne": None}, "inactive": {"$ne": True}}
        cursor = self.crawls.find(match_query).sort("finished", pymongo.DESCENDING)
        results = await cursor.to_list(length=1000)
        if results:
            stats["crawl_count"] = len(results)

            last_crawl = Crawl.from_dict(results[0])
            stats["last_crawl_id"] = str(last_crawl.id)
            stats["last_crawl_finished"] = last_crawl.finished
            stats["last_crawl_state"] = last_crawl.state

        return stats

    async def _resolve_crawl_refs(
        self,
        crawl: Union[CrawlOut, ListCrawlOut],
        org: Optional[Organization],
        add_first_seed: bool = True,
    ):
        """Resolve running crawl data"""
        config = await self.crawl_configs.get_crawl_config(
            crawl.cid, org, active_only=False
        )

        if config:
            if not crawl.name:
                crawl.name = config.name

            if not crawl.description:
                crawl.description = config.description

            if config.config.seeds:
                if add_first_seed:
                    first_seed = config.config.seeds[0]
                    if isinstance(first_seed, HttpUrl):
                        crawl.firstSeed = first_seed
                    elif isinstance(first_seed, Seed):
                        crawl.firstSeed = first_seed.url
                crawl.seedCount = len(config.config.seeds)

        if hasattr(crawl, "profileid") and crawl.profileid:
            crawl.profileName = await self.crawl_configs.profiles.get_profile_name(
                crawl.profileid, org
            )

        if not crawl.collections:
            crawl.collections = [
                coll["name"]
                async for coll in self.collections.find(
                    {"crawl_ids": {"$in": [crawl.id]}}
                )
            ]

        user = await self.user_manager.get(crawl.userid)
        if user:
            crawl.userName = user.name

        return crawl

    async def _resolve_signed_urls(
        self, files, org: Organization, crawl_id: Optional[str] = None
    ):
        if not files:
            print("no files")
            return

        delta = timedelta(seconds=self.presign_duration)

        updates = []
        out_files = []

        for file_ in files:
            presigned_url = file_.presignedUrl
            now = dt_now()

            if not presigned_url or now >= file_.expireAt:
                exp = now + delta
                presigned_url = await get_presigned_url(
                    org, file_, self.crawl_manager, self.presign_duration
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

        print("presigned", out_files)

        return out_files

    async def _update_presigned(self, updates):
        for update in updates:
            await self.crawls.find_one_and_update(*update)

    async def delete_crawls(self, org: Organization, delete_list: DeleteCrawlList):
        """Delete a list of crawls by id for given org"""
        for crawl_id in delete_list.crawl_ids:
            await self._delete_crawl_files(org, crawl_id)

        res = await self.crawls.delete_many(
            {"_id": {"$in": delete_list.crawl_ids}, "oid": org.id}
        )

        return res.deleted_count

    async def _delete_crawl_files(self, org: Organization, crawl_id: str):
        """Delete files associated with crawl from storage."""
        crawl_raw = await self.get_crawl_raw(crawl_id, org)
        crawl = Crawl.from_dict(crawl_raw)
        for file_ in crawl.files:
            status_code = await delete_crawl_file_object(org, file_, self.crawl_manager)
            if status_code != 204:
                raise HTTPException(status_code=400, detail="file_deletion_error")

    async def get_wacz_files(self, crawl_id: str, org: Organization):
        """Return list of WACZ files associated with crawl."""
        wacz_files = []
        crawl_raw = await self.get_crawl_raw(crawl_id, org)
        crawl = Crawl.from_dict(crawl_raw)
        for file_ in crawl.files:
            if file_.filename.endswith(".wacz"):
                wacz_files.append(file_)
        return wacz_files

    async def add_new_crawl(self, crawl_id: str, crawlconfig: CrawlConfig, user: User):
        """initialize new crawl"""
        crawl = Crawl(
            id=crawl_id,
            state="starting",
            userid=user.id,
            oid=crawlconfig.oid,
            cid=crawlconfig.id,
            cid_rev=crawlconfig.rev,
            scale=crawlconfig.scale,
            jobType=crawlconfig.jobType,
            config=crawlconfig.config,
            profileid=crawlconfig.profileid,
            schedule=crawlconfig.schedule,
            crawlTimeout=crawlconfig.crawlTimeout,
            manual=True,
            started=ts_now(),
            tags=crawlconfig.tags,
        )

        try:
            await self.crawls.insert_one(crawl.to_dict())
            return True
        except pymongo.errors.DuplicateKeyError:
            # print(f"Crawl Already Added: {crawl.id} - {crawl.state}")
            return False

    async def update_crawl(self, crawl_id: str, org: Organization, update: UpdateCrawl):
        """Update existing crawl (tags and notes only for now)"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        # update in db
        result = await self.crawls.find_one_and_update(
            {"_id": crawl_id, "oid": org.id},
            {"$set": query},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail=f"Crawl '{crawl_id}' not found")

        return {"success": True}

    async def update_crawl_state(self, crawl_id: str, state: str):
        """called only when job container is being stopped/canceled"""

        data = {"state": state}
        # if cancelation, set the finish time here
        if state == "canceled":
            data["finished"] = dt_now()

        await self.crawls.find_one_and_update(
            {
                "_id": crawl_id,
                "state": {"$in": ["running", "starting", "canceling", "stopping"]},
            },
            {"$set": data},
        )

    async def shutdown_crawl(self, crawl_id: str, org: Organization, graceful: bool):
        """stop or cancel specified crawl"""
        result = None
        try:
            result = await self.crawl_manager.shutdown_crawl(
                crawl_id, org.id_str, graceful=graceful
            )

            if result.get("success"):
                # for canceletion, just set to canceled immediately if succeeded
                await self.update_crawl_state(
                    crawl_id, "stopping" if graceful else "canceled"
                )
                return {"success": True}

        except Exception as exc:
            # pylint: disable=raise-missing-from
            # if reached here, probably crawl doesn't exist anymore
            raise HTTPException(
                status_code=404, detail=f"crawl_not_found, (details: {exc})"
            )

        # if job no longer running, canceling is considered success,
        # but graceful stoppage is not possible, so would be a failure
        if result.get("error") == "job_not_running":
            if not graceful:
                await self.update_crawl_state(crawl_id, "canceled")
                return {"success": True}

        # return whatever detail may be included in the response
        raise HTTPException(status_code=400, detail=result.get("error"))

    async def _crawl_queue_len(self, redis, key):
        try:
            return await redis.zcard(key)
        except exceptions.ResponseError:
            # fallback to old crawler queue
            return await redis.llen(key)

    async def _crawl_queue_range(self, redis, key, offset, count):
        try:
            return await redis.zrangebyscore(key, 0, "inf", offset, count)
        except exceptions.ResponseError:
            # fallback to old crawler queue
            return reversed(await redis.lrange(key, -offset - count, -offset - 1))

    async def _crawl_queue_rem(self, redis, key, values, dircount=1):
        try:
            return await redis.zrem(key, *values)
        except exceptions.ResponseError:
            # fallback to old crawler queue
            res = 0
            for value in values:
                res += await redis.lrem(key, dircount, value)
            return res

    async def get_crawl_queue(self, crawl_id, offset, count, regex):
        """get crawl queue"""

        total = 0
        results = []
        redis = None

        try:
            redis = await self.get_redis(crawl_id)

            total = await self._crawl_queue_len(redis, f"{crawl_id}:q")
            results = await self._crawl_queue_range(
                redis, f"{crawl_id}:q", offset, count
            )
            results = [json.loads(result)["url"] for result in results]
        except exceptions.ConnectionError:
            # can't connect to redis, likely not initialized yet
            pass

        matched = []
        if regex:
            regex = re.compile(regex)
            matched = [result for result in results if regex.search(result)]

        return {"total": total, "results": results, "matched": matched}

    async def match_crawl_queue(self, crawl_id, regex):
        """get list of urls that match regex"""
        total = 0
        redis = None

        try:
            redis = await self.get_redis(crawl_id)
            total = await self._crawl_queue_len(redis, f"{crawl_id}:q")
        except exceptions.ConnectionError:
            # can't connect to redis, likely not initialized yet
            pass

        regex = re.compile(regex)
        matched = []
        step = 50

        for count in range(0, total, step):
            results = await self._crawl_queue_range(redis, f"{crawl_id}:q", count, step)
            for result in results:
                url = json.loads(result)["url"]
                if regex.search(url):
                    matched.append(url)

        return {"total": total, "matched": matched}

    async def filter_crawl_queue(self, crawl_id, regex):
        """filter out urls that match regex"""
        # pylint: disable=too-many-locals
        total = 0
        redis = None

        q_key = f"{crawl_id}:q"
        s_key = f"{crawl_id}:s"

        try:
            redis = await self.get_redis(crawl_id)
            total = await self._crawl_queue_len(redis, f"{crawl_id}:q")
        except exceptions.ConnectionError:
            # can't connect to redis, likely not initialized yet
            pass

        dircount = -1
        regex = re.compile(regex)
        step = 50

        count = 0
        num_removed = 0

        # pylint: disable=fixme
        # todo: do this in a more efficient way?
        # currently quite inefficient as redis does not have a way
        # to atomically check and remove value from list
        # so removing each jsob block by value
        while count < total:
            if dircount == -1 and count > total / 2:
                dircount = 1
            results = await self._crawl_queue_range(redis, q_key, count, step)
            count += step

            qrems = []
            srems = []

            for result in results:
                url = json.loads(result)["url"]
                if regex.search(url):
                    srems.append(url)
                    # await redis.srem(s_key, url)
                    # res = await self._crawl_queue_rem(redis, q_key, result, dircount)
                    qrems.append(result)

            if not srems:
                continue

            await redis.srem(s_key, *srems)
            res = await self._crawl_queue_rem(redis, q_key, qrems, dircount)
            if res:
                count -= res
                num_removed += res
                print(f"Removed {res} from queue", flush=True)

        return num_removed

    async def get_redis(self, crawl_id):
        """get redis url for crawl id"""
        # pylint: disable=line-too-long
        redis_url = f"redis://redis-{crawl_id}-0.redis-{crawl_id}.{self.namespace}.svc.cluster.local/0"

        return await aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        )

    async def add_or_remove_exclusion(self, crawl_id, regex, org, user, add):
        """add new exclusion to config or remove exclusion from config
        for given crawl_id, update config on crawl"""

        crawlraw = await self.crawls.find_one({"_id": crawl_id}, {"cid": True})

        cid = crawlraw.get("cid")

        new_config = await self.crawl_configs.add_or_remove_exclusion(
            regex, cid, org, user, add
        )

        await self.crawls.find_one_and_update(
            {"_id": crawl_id, "oid": org.id}, {"$set": {"config": new_config.dict()}}
        )

        resp = {"success": True}

        # restart crawl pods
        restart_c = self.crawl_manager.rollover_restart_crawl(crawl_id, org.id)

        if add:
            filter_q = self.filter_crawl_queue(crawl_id, regex)

            _, num_removed = await asyncio.gather(restart_c, filter_q)
            resp["num_removed"] = num_removed

        else:
            await restart_c

        return resp

    async def remove_crawl_from_collections(self, oid: uuid.UUID, crawl_id: str):
        """Remove crawl with given crawl_id from all collections it belongs to"""
        collections = [
            coll["name"]
            async for coll in self.collections.find({"crawl_ids": {"$in": [crawl_id]}})
        ]
        for collection_name in collections:
            await self.collections.find_one_and_update(
                {"name": collection_name, "oid": oid},
                {"$pull": {"crawl_ids": crawl_id}},
            )


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, too-many-statements
def init_crawls_api(app, mdb, users, crawl_manager, crawl_config_ops, orgs, user_dep):
    """API for crawl management, including crawl done callback"""
    # pylint: disable=invalid-name

    ops = CrawlOps(mdb, users, crawl_manager, crawl_config_ops, orgs)

    org_viewer_dep = orgs.org_viewer_dep
    org_crawl_dep = orgs.org_crawl_dep

    @app.get("/orgs/all/crawls", tags=["crawls"])
    async def list_crawls_admin(
        user: User = Depends(user_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID4] = None,
        cid: Optional[UUID4] = None,
        state: Optional[str] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collection: Optional[str] = None,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
        runningOnly: Optional[bool] = True,
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        if state:
            state = state.split(",")

        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        if collection:
            collection = urllib.parse.unquote(collection)

        crawls, total = await ops.list_crawls(
            None,
            userid=userid,
            cid=cid,
            running_only=runningOnly,
            state=state,
            first_seed=firstSeed,
            name=name,
            description=description,
            collection_name=collection,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.get("/orgs/{oid}/crawls", tags=["crawls"])
    async def list_crawls(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID4] = None,
        cid: Optional[UUID4] = None,
        state: Optional[str] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collection: Optional[str] = None,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        # pylint: disable=duplicate-code
        if state:
            state = state.split(",")

        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        if collection:
            collection = urllib.parse.unquote(collection)

        crawls, total = await ops.list_crawls(
            org,
            userid=userid,
            cid=cid,
            running_only=False,
            state=state,
            first_seed=firstSeed,
            name=name,
            description=description,
            collection_name=collection,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/cancel",
        tags=["crawls"],
    )
    async def crawl_cancel_immediately(
        crawl_id, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.shutdown_crawl(crawl_id, org, graceful=False)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/stop",
        tags=["crawls"],
    )
    async def crawl_graceful_stop(crawl_id, org: Organization = Depends(org_crawl_dep)):
        return await ops.shutdown_crawl(crawl_id, org, graceful=True)

    @app.post("/orgs/{oid}/crawls/delete", tags=["crawls"])
    async def delete_crawls(
        delete_list: DeleteCrawlList,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        # Ensure user has appropriate permissions for all crawls in list:
        # - Crawler users can delete their own crawls
        # - Org owners can delete any crawls in org
        for crawl_id in delete_list.crawl_ids:
            crawl_raw = await ops.get_crawl_raw(crawl_id, org)
            crawl = Crawl.from_dict(crawl_raw)
            if (crawl.userid != user.id) and not org.is_owner(user):
                raise HTTPException(status_code=403, detail="Not Allowed")

            if not crawl.finished:
                try:
                    await ops.shutdown_crawl(crawl_id, org, graceful=False)
                except Exception as exc:
                    # pylint: disable=raise-missing-from
                    raise HTTPException(
                        status_code=400, detail=f"Error Stopping Crawl: {exc}"
                    )

        await ops.remove_crawl_from_collections(crawl.oid, crawl.id)

        res = await ops.delete_crawls(org, delete_list)

        return {"deleted": res}

    @app.get(
        "/orgs/all/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOut,
    )
    async def get_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl(crawl_id, None)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOut,
    )
    async def get_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl(crawl_id, org)

    @app.get(
        "/orgs/all/crawls/{crawl_id}",
        tags=["crawls"],
        response_model=ListCrawlOut,
    )
    async def list_single_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        crawls, _ = await ops.list_crawls(crawl_id=crawl_id)
        if len(crawls) < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return crawls[0]

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}",
        tags=["crawls"],
        response_model=ListCrawlOut,
    )
    async def list_single_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        crawls, _ = await ops.list_crawls(org, crawl_id=crawl_id)
        if len(crawls) < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return crawls[0]

    @app.patch("/orgs/{oid}/crawls/{crawl_id}", tags=["crawls"])
    async def update_crawl(
        update: UpdateCrawl, crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.update_crawl(crawl_id, org, update)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/scale",
        tags=["crawls"],
    )
    async def scale_crawl(
        scale: CrawlScale, crawl_id, org: Organization = Depends(org_crawl_dep)
    ):
        result = await crawl_manager.scale_crawl(crawl_id, org.id_str, scale.scale)
        if not result or not result.get("success"):
            raise HTTPException(
                status_code=400, detail=result.get("error") or "unknown"
            )

        return {"scaled": scale.scale}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/access",
        tags=["crawls"],
    )
    async def access_check(crawl_id, org: Organization = Depends(org_crawl_dep)):
        if await ops.get_crawl_raw(crawl_id, org):
            return {}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/queue",
        tags=["crawls"],
    )
    async def get_crawl_queue(
        crawl_id,
        offset: int,
        count: int,
        regex: Optional[str] = "",
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.get_crawl_raw(crawl_id, org)

        return await ops.get_crawl_queue(crawl_id, offset, count, regex)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/queueMatchAll",
        tags=["crawls"],
    )
    async def match_crawl_queue(
        crawl_id, regex: str, org: Organization = Depends(org_crawl_dep)
    ):
        await ops.get_crawl_raw(crawl_id, org)

        return await ops.match_crawl_queue(crawl_id, regex)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/exclusions",
        tags=["crawls"],
    )
    async def add_exclusion(
        crawl_id,
        regex: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.add_or_remove_exclusion(crawl_id, regex, org, user, add=True)

    @app.delete(
        "/orgs/{oid}/crawls/{crawl_id}/exclusions",
        tags=["crawls"],
    )
    async def remove_exclusion(
        crawl_id,
        regex: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.add_or_remove_exclusion(crawl_id, regex, org, user, add=False)

    @app.get("/orgs/{oid}/crawls/{crawl_id}/logs", tags=["crawls"])
    async def stream_crawl_logs(
        crawl_id,
        org: Organization = Depends(org_viewer_dep),
        logLevel: Optional[str] = None,
        context: Optional[str] = None,
    ):
        crawl = await ops.get_crawl(crawl_id, org)

        log_levels = []
        contexts = []
        if logLevel:
            log_levels = logLevel.split(",")
        if context:
            contexts = context.split(",")

        def stream_json_lines(iterator, log_levels, contexts):
            """Return iterator as generator, filtering as necessary"""
            for line_dict in iterator:
                if log_levels and line_dict["logLevel"] not in log_levels:
                    continue
                if contexts and line_dict["context"] not in contexts:
                    continue

                # Convert to JSON-lines bytes
                json_str = json.dumps(line_dict, ensure_ascii=False) + "\n"
                yield json_str.encode("utf-8")

        # If crawl is finished, stream logs from WACZ files
        if crawl.finished:
            logs = []
            wacz_files = await ops.get_wacz_files(crawl_id, org)
            for wacz_file in wacz_files:
                wacz_logs = await get_wacz_logs(org, wacz_file, crawl_manager)
                logs.append(wacz_logs)
            heap_iter = heapq.merge(*logs, key=lambda entry: entry["timestamp"])
            return StreamingResponse(stream_json_lines(heap_iter, log_levels, contexts))

        raise HTTPException(status_code=400, detail="crawl_not_finished")

    return ops


def dt_now():
    """get current ts"""
    return datetime.utcnow().replace(microsecond=0, tzinfo=None)


def ts_now():
    """get current ts"""
    return str(dt_now())
