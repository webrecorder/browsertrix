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
from pydantic import BaseModel, UUID4, conint, HttpUrl
from fastapi import APIRouter, Depends, HTTPException, Query

from .users import User
from .orgs import Organization, MAX_CRAWL_SCALE

from .db import BaseMongoModel


# ============================================================================
class JobType(str, Enum):
    """Job Types"""

    URL_LIST = "url-list"
    SEED_CRAWL = "seed-crawl"
    CUSTOM = "custom"


# ============================================================================
class ScopeType(str, Enum):
    """Crawl scope type"""

    PAGE = "page"
    PAGE_SPA = "page-spa"
    PREFIX = "prefix"
    HOST = "host"
    DOMAIN = "domain"
    ANY = "any"
    CUSTOM = "custom"


# ============================================================================
class Seed(BaseModel):
    """Crawl seed"""

    url: HttpUrl
    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None]
    exclude: Union[str, List[str], None]
    sitemap: Union[bool, HttpUrl, None]
    allowHash: Optional[bool]
    depth: Optional[int]
    extraHops: Optional[int] = 0


# ============================================================================
class RawCrawlConfig(BaseModel):
    """Base Crawl Config"""

    seeds: List[Union[HttpUrl, Seed]]

    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None] = None
    exclude: Union[str, List[str], None] = None

    depth: Optional[int] = -1
    limit: Optional[int] = 0
    extraHops: Optional[int] = 0

    lang: Optional[str]
    blockAds: Optional[bool] = False

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

    name: str

    jobType: Optional[JobType] = JobType.CUSTOM

    profileid: Optional[UUID4]

    colls: Optional[List[str]] = []
    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    # for now, until frontend is changed
    oldId: Optional[UUID4]


# ============================================================================
class ConfigRevision(BaseMongoModel):
    """Crawl Config Revision"""

    cid: UUID4

    schedule: Optional[str] = ""

    config: RawCrawlConfig

    profileid: Optional[UUID4]

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    userid: Optional[UUID4]
    modified: datetime

    rev: int = 0


# ============================================================================
class CrawlConfig(BaseMongoModel):
    """Schedulable config"""

    schedule: Optional[str] = ""

    config: RawCrawlConfig

    name: Optional[str]

    jobType: Optional[JobType] = JobType.CUSTOM

    created: datetime

    colls: Optional[List[str]] = []
    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    oid: UUID4

    useridCreated: UUID4

    userid: Optional[UUID4]
    modified: Optional[datetime]

    profileid: Optional[UUID4]

    crawlAttemptCount: Optional[int] = 0

    inactive: Optional[bool] = False

    rev: int = 0

    def get_raw_config(self):
        """serialize config for browsertrix-crawler"""
        return self.config.dict(exclude_unset=True, exclude_none=True)


# ============================================================================
class CrawlConfigOut(CrawlConfig):
    """Crawl Config Output, includes currCrawlId of running crawl"""

    currCrawlId: Optional[str]
    profileName: Optional[str]
    userName: Optional[str]

    crawlCount: Optional[int] = 0
    lastCrawlId: Optional[str]
    lastCrawlTime: Optional[datetime]
    lastCrawlState: Optional[str]


# ============================================================================
class CrawlConfigIdNameOut(BaseMongoModel):
    """Crawl Config id and name output only"""

    name: str


# ============================================================================
class CrawlConfigsResponse(BaseModel):
    """model for crawl configs response"""

    crawlConfigs: List[CrawlConfigOut]


# ============================================================================
class UpdateCrawlConfig(BaseModel):
    """Update crawl config name, crawl schedule, or tags"""

    # metadata: not revision tracked
    name: Optional[str]
    tags: Optional[List[str]] = []

    # crawl data: revision tracked
    schedule: Optional[str]
    profileid: Optional[str]
    crawlTimeout: Optional[int]
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)]
    config: Optional[RawCrawlConfig]


# ============================================================================
# pylint: disable=too-many-instance-attributes,too-many-arguments
class CrawlConfigOps:
    """Crawl Config Operations"""

    def __init__(self, dbclient, mdb, user_manager, org_ops, crawl_manager, profiles):
        self.dbclient = dbclient
        self.crawl_configs = mdb["crawl_configs"]
        self.config_revs = mdb["configs_revs"]
        self.user_manager = user_manager
        self.org_ops = org_ops
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

    def set_crawl_ops(self, ops):
        """set crawl ops reference"""
        self.crawl_ops = ops

    async def init_index(self):
        """init index for crawls db"""
        await self.crawl_configs.create_index(
            [("oid", pymongo.HASHED), ("inactive", pymongo.ASCENDING)]
        )

        await self.crawl_configs.create_index(
            [("oid", pymongo.ASCENDING), ("tags", pymongo.ASCENDING)]
        )

        await self.config_revs.create_index([("cid", pymongo.HASHED)])

        await self.config_revs.create_index(
            [("cid", pymongo.HASHED), ("rev", pymongo.ASCENDING)]
        )

    def set_coll_ops(self, coll_ops):
        """set collection ops"""
        self.coll_ops = coll_ops

    def sanitize(self, string=""):
        """sanitize string for use in wacz filename"""
        return self._file_rx.sub("-", string.lower())

    async def add_crawl_config(
        self,
        config: CrawlConfigIn,
        org: Organization,
        user: User,
    ):
        """Add new crawl config"""

        # for now, to support frontend update logic
        if config.oldId:
            cid = config.oldId
            await self.update_crawl_config(
                cid, org, user, update=UpdateCrawlConfig(**config.dict())
            )

            crawl_id = None
            if config.runNow:
                crawl_id = await self.run_now(cid, org, user)

            return cid, crawl_id

        data = config.dict()
        data["oid"] = org.id
        data["useridCreated"] = user.id
        data["userid"] = user.id
        data["_id"] = uuid.uuid4()
        data["created"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)
        data["modified"] = data["created"]

        profile_filename = None
        if config.profileid:
            profile_filename = await self.profiles.get_profile_storage_path(
                config.profileid, org
            )
            if not profile_filename:
                raise HTTPException(status_code=400, detail="invalid_profile_id")

        if config.colls:
            data["colls"] = await self.coll_ops.find_collections(org.id, config.colls)

        result = await self.crawl_configs.insert_one(data)

        crawlconfig = CrawlConfig.from_dict(data)

        suffix = f"{self.sanitize(str(crawlconfig.id))}-{self.sanitize(user.name)}"

        # pylint: disable=line-too-long
        out_filename = f"data/{self.sanitize(str(crawlconfig.id))}-@id/{suffix}-@ts-@hostsuffix.wacz"

        crawl_id = await self.crawl_manager.add_crawl_config(
            crawlconfig=crawlconfig,
            storage=org.storage,
            run_now=config.runNow,
            out_filename=out_filename,
            profile_filename=profile_filename,
        )

        if crawl_id and config.runNow:
            await self.add_new_crawl(crawl_id, crawlconfig)

        return result.inserted_id, crawl_id

    async def add_new_crawl(self, crawl_id, crawlconfig):
        """increments crawl count for this config and adds new crawl"""
        inc = self.crawl_configs.find_one_and_update(
            {"_id": crawlconfig.id, "inactive": {"$ne": True}},
            {"$inc": {"crawlAttemptCount": 1}},
        )

        add = self.crawl_ops.add_new_crawl(crawl_id, crawlconfig)
        await asyncio.gather(inc, add)

    async def update_crawl_config(
        self, cid: uuid.UUID, org: Organization, user: User, update: UpdateCrawlConfig
    ):
        """Update name, scale, schedule, and/or tags for an existing crawl config"""

        orig_crawl_config = await self.get_crawl_config(cid, org)
        if not orig_crawl_config:
            raise HTTPException(status_code=400, detail="config_not_found")

        # set update query
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        is_crawl_update = (
            update.schedule is not None
            or update.scale is not None
            or update.config is not None
            or update.crawlTimeout is not None
        )

        if is_crawl_update:
            orig_dict = orig_crawl_config.dict(exclude_unset=True, exclude_none=True)
            orig_dict["cid"] = orig_dict.pop("id", cid)
            orig_dict["id"] = uuid.uuid4()

            last_rev = ConfigRevision(**orig_dict)
            last_rev = await self.config_revs.insert_one(last_rev.to_dict())

        query["userid"] = user.id
        query["modified"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        if update.profileid is not None:
            # if empty string, set to none, remove profile association
            if update.profileid == "":
                update.profileid = None
            else:
                update.profileid = (
                    await self.profiles.get_profile(update.profileid)
                ).id

        if update.config is not None:
            query["config"] = update.config.dict()

        # update in db
        result = await self.crawl_configs.find_one_and_update(
            {"_id": cid, "inactive": {"$ne": True}},
            {"$set": query, "$inc": {"rev": 1}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        # update schedule in crawl manager first
        if is_crawl_update:
            crawlconfig = CrawlConfig.from_dict(result)
            try:
                await self.crawl_manager.update_crawl_config(crawlconfig, update)
            except Exception as exc:
                print(exc, flush=True)
                # pylint: disable=raise-missing-from
                raise HTTPException(
                    status_code=404, detail=f"Crawl Config '{cid}' not found"
                )

        return {"success": True}

    async def get_crawl_configs(
        self,
        org: Organization,
        userid: Optional[UUID4] = None,
        tags: Optional[List[str]] = None,
    ):
        """Get all crawl configs for an organization is a member of"""
        match_query = {"oid": org.id, "inactive": {"$ne": True}}

        if tags:
            match_query["tags"] = {"$all": tags}

        if userid:
            match_query["userid"] = userid

        # pylint: disable=duplicate-code
        cursor = self.crawl_configs.aggregate(
            [
                {"$match": match_query},
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

        # crawls = await self.crawl_manager.list_running_crawls(oid=org.id)
        crawls = await self.crawl_ops.list_crawls(org=org, running_only=True)

        running = {}
        for crawl in crawls:
            running[crawl.cid] = crawl.id

        configs = []
        for res in results:
            config = CrawlConfigOut.from_dict(res)
            config = await self._annotate_with_crawl_stats(config)
            # pylint: disable=invalid-name
            config.currCrawlId = running.get(config.id)
            configs.append(config)

        return CrawlConfigsResponse(crawlConfigs=configs)

    async def get_crawl_config_ids_for_profile(
        self, profileid: uuid.UUID, org: Optional[Organization] = None
    ):
        """Return all crawl configs that are associated with a given profileid"""
        query = {"profileid": profileid, "inactive": {"$ne": True}}
        if org:
            query["oid"] = org.id

        cursor = self.crawl_configs.find(query, projection=["_id", "name"])
        results = await cursor.to_list(length=1000)
        print("for profile", profileid, query, results)
        results = [CrawlConfigIdNameOut.from_dict(res) for res in results]
        return results

    async def get_running_crawl(self, crawlconfig: CrawlConfig):
        """Return the id of currently running crawl for this config, if any"""
        # crawls = await self.crawl_manager.list_running_crawls(cid=crawlconfig.id)
        crawls = await self.crawl_ops.list_crawls(cid=crawlconfig.id, running_only=True)

        if len(crawls) == 1:
            return crawls[0].id

        return None

    async def _annotate_with_crawl_stats(self, crawlconfig: CrawlConfigOut):
        """Annotate crawlconfig with information about associated crawls"""
        crawl_stats = await self.crawl_ops.get_latest_crawl_and_count_by_config(
            cid=crawlconfig.id
        )
        crawlconfig.crawlCount = crawl_stats["crawl_count"]
        crawlconfig.lastCrawlId = crawl_stats["last_crawl_id"]
        crawlconfig.lastCrawlTime = crawl_stats["last_crawl_finished"]
        crawlconfig.lastCrawlState = crawl_stats["last_crawl_state"]
        return crawlconfig

    async def get_crawl_config_out(self, cid: uuid.UUID, org: Organization):
        """Return CrawlConfigOut, including state of currently running crawl, if active
        also include inactive crawl configs"""

        crawlconfig = await self.get_crawl_config(
            cid, org, active_only=False, config_cls=CrawlConfigOut
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
                crawlconfig.profileid, org
            )

        crawlconfig = await self._annotate_with_crawl_stats(crawlconfig)

        return crawlconfig

    async def get_crawl_config(
        self,
        cid: uuid.UUID,
        org: Optional[Organization],
        active_only: bool = True,
        config_cls=CrawlConfig,
    ):
        """Get an organization for user by unique id"""
        query = {"_id": cid}
        if org:
            query["oid"] = org.id
        if active_only:
            query["inactive"] = {"$ne": True}

        res = await self.crawl_configs.find_one(query)
        return config_cls.from_dict(res)

    async def get_crawl_config_revs(self, cid: uuid.UUID):
        """return all config revisions for crawlconfig"""

        # pylint: disable=fixme
        # todo: pagination needed
        cursor = self.config_revs.find({"cid": cid})
        results = await cursor.to_list(length=1000)
        return [ConfigRevision.from_dict(res) for res in results]

    async def make_inactive_or_delete(
        self,
        crawlconfig: CrawlConfig,
    ):
        """Make config inactive if crawls exist, otherwise move to inactive list"""

        query = {"inactive": True}

        is_running = await self.get_running_crawl(crawlconfig) is not None

        if is_running:
            raise HTTPException(status_code=400, detail="crawl_running_cant_deactivate")

        # set to either "deleted" or "deactivated"
        status = None

        # if no crawls have been run, actually delete
        if not crawlconfig.crawlAttemptCount:
            result = await self.crawl_configs.delete_one(
                {"_id": crawlconfig.id, "oid": crawlconfig.oid}
            )

            if result.deleted_count != 1:
                raise HTTPException(status_code=404, detail="failed_to_delete")

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
        """perform make_inactive in a transaction"""

        async with await self.dbclient.start_session() as sesh:
            async with sesh.start_transaction():
                status = await self.make_inactive_or_delete(crawlconfig)

        return {"success": True, "status": status}

    async def add_or_remove_exclusion(self, regex, cid, org, user, add=True):
        """added or remove regex to crawl config"""
        # get crawl config
        crawl_config = await self.get_crawl_config(cid, org, active_only=False)

        # update exclusion
        exclude = crawl_config.config.exclude or []
        if isinstance(exclude, str):
            exclude = [exclude]

        if add:
            if regex in exclude:
                raise HTTPException(status_code=400, detail="exclusion_already_exists")

            exclude.append(regex)
        else:
            if regex not in exclude:
                raise HTTPException(status_code=400, detail="exclusion_not_found")

            exclude.remove(regex)

        crawl_config.config.exclude = exclude

        update_config = UpdateCrawlConfig(config=crawl_config.config)

        await self.update_crawl_config(cid, org, user, update_config)

        return crawl_config.config

    async def get_crawl_config_tags(self, org):
        """get distinct tags from all crawl configs for this org"""
        return await self.crawl_configs.distinct("tags", {"oid": org.id})

    async def run_now(self, cid, org, user):
        """run specified crawlconfig now"""
        crawlconfig = await self.get_crawl_config(uuid.UUID(cid), org)

        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        if await self.get_running_crawl(crawlconfig):
            raise HTTPException(status_code=400, detail="crawl_already_running")

        crawl_id = None
        try:
            crawl_id = await self.crawl_manager.run_crawl_config(
                crawlconfig, userid=str(user.id)
            )
            await self.add_new_crawl(crawl_id, crawlconfig)

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {exc}")


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_crawl_config_api(
    dbclient, mdb, user_dep, user_manager, org_ops, crawl_manager, profiles
):
    """Init /crawlconfigs api routes"""
    ops = CrawlConfigOps(dbclient, mdb, user_manager, org_ops, crawl_manager, profiles)

    router = ops.router

    org_crawl_dep = org_ops.org_crawl_dep

    @router.get("", response_model=CrawlConfigsResponse)
    async def get_crawl_configs(
        org: Organization = Depends(org_crawl_dep),
        userid: Optional[UUID4] = None,
        tag: Union[List[str], None] = Query(default=None),
    ):
        return await ops.get_crawl_configs(org, userid=userid, tags=tag)

    @router.get("/tags")
    async def get_crawl_config_tags(org: Organization = Depends(org_crawl_dep)):
        return await ops.get_crawl_config_tags(org)

    @router.get("/{cid}", response_model=CrawlConfigOut)
    async def get_crawl_config(cid: str, org: Organization = Depends(org_crawl_dep)):
        return await ops.get_crawl_config_out(uuid.UUID(cid), org)

    @router.get(
        "/{cid}/revs",
        response_model=List[ConfigRevision],
        dependencies=[Depends(org_crawl_dep)],
    )
    async def get_crawl_config_revisions(cid: str):
        return await ops.get_crawl_config_revs(uuid.UUID(cid))

    @router.post("/")
    async def add_crawl_config(
        config: CrawlConfigIn,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        cid, new_job_name = await ops.add_crawl_config(config, org, user)
        return {"added": str(cid), "run_now_job": new_job_name}

    @router.patch("/{cid}", dependencies=[Depends(org_crawl_dep)])
    async def update_crawl_config(
        update: UpdateCrawlConfig,
        cid: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.update_crawl_config(uuid.UUID(cid), org, user, update)

    @router.post("/{cid}/run")
    async def run_now(
        cid: str,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        crawl_id = await ops.run_now(cid, org, user)
        return {"started": crawl_id}

    @router.delete("/{cid}")
    async def make_inactive(cid: str, org: Organization = Depends(org_crawl_dep)):
        crawlconfig = await ops.get_crawl_config(uuid.UUID(cid), org)

        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        return await ops.do_make_inactive(crawlconfig)

    org_ops.router.include_router(router)

    return ops
