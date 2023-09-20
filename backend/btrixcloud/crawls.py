""" Crawl API """
# pylint: disable=too-many-lines

import asyncio
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

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .storages import sync_stream_wacz_logs
from .utils import dt_now, parse_jsonl_error_messages
from .basecrawls import BaseCrawlOps
from .models import (
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
    def __init__(
        self, mdb, users, crawl_manager, crawl_configs, orgs, colls, event_webhook_ops
    ):
        super().__init__(mdb, users, orgs, crawl_configs, crawl_manager, colls)
        self.crawls = self.crawls
        self.crawl_configs = crawl_configs
        self.user_manager = users
        self.event_webhook_ops = event_webhook_ops

        self.crawl_configs.set_crawl_ops(self)
        self.colls.set_crawl_ops(self)
        self.event_webhook_ops.set_crawl_ops(self)

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
        await self.crawls.create_index(
            [("type", pymongo.HASHED), ("fileSize", pymongo.DESCENDING)]
        )

        await self.crawls.create_index([("finished", pymongo.DESCENDING)])
        await self.crawls.create_index([("oid", pymongo.HASHED)])
        await self.crawls.create_index([("cid", pymongo.HASHED)])
        await self.crawls.create_index([("state", pymongo.HASHED)])
        await self.crawls.create_index([("fileSize", pymongo.DESCENDING)])

    async def list_crawls(
        self,
        org: Optional[Organization] = None,
        cid: Optional[uuid.UUID] = None,
        userid: Optional[uuid.UUID] = None,
        crawl_id: str = "",
        running_only=False,
        state: Optional[List[str]] = None,
        first_seed: str = "",
        name: str = "",
        description: str = "",
        collection_id: Optional[uuid.UUID] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = "",
        sort_direction: int = -1,
        resources: bool = False,
    ):
        """List all finished crawls from the db"""
        # pylint: disable=too-many-locals,too-many-branches,too-many-statements
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        oid = org.id if org else None

        query: dict[str, object] = {"type": {"$in": ["crawl", None]}}
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
            {"$unset": ["firstSeedObject", "errors", "config"]},
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
            aggregate.extend([{"$match": {"collectionIds": {"$in": [collection_id]}}}])

        if sort_by:
            if sort_by not in (
                "started",
                "finished",
                "fileSize",
                "firstSeed",
            ):
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

    async def delete_crawls(
        self,
        org: Organization,
        delete_list: DeleteCrawlList,
        type_="crawl",
        user: Optional[User] = None,
    ):
        """Delete a list of crawls by id for given org"""

        count, cids_to_update, quota_reached = await super().delete_crawls(
            org, delete_list, type_, user
        )

        if count < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        for cid, cid_dict in cids_to_update.items():
            cid_size = cid_dict["size"]
            cid_inc = cid_dict["inc"]
            await self.crawl_configs.stats_recompute_last(cid, -cid_size, -cid_inc)

        return {"deleted": True, "storageQuotaReached": quota_reached}

    async def get_wacz_files(self, crawl_id: str, org: Organization):
        """Return list of WACZ files associated with crawl."""
        wacz_files = []
        crawl_raw = await self.get_crawl_raw(crawl_id, org)
        crawl = Crawl.from_dict(crawl_raw)
        for file_ in crawl.files:
            if file_.filename.endswith(".wacz"):
                wacz_files.append(file_)
        return wacz_files

    # pylint: disable=too-many-arguments
    async def add_new_crawl(
        self,
        crawl_id: str,
        crawlconfig: CrawlConfig,
        userid: uuid.UUID,
        started: str,
        manual: bool,
        username: str = "",
    ):
        """initialize new crawl"""
        if not username:
            user = await self.user_manager.get(userid)
            if user:
                username = user.name

        crawl = Crawl(
            id=crawl_id,
            state="starting",
            userid=userid,
            userName=username,
            oid=crawlconfig.oid,
            cid=crawlconfig.id,
            cid_rev=crawlconfig.rev,
            scale=crawlconfig.scale,
            jobType=crawlconfig.jobType,
            config=crawlconfig.config,
            profileid=crawlconfig.profileid,
            schedule=crawlconfig.schedule,
            crawlTimeout=crawlconfig.crawlTimeout,
            maxCrawlSize=crawlconfig.maxCrawlSize,
            manual=manual,
            started=started,
            tags=crawlconfig.tags,
            name=crawlconfig.name,
        )

        try:
            await self.crawls.insert_one(crawl.to_dict())
            return dt_now

        except pymongo.errors.DuplicateKeyError:
            # print(f"Crawl Already Added: {crawl.id} - {crawl.state}")
            return None

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

        try:
            async with self.get_redis(crawl_id) as redis:
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
            try:
                regex = re.compile(regex)
            except re.error as exc:
                raise HTTPException(status_code=400, detail="invalid_regex") from exc

            matched = [result for result in results if regex.search(result)]

        return {"total": total, "results": results, "matched": matched}

    async def match_crawl_queue(self, crawl_id, regex, offset=0, limit=1000):
        """get list of urls that match regex, starting at offset and at most
        around 'limit'. (limit rounded to next step boundary, so
        limit <= next_offset < limit + step"""
        total = 0
        matched = []
        step = 50

        async with self.get_redis(crawl_id) as redis:
            try:
                total = await self._crawl_queue_len(redis, f"{crawl_id}:q")
            except exceptions.ConnectionError:
                # can't connect to redis, likely not initialized yet
                pass

            try:
                regex = re.compile(regex)
            except re.error as exc:
                raise HTTPException(status_code=400, detail="invalid_regex") from exc

            next_offset = -1

            for count in range(offset, total, step):
                results = await self._crawl_queue_range(
                    redis, f"{crawl_id}:q", count, step
                )
                for result in results:
                    url = json.loads(result)["url"]
                    if regex.search(url):
                        matched.append(url)

                # if exceeded limit set nextOffset to next step boundary
                # and break
                if len(matched) >= limit:
                    next_offset = count + step
                    break

        return {"total": total, "matched": matched, "nextOffset": next_offset}

    async def filter_crawl_queue(self, crawl_id, regex):
        """filter out urls that match regex"""
        # pylint: disable=too-many-locals
        total = 0
        q_key = f"{crawl_id}:q"
        s_key = f"{crawl_id}:s"
        step = 50
        num_removed = 0

        async with self.get_redis(crawl_id) as redis:
            try:
                total = await self._crawl_queue_len(redis, f"{crawl_id}:q")
            except exceptions.ConnectionError:
                # can't connect to redis, likely not initialized yet
                pass

            dircount = -1

            try:
                regex = re.compile(regex)
            except re.error as exc:
                raise HTTPException(status_code=400, detail="invalid_regex") from exc

            count = 0

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

        async with self.get_redis(crawl_id) as redis:
            try:
                errors = await redis.lrange(f"{crawl_id}:e", skip, upper_bound)
                total = await redis.llen(f"{crawl_id}:e")
            except exceptions.ConnectionError:
                # pylint: disable=raise-missing-from
                raise HTTPException(status_code=503, detail="error_logs_not_available")

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

    async def update_crawl_state_if_allowed(
        self, crawl_id, state, allowed_from, **kwargs
    ):
        """update crawl state and other properties in db if state has changed"""
        kwargs["state"] = state
        query = {"_id": crawl_id, "type": "crawl"}
        if allowed_from:
            query["state"] = {"$in": list(allowed_from)}

        return await self.crawls.find_one_and_update(query, {"$set": kwargs})

    async def update_running_crawl_stats(self, crawl_id, stats):
        """update running crawl stats"""
        query = {"_id": crawl_id, "type": "crawl", "state": "running"}
        return await self.crawls.find_one_and_update(query, {"$set": {"stats": stats}})

    async def store_exec_time(self, crawl_id, exec_time):
        """set exec time, only if not already set"""
        query = {"_id": crawl_id, "type": "crawl", "execTime": {"$in": [0, None]}}
        return await self.crawls.find_one_and_update(
            query, {"$set": {"execTime": exec_time}}
        )

    async def get_crawl_state(self, crawl_id):
        """return current crawl state of a crawl"""
        res = await self.crawls.find_one(
            {"_id": crawl_id}, projection=["state", "finished"]
        )
        if not res:
            return None, None
        return res.get("state"), res.get("finished")

    async def add_crawl_errors(self, crawl_id, errors):
        """add crawl errors from redis to mongodb errors field"""
        await self.crawls.find_one_and_update(
            {"_id": crawl_id}, {"$push": {"errors": {"$each": errors}}}
        )

    async def add_crawl_file(self, crawl_id, crawl_file, size):
        """add new crawl file to crawl"""
        await self.crawls.find_one_and_update(
            {"_id": crawl_id},
            {
                "$push": {"files": crawl_file.dict()},
                "$inc": {"fileCount": 1, "fileSize": size},
            },
        )

    async def get_crawl_seeds(
        self,
        crawl_id: str,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        """Get paginated list of seeds from crawl"""
        skip = (page - 1) * page_size
        upper_bound = skip + page_size

        crawl_raw = await self.get_crawl_raw(crawl_id, org)
        crawl = Crawl.from_dict(crawl_raw)
        try:
            return crawl.config.seeds[skip:upper_bound], len(crawl.config.seeds)
        # pylint: disable=broad-exception-caught
        except Exception:
            return [], 0


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
def init_crawls_api(
    app,
    mdb,
    users,
    crawl_manager,
    crawl_config_ops,
    orgs,
    colls,
    user_dep,
    event_webhook_ops,
):
    """API for crawl management, including crawl done callback"""
    # pylint: disable=invalid-name

    ops = CrawlOps(
        mdb, users, crawl_manager, crawl_config_ops, orgs, colls, event_webhook_ops
    )

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

        states = []
        if state:
            states = state.split(",")

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
            state=states,
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
        states = []
        if state:
            states = state.split(",")

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
            state=states,
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
        return await ops.delete_crawls(org, delete_list, "crawl", user)

    @app.get(
        "/orgs/all/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl_admin(crawl_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl(crawl_id, None, "crawl")

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl(crawl_id, org, "crawl")

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
        crawl_id,
        regex: str,
        offset: int = 0,
        limit: int = 1000,
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.get_crawl_raw(crawl_id, org)

        return await ops.match_crawl_queue(crawl_id, regex, offset, limit)

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

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/seeds",
        tags=["crawls"],
        response_model=PaginatedResponse,
    )
    async def get_crawl_config_seeds(
        crawl_id: str,
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        seeds, total = await ops.get_crawl_seeds(crawl_id, org, pageSize, page)
        return paginated_format(seeds, total, page, pageSize)

    @app.get("/orgs/{oid}/crawls/{crawl_id}/logs", tags=["crawls"])
    async def stream_crawl_logs(
        crawl_id,
        org: Organization = Depends(org_viewer_dep),
        logLevel: Optional[str] = None,
        context: Optional[str] = None,
    ):
        crawl = await ops.get_crawl(crawl_id, org, "crawl")

        log_levels = []
        contexts = []
        if logLevel:
            log_levels = logLevel.split(",")
        if context:
            contexts = context.split(",")

        # If crawl is finished, stream logs from WACZ files
        if crawl.finished:
            wacz_files = await ops.get_wacz_files(crawl_id, org)
            resp = await sync_stream_wacz_logs(
                org, wacz_files, log_levels, contexts, crawl_manager
            )
            return StreamingResponse(resp)

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
