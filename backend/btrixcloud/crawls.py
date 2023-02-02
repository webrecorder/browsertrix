""" Crawl API """

import asyncio
import uuid
import os
import json
import re

from typing import Optional, List, Dict, Union
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from pydantic import BaseModel, UUID4, conint
from redis import asyncio as aioredis, exceptions
import pymongo


from .db import BaseMongoModel
from .users import User
from .orgs import Organization, MAX_CRAWL_SCALE
from .storages import get_presigned_url


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


# ============================================================================
class Crawl(BaseMongoModel):
    """Store State of a Crawl (Finished or Running)"""

    id: str

    userid: UUID4
    oid: UUID4
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
    tags: Optional[List[str]] = []


# ============================================================================
class CrawlOut(Crawl):
    """Output for single crawl, add configName and userName"""

    userName: Optional[str]
    configName: Optional[str]
    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class ListCrawlOut(BaseMongoModel):
    """Crawl output model for list view"""

    id: str

    userid: UUID4
    userName: Optional[str]

    oid: UUID4
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
    tags: Optional[List[str]] = []


# ============================================================================
class ListCrawls(BaseModel):
    """Response model for list of crawls"""

    crawls: List[ListCrawlOut]


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
    """Update crawl tags"""

    tags: Optional[List[str]] = []


# ============================================================================
class CrawlOps:
    """Crawl Ops"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes
    def __init__(self, mdb, users, crawl_manager, crawl_configs, orgs):
        self.crawls = mdb["crawls"]
        self.crawl_manager = crawl_manager
        self.crawl_configs = crawl_configs
        self.user_manager = users
        self.orgs = orgs
        self.namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"

        self.crawl_configs.set_crawl_ops(self)

        self.presign_duration = int(os.environ.get("PRESIGN_DURATION_SECONDS", 3600))

    async def init_index(self):
        """init index for crawls db"""
        await self.crawls.create_index("colls")

    async def list_crawls(
        self,
        org: Optional[Organization] = None,
        cid: uuid.UUID = None,
        collid: uuid.UUID = None,
        userid: uuid.UUID = None,
        crawl_id: str = None,
        exclude_files=True,
        running_only=False,
    ):
        """List all finished crawls from the db"""

        oid = org.id if org else None

        query = {}
        if oid:
            query["oid"] = oid

        if cid:
            query["cid"] = cid

        if collid:
            query["colls"] = collid

        if userid:
            query["userid"] = userid

        if running_only:
            query["state"] = {"$in": ["running", "starting", "stopping"]}

        if crawl_id:
            query["_id"] = crawl_id

        # pylint: disable=duplicate-code
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
        crawls = [crawl_cls.from_dict(res) for res in results]
        return crawls

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

            res["resources"] = await self._resolve_signed_urls(files, org)

        crawl = CrawlOut.from_dict(res)

        return await self._resolve_crawl_refs(crawl, org)

    async def _resolve_crawl_refs(
        self, crawl: Union[CrawlOut, ListCrawlOut], org: Organization
    ):
        """Resolve running crawl data"""
        config = await self.crawl_configs.get_crawl_config(
            crawl.cid, org, active_only=False
        )

        if config:
            crawl.configName = config.name

        user = await self.user_manager.get(crawl.userid)
        if user:
            crawl.userName = user.name

        return crawl

    async def _resolve_signed_urls(self, files, org: Organization):
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
                )
            )

        if updates:
            asyncio.create_task(self._update_presigned(updates))

        print("presigned", out_files)

        return out_files

    async def _update_presigned(self, updates):
        for update in updates:
            await self.crawls.find_one_and_update(*update)

    async def delete_crawls(self, oid: uuid.UUID, delete_list: DeleteCrawlList):
        """Delete a list of crawls by id for given org"""
        res = await self.crawls.delete_many(
            {"_id": {"$in": delete_list.crawl_ids}, "oid": oid}
        )
        return res.deleted_count

    async def add_new_crawl(self, crawl_id: str, crawlconfig):
        """initialize new crawl"""
        crawl = Crawl(
            id=crawl_id,
            state="starting",
            userid=crawlconfig.userid,
            oid=crawlconfig.oid,
            cid=crawlconfig.id,
            scale=crawlconfig.scale,
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
        """Update existing crawl (tags only for now)"""
        query = update.dict(exclude_unset=True, exclude_none=True)

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

    async def get_crawl_queue(self, crawl_id, offset, count, regex):
        """get crawl queue"""

        total = 0
        results = []
        redis = None

        try:
            redis = await self.get_redis(crawl_id)
            total = await redis.llen(f"{crawl_id}:q")
            results = await redis.lrange(f"{crawl_id}:q", -offset - count, -offset - 1)
            results = [json.loads(result)["url"] for result in reversed(results)]
        except exceptions.ConnectionError:
            # can't connect to redis, likely not initialized yet
            pass

        matched = []
        if regex:
            regex = re.compile(regex)
            matched = [result for result in results if regex.search(result)]

        return {"total": total, "results": results, "matched": matched}

    async def iter_crawl_queue(self, regex, redis, crawl_id, total, step=50):
        """iterate over urls that match regex in crawl queue list"""

    async def match_crawl_queue(self, crawl_id, regex):
        """get list of urls that match regex"""
        total = 0
        redis = None

        try:
            redis = await self.get_redis(crawl_id)
            total = await redis.llen(f"{crawl_id}:q")
        except exceptions.ConnectionError:
            # can't connect to redis, likely not initialized yet
            pass

        regex = re.compile(regex)
        matched = []
        step = 50

        for count in range(0, total, step):
            results = await redis.lrange(f"{crawl_id}:q", -count - step, -count - 1)
            for result in reversed(results):
                url = json.loads(result)["url"]
                if regex.search(url):
                    matched.append(url)

        return {"total": total, "matched": matched}

    async def filter_crawl_queue(self, crawl_id, regex):
        """filter out urls that match regex"""
        total = 0
        redis = None

        q_key = f"{crawl_id}:q"
        s_key = f"{crawl_id}:s"

        try:
            redis = await self.get_redis(crawl_id)
            total = await redis.llen(q_key)
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
            results = await redis.lrange(q_key, -count - step, -count - 1)
            count += step
            for result in reversed(results):
                url = json.loads(result)["url"]
                if regex.search(url):
                    await redis.srem(s_key, url)
                    res = await redis.lrem(q_key, dircount, result)
                    if res:
                        count -= res
                        num_removed += res
                        print(f"Removed {result}: {res}", flush=True)

        return num_removed

    async def get_redis(self, crawl_id):
        """get redis url for crawl id"""
        # pylint: disable=line-too-long
        redis_url = f"redis://redis-{crawl_id}-0.redis-{crawl_id}.{self.namespace}.svc.cluster.local/0"

        return await aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        )

    async def add_exclusion(self, crawl_id, regex, org, user):
        """create new config with additional exclusion, copying existing config"""

        raw = await self.get_crawl_raw(crawl_id, org)

        cid = raw.get("cid")

        new_cid = await self.crawl_configs.copy_add_remove_exclusion(
            regex, cid, org, user, add=True
        )

        await self.crawls.find_one_and_update(
            {"_id": crawl_id}, {"$set": {"cid": new_cid}}
        )

        # restart crawl pods
        change_c = self.crawl_manager.change_crawl_config(crawl_id, org.id, new_cid)

        filter_q = self.filter_crawl_queue(crawl_id, regex)

        _, num_removed = await asyncio.gather(change_c, filter_q)

        return {"new_cid": new_cid, "num_removed": num_removed}

    async def remove_exclusion(self, crawl_id, regex, org, user):
        """create new config with exclusion removed, copying existing config"""

        raw = await self.get_crawl_raw(crawl_id, org)

        cid = raw.get("cid")

        new_cid = await self.crawl_configs.copy_add_remove_exclusion(
            regex, cid, org, user, add=False
        )

        await self.crawls.find_one_and_update(
            {"_id": crawl_id}, {"$set": {"cid": new_cid}}
        )

        # restart crawl pods
        await self.crawl_manager.change_crawl_config(crawl_id, org.id, new_cid)

        return {"new_cid": new_cid}


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals
def init_crawls_api(app, mdb, users, crawl_manager, crawl_config_ops, orgs, user_dep):
    """API for crawl management, including crawl done callback"""

    ops = CrawlOps(mdb, users, crawl_manager, crawl_config_ops, orgs)

    org_viewer_dep = orgs.org_viewer_dep
    org_crawl_dep = orgs.org_crawl_dep

    @app.get("/orgs/all/crawls", tags=["crawls"], response_model=ListCrawls)
    async def list_crawls_admin(
        user: User = Depends(user_dep),
        userid: Optional[UUID4] = None,
        cid: Optional[UUID4] = None,
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return ListCrawls(
            crawls=await ops.list_crawls(
                None, userid=userid, cid=cid, running_only=True
            )
        )

    @app.get("/orgs/{oid}/crawls", tags=["crawls"], response_model=ListCrawls)
    async def list_crawls(
        org: Organization = Depends(org_viewer_dep),
        userid: Optional[UUID4] = None,
        cid: Optional[UUID4] = None,
    ):
        return ListCrawls(
            crawls=await ops.list_crawls(
                org, userid=userid, cid=cid, running_only=False
            )
        )

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
        delete_list: DeleteCrawlList, org: Organization = Depends(org_crawl_dep)
    ):
        try:
            for crawl_id in delete_list:
                await crawl_manager.stop_crawl(crawl_id, org.id, graceful=False)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail=f"Error Stopping Crawl: {exc}")

        res = await ops.delete_crawls(org.id, delete_list)

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

        crawls = await ops.list_crawls(crawl_id=crawl_id)
        if len(crawls) < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return crawls[0]

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}",
        tags=["crawls"],
        response_model=ListCrawlOut,
    )
    async def list_single_crawl(crawl_id, org: Organization = Depends(org_viewer_dep)):
        crawls = await ops.list_crawls(org, crawl_id=crawl_id)
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
        return await ops.add_exclusion(crawl_id, regex, org, user)

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
        return await ops.remove_exclusion(crawl_id, regex, org, user)

    return ops


def dt_now():
    """get current ts"""
    return datetime.utcnow().replace(microsecond=0, tzinfo=None)


def ts_now():
    """get current ts"""
    return str(dt_now())
