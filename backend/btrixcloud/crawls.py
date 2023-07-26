""" Crawl API """
# pylint: disable=too-many-lines

import asyncio
import heapq
import uuid
import json
import re
import urllib.parse

from typing import Optional, List

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import UUID4
from redis import asyncio as exceptions
import pymongo

from .crawlconfigs import set_config_current_crawl_info
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .storages import get_wacz_logs
from .utils import dt_now, parse_jsonl_error_messages
from .basecrawls import BaseCrawlOps
from .models import (
    CrawlFile,
    UpdateCrawl,
    DeleteCrawlList,
    CrawlConfig,
    UpdateCrawlConfig,
    CrawlScale,
    Crawl,
    CrawlOut,
    CrawlOutWithResources,
    Organization,
    User,
    PaginatedResponse,
)
from .basecrawls import RUNNING_AND_STARTING_STATES, ALL_CRAWL_STATES


# ============================================================================
class CrawlOps(BaseCrawlOps):
    """Crawl Ops"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods
    def __init__(self, mdb, users, crawl_manager, crawl_configs, orgs):
        super().__init__(mdb, users, crawl_configs, crawl_manager)
        self.crawls = self.crawls
        self.crawl_configs = crawl_configs
        self.user_manager = users
        self.orgs = orgs

        self.crawl_configs.set_crawl_ops(self)

    async def init_index(self):
        """init index for crawls db collection"""
        await self.crawls.create_index([("type", pymongo.HASHED)])

        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("finished", pymongo.DESCENDING)]
        )
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("oid", pymongo.DESCENDING)]
        )
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("cid", pymongo.DESCENDING)]
        )
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("state", pymongo.DESCENDING)]
        )

        await self.crawls.create_index([("finished", pymongo.DESCENDING)])
        await self.crawls.create_index([("oid", pymongo.HASHED)])
        await self.crawls.create_index([("cid", pymongo.HASHED)])
        await self.crawls.create_index([("state", pymongo.HASHED)])

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
        collection_id: uuid.UUID = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = None,
        sort_direction: int = -1,
        resources: bool = False,
    ):
        """List all finished crawls from the db"""
        # pylint: disable=too-many-locals,too-many-branches,too-many-statements
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        oid = org.id if org else None

        query = {"type": {"$in": ["crawl", None]}}
        if oid:
            query["oid"] = oid

        if cid:
            query["cid"] = cid

        if userid:
            query["userid"] = userid

        if running_only:
            query["state"] = {"$in": list(RUNNING_AND_STARTING_STATES)}

        # Override running_only if state list is explicitly passed
        if state:
            validated_states = [value for value in state if value in ALL_CRAWL_STATES]
            query["state"] = {"$in": validated_states}

        if crawl_id:
            query["_id"] = crawl_id

        # pylint: disable=duplicate-code
        aggregate = [
            {"$match": query},
            {"$set": {"firstSeedObject": {"$arrayElemAt": ["$config.seeds", 0]}}},
            {"$set": {"firstSeed": "$firstSeedObject.url"}},
            {"$unset": ["firstSeedObject", "errors"]},
            {
                "$lookup": {
                    "from": "crawl_configs",
                    "localField": "cid",
                    "foreignField": "_id",
                    "as": "crawlConfig",
                },
            },
            {"$set": {"name": {"$arrayElemAt": ["$crawlConfig.name", 0]}}},
        ]

        if not resources:
            aggregate.extend([{"$unset": ["files"]}])

        if name:
            aggregate.extend([{"$match": {"name": name}}])

        if description:
            aggregate.extend([{"$match": {"description": description}}])

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if collection_id:
            aggregate.extend([{"$match": {"collections": {"$in": [collection_id]}}}])

        if sort_by:
            if sort_by not in ("started", "finished", "fileSize", "firstSeed"):
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

        cls = CrawlOut
        if resources:
            cls = CrawlOutWithResources

        crawls = []
        for result in items:
            crawl = cls.from_dict(result)
            files = result.get("files") if resources else None
            crawl = await self._resolve_crawl_refs(
                crawl, org, add_first_seed=False, files=files
            )
            crawls.append(crawl)

        return crawls, total

    # pylint: disable=arguments-differ
    async def get_crawl(self, crawlid: str, org: Organization):
        """Get data for single crawl"""

        res = await self.get_crawl_raw(crawlid, org)

        if res.get("files"):
            files = [CrawlFile(**data) for data in res["files"]]

            del res["files"]

            res["resources"] = await self._resolve_signed_urls(files, org, crawlid)

        del res["errors"]

        crawl = CrawlOutWithResources.from_dict(res)

        return await self._resolve_crawl_refs(crawl, org)

    async def delete_crawls(
        self, org: Organization, delete_list: DeleteCrawlList, type_="crawl"
    ):
        """Delete a list of crawls by id for given org"""

        count, size, cids_to_update = await super().delete_crawls(
            org, delete_list, type_
        )

        for cid in cids_to_update:
            await self.crawl_configs.stats_recompute_remove_crawl(cid, size)

        return count

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
        new_crawl = await add_new_crawl(self.crawls, crawl_id, crawlconfig, user.id)
        return await set_config_current_crawl_info(
            self.crawl_configs.crawl_configs,
            crawlconfig.id,
            new_crawl["id"],
            new_crawl["started"],
        )

    async def update_crawl_scale(
        self, crawl_id: str, org: Organization, crawl_scale: CrawlScale, user: User
    ):
        """Update crawl scale in the db"""
        crawl = await self.get_crawl_raw(crawl_id, org)
        update = UpdateCrawlConfig(scale=crawl_scale.scale)
        await self.crawl_configs.update_crawl_config(crawl["cid"], org, user, update)

        result = await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl", "oid": org.id},
            {"$set": {"scale": crawl_scale.scale}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail=f"Crawl '{crawl_id}' not found")

        return True

    async def update_crawl_state(self, crawl_id: str, state: str):
        """called only when job container is being stopped/canceled"""

        data = {"state": state}
        # if cancelation, set the finish time here
        if state == "canceled":
            data["finished"] = dt_now()

        await self.crawls.find_one_and_update(
            {
                "_id": crawl_id,
                "type": "crawl",
                "state": {"$in": RUNNING_AND_STARTING_STATES},
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
                if graceful:
                    await self.crawls.find_one_and_update(
                        {"_id": crawl_id, "type": "crawl", "oid": org.id},
                        {"$set": {"stopping": True}},
                    )
                return result

        except Exception as exc:
            # pylint: disable=raise-missing-from
            # if reached here, probably crawl doesn't exist anymore
            raise HTTPException(
                status_code=404, detail=f"crawl_not_found, (details: {exc})"
            )

        # if job no longer running, canceling is considered success,
        # but graceful stoppage is not possible, so would be a failure
        if result.get("error") == "Not Found":
            if not graceful:
                await self.update_crawl_state(crawl_id, "canceled")
                crawl = await self.get_crawl_raw(crawl_id, org)
                await self.crawl_configs.stats_recompute_remove_crawl(crawl["cid"], 0)
                return {"success": True}

        # return whatever detail may be included in the response
        raise HTTPException(status_code=400, detail=result)

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

    async def get_errors_from_redis(
        self, crawl_id: str, page_size: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        """Get crawl errors from Redis and optionally store in mongodb."""
        # Zero-index page for query
        page = page - 1
        skip = page * page_size
        upper_bound = skip + page_size - 1

        try:
            redis = await self.get_redis(crawl_id)
            errors = await redis.lrange(f"{crawl_id}:e", skip, upper_bound)
            total = await redis.llen(f"{crawl_id}:e")
        except exceptions.ConnectionError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=503, detail="redis_connection_error")

        parsed_errors = parse_jsonl_error_messages(errors)
        return parsed_errors, total

    async def add_or_remove_exclusion(self, crawl_id, regex, org, user, add):
        """add new exclusion to config or remove exclusion from config
        for given crawl_id, update config on crawl"""

        crawlraw = await self.crawls.find_one(
            {"_id": crawl_id, "type": "crawl"}, {"cid": True}
        )

        cid = crawlraw.get("cid")

        new_config = await self.crawl_configs.add_or_remove_exclusion(
            regex, cid, org, user, add
        )

        await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl", "oid": org.id},
            {"$set": {"config": new_config.dict()}},
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


# ============================================================================
async def add_new_crawl(
    crawls, crawl_id: str, crawlconfig: CrawlConfig, userid: UUID4, manual=True
):
    """initialize new crawl"""
    started = dt_now()

    crawl = Crawl(
        id=crawl_id,
        state="starting",
        userid=userid,
        oid=crawlconfig.oid,
        cid=crawlconfig.id,
        cid_rev=crawlconfig.rev,
        scale=crawlconfig.scale,
        jobType=crawlconfig.jobType,
        config=crawlconfig.config,
        profileid=crawlconfig.profileid,
        schedule=crawlconfig.schedule,
        crawlTimeout=crawlconfig.crawlTimeout,
        manual=manual,
        started=started,
        tags=crawlconfig.tags,
    )

    try:
        result = await crawls.insert_one(crawl.to_dict())
        return {"id": str(result.inserted_id), "started": str(started)}
    except pymongo.errors.DuplicateKeyError:
        # print(f"Crawl Already Added: {crawl.id} - {crawl.state}")
        return False


# ============================================================================
async def update_crawl_state_if_allowed(
    crawls, crawl_id, state, allowed_from, **kwargs
):
    """update crawl state and other properties in db if state has changed"""
    kwargs["state"] = state
    query = {"_id": crawl_id, "type": "crawl"}
    if allowed_from:
        query["state"] = {"$in": allowed_from}

    return await crawls.find_one_and_update(query, {"$set": kwargs})


# ============================================================================
async def get_crawl_state(crawls, crawl_id):
    """return current crawl state of a crawl"""
    res = await crawls.find_one({"_id": crawl_id}, projection=["state", "finished"])
    if not res:
        return None, None
    return res.get("state"), res.get("finished")


# ============================================================================
async def add_crawl_errors(crawls, crawl_id, errors):
    """add crawl errors from redis to mmongodb errors field"""
    await crawls.find_one_and_update(
        {"_id": crawl_id}, {"$push": {"errors": {"$each": errors}}}
    )


# ============================================================================
async def add_crawl_file(crawls, crawl_id, crawl_file, size):
    """add new crawl file to crawl"""
    await crawls.find_one_and_update(
        {"_id": crawl_id},
        {
            "$push": {"files": crawl_file.dict()},
            "$inc": {"fileCount": 1, "fileSize": size},
        },
    )


# ============================================================================
async def recompute_crawl_file_count_and_size(crawls, crawl_id):
    """Fully recompute file count and size for given crawl"""
    file_count = 0
    size = 0

    crawl_raw = await crawls.find_one({"_id": crawl_id})
    crawl = Crawl.from_dict(crawl_raw)
    for file_ in crawl.files:
        file_count += 1
        size += file_.size

    await crawls.find_one_and_update(
        {"_id": crawl_id},
        {"$set": {"fileCount": file_count, "fileSize": size}},
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
        collectionId: Optional[UUID4] = None,
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

        crawls, total = await ops.list_crawls(
            None,
            userid=userid,
            cid=cid,
            running_only=runningOnly,
            state=state,
            first_seed=firstSeed,
            name=name,
            description=description,
            collection_id=collectionId,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.get("/orgs/{oid}/crawls", tags=["crawls"], response_model=PaginatedResponse)
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
        collectionId: Optional[UUID4] = None,
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

        crawls, total = await ops.list_crawls(
            org,
            userid=userid,
            cid=cid,
            running_only=False,
            state=state,
            first_seed=firstSeed,
            name=name,
            description=description,
            collection_id=collectionId,
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

        res = await ops.delete_crawls(org, delete_list)

        return {"deleted": res}

    @app.get(
        "/orgs/all/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl(crawl_id, None)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl(crawl_id, org)

    @app.get(
        "/orgs/all/crawls/{crawl_id}",
        tags=["crawls"],
        response_model=CrawlOut,
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
        response_model=CrawlOut,
    )
    async def list_single_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        crawls, _ = await ops.list_crawls(org, crawl_id=crawl_id)
        if len(crawls) < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return crawls[0]

    @app.patch("/orgs/{oid}/crawls/{crawl_id}", tags=["crawls"])
    async def update_crawl_api(
        update: UpdateCrawl, crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.update_crawl(crawl_id, org, update, "crawl")

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/scale",
        tags=["crawls"],
    )
    async def scale_crawl(
        scale: CrawlScale,
        crawl_id,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.update_crawl_scale(crawl_id, org, scale, user)

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

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/errors",
        tags=["crawls"],
    )
    async def get_crawl_errors(
        crawl_id: str,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        org: Organization = Depends(org_crawl_dep),
    ):
        crawl_raw = await ops.get_crawl_raw(crawl_id, org)
        crawl = Crawl.from_dict(crawl_raw)

        if crawl.finished:
            skip = (page - 1) * pageSize
            upper_bound = skip + pageSize
            errors = crawl.errors[skip:upper_bound]
            parsed_errors = parse_jsonl_error_messages(errors)
            total = len(crawl.errors)
            return paginated_format(parsed_errors, total, page, pageSize)

        errors, total = await ops.get_errors_from_redis(crawl_id, pageSize, page)
        return paginated_format(errors, total, page, pageSize)

    return ops
