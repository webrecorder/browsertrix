""" Crawl API """

import asyncio
import json
import uuid
import os

from typing import Optional, List, Dict, Union
from datetime import datetime

import websockets
from fastapi import Depends, HTTPException, WebSocket
from pydantic import BaseModel, UUID4, conint
import pymongo
import aioredis

from db import BaseMongoModel
from archives import Archive, MAX_CRAWL_SCALE
from storages import get_presigned_url


# ============================================================================
class DeleteCrawlList(BaseModel):
    """ delete crawl list POST body """

    crawl_ids: List[str]


# ============================================================================
class CrawlScale(BaseModel):
    """ scale the crawl to N parallel containers """

    scale: conint(ge=1, le=MAX_CRAWL_SCALE) = 1


# ============================================================================
class CrawlFile(BaseModel):
    """ file from a crawl """

    filename: str
    hash: str
    size: int
    def_storage_name: Optional[str]


# ============================================================================
class CrawlFileOut(BaseModel):
    """ output for file from a crawl (conformance to Data Resource Spec) """

    name: str
    path: str
    hash: str
    size: int


# ============================================================================
class Crawl(BaseMongoModel):
    """ Store State of a Crawl (Finished or Running) """

    id: str

    userid: UUID4
    aid: UUID4
    cid: UUID4

    # schedule: Optional[str]
    manual: Optional[bool]

    started: datetime
    finished: Optional[datetime]

    state: str

    scale: conint(ge=1, le=MAX_CRAWL_SCALE) = 1
    completions: Optional[int] = 0

    stats: Optional[Dict[str, str]]

    files: Optional[List[CrawlFile]] = []

    colls: Optional[List[str]] = []


# ============================================================================
class CrawlOut(Crawl):
    """ Output for single crawl, add configName and userName"""

    userName: Optional[str]
    configName: Optional[str]
    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class ListCrawlOut(BaseMongoModel):
    """ Crawl output model for list view """

    id: str

    userid: UUID4
    userName: Optional[str]

    cid: UUID4
    configName: Optional[str]

    manual: Optional[bool]

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, str]]

    fileSize: int = 0
    fileCount: int = 0

    colls: Optional[List[str]] = []


# ============================================================================
class ListCrawls(BaseModel):
    """ Response model for list of crawls """

    crawls: List[ListCrawlOut]


# ============================================================================
class CrawlCompleteIn(BaseModel):
    """ Completed Crawl Webhook POST message  """

    id: str

    user: str

    filename: str
    size: int
    hash: str

    completed: Optional[bool] = True


# ============================================================================
class CrawlOps:
    """ Crawl Ops """

    # pylint: disable=too-many-arguments, too-many-instance-attributes
    def __init__(self, mdb, redis_url, users, crawl_manager, crawl_configs, archives):
        self.crawls = mdb["crawls"]
        self.crawl_manager = crawl_manager
        self.crawl_configs = crawl_configs
        self.user_manager = users
        self.archives = archives
        self.crawls_done_key = "crawls-done"

        self.presign_duration = int(os.environ.get("PRESIGN_DURATION_SECONDS", 3600))

        self.redis = None
        asyncio.create_task(self.init_redis(redis_url))
        asyncio.create_task(self.init_index())

        self.crawl_manager.set_crawl_ops(self)

    async def init_index(self):
        """ init index for crawls db """
        await self.crawls.create_index("colls")

    async def init_redis(self, redis_url):
        """ init redis async """
        self.redis = await aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        )
        self.pubsub = self.redis.pubsub()

        loop = asyncio.get_running_loop()
        loop.create_task(self.run_crawl_complete_loop())

    async def run_crawl_complete_loop(self):
        """ Wait for any crawls done from redis queue """
        while True:
            try:
                _, value = await self.redis.blpop(self.crawls_done_key, timeout=0)
                value = json.loads(value)
                await self.on_handle_crawl_complete(CrawlCompleteIn(**value))

            # pylint: disable=broad-except
            except Exception as exc:
                print(f"Retrying crawls done loop: {exc}")
                await asyncio.sleep(10)

    async def on_handle_crawl_complete(self, msg: CrawlCompleteIn):
        """ Handle completed crawl, add to crawls db collection, also update archive usage """
        print(msg, flush=True)
        crawl, crawl_file = await self.crawl_manager.process_crawl_complete(msg)
        if not crawl:
            print("Not a valid crawl complete msg!", flush=True)
            return

        await self.store_crawl(crawl, crawl_file)

    async def store_crawl(self, crawl: Crawl, crawl_file: CrawlFile = None):
        """Add finished crawl to db, increment archive usage.
        If crawl file provided, update and add file"""
        if crawl_file:
            await self.get_redis_stats([crawl])

            crawl_update = {
                "$set": crawl.to_dict(exclude={"files", "completions"}),
                "$push": {"files": crawl_file.dict()},
            }

            if crawl.state == "complete":
                crawl_update["$inc"] = {"completions": 1}

            await self.crawls.find_one_and_update(
                {"_id": crawl.id},
                crawl_update,
                upsert=True,
            )

        else:
            try:
                await self.crawls.insert_one(crawl.to_dict())
            except pymongo.errors.DuplicateKeyError:
                # print(f"Crawl Already Added: {crawl.id} - {crawl.state}")
                return False

        dura = int((crawl.finished - crawl.started).total_seconds())

        print(f"Duration: {dura}", flush=True)

        await self.archives.inc_usage(crawl.aid, dura)

        await self.crawl_configs.inc_crawls(
            crawl.cid, crawl.id, crawl.finished, crawl.state
        )

        return True

    async def list_finished_crawls(
        self,
        aid: uuid.UUID = None,
        cid: uuid.UUID = None,
        collid: uuid.UUID = None,
        exclude_files=False,
    ):
        """List all finished crawls from the db """
        query = {}
        if aid:
            query["aid"] = aid

        if cid:
            query["cid"] = cid

        if collid:
            query["colls"] = collid

        aggregate = [
            {"$match": query},
            {
                "$lookup": {
                    "from": "crawl_configs",
                    "localField": "cid",
                    "foreignField": "_id",
                    "as": "configName",
                },
            },
            {"$set": {"configName": {"$arrayElemAt": ["$configName.name", 0]}}},
            {
                "$lookup": {
                    "from": "users",
                    "localField": "userid",
                    "foreignField": "id",
                    "as": "userName",
                },
            },
            {"$set": {"userName": {"$arrayElemAt": ["$userName.name", 0]}}},
        ]

        if exclude_files:
            aggregate.extend(
                [
                    {"$set": {"fileSize": {"$sum": "$files.size"}}},
                    {"$set": {"fileCount": {"$size": "$files"}}},
                    {"$unset": ["files"]},
                ]
            )
            crawl_cls = ListCrawlOut
        else:
            crawl_cls = CrawlOut

        cursor = self.crawls.aggregate(aggregate)

        results = await cursor.to_list(length=1000)
        return [crawl_cls.from_dict(res) for res in results]

    async def list_crawls(self, archive: Archive):
        """ list finished and running crawl data """
        running_crawls = await self.crawl_manager.list_running_crawls(
            aid=archive.id_str
        )

        await self.get_redis_stats(running_crawls)

        finished_crawls = await self.list_finished_crawls(
            aid=archive.id, exclude_files=True
        )

        crawls = []

        for crawl in running_crawls:
            list_crawl = ListCrawlOut(**crawl.dict())
            crawls.append(await self._resolve_crawl_refs(list_crawl, archive))

        crawls.extend(finished_crawls)

        return ListCrawls(crawls=crawls)

    async def get_crawl(self, crawlid: str, archive: Archive):
        """ Get data for single crawl """

        res = await self.crawls.find_one({"_id": crawlid, "aid": archive.id})

        if not res:
            crawl = await self.crawl_manager.get_running_crawl(crawlid, archive.id_str)
            if crawl:
                await self.get_redis_stats([crawl])

        else:
            files = [CrawlFile(**data) for data in res["files"]]

            del res["files"]

            res["resources"] = await self._resolve_signed_urls(files, archive)
            crawl = CrawlOut.from_dict(res)

        if not crawl:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawlid}")

        return await self._resolve_crawl_refs(crawl, archive)

    async def _resolve_crawl_refs(
        self, crawl: Union[CrawlOut, ListCrawlOut], archive: Archive
    ):
        """ Resolve running crawl data """
        config = await self.crawl_configs.get_crawl_config(
            crawl.cid, archive, active_only=False
        )

        if config:
            crawl.configName = config.name

        user = await self.user_manager.get(crawl.userid)
        if user:
            crawl.userName = user.name

        return crawl

    async def _resolve_signed_urls(self, files, archive: Archive):
        if not files:
            return

        async with self.redis.pipeline(transaction=True) as pipe:
            for file_ in files:
                pipe.get(f"{file_.filename}")

            results = await pipe.execute()

        out_files = []

        for file_, presigned_url in zip(files, results):
            if not presigned_url:
                presigned_url = await get_presigned_url(
                    archive, file_, self.crawl_manager, self.presign_duration
                )
                await self.redis.setex(
                    f"f:{file_.filename}", self.presign_duration - 1, presigned_url
                )

            out_files.append(
                CrawlFileOut(
                    name=file_.filename,
                    path=presigned_url,
                    hash=file_.hash,
                    size=file_.size,
                )
            )

        return out_files

    async def _resolve_filenames(self, crawl: CrawlOut):
        """ Resolve absolute filenames for each file """
        if not crawl.files:
            return

        for file_ in crawl.files:
            if file_.def_storage_name:
                storage_prefix = (
                    await self.crawl_manager.get_default_storage_access_endpoint(
                        file_.def_storage_name
                    )
                )
                file_.filename = storage_prefix + file_.filename

    # pylint: disable=too-many-arguments
    async def get_redis_stats(self, crawl_list):
        """ Add additional live crawl stats from redis """
        results = None

        def pairwise(iterable):
            val = iter(iterable)
            return zip(val, val)

        async with self.redis.pipeline(transaction=True) as pipe:
            for crawl in crawl_list:
                key = crawl.id
                pipe.llen(f"{key}:d")
                pipe.scard(f"{key}:s")

            results = await pipe.execute()

        for crawl, (done, total) in zip(crawl_list, pairwise(results)):
            crawl.stats = {"done": done, "found": total}

    async def delete_crawls(self, aid: uuid.UUID, delete_list: DeleteCrawlList):
        """ Delete a list of crawls by id for given archive """
        res = await self.crawls.delete_many(
            {"_id": {"$in": delete_list.crawl_ids}, "aid": aid}
        )
        return res.deleted_count

    async def handle_watch_ws(self, crawl_id: str, websocket: WebSocket):
        """ Handle watch WS by proxying screencast data via redis pubsub """
        # ensure websocket connected
        await websocket.accept()

        ctrl_channel = f"c:{crawl_id}:ctrl"
        cast_channel = f"c:{crawl_id}:cast"

        await self.redis.publish(ctrl_channel, "connect")

        async with self.pubsub as chan:
            await chan.subscribe(cast_channel)

            # pylint: disable=broad-except
            try:
                while True:
                    message = await chan.get_message(ignore_subscribe_messages=True)
                    if not message:
                        continue

                    await websocket.send_text(message["data"])

            except websockets.exceptions.ConnectionClosedOK:
                pass

            except Exception as exc:
                print(exc, flush=True)

            finally:
                await self.redis.publish(ctrl_channel, "disconnect")


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals
def init_crawls_api(
    app, mdb, redis_url, users, crawl_manager, crawl_config_ops, archives
):
    """ API for crawl management, including crawl done callback"""

    ops = CrawlOps(mdb, redis_url, users, crawl_manager, crawl_config_ops, archives)

    archive_crawl_dep = archives.archive_crawl_dep

    @app.get("/archives/{aid}/crawls", tags=["crawls"], response_model=ListCrawls)
    async def list_crawls(archive: Archive = Depends(archive_crawl_dep)):
        return await ops.list_crawls(archive)

    @app.post(
        "/archives/{aid}/crawls/{crawl_id}/cancel",
        tags=["crawls"],
    )
    async def crawl_cancel_immediately(
        crawl_id, archive: Archive = Depends(archive_crawl_dep)
    ):
        crawl = None
        try:
            crawl = await crawl_manager.stop_crawl(
                crawl_id, archive.id_str, graceful=False
            )

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Canceling Crawl: {exc}")

        if not crawl:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawl_id}")

        await ops.store_crawl(crawl)

        return {"canceled": True}

    @app.post(
        "/archives/{aid}/crawls/{crawl_id}/stop",
        tags=["crawls"],
    )
    async def crawl_graceful_stop(
        crawl_id, archive: Archive = Depends(archive_crawl_dep)
    ):
        stopping = False
        try:
            stopping = await crawl_manager.stop_crawl(
                crawl_id, archive.id_str, graceful=True
            )

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Stopping Crawl: {exc}")

        if not stopping:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawl_id}")

        return {"stopping_gracefully": True}

    @app.post("/archives/{aid}/crawls/delete", tags=["crawls"])
    async def delete_crawls(
        delete_list: DeleteCrawlList, archive: Archive = Depends(archive_crawl_dep)
    ):
        try:
            for crawl_id in delete_list:
                await crawl_manager.stop_crawl(crawl_id, archive.id, graceful=False)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Stopping Crawl: {exc}")

        res = await ops.delete_crawls(archive.id, delete_list)

        return {"deleted": res}

    @app.get(
        "/archives/{aid}/crawls/{crawl_id}.json",
        tags=["crawls"],
        response_model=CrawlOut,
    )
    async def get_crawl(crawl_id, archive: Archive = Depends(archive_crawl_dep)):
        return await ops.get_crawl(crawl_id, archive)

    @app.post(
        "/archives/{aid}/crawls/{crawl_id}/scale",
        tags=["crawls"],
    )
    async def scale_crawl(
        scale: CrawlScale, crawl_id, archive: Archive = Depends(archive_crawl_dep)
    ):

        error = await crawl_manager.scale_crawl(crawl_id, archive.id_str, scale.scale)
        if error:
            raise HTTPException(status_code=400, detail=error)

        return {"scaled": scale.scale}

    @app.websocket("/archives/{aid}/crawls/{crawl_id}/watch/ws")
    async def watch_ws(
        crawl_id, websocket: WebSocket, archive: Archive = Depends(archive_crawl_dep)
    ):
        # ensure crawl exists
        await ops.get_crawl(crawl_id, archive)

        await ops.handle_watch_ws(crawl_id, websocket)

    return ops
