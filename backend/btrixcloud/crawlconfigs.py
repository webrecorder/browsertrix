"""
Crawl Config API handling
"""

from typing import List, Union, Optional
from enum import Enum
import uuid
import asyncio
import re
from datetime import datetime

import pymongo
from pydantic import BaseModel, UUID4, conint
from fastapi import APIRouter, Depends, HTTPException

from .users import User
from .archives import Archive, MAX_CRAWL_SCALE

from .db import BaseMongoModel


# ============================================================================
class ScopeType(str, Enum):
    """Crawl scope type"""

    PAGE = "page"
    PAGE_SPA = "page-spa"
    PREFIX = "prefix"
    HOST = "host"
    DOMAIN = "domain"
    ANY = "any"


# ============================================================================
class Seed(BaseModel):
    """Crawl seed"""

    url: str
    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None]
    exclude: Union[str, List[str], None]
    sitemap: Union[bool, str, None]
    allowHash: Optional[bool]
    depth: Optional[int]


# ============================================================================
class RawCrawlConfig(BaseModel):
    """Base Crawl Config"""

    seeds: List[Union[str, Seed]]

    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None]
    exclude: Union[str, List[str], None]

    depth: Optional[int] = -1
    limit: Optional[int] = 0
    extraHops: Optional[int] = 0

    behaviorTimeout: Optional[int]

    workers: Optional[int]

    headless: Optional[bool]

    generateWACZ: Optional[bool]
    combineWARC: Optional[bool]

    logging: Optional[str]
    behaviors: Optional[str] = "autoscroll,autoplay,autofetch,siteSpecific"


# ============================================================================
class CrawlConfigIn(BaseModel):
    """CrawlConfig input model, submitted via API"""

    schedule: Optional[str] = ""
    runNow: Optional[bool] = False

    config: RawCrawlConfig

    name: Optional[str]

    profileid: Optional[UUID4]

    colls: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    oldId: Optional[UUID4]


# ============================================================================
class CrawlConfig(BaseMongoModel):
    """Schedulable config"""

    schedule: Optional[str] = ""

    config: RawCrawlConfig

    name: Optional[str]

    created: Optional[datetime]

    colls: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    aid: UUID4

    userid: UUID4

    profileid: Optional[UUID4]

    crawlAttemptCount: Optional[int] = 0

    crawlCount: Optional[int] = 0

    lastCrawlId: Optional[str]
    lastCrawlTime: Optional[datetime]
    lastCrawlState: Optional[str]

    newId: Optional[UUID4]
    oldId: Optional[UUID4]
    inactive: Optional[bool] = False

    def get_raw_config(self):
        """ serialize config for browsertrix-crawler """
        return self.config.dict(exclude_unset=True, exclude_none=True)


# ============================================================================
class CrawlConfigOut(CrawlConfig):
    """Crawl Config Output, includes currCrawlId of running crawl"""

    currCrawlId: Optional[str]
    profileName: Optional[str]
    userName: Optional[str]


# ============================================================================
class CrawlConfigIdNameOut(BaseMongoModel):
    """ Crawl Config id and name output only """

    name: str


# ============================================================================
class CrawlConfigsResponse(BaseModel):
    """ model for crawl configs response """

    crawlConfigs: List[CrawlConfigOut]


# ============================================================================
class UpdateCrawlConfig(BaseModel):
    """ Update crawl config name or crawl schedule """

    name: Optional[str]
    schedule: Optional[str]
    profileid: Optional[str]
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)]


# ============================================================================
# pylint: disable=too-many-instance-attributes,too-many-arguments
class CrawlConfigOps:
    """Crawl Config Operations"""

    def __init__(
        self, dbclient, mdb, user_manager, archive_ops, crawl_manager, profiles
    ):
        self.dbclient = dbclient
        self.crawl_configs = mdb["crawl_configs"]
        self.user_manager = user_manager
        self.archive_ops = archive_ops
        self.crawl_manager = crawl_manager
        self.profiles = profiles
        self.profiles.set_crawlconfigs(self)
        self.crawl_ops = None

        self.router = APIRouter(
            prefix="/crawlconfigs",
            tags=["crawlconfigs"],
            responses={404: {"description": "Not found"}},
        )

        self.coll_ops = None
        self._file_rx = re.compile("\\W+")

        asyncio.create_task(self.init_index())

    def set_crawl_ops(self, ops):
        """ set crawl ops reference """
        self.crawl_ops = ops

    async def init_index(self):
        """ init index for crawls db """
        await self.crawl_configs.create_index(
            [("aid", pymongo.HASHED), ("inactive", pymongo.ASCENDING)]
        )

    def set_coll_ops(self, coll_ops):
        """ set collection ops """
        self.coll_ops = coll_ops

    def sanitize(self, string=""):
        """ sanitize string for use in wacz filename"""
        return self._file_rx.sub("-", string.lower())

    async def add_crawl_config(
        self, config: CrawlConfigIn, archive: Archive, user: User
    ):
        """Add new crawl config"""
        data = config.dict()
        data["aid"] = archive.id
        data["userid"] = user.id
        data["_id"] = uuid.uuid4()
        data["created"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        profile_filename = None
        if config.profileid:
            profile_filename = await self.profiles.get_profile_storage_path(
                config.profileid, archive
            )
            if not profile_filename:
                raise HTTPException(status_code=400, detail="invalid_profile_id")

        if config.colls:
            data["colls"] = await self.coll_ops.find_collections(
                archive.id, config.colls
            )

        old_id = data.get("oldId")

        if old_id:
            old_config = await self.get_crawl_config(old_id, archive)
            async with await self.dbclient.start_session() as sesh:
                async with sesh.start_transaction():
                    if (
                        await self.make_inactive_or_delete(old_config, data["_id"])
                        == "deleted"
                    ):
                        data["oldId"] = old_config.oldId

                    result = await self.crawl_configs.insert_one(data)

        else:
            result = await self.crawl_configs.insert_one(data)

        crawlconfig = CrawlConfig.from_dict(data)

        suffix = f"{self.sanitize(crawlconfig.name)}-{self.sanitize(user.name)}"

        # pylint: disable=line-too-long
        out_filename = (
            f"data/{self.sanitize(crawlconfig.name)}-@id/{suffix}-@ts-@hostsuffix.wacz"
        )

        crawl_id = await self.crawl_manager.add_crawl_config(
            crawlconfig=crawlconfig,
            storage=archive.storage,
            run_now=config.runNow,
            out_filename=out_filename,
            profile_filename=profile_filename,
        )

        if crawl_id and config.runNow:
            await self.add_new_crawl(crawl_id, crawlconfig)

        return result, crawl_id

    async def add_new_crawl(self, crawl_id, crawlconfig):
        """ increments crawl count for this config and adds new crawl """
        inc = self.crawl_configs.find_one_and_update(
            {"_id": crawlconfig.id, "inactive": {"$ne": True}},
            {"$inc": {"crawlAttemptCount": 1}},
        )

        add = self.crawl_ops.add_new_crawl(crawl_id, crawlconfig)
        await asyncio.gather(inc, add)

    async def update_crawl_config(self, cid: uuid.UUID, update: UpdateCrawlConfig):
        """ Update name, scale and/or schedule for an existing crawl config """

        # set update query
        query = update.dict(
            exclude_unset=True, exclude_defaults=True, exclude_none=True
        )

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        if update.profileid is not None:
            # if empty string, set to none, remove profile association
            if update.profileid == "":
                update.profileid = None
            else:
                update.profileid = (
                    await self.profiles.get_profile(update.profileid)
                ).id

        # update in db
        result = await self.crawl_configs.find_one_and_update(
            {"_id": cid, "inactive": {"$ne": True}},
            {"$set": query},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        # update schedule in crawl manager first
        if update.schedule is not None or update.scale is not None:
            crawlconfig = CrawlConfig.from_dict(result)
            try:
                await self.crawl_manager.update_crawlconfig_schedule_or_scale(
                    crawlconfig, update.scale, update.schedule
                )
            except Exception as exc:
                print(exc, flush=True)
                # pylint: disable=raise-missing-from
                raise HTTPException(
                    status_code=404, detail=f"Crawl Config '{cid}' not found"
                )

        return {"success": True}

    async def get_crawl_configs(self, archive: Archive):
        """Get all crawl configs for an archive is a member of"""
        # pylint: disable=duplicate-code
        cursor = self.crawl_configs.aggregate(
            [
                {"$match": {"aid": archive.id, "inactive": {"$ne": True}}},
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
        )

        results = await cursor.to_list(length=1000)

        # crawls = await self.crawl_manager.list_running_crawls(aid=archive.id)
        crawls = await self.crawl_ops.list_crawls(archive=archive, running_only=True)

        running = {}
        for crawl in crawls:
            running[crawl.cid] = crawl.id

        configs = []
        for res in results:
            config = CrawlConfigOut.from_dict(res)
            # pylint: disable=invalid-name
            print("config", config.id, flush=True)
            config.currCrawlId = running.get(config.id)
            configs.append(config)

        return CrawlConfigsResponse(crawlConfigs=configs)

    async def get_crawl_config_ids_for_profile(
        self, profileid: uuid.UUID, archive: Optional[Archive] = None
    ):
        """ Return all crawl configs that are associated with a given profileid"""
        query = {"profileid": profileid, "inactive": {"$ne": True}}
        if archive:
            query["aid"] = archive.id

        cursor = self.crawl_configs.find(query, projection=["_id", "name"])
        results = await cursor.to_list(length=1000)
        print("for profile", profileid, query, results)
        results = [CrawlConfigIdNameOut.from_dict(res) for res in results]
        return results

    async def get_running_crawl(self, crawlconfig: CrawlConfig):
        """ Return the id of currently running crawl for this config, if any """
        # crawls = await self.crawl_manager.list_running_crawls(cid=crawlconfig.id)
        crawls = await self.crawl_ops.list_crawls(cid=crawlconfig.id, running_only=True)

        if len(crawls) == 1:
            return crawls[0].id

        return None

    async def get_crawl_config_out(self, cid: uuid.UUID, archive: Archive):
        """Return CrawlConfigOut, including state of currently running crawl, if active
        also include inactive crawl configs"""

        crawlconfig = await self.get_crawl_config(
            cid, archive, active_only=False, config_cls=CrawlConfigOut
        )
        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        if not crawlconfig.inactive:
            crawlconfig.currCrawlId = await self.get_running_crawl(crawlconfig)

        user = await self.user_manager.get(crawlconfig.userid)
        # pylint: disable=invalid-name
        if user:
            crawlconfig.userName = user.name

        if crawlconfig.profileid:
            crawlconfig.profileName = await self.profiles.get_profile_name(
                crawlconfig.profileid, archive
            )

        return crawlconfig

    async def get_crawl_config(
        self,
        cid: uuid.UUID,
        archive: Optional[Archive],
        active_only: bool = True,
        config_cls=CrawlConfig,
    ):
        """Get an archive for user by unique id"""
        query = {"_id": cid}
        if archive:
            query["aid"] = archive.id
        if active_only:
            query["inactive"] = {"$ne": True}

        res = await self.crawl_configs.find_one(query)
        return config_cls.from_dict(res)

    async def make_inactive_or_delete(
        self, crawlconfig: CrawlConfig, new_id: uuid.UUID = None
    ):
        """Make config inactive if crawls exist, otherwise move to inactive list"""

        query = {"inactive": True}

        if new_id:
            crawlconfig.newId = query["newId"] = new_id

        if await self.get_running_crawl(crawlconfig):
            raise HTTPException(status_code=400, detail="crawl_running_cant_deactivate")

        # set to either "deleted" or "deactivated"
        status = None

        # if no crawls have been run, actually delete
        if not crawlconfig.crawlAttemptCount and not crawlconfig.crawlCount:
            result = await self.crawl_configs.delete_one(
                {"_id": crawlconfig.id, "aid": crawlconfig.aid}
            )

            if result.deleted_count != 1:
                raise HTTPException(status_code=404, detail="failed_to_delete")

            if crawlconfig.oldId:
                await self.crawl_configs.find_one_and_update(
                    {"_id": crawlconfig.oldId}, {"$set": query}
                )

            status = "deleted"

        else:

            if not await self.crawl_configs.find_one_and_update(
                {"_id": crawlconfig.id, "inactive": {"$ne": True}},
                {"$set": query},
            ):
                raise HTTPException(status_code=404, detail="failed_to_deactivate")

            status = "deactivated"

        # delete from crawl manager, but not from db
        await self.crawl_manager.delete_crawl_config_by_id(crawlconfig.id)

        return status

    async def do_make_inactive(self, crawlconfig: CrawlConfig):
        """ perform make_inactive in a transaction """

        async with await self.dbclient.start_session() as sesh:
            async with sesh.start_transaction():
                status = await self.make_inactive_or_delete(crawlconfig)

        return {"success": True, "status": status}


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_crawl_config_api(
    dbclient, mdb, user_dep, user_manager, archive_ops, crawl_manager, profiles
):
    """Init /crawlconfigs api routes"""
    ops = CrawlConfigOps(
        dbclient, mdb, user_manager, archive_ops, crawl_manager, profiles
    )

    router = ops.router

    archive_crawl_dep = archive_ops.archive_crawl_dep

    @router.get("", response_model=CrawlConfigsResponse)
    async def get_crawl_configs(archive: Archive = Depends(archive_crawl_dep)):
        return await ops.get_crawl_configs(archive)

    @router.get("/{cid}", response_model=CrawlConfigOut)
    async def get_crawl_config(cid: str, archive: Archive = Depends(archive_crawl_dep)):
        return await ops.get_crawl_config_out(uuid.UUID(cid), archive)

    @router.post("/")
    async def add_crawl_config(
        config: CrawlConfigIn,
        archive: Archive = Depends(archive_crawl_dep),
        user: User = Depends(user_dep),
    ):
        res, new_job_name = await ops.add_crawl_config(config, archive, user)
        return {"added": str(res.inserted_id), "run_now_job": new_job_name}

    @router.patch("/{cid}", dependencies=[Depends(archive_crawl_dep)])
    async def update_crawl_config(
        update: UpdateCrawlConfig,
        cid: str,
    ):
        return await ops.update_crawl_config(uuid.UUID(cid), update)

    @router.post("/{cid}/run")
    async def run_now(
        cid: str,
        archive: Archive = Depends(archive_crawl_dep),
        user: User = Depends(user_dep),
    ):
        crawlconfig = await ops.get_crawl_config(uuid.UUID(cid), archive)

        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        crawl_id = None
        try:
            crawl_id = await crawl_manager.run_crawl_config(
                crawlconfig, userid=str(user.id)
            )
            await ops.add_new_crawl(crawl_id, crawlconfig)

        except Exception as e:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {e}")

        return {"started": crawl_id}

    @router.delete("/{cid}")
    async def make_inactive(cid: str, archive: Archive = Depends(archive_crawl_dep)):

        crawlconfig = await ops.get_crawl_config(uuid.UUID(cid), archive)

        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        return await ops.do_make_inactive(crawlconfig)

    archive_ops.router.include_router(router)

    return ops
