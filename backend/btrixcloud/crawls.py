""" Crawl API """
# pylint: disable=too-many-lines

import json
import re
import urllib.parse
from uuid import UUID

from typing import Optional, List, Dict, Union

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse
from redis import asyncio as exceptions
import pymongo

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import dt_now, parse_jsonl_error_messages, stream_dict_list_as_csv
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
    RUNNING_AND_STARTING_STATES,
    ALL_CRAWL_STATES,
)


MAX_MATCH_SIZE = 500000
DEFAULT_RANGE_LIMIT = 50


# ============================================================================
class CrawlOps(BaseCrawlOps):
    """Crawl Ops"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods

    def __init__(self, *args):
        super().__init__(*args)
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
        cid: Optional[UUID] = None,
        userid: Optional[UUID] = None,
        crawl_id: str = "",
        running_only=False,
        state: Optional[List[str]] = None,
        first_seed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collection_id: Optional[UUID] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
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
            query["state"] = {"$in": RUNNING_AND_STARTING_STATES}

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
        userid: UUID,
        started: str,
        manual: bool,
        username: str = "",
    ):
        """initialize new crawl"""
        if not username:
            user = await self.user_manager.get_by_id(userid)
            if user:
                username = user.name

        image = self.crawl_configs.get_channel_crawler_image(crawlconfig.crawlerChannel)

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
            crawlerChannel=crawlconfig.crawlerChannel,
            image=image,
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

    async def match_crawl_queue(self, crawl_id, regex, offset=0):
        """get list of urls that match regex, starting at offset and at most
        around 'limit'. (limit rounded to next step boundary, so
        limit <= next_offset < limit + step"""
        total = 0
        matched = []
        step = DEFAULT_RANGE_LIMIT

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
            size = 0

            for count in range(offset, total, step):
                results = await self._crawl_queue_range(
                    redis, f"{crawl_id}:q", count, step
                )
                for result in results:
                    url = json.loads(result)["url"]
                    if regex.search(url):
                        size += len(url)
                        matched.append(url)

                # if size of match response exceeds size limit, set nextOffset
                # and break
                if size > MAX_MATCH_SIZE:
                    next_offset = count + step
                    break

        return {"total": total, "matched": matched, "nextOffset": next_offset}

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

        crawl_raw = await self.get_crawl_raw(crawl_id, org, project={"cid": True})

        cid = crawl_raw.get("cid")

        scale = crawl_raw.get("scale", 1)

        async with self.get_redis(crawl_id) as redis:
            query = {
                "regex": regex,
                "type": "addExclusion" if add else "removeExclusion",
            }
            query_str = json.dumps(query)

            for i in range(0, scale):
                await redis.rpush(f"crawl-{crawl_id}-{i}:msg", query_str)

        new_config = await self.crawl_configs.add_or_remove_exclusion(
            regex, cid, org, user, add
        )

        await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl", "oid": org.id},
            {"$set": {"config": new_config.dict()}},
        )

        return {"success": True}

    async def update_crawl_state_if_allowed(
        self, crawl_id, state, allowed_from, **kwargs
    ):
        """update crawl state and other properties in db if state has changed"""
        kwargs["state"] = state
        query = {"_id": crawl_id, "type": "crawl"}
        if allowed_from:
            query["state"] = {"$in": allowed_from}

        return await self.crawls.find_one_and_update(query, {"$set": kwargs})

    async def update_running_crawl_stats(self, crawl_id, stats):
        """update running crawl stats"""
        query = {"_id": crawl_id, "type": "crawl", "state": "running"}
        return await self.crawls.find_one_and_update(query, {"$set": {"stats": stats}})

    async def inc_crawl_exec_time(self, crawl_id, exec_time):
        """increment exec time"""
        return await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl"},
            {"$inc": {"crawlExecSeconds": exec_time}},
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
        try:
            crawl = Crawl.from_dict(crawl_raw)
            return crawl.config.seeds[skip:upper_bound], len(crawl.config.seeds)
        # pylint: disable=broad-exception-caught
        except Exception:
            return [], 0

    async def get_crawl_stats(
        self, org: Optional[Organization] = None
    ) -> List[Dict[str, Union[str, int]]]:
        """Return crawl statistics"""
        # pylint: disable=too-many-locals
        org_slugs = await self.orgs.get_org_slugs_by_ids()
        user_emails = await self.user_manager.get_user_emails_by_ids()

        crawls_data: List[Dict[str, Union[str, int]]] = []

        query: Dict[str, Union[str, UUID]] = {"type": "crawl"}
        if org:
            query["oid"] = org.id

        async for crawl in self.crawls.find(query):
            data: Dict[str, Union[str, int]] = {}
            data["id"] = str(crawl.get("_id"))

            oid = crawl.get("oid")
            data["oid"] = str(oid)
            data["org"] = org_slugs[oid]

            data["cid"] = str(crawl.get("cid"))
            crawl_name = crawl.get("name")
            data["name"] = f'"{crawl_name}"' if crawl_name else ""
            data["state"] = crawl.get("state")

            userid = crawl.get("userid")
            data["userid"] = str(userid)
            data["user"] = user_emails.get(userid)

            started = crawl.get("started")
            finished = crawl.get("finished")

            data["started"] = str(started)
            data["finished"] = str(finished)

            data["duration"] = 0
            if started and finished:
                duration = finished - started
                duration_seconds = int(duration.total_seconds())
                if duration_seconds:
                    data["duration"] = duration_seconds

            done_stats = None
            if crawl.get("stats") and crawl.get("stats").get("done"):
                done_stats = crawl["stats"]["done"]

            data["pages"] = 0
            if done_stats:
                data["pages"] = done_stats

            data["filesize"] = crawl.get("fileSize", 0)

            data["avg_page_time"] = 0
            if (
                done_stats
                and done_stats != 0
                and started
                and finished
                and duration_seconds
            ):
                data["avg_page_time"] = int(duration_seconds / done_stats)

            crawls_data.append(data)

        return crawls_data


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
def init_crawls_api(app, user_dep, *args):
    """API for crawl management, including crawl done callback"""
    # pylint: disable=invalid-name, duplicate-code

    ops = CrawlOps(*args)

    org_viewer_dep = ops.orgs.org_viewer_dep
    org_crawl_dep = ops.orgs.org_crawl_dep

    @app.get("/orgs/all/crawls", tags=["crawls"])
    async def list_crawls_admin(
        user: User = Depends(user_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID] = None,
        cid: Optional[UUID] = None,
        state: Optional[str] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collectionId: Optional[UUID] = None,
        sortBy: Optional[str] = None,
        sortDirection: int = -1,
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
        userid: Optional[UUID] = None,
        cid: Optional[UUID] = None,
        state: Optional[str] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        collectionId: Optional[UUID] = None,
        sortBy: Optional[str] = None,
        sortDirection: int = -1,
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

    @app.get("/orgs/all/crawls/stats", tags=["crawls"])
    async def get_all_orgs_crawl_stats(
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        crawl_stats = await ops.get_crawl_stats()
        return stream_dict_list_as_csv(crawl_stats, "crawling-stats.csv")

    @app.get("/orgs/{oid}/crawls/stats", tags=["crawls"])
    async def get_org_crawl_stats(
        org: Organization = Depends(org_crawl_dep),
    ):
        crawl_stats = await ops.get_crawl_stats(org)
        return stream_dict_list_as_csv(crawl_stats, f"crawling-stats-{org.id}.csv")

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

        result = await ops.crawl_manager.scale_crawl(crawl_id, scale.scale)
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
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.get_crawl_raw(crawl_id, org)

        return await ops.match_crawl_queue(crawl_id, regex, offset)

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
            resp = await ops.storage_ops.sync_stream_wacz_logs(
                org, wacz_files, log_levels, contexts
            )
            return StreamingResponse(
                resp,
                media_type="text/jsonl",
                headers={
                    "Content-Disposition": f'attachment; filename="{crawl_id}.log"'
                },
            )

        raise HTTPException(status_code=400, detail="crawl_not_finished")

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/errors",
        tags=["crawls"],
    )
    async def get_crawl_errors(
        crawl_id: str,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        org: Organization = Depends(org_viewer_dep),
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
