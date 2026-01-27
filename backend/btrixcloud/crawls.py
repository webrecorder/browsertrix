"""Crawl API"""

# pylint: disable=too-many-lines

import json
import os
import re
import contextlib
import urllib.parse
from datetime import datetime
from uuid import UUID
import asyncio

from typing import (
    Annotated,
    Optional,
    List,
    Dict,
    Union,
    Any,
    Sequence,
    AsyncIterator,
    Tuple,
)

from fastapi import Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClientSession
from redis import asyncio as exceptions
from redis.asyncio.client import Redis
import pymongo

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import (
    dt_now,
    date_to_str,
    stream_dict_list_as_csv,
    validate_regexes,
    scale_from_browser_windows,
    browser_windows_from_scale,
    crawler_image_below_minimum,
)
from .basecrawls import BaseCrawlOps
from .crawlmanager import CrawlManager
from .crawl_logs import CrawlLogOps
from .models import (
    ListFilterType,
    UpdateCrawl,
    DeleteCrawlList,
    CrawlConfig,
    UpdateCrawlConfig,
    CrawlScale,
    CrawlStats,
    CrawlFile,
    Crawl,
    CrawlOut,
    CrawlOutWithResources,
    QARun,
    QARunOut,
    QARunWithResources,
    QARunAggregateStatsOut,
    DeleteQARunList,
    Organization,
    User,
    Seed,
    PaginatedCrawlOutResponse,
    PaginatedSeedResponse,
    PaginatedCrawlLogResponse,
    RUNNING_AND_WAITING_STATES,
    SUCCESSFUL_STATES,
    NON_RUNNING_STATES,
    ALL_CRAWL_STATES,
    TYPE_ALL_CRAWL_STATES,
    UpdatedResponse,
    SuccessResponse,
    StartedResponse,
    DeletedCountResponseQuota,
    DeletedCountResponse,
    EmptyResponse,
    CrawlScaleResponse,
    CrawlQueueResponse,
    MatchCrawlQueueResponse,
    CrawlLogLine,
    TagsResponse,
    TYPE_AUTO_PAUSED_STATES,
    UserRole,
)


MAX_MATCH_SIZE = 500000
DEFAULT_RANGE_LIMIT = 50


# ============================================================================
# pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods
class CrawlOps(BaseCrawlOps):
    """Crawl Ops"""

    crawl_manager: CrawlManager

    def __init__(
        self,
        crawl_manager: CrawlManager,
        log_ops: CrawlLogOps,
        *args,
    ):
        super().__init__(*args)
        self.crawl_manager = crawl_manager
        self.log_ops = log_ops
        self.crawl_configs.set_crawl_ops(self)
        self.colls.set_crawl_ops(self)
        self.event_webhook_ops.set_crawl_ops(self)

        self.min_qa_crawler_image = os.environ.get("MIN_QA_CRAWLER_IMAGE")

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
        await self.crawls.create_index(
            [
                ("state", pymongo.ASCENDING),
                ("oid", pymongo.ASCENDING),
                ("started", pymongo.ASCENDING),
            ]
        )
        await self.crawls.create_index([("finished", pymongo.DESCENDING)])
        await self.crawls.create_index([("oid", pymongo.HASHED)])
        await self.crawls.create_index([("cid", pymongo.HASHED)])
        await self.crawls.create_index([("state", pymongo.HASHED)])
        await self.crawls.create_index([("fileSize", pymongo.DESCENDING)])

    async def get_crawl(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
    ) -> Crawl:
        """Get crawl data for internal use"""
        res = await self.get_crawl_raw(crawlid, org, "crawl")
        return Crawl.from_dict(res)

    @contextlib.asynccontextmanager
    async def get_redis(self, crawl_id: str) -> AsyncIterator[Redis]:
        """get redis url for crawl id"""
        redis_url = self.crawl_manager.get_redis_url(crawl_id)

        redis = await self.crawl_manager.get_redis_client(redis_url)

        try:
            yield redis
        finally:
            await redis.close()

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
        tags: list[str] | None = None,
        tag_match: ListFilterType | None = ListFilterType.AND,
        collection_id: Optional[UUID] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: int = -1,
        resources: bool = False,
        session: AsyncIOMotorClientSession | None = None,
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
            query["state"] = {"$in": RUNNING_AND_WAITING_STATES}

        if tags:
            query_type = "$all" if tag_match == ListFilterType.AND else "$in"
            query["tags"] = {query_type: tags}

        # Override running_only if state list is explicitly passed
        if state:
            validated_states = [value for value in state if value in ALL_CRAWL_STATES]
            query["state"] = {"$in": validated_states}

        if crawl_id:
            query["_id"] = crawl_id

        # pylint: disable=duplicate-code
        aggregate = [
            {"$match": query},
            {"$unset": ["errors", "behaviorLogs", "config"]},
            {"$set": {"activeQAStats": "$qa.stats"}},
            {
                "$set": {
                    "qaFinishedArray": {
                        "$map": {
                            "input": {"$objectToArray": "$qaFinished"},
                            "in": "$$this.v",
                        }
                    }
                }
            },
            # Add active QA run to array if exists prior to sorting, taking care not to
            # pass null to $concatArrays so that our result isn't null
            {
                "$set": {
                    "qaActiveArray": {"$cond": [{"$ne": ["$qa", None]}, ["$qa"], []]}
                }
            },
            {
                "$set": {
                    "qaArray": {"$concatArrays": ["$qaFinishedArray", "$qaActiveArray"]}
                }
            },
            {
                "$set": {
                    "sortedQARuns": {
                        "$sortArray": {
                            "input": "$qaArray",
                            "sortBy": {"started": -1},
                        }
                    }
                }
            },
            {"$set": {"lastQARun": {"$arrayElemAt": ["$sortedQARuns", 0]}}},
            {"$set": {"lastQAState": "$lastQARun.state"}},
            {"$set": {"lastQAStarted": "$lastQARun.started"}},
            {
                "$set": {
                    "qaRunCount": {
                        "$size": {
                            "$cond": [
                                {"$isArray": "$qaArray"},
                                "$qaArray",
                                [],
                            ]
                        }
                    }
                }
            },
            {
                "$unset": [
                    "lastQARun",
                    "qaActiveArray",
                    "qaFinishedArray",
                    "qaArray",
                    "sortedQARuns",
                ]
            },
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
                "reviewStatus",
                "qaRunCount",
                "lastQAState",
                "lastQAStarted",
                "crawlExecSeconds",
                "pageCount",
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
        cursor = self.crawls.aggregate(aggregate, session=session)  # type: ignore # Argument 1 to "aggregate" of "AsyncIOMotorCollection" has incompatible type "list[object]"; expected "Sequence[Mapping[str, Any]]"
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
                crawl, org, files=files, session=session
            )
            crawls.append(crawl)

        return crawls, total

    async def get_active_crawls(self, oid: UUID, limit: int) -> list[str]:
        """get list of waiting crawls, sorted from earliest to latest"""
        res = (
            self.crawls.find(
                {"state": {"$in": RUNNING_AND_WAITING_STATES}, "oid": oid}, {"_id": 1}
            )
            .sort({"started": 1})
            .limit(limit)
        )
        res_list = await res.to_list()
        return [res["_id"] for res in res_list]

    async def get_active_crawls_pending_size(self, oid: UUID) -> int:
        """get pending size of all active (running, waiting, paused) crawls"""
        cursor = self.crawls.aggregate(
            [
                {"$match": {"state": {"$in": RUNNING_AND_WAITING_STATES}, "oid": oid}},
                {"$group": {"_id": None, "totalSum": {"$sum": "$pendingSize"}}},
            ]
        )
        results = await cursor.to_list(length=1)
        if not results:
            return 0

        return results[0].get("totalSum") or 0

    async def delete_crawls(
        self,
        org: Organization,
        delete_list: DeleteCrawlList,
        type_="crawl",
        user: Optional[User] = None,
    ) -> tuple[int, dict[UUID, dict[str, int]], bool]:
        """Delete a list of crawls by id for given org"""

        count, cids_to_update, quota_reached = await super().delete_crawls(
            org, delete_list, type_, user
        )

        if count < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        for cid, cid_dict in cids_to_update.items():
            cid_size = cid_dict["size"]
            cid_inc = cid_dict["inc"]
            cid_successful = cid_dict["successful"]
            await self.crawl_configs.stats_recompute_last(
                cid, -cid_size, -cid_inc, -cid_successful
            )

        return count, cids_to_update, quota_reached

    # pylint: disable=too-many-arguments
    async def add_new_crawl(
        self,
        crawl_id: str,
        crawlconfig: CrawlConfig,
        userid: UUID,
        started: datetime,
        manual: bool,
        username: str = "",
    ) -> None:
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
            scale=scale_from_browser_windows(crawlconfig.browserWindows),
            browserWindows=crawlconfig.browserWindows,
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
            proxyId=crawlconfig.proxyId,
            image=image,
            version=2,
            firstSeed=crawlconfig.firstSeed,
            seedCount=crawlconfig.seedCount,
        )

        try:
            await self.crawls.insert_one(crawl.to_dict())

        except pymongo.errors.DuplicateKeyError:
            pass

    async def update_crawl_scale(
        self,
        crawl_id: str,
        org: Organization,
        scale: int,
        browser_windows: int,
        user: User,
    ) -> bool:
        """Update crawl scale in the db"""
        crawl = await self.get_crawl(crawl_id, org)

        update = UpdateCrawlConfig(browserWindows=browser_windows)
        await self.crawl_configs.update_crawl_config(crawl.cid, org, user, update)

        result = await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl", "oid": org.id},
            {
                "$set": {
                    "scale": scale,
                    "browserWindows": browser_windows,
                }
            },
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail=f"Crawl '{crawl_id}' not found")

        return True

    async def _crawl_queue_len(self, redis, key) -> int:
        try:
            return await redis.zcard(key)
        except exceptions.ResponseError:
            # fallback to old crawler queue
            return await redis.llen(key)

    async def _crawl_queue_range(
        self, redis: Redis, key: str, offset: int, count: int
    ) -> list[str]:
        try:
            return await redis.zrangebyscore(key, 0, "inf", offset, count)
        except exceptions.ResponseError:
            # fallback to old crawler queue
            return list(reversed(await redis.lrange(key, -offset - count, -offset - 1)))

    async def get_crawl_queue(
        self, crawl_id: str, offset: int, count: int, regex: str
    ) -> CrawlQueueResponse:
        """get crawl queue"""

        state, _ = await self.get_crawl_state(crawl_id, False)

        if state not in RUNNING_AND_WAITING_STATES:
            raise HTTPException(status_code=400, detail="crawl_not_running")

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
                regex_re = re.compile(regex)
            except re.error as exc:
                raise HTTPException(status_code=400, detail="invalid_regex") from exc

            matched = [result for result in results if regex_re.search(result)]

        return CrawlQueueResponse(total=total, results=results, matched=matched)

    # pylint: disable=too-many-locals
    async def match_crawl_queue(
        self, crawl_id: str, regex: str, offset: int = 0
    ) -> MatchCrawlQueueResponse:
        """get list of urls that match regex, starting at offset and at most
        around 'limit'. (limit rounded to next step boundary, so
        limit <= next_offset < limit + step"""
        state, _ = await self.get_crawl_state(crawl_id, False)

        if state not in RUNNING_AND_WAITING_STATES:
            raise HTTPException(status_code=400, detail="crawl_not_running")

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
                regex_re = re.compile(regex)
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
                    if regex_re.search(url):
                        size += len(url)
                        matched.append(url)

                # if size of match response exceeds size limit, set nextOffset
                # and break
                if size > MAX_MATCH_SIZE:
                    next_offset = count + step
                    break

        return MatchCrawlQueueResponse(
            total=total, matched=matched, nextOffset=next_offset
        )

    async def add_or_remove_exclusion(
        self, crawl_id, regex, org, user, add
    ) -> dict[str, bool]:
        """add new exclusion to config or remove exclusion from config
        for given crawl_id, update config on crawl"""

        if add:
            validate_regexes([regex])

        crawl = await self.get_crawl(crawl_id, org)

        if crawl.state not in RUNNING_AND_WAITING_STATES:
            raise HTTPException(status_code=400, detail="crawl_not_running")

        cid = crawl.cid

        browser_windows = crawl.browserWindows or 2

        async with self.get_redis(crawl_id) as redis:
            query = {
                "regex": regex,
                "type": "addExclusion" if add else "removeExclusion",
            }
            query_str = json.dumps(query)

            scale = scale_from_browser_windows(browser_windows)
            for i in range(0, scale):
                await redis.rpush(f"crawl-{crawl_id}-{i}:msg", query_str)

        new_config = await self.crawl_configs.add_or_remove_exclusion(
            regex, cid, org, user, add
        )

        await self.crawl_manager.reload_running_crawl_config(crawl.id)

        await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl", "oid": org.id},
            {"$set": {"config": new_config.dict()}},
        )

        return {"success": True}

    async def update_crawl_state_if_allowed(
        self,
        crawl_id: str,
        is_qa: bool,
        state: TYPE_ALL_CRAWL_STATES,
        allowed_from: Sequence[TYPE_ALL_CRAWL_STATES],
        finished: Optional[datetime] = None,
        stats: Optional[CrawlStats] = None,
    ) -> bool:
        """update crawl state and other properties in db if state has changed"""
        prefix = "" if not is_qa else "qa."

        update: Dict[str, Any] = {f"{prefix}state": state}
        if finished:
            update[f"{prefix}finished"] = finished
        if stats:
            update[f"{prefix}stats"] = stats.dict()

        query: Dict[str, Any] = {"_id": crawl_id, "type": "crawl"}
        if allowed_from:
            query[f"{prefix}state"] = {"$in": allowed_from}

        res = await self.crawls.find_one_and_update(query, {"$set": update})
        return res is not None

    async def update_running_crawl_stats(
        self, crawl_id: str, is_qa: bool, stats: CrawlStats, pending_size: int
    ) -> bool:
        """update running crawl stats"""
        prefix = "" if not is_qa else "qa."
        query = {"_id": crawl_id, "type": "crawl", f"{prefix}state": "running"}
        update: dict[str, dict | int] = {f"{prefix}stats": stats.dict()}
        if not is_qa:
            update["pendingSize"] = pending_size

        res = await self.crawls.find_one_and_update(query, {"$set": update})
        return res is not None

    async def inc_crawl_exec_time(
        self,
        crawl_id: str,
        is_qa: bool,
        exec_time: int,
        last_updated_time: datetime,
    ) -> bool:
        """increment exec time"""
        # update both crawl-shared qa exec seconds and per-qa run exec seconds
        if is_qa:
            inc_update = {
                "qaCrawlExecSeconds": exec_time,
                "qa.crawlExecSeconds": exec_time,
            }
            field = "qa._lut"
        else:
            inc_update = {"crawlExecSeconds": exec_time}
            field = "_lut"

        res = await self.crawls.find_one_and_update(
            {
                "_id": crawl_id,
                "type": "crawl",
                field: {"$ne": last_updated_time},
            },
            {
                "$inc": inc_update,
                "$set": {field: last_updated_time},
            },
        )
        return res is not None

    async def get_crawl_exec_last_update_time(
        self, crawl_id: str, is_qa: bool
    ) -> Optional[datetime]:
        """get crawl last updated time"""
        field = "_lut" if not is_qa else "qa._lut"
        res = await self.crawls.find_one(
            {"_id": crawl_id, "type": "crawl"}, projection=[field]
        )
        if not res:
            return None

        return res.get("qa", {}).get("_lut") if is_qa else res.get("_lut")

    async def get_crawl_state(
        self, crawl_id: str, is_qa: bool
    ) -> tuple[Optional[TYPE_ALL_CRAWL_STATES], Optional[datetime]]:
        """return current crawl state of a crawl"""
        prefix = "" if not is_qa else "qa."

        res = await self.crawls.find_one(
            {"_id": crawl_id},
            projection={"state": f"${prefix}state", "finished": f"${prefix}finished"},
        )
        if not res:
            return None, None
        return res.get("state"), res.get("finished")

    async def is_upload(self, crawl_id: str):
        """return true if archived item with this id is an upload"""
        res = await self.crawls.find_one({"_id": crawl_id}, projection={"type": 1})
        if not res:
            return False
        return res.get("type") == "upload"

    async def add_crawl_file(
        self, crawl_id: str, is_qa: bool, crawl_file: CrawlFile, size: int
    ) -> bool:
        """add new crawl file to crawl"""
        prefix = "" if not is_qa else "qa."

        res = await self.crawls.find_one_and_update(
            {"_id": crawl_id},
            {
                "$push": {f"{prefix}files": crawl_file.dict()},
                "$inc": {f"{prefix}fileCount": 1, f"{prefix}fileSize": size},
            },
        )
        return res is not None

    async def get_crawl_seeds(
        self,
        crawl_id: str,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ) -> tuple[list[Seed], int]:
        """Get paginated list of seeds from crawl"""
        skip = (page - 1) * page_size
        upper_bound = skip + page_size

        crawl = await self.get_crawl(crawl_id, org)
        if not crawl.config or not crawl.config.seeds:
            return [], 0
        try:
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

        async for crawl_raw in self.crawls.find(query):
            crawl = Crawl.from_dict(crawl_raw)
            data: Dict[str, Union[str, int]] = {}
            data["id"] = crawl.id

            data["oid"] = str(crawl.oid)
            data["org"] = org_slugs[crawl.oid]

            data["cid"] = crawl.id
            data["name"] = f'"{crawl.name}"' if crawl.name else ""
            data["state"] = crawl.state

            data["userid"] = str(crawl.userid)
            data["user"] = user_emails.get(crawl.userid)

            data["started"] = date_to_str(crawl.started) if crawl.started else ""
            data["finished"] = date_to_str(crawl.finished) if crawl.finished else ""

            data["duration"] = 0
            duration_seconds = 0
            if crawl.started and crawl.finished:
                duration = crawl.finished - crawl.started
                duration_seconds = int(duration.total_seconds())
                if duration_seconds:
                    data["duration"] = duration_seconds

            if crawl.stats:
                data["pages"] = crawl.stats.done

            data["filesize"] = crawl.fileSize

            data["avg_page_time"] = 0
            if crawl.stats and crawl.stats.done != 0 and duration_seconds:
                data["avg_page_time"] = int(duration_seconds / crawl.stats.done)

            crawls_data.append(data)

        return crawls_data

    async def pause_crawl(
        self,
        crawl_id: str,
        org: Organization,
        pause: bool,
        paused_at: Optional[datetime] = None,
    ) -> Dict[str, bool]:
        """pause or resume a crawl temporarily"""
        crawl = await self.get_base_crawl(crawl_id, org)
        if crawl and crawl.type != "crawl":
            raise HTTPException(status_code=400, detail="not_a_crawl")

        result = None

        if pause and not paused_at:
            paused_at = dt_now()

        if not pause:
            # If unpausing, unset autoPausedEmailsSent so that we will send
            # emails again if quota is reached
            await self.set_auto_paused_emails_sent(crawl_id, org, False)

        try:
            result = await self.crawl_manager.pause_resume_crawl(
                crawl_id, paused_at=paused_at
            )

            if result.get("success"):
                await self.crawls.find_one_and_update(
                    {"_id": crawl_id, "type": "crawl", "oid": org.id},
                    {"$set": {"shouldPause": pause, "pausedAt": paused_at}},
                )

                return {"success": True}
        # pylint: disable=bare-except
        except:
            pass

        raise HTTPException(status_code=404, detail="crawl_not_found")

    async def shutdown_crawl(
        self, crawl_id: str, org: Organization, graceful: bool
    ) -> Dict[str, bool]:
        """stop or cancel specified crawl"""
        crawl = await self.get_base_crawl(crawl_id, org)
        if crawl and crawl.type != "crawl":
            raise HTTPException(status_code=400, detail="not_a_crawl")

        result = None
        try:
            result = await self.crawl_manager.shutdown_crawl(
                crawl_id, graceful=graceful
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
                crawl = await self.get_crawl(crawl_id, org)
                if not await self.crawl_configs.stats_recompute_last(
                    crawl.cid, 0, -1, 0
                ):
                    raise HTTPException(
                        status_code=404,
                        detail=f"crawl_config_not_found: {crawl.cid}",
                    )

                return {"success": True}

        # return whatever detail may be included in the response
        raise HTTPException(status_code=400, detail=result)

    async def start_crawl_qa_run(
        self, crawl_id: str, org: Organization, user: User
    ) -> str:
        """Start crawl QA run"""

        crawl = await self.get_crawl(crawl_id, org)

        # ensure org execution is allowed
        if org.readOnly:
            raise HTTPException(status_code=403, detail="org_set_to_read_only")

        # can only QA finished crawls
        if not crawl.finished:
            raise HTTPException(status_code=400, detail="crawl_not_finished")

        # can only QA successfully finished crawls
        if crawl.state not in SUCCESSFUL_STATES:
            raise HTTPException(status_code=400, detail="crawl_did_not_succeed")

        # if set, can only QA if crawl image is >= min_qa_crawler_image
        if (
            self.min_qa_crawler_image
            and crawl.image
            and crawler_image_below_minimum(crawl.image, self.min_qa_crawler_image)
        ):
            raise HTTPException(status_code=400, detail="qa_not_supported_for_crawl")

        # can only run one QA at a time
        if crawl.qa:
            raise HTTPException(status_code=400, detail="qa_already_running")

        # not a valid crawl
        if not crawl.cid or crawl.type != "crawl":
            raise HTTPException(status_code=400, detail="invalid_crawl_for_qa")

        self.orgs.can_write_data(org)

        crawlconfig = await self.crawl_configs.get_crawl_config(crawl.cid, org.id)

        try:
            qa_run_id = await self.crawl_manager.create_qa_crawl_job(
                crawlconfig,
                org.storage,
                userid=str(user.id),
                qa_source=crawl_id,
                storage_filename=self.crawl_configs.default_filename_template,
            )

            image = self.crawl_configs.get_channel_crawler_image(
                crawlconfig.crawlerChannel
            )

            qa_run = QARun(
                id=qa_run_id,
                started=dt_now(),
                userid=user.id,
                userName=user.name,
                state="starting",
                image=image,
            )

            await self.crawls.find_one_and_update(
                {"_id": crawl_id},
                {
                    "$set": {
                        "qa": qa_run.dict(),
                    }
                },
            )

            return qa_run_id

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {exc}")

    async def stop_crawl_qa_run(
        self, crawl_id: str, org: Organization, graceful: bool = True
    ) -> dict[str, bool]:
        """Stop crawl QA run, QA run removed when actually finished"""
        crawl = await self.get_crawl(crawl_id, org)

        if not crawl.qa:
            raise HTTPException(status_code=400, detail="qa_not_running")

        try:
            result = await self.crawl_manager.shutdown_crawl(
                crawl.qa.id, graceful=graceful
            )

            if result.get("error") == "Not Found":
                # treat as success, qa crawl no longer exists, so mark as no qa
                result = {"success": True}

            return result

        except Exception as exc:
            # pylint: disable=raise-missing-from
            # if reached here, probably crawl doesn't exist anymore
            raise HTTPException(
                status_code=404, detail=f"crawl_not_found, (details: {exc})"
            )

    async def delete_crawl_qa_runs(
        self, crawl_id: str, delete_list: DeleteQARunList, org: Organization
    ) -> dict[str, int]:
        """delete specified finished QA run"""
        count = 0
        for qa_run_id in delete_list.qa_run_ids:
            await self.page_ops.delete_qa_run_from_pages(crawl_id, qa_run_id)
            await self.delete_crawl_qa_run_files(crawl_id, qa_run_id, org)

            res = await self.crawls.find_one_and_update(
                {"_id": crawl_id, "type": "crawl"},
                {"$unset": {f"qaFinished.{qa_run_id}": ""}},
            )

            if res:
                count += 1

        return {"deleted": count}

    async def delete_crawl_qa_run_files(
        self, crawl_id: str, qa_run_id: str, org: Organization
    ) -> None:
        """delete crawl qa wacz files"""
        qa_run = await self.get_qa_run(crawl_id, qa_run_id, org)
        for file_ in qa_run.files:
            if not await self.storage_ops.delete_file_object(org, file_):
                raise HTTPException(status_code=400, detail="file_deletion_error")
            # Not replicating QA run WACZs yet
            # await self.background_job_ops.create_delete_replica_jobs(
            #     org, file_, qa_run_id, "qa"
            # )

    async def qa_run_finished(self, crawl_id: str) -> bool:
        """clear active qa, add qa run to finished list, if successful"""
        try:
            crawl = await self.get_crawl(crawl_id)
        # pylint: disable=bare-except
        except:
            return False

        if not crawl.qa:
            return False

        query: Dict[str, Any] = {"qa": None}

        if crawl.qa.finished and crawl.qa.state in NON_RUNNING_STATES:
            query[f"qaFinished.{crawl.qa.id}"] = crawl.qa.dict()

        res = await self.crawls.find_one_and_update(
            {"_id": crawl_id, "type": "crawl"}, {"$set": query}
        )

        await self.event_webhook_ops.create_qa_analysis_finished_notification(
            crawl.qa, crawl.oid, crawl.id
        )

        return res

    async def get_qa_runs(
        self,
        crawl_id: str,
        skip_failed: bool = False,
        org: Optional[Organization] = None,
    ) -> List[QARunOut]:
        """Return list of QA runs"""
        crawl_data = await self.get_crawl_raw(
            crawl_id, org, "crawl", project={"qaFinished": True, "qa": True}
        )
        qa_finished = crawl_data.get("qaFinished") or {}
        if skip_failed:
            all_qa = [
                QARunOut(**qa_run_data)
                for qa_run_data in qa_finished.values()
                if qa_run_data.get("state") in SUCCESSFUL_STATES
            ]
        else:
            all_qa = [QARunOut(**qa_run_data) for qa_run_data in qa_finished.values()]
        all_qa.sort(key=lambda x: x.finished or dt_now(), reverse=True)
        qa = crawl_data.get("qa")
        # ensure current QA run didn't just fail, just in case
        if qa and (not skip_failed or qa.get("state") in SUCCESSFUL_STATES):
            all_qa.insert(0, QARunOut(**qa))
        return all_qa

    async def get_active_qa(
        self, crawl_id: str, org: Optional[Organization] = None
    ) -> Optional[QARunOut]:
        """return just the active QA, if any"""
        crawl_data = await self.get_crawl_raw(
            crawl_id, org, "crawl", project={"qa": True}
        )
        qa = crawl_data.get("qa")
        return QARunOut(**qa) if qa else None

    async def get_qa_run(
        self, crawl_id: str, qa_run_id: str, org: Optional[Organization] = None
    ):
        """Get QARun by id"""
        crawl = await self.get_crawl(crawl_id, org)
        qa_finished = crawl.qaFinished or {}
        qa_run = qa_finished.get(qa_run_id)

        if not qa_run:
            raise HTTPException(status_code=404, detail="crawl_qa_not_found")

        return qa_run

    async def get_qa_run_for_replay(
        self, crawl_id: str, qa_run_id: str, org: Optional[Organization] = None
    ) -> QARunWithResources:
        """Fetch QA runs with resources for replay.json"""
        crawl = await self.get_crawl(crawl_id, org)
        qa_run = await self.get_qa_run(crawl_id, qa_run_id, org)

        if not org:
            org = await self.orgs.get_org_by_id(crawl.oid)
            if not org:
                raise HTTPException(status_code=400, detail="missing_org")

        resources = await self.resolve_signed_urls(qa_run.files, org, crawl.id)

        qa_run.files = []

        qa_run_dict = qa_run.dict()
        qa_run_dict["resources"] = resources

        return QARunWithResources(**qa_run_dict)

    async def download_qa_run_as_single_wacz(
        self, crawl_id: str, qa_run_id: str, org: Organization
    ):
        """Download all WACZs in a QA run as streaming nested WACZ"""
        qa_run = await self.get_qa_run_for_replay(crawl_id, qa_run_id, org)
        if not qa_run.finished:
            raise HTTPException(status_code=400, detail="qa_run_not_finished")

        if not qa_run.resources:
            raise HTTPException(status_code=400, detail="qa_run_no_resources")

        metadata = {
            "type": "qaRun",
            "id": qa_run_id,
            "crawlId": crawl_id,
            "organization": org.slug,
        }

        resp = await self.storage_ops.download_streaming_wacz(
            metadata, qa_run.resources
        )

        finished = qa_run.finished.isoformat()

        headers = {
            "Content-Disposition": f'attachment; filename="qa-{finished}-crawl-{crawl_id}.wacz"'
        }
        return StreamingResponse(
            resp, headers=headers, media_type="application/wacz+zip"
        )

    async def get_qa_run_aggregate_stats(
        self,
        crawl_id: str,
        qa_run_id: str,
        thresholds: Dict[str, List[float]],
    ) -> QARunAggregateStatsOut:
        """Get aggregate stats for QA run"""
        screenshot_results = await self.page_ops.get_qa_run_aggregate_counts(
            crawl_id, qa_run_id, thresholds, key="screenshotMatch"
        )
        text_results = await self.page_ops.get_qa_run_aggregate_counts(
            crawl_id, qa_run_id, thresholds, key="textMatch"
        )
        return QARunAggregateStatsOut(
            screenshotMatch=screenshot_results,
            textMatch=text_results,
        )

    async def get_crawl_logs(
        self,
        org: Organization,
        crawl_id: str,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = "timestamp",
        sort_direction: int = 1,
        contexts: Optional[List[str]] = None,
        log_levels: Optional[List[str]] = None,
        qa_run_id: Optional[str] = None,
    ) -> Tuple[list[CrawlLogLine], int]:
        """get crawl logs"""
        return await self.log_ops.get_crawl_logs(
            org,
            crawl_id,
            page_size=page_size,
            page=page,
            sort_by=sort_by,
            sort_direction=sort_direction,
            contexts=contexts,
            log_levels=log_levels,
            qa_run_id=qa_run_id,
        )

    async def notify_org_admins_of_auto_paused_crawl(
        self,
        paused_reason: TYPE_AUTO_PAUSED_STATES,
        crawl_id: str,
        cid: UUID,
        org: Organization,
    ):
        """Send email to all org admins about automatically paused crawl"""
        if await self.get_auto_paused_emails_sent(crawl_id, org):
            return

        users = await self.orgs.get_users_for_org(org, UserRole.OWNER)
        workflow = await self.crawl_configs.get_crawl_config_out(cid, org)

        await asyncio.gather(
            *[
                self.user_manager.email.send_crawl_auto_paused(
                    user.name,
                    user.email,
                    paused_reason,
                    workflow.lastCrawlPausedExpiry,
                    cid,
                    org,
                )
                for user in users
            ]
        )

        await self.set_auto_paused_emails_sent(crawl_id, org)

    async def set_auto_paused_emails_sent(
        self, crawl_id: str, org: Organization, emails_sent: bool = True
    ):
        """Set if auto-paused emails already sent"""
        await self.crawls.find_one_and_update(
            {"_id": crawl_id, "oid": org.id, "type": "crawl"},
            {"$set": {"autoPausedEmailsSent": emails_sent}},
        )

    async def get_auto_paused_emails_sent(
        self, crawl_id: str, org: Organization
    ) -> bool:
        """Return whether auto-paused emails already sent for crawl"""
        res = await self.crawls.find_one(
            {"_id": crawl_id, "oid": org.id, "type": "crawl"},
            projection=["autoPausedEmailsSent"],
        )
        if res:
            return res.get("autoPausedEmailsSent", False)
        return False


# ============================================================================
async def recompute_crawl_file_count_and_size(crawls, crawl_id: str):
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
    crawl_manager: CrawlManager,
    crawl_log_ops: CrawlLogOps,
    app,
    user_dep,
    *args,
):
    """API for crawl management, including crawl done callback"""
    # pylint: disable=invalid-name, duplicate-code

    ops = CrawlOps(crawl_manager, crawl_log_ops, *args)

    org_viewer_dep = ops.orgs.org_viewer_dep
    org_crawl_dep = ops.orgs.org_crawl_dep

    @app.get(
        "/orgs/all/crawls", tags=["crawls"], response_model=PaginatedCrawlOutResponse
    )
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

    @app.get(
        "/orgs/{oid}/crawls", tags=["crawls"], response_model=PaginatedCrawlOutResponse
    )
    async def list_crawls(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID] = None,
        cid: Optional[UUID] = None,
        state: Annotated[list[str] | None, Query()] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Annotated[list[str] | None, Query()] = None,
        tag_match: Annotated[
            ListFilterType | None,
            Query(
                alias="tagMatch",
                title="Tag Match Type",
                description='Defaults to `"and"` if omitted',
            ),
        ] = ListFilterType.AND,
        collectionId: Optional[UUID] = None,
        sortBy: Optional[str] = None,
        sortDirection: int = -1,
    ):
        # Support both comma-separated values and multiple search parameters
        # e.g. `?state=running,paused` and `?state=running&state=paused`
        if state and len(state) == 1:
            states: list[str] | None = state[0].split(",")
        else:
            states = state if state else None

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
            tags=tags,
            tag_match=tag_match,
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
        response_model=SuccessResponse,
    )
    async def crawl_cancel_immediately(
        crawl_id, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.shutdown_crawl(crawl_id, org, graceful=False)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/stop",
        tags=["crawls"],
        response_model=SuccessResponse,
    )
    async def crawl_graceful_stop(crawl_id, org: Organization = Depends(org_crawl_dep)):
        return await ops.shutdown_crawl(crawl_id, org, graceful=True)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/pause",
        tags=["crawls"],
        response_model=SuccessResponse,
    )
    async def pause_crawl(crawl_id, org: Organization = Depends(org_crawl_dep)):
        return await ops.pause_crawl(crawl_id, org, pause=True)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/resume",
        tags=["crawls"],
        response_model=SuccessResponse,
    )
    async def resume_crawl(crawl_id, org: Organization = Depends(org_crawl_dep)):
        return await ops.pause_crawl(crawl_id, org, pause=False)

    @app.post(
        "/orgs/{oid}/crawls/delete",
        tags=["crawls"],
        response_model=DeletedCountResponseQuota,
    )
    async def delete_crawls(
        delete_list: DeleteCrawlList,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        count, _, quota_reached = await ops.delete_crawls(
            org, delete_list, "crawl", user
        )
        return DeletedCountResponseQuota(
            deleted=count, storageQuotaReached=quota_reached
        )

    @app.get(
        "/orgs/{oid}/crawls/tagCounts",
        tags=["crawls"],
        response_model=TagsResponse,
    )
    async def get_crawls_tag_counts(
        org: Organization = Depends(org_viewer_dep),
        onlySuccessful: bool = True,
    ):
        tags = await ops.get_all_crawls_tag_counts(
            org, only_successful=onlySuccessful, type_="crawl"
        )
        return {"tags": tags}

    @app.get("/orgs/all/crawls/stats", tags=["crawls"], response_model=bytes)
    async def get_all_orgs_crawl_stats(
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        crawl_stats = await ops.get_crawl_stats()
        return stream_dict_list_as_csv(crawl_stats, "crawling-stats.csv")

    @app.get("/orgs/{oid}/crawls/stats", tags=["crawls"], response_model=bytes)
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
    async def get_crawl_admin(
        crawl_id, request: Request, user: User = Depends(user_dep)
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl_out(
            crawl_id, None, "crawl", headers=dict(request.headers)
        )

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/replay.json",
        tags=["crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl_out(
        crawl_id, request: Request, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_crawl_out(
            crawl_id, org, "crawl", headers=dict(request.headers)
        )

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/download", tags=["crawls"], response_model=bytes
    )
    async def download_crawl_as_single_wacz(
        crawl_id: str,
        preferSingleWACZ: bool = False,
        org: Organization = Depends(org_viewer_dep),
    ):
        return await ops.download_crawl_as_single_wacz(
            crawl_id, org, prefer_single_wacz=preferSingleWACZ
        )

    # QA APIs
    # ---------------------
    @app.get(
        "/orgs/all/crawls/{crawl_id}/qa/{qa_run_id}/replay.json",
        tags=["qa"],
        response_model=QARunWithResources,
    )
    async def get_qa_run_admin(crawl_id, qa_run_id, user: User = Depends(user_dep)):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_qa_run_for_replay(crawl_id, qa_run_id)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/replay.json",
        tags=["qa"],
        response_model=QARunWithResources,
    )
    async def get_qa_run(
        crawl_id, qa_run_id, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_qa_run_for_replay(crawl_id, qa_run_id, org)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/download",
        tags=["qa"],
        response_model=bytes,
    )
    async def download_qa_run_as_single_wacz(
        crawl_id: str, qa_run_id: str, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.download_qa_run_as_single_wacz(crawl_id, qa_run_id, org)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/stats",
        tags=["qa"],
        response_model=QARunAggregateStatsOut,
    )
    async def get_qa_run_aggregate_stats(
        crawl_id,
        qa_run_id,
        screenshotThresholds: str,
        textThresholds: str,
        # pylint: disable=unused-argument
        org: Organization = Depends(org_viewer_dep),
    ):
        thresholds: Dict[str, List[float]] = {}
        try:
            thresholds["screenshotMatch"] = [
                float(threshold) for threshold in screenshotThresholds.split(",")
            ]
            thresholds["textMatch"] = [
                float(threshold) for threshold in textThresholds.split(",")
            ]
        # pylint: disable=broad-exception-caught,raise-missing-from
        except Exception:
            raise HTTPException(status_code=400, detail="invalid_thresholds")

        return await ops.get_qa_run_aggregate_stats(
            crawl_id,
            qa_run_id,
            thresholds,
        )

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/qa/start",
        tags=["qa"],
        response_model=StartedResponse,
    )
    async def start_crawl_qa_run(
        crawl_id: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        qa_run_id = await ops.start_crawl_qa_run(crawl_id, org, user)
        return {"started": qa_run_id}

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/qa/stop",
        tags=["qa"],
        response_model=SuccessResponse,
    )
    async def stop_crawl_qa_run(
        crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        # pylint: disable=unused-argument
        return await ops.stop_crawl_qa_run(crawl_id, org)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/qa/cancel",
        tags=["qa"],
        response_model=SuccessResponse,
    )
    async def cancel_crawl_qa_run(
        crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        # pylint: disable=unused-argument
        return await ops.stop_crawl_qa_run(crawl_id, org, graceful=False)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/qa/delete",
        tags=["qa"],
        response_model=DeletedCountResponse,
    )
    async def delete_crawl_qa_runs(
        crawl_id: str,
        qa_run_ids: DeleteQARunList,
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_crawl_qa_runs(crawl_id, qa_run_ids, org)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa",
        tags=["qa"],
        response_model=List[QARunOut],
    )
    async def get_qa_runs(
        crawl_id, org: Organization = Depends(org_viewer_dep), skipFailed: bool = False
    ):
        return await ops.get_qa_runs(crawl_id, skip_failed=skipFailed, org=org)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/activeQA",
        tags=["qa"],
        response_model=Dict[str, Optional[QARunOut]],
    )
    async def get_active_qa(crawl_id, org: Organization = Depends(org_viewer_dep)):
        return {"qa": await ops.get_active_qa(crawl_id, org)}

    # ----

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

    @app.patch(
        "/orgs/{oid}/crawls/{crawl_id}", tags=["crawls"], response_model=UpdatedResponse
    )
    async def update_crawl_api(
        update: UpdateCrawl, crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.update_crawl(crawl_id, org, update, "crawl")

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/scale",
        tags=["crawls"],
        response_model=CrawlScaleResponse,
    )
    async def scale_crawl(
        crawl_scale: CrawlScale,
        crawl_id,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        if crawl_scale.browserWindows:
            browser_windows = crawl_scale.browserWindows
            scale = scale_from_browser_windows(browser_windows)
        elif crawl_scale.scale:
            scale = crawl_scale.scale
            browser_windows = browser_windows_from_scale(scale)
        else:
            raise HTTPException(
                status_code=400, detail="browser_windows_or_scale_required"
            )

        await ops.update_crawl_scale(crawl_id, org, scale, browser_windows, user)

        result = await ops.crawl_manager.scale_crawl(crawl_id, scale, browser_windows)
        if not result or not result.get("success"):
            raise HTTPException(
                status_code=400, detail=result.get("error") or "unknown"
            )

        return {"scaled": True, "browserWindows": browser_windows}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/access",
        tags=["crawls"],
        response_model=EmptyResponse,
    )
    async def access_check(crawl_id, org: Organization = Depends(org_crawl_dep)):
        if await ops.get_crawl_raw(crawl_id, org):
            return {}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/queue",
        tags=["crawls"],
        response_model=CrawlQueueResponse,
    )
    async def get_crawl_queue(
        crawl_id,
        offset: int,
        count: int,
        regex: str = "",
        org: Organization = Depends(org_crawl_dep),
    ):
        await ops.get_crawl_raw(crawl_id, org)

        return await ops.get_crawl_queue(crawl_id, offset, count, regex)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/queueMatchAll",
        tags=["crawls"],
        response_model=MatchCrawlQueueResponse,
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
        response_model=SuccessResponse,
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
        response_model=SuccessResponse,
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
        response_model=PaginatedSeedResponse,
    )
    async def get_crawl_config_seeds(
        crawl_id: str,
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        seeds, total = await ops.get_crawl_seeds(crawl_id, org, pageSize, page)
        return paginated_format(seeds, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/logs", tags=["crawls"], response_model=bytes
    )
    async def stream_crawl_logs(
        crawl_id,
        org: Organization = Depends(org_viewer_dep),
        logLevel: Optional[str] = None,
        context: Optional[str] = None,
    ):
        crawl = await ops.get_crawl_out(crawl_id, org)

        log_levels = []
        contexts = []
        if logLevel:
            log_levels = logLevel.split(",")
        if context:
            contexts = context.split(",")

        # If crawl is finished, stream logs from WACZ files using presigned urls
        if crawl.finished:
            resp = await ops.storage_ops.sync_stream_wacz_logs(
                crawl.resources or [], log_levels, contexts
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
        response_model=PaginatedCrawlLogResponse,
    )
    async def get_crawl_errors(
        crawl_id: str,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        org: Organization = Depends(org_viewer_dep),
        sortBy: str = "timestamp",
        sortDirection: int = 1,
    ):
        log_lines, total = await ops.get_crawl_logs(
            org,
            crawl_id,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            log_levels=["error", "fatal"],
            qa_run_id=None,
        )
        return paginated_format(log_lines, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/behaviorLogs",
        tags=["crawls"],
        response_model=PaginatedCrawlLogResponse,
    )
    async def get_crawl_behavior_logs(
        crawl_id: str,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        org: Organization = Depends(org_viewer_dep),
        sortBy: str = "timestamp",
        sortDirection: int = 1,
    ):
        log_lines, total = await ops.get_crawl_logs(
            org,
            crawl_id,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            contexts=["behavior", "behaviorScript", "behaviorScriptCustom"],
            qa_run_id=None,
        )
        return paginated_format(log_lines, total, page, pageSize)

    return ops
