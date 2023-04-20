"""
Crawl Config API handling
"""

from typing import List, Union, Optional
from enum import Enum
import uuid
import asyncio
import re
from datetime import datetime
import urllib.parse

import pymongo
from pydantic import BaseModel, UUID4, conint, HttpUrl
from fastapi import APIRouter, Depends, HTTPException, Query

from .users import User
from .orgs import Organization, MAX_CRAWL_SCALE
from .pagination import DEFAULT_PAGE_SIZE, paginated_format

from .db import BaseMongoModel

# pylint: disable=too-many-lines


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

    seeds: List[Seed]

    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None] = None
    exclude: Union[str, List[str], None] = None

    depth: Optional[int] = -1
    limit: Optional[int] = 0
    extraHops: Optional[int] = 0

    lang: Optional[str]
    blockAds: Optional[bool] = False

    behaviorTimeout: Optional[int]
    pageLoadTimeout: Optional[int]
    pageExtraDelay: Optional[int] = 0

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

    description: Optional[str]

    jobType: Optional[JobType] = JobType.CUSTOM

    profileid: Optional[str]

    colls: Optional[List[str]] = []
    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1


# ============================================================================
class ConfigRevision(BaseMongoModel):
    """Crawl Config Revision"""

    cid: UUID4

    schedule: Optional[str] = ""

    config: RawCrawlConfig

    profileid: Optional[UUID4]

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    modified: datetime
    modifiedBy: Optional[UUID4]

    rev: int = 0


# ============================================================================
class CrawlConfigCore(BaseMongoModel):
    """Core data shared between crawls and crawlconfigs"""

    schedule: Optional[str] = ""

    jobType: Optional[JobType] = JobType.CUSTOM
    config: RawCrawlConfig

    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    oid: UUID4

    profileid: Optional[UUID4]


# ============================================================================
class CrawlConfig(CrawlConfigCore):
    """Schedulable config"""

    name: Optional[str]
    description: Optional[str]

    created: datetime
    createdBy: Optional[UUID4]

    modified: Optional[datetime]
    modifiedBy: Optional[UUID4]

    colls: Optional[List[str]] = []

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
    currCrawlStartTime: Optional[datetime]
    currCrawlState: Optional[str]

    profileName: Optional[str]

    createdByName: Optional[str]
    modifiedByName: Optional[str]
    lastStartedByName: Optional[str]

    firstSeed: Optional[str]

    totalSize: Optional[int] = 0

    crawlCount: Optional[int] = 0
    lastCrawlId: Optional[str]
    lastCrawlStartTime: Optional[datetime]
    lastCrawlTime: Optional[datetime]
    lastCrawlState: Optional[str]


# ============================================================================
class CrawlConfigIdNameOut(BaseMongoModel):
    """Crawl Config id and name output only"""

    name: str


# ============================================================================
class UpdateCrawlConfig(BaseModel):
    """Update crawl config name, crawl schedule, or tags"""

    # metadata: not revision tracked
    name: Optional[str]
    tags: Optional[List[str]]
    description: Optional[str]

    # crawl data: revision tracked
    schedule: Optional[str]
    profileid: Optional[str]
    crawlTimeout: Optional[int]
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)]
    config: Optional[RawCrawlConfig]


# ============================================================================
# pylint: disable=too-many-instance-attributes,too-many-arguments,too-many-public-methods
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

    async def _lookup_profile(self, profileid, org):
        if profileid is None:
            return None, None

        if profileid == "":
            return None, ""

        profileid = uuid.UUID(profileid)
        profile_filename = await self.profiles.get_profile_storage_path(profileid, org)
        if not profile_filename:
            raise HTTPException(status_code=400, detail="invalid_profile_id")

        return profileid, profile_filename

    async def add_crawl_config(
        self,
        config: CrawlConfigIn,
        org: Organization,
        user: User,
    ):
        """Add new crawl config"""

        data = config.dict()
        data["oid"] = org.id
        data["createdBy"] = user.id
        data["modifiedBy"] = user.id
        data["_id"] = uuid.uuid4()
        data["created"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)
        data["modified"] = data["created"]

        data["profileid"], profile_filename = await self._lookup_profile(
            config.profileid, org
        )

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
            await self.add_new_crawl(crawl_id, crawlconfig, user)

        return result.inserted_id, crawl_id

    async def add_new_crawl(self, crawl_id: str, crawlconfig: CrawlConfig, user: User):
        """increments crawl count for this config and adds new crawl"""
        inc = self.crawl_configs.find_one_and_update(
            {"_id": crawlconfig.id, "inactive": {"$ne": True}},
            {"$inc": {"crawlAttemptCount": 1}},
        )

        add = self.crawl_ops.add_new_crawl(crawl_id, crawlconfig, user)
        await asyncio.gather(inc, add)

    def check_attr_changed(
        self, crawlconfig: CrawlConfig, update: UpdateCrawlConfig, attr_name: str
    ):
        """check if attribute is set and has changed. if not changed, clear it on the update"""
        if getattr(update, attr_name) is not None:
            if getattr(update, attr_name) != getattr(crawlconfig, attr_name):
                return True

        return False

    async def update_crawl_config(
        self, cid: uuid.UUID, org: Organization, user: User, update: UpdateCrawlConfig
    ):
        """Update name, scale, schedule, and/or tags for an existing crawl config"""

        orig_crawl_config = await self.get_crawl_config(cid, org)
        if not orig_crawl_config:
            raise HTTPException(status_code=400, detail="config_not_found")

        # indicates if any k8s crawl config settings changed
        changed = False
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "config")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "crawlTimeout")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "schedule")
        )
        changed = changed or self.check_attr_changed(orig_crawl_config, update, "scale")

        changed = changed or (
            update.profileid is not None
            and update.profileid != orig_crawl_config.profileid
            and ((not update.profileid) != (not orig_crawl_config.profileid))
        )

        metadata_changed = self.check_attr_changed(orig_crawl_config, update, "name")
        metadata_changed = metadata_changed or self.check_attr_changed(
            orig_crawl_config, update, "description"
        )
        metadata_changed = metadata_changed or (
            update.tags is not None
            and ",".join(orig_crawl_config.tags) != ",".join(update.tags)
        )

        if not changed and not metadata_changed:
            return {
                "success": True,
                "settings_changed": changed,
                "metadata_changed": metadata_changed,
            }

        if changed:
            orig_dict = orig_crawl_config.dict(exclude_unset=True, exclude_none=True)
            orig_dict["cid"] = orig_dict.pop("id", cid)
            orig_dict["id"] = uuid.uuid4()

            last_rev = ConfigRevision(**orig_dict)
            last_rev = await self.config_revs.insert_one(last_rev.to_dict())

        # set update query
        query = update.dict(exclude_unset=True)
        query["modifiedBy"] = user.id
        query["modified"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        query["profileid"], profile_filename = await self._lookup_profile(
            update.profileid, org
        )

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

        # update in crawl manager if config, schedule, scale or crawlTimeout changed
        if changed:
            crawlconfig = CrawlConfig.from_dict(result)
            try:
                await self.crawl_manager.update_crawl_config(
                    crawlconfig, update, profile_filename
                )
            except Exception as exc:
                print(exc, flush=True)
                # pylint: disable=raise-missing-from
                raise HTTPException(
                    status_code=404, detail=f"Crawl Config '{cid}' not found"
                )

        return {
            "success": True,
            "settings_changed": changed,
            "metadata_changed": metadata_changed,
        }

    async def get_crawl_configs(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        created_by: uuid.UUID = None,
        modified_by: uuid.UUID = None,
        first_seed: str = None,
        name: str = None,
        description: str = None,
        tags: Optional[List[str]] = None,
        sort_by: str = None,
        sort_direction: int = -1,
    ):
        """Get all crawl configs for an organization is a member of"""
        # pylint: disable=too-many-locals,too-many-branches
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        match_query = {"oid": org.id, "inactive": {"$ne": True}}

        if tags:
            match_query["tags"] = {"$all": tags}

        if created_by:
            match_query["createdBy"] = created_by

        if modified_by:
            match_query["modifiedBy"] = modified_by

        if name:
            match_query["name"] = name

        if description:
            match_query["description"] = description

        # pylint: disable=duplicate-code
        aggregate = [
            {"$match": match_query},
            {"$set": {"firstSeedObject": {"$arrayElemAt": ["$config.seeds", 0]}}},
            # Set firstSeed
            {"$set": {"firstSeed": "$firstSeedObject.url"}},
            {"$unset": ["firstSeedObject"]},
            {
                "$lookup": {
                    "from": "crawls",
                    "localField": "_id",
                    "foreignField": "cid",
                    "as": "configCrawls",
                },
            },
            # Filter workflow crawls on finished and active
            {
                "$set": {
                    "finishedCrawls": {
                        "$filter": {
                            "input": "$configCrawls",
                            "as": "filterCrawls",
                            "cond": {
                                "$and": [
                                    {"$ne": ["$$filterCrawls.finished", None]},
                                    {"$ne": ["$$filterCrawls.inactive", True]},
                                ]
                            },
                        }
                    }
                }
            },
            # Set crawl count to number of finished crawls
            {"$set": {"crawlCount": {"$size": "$finishedCrawls"}}},
            # Sort finished crawls by finished time descending to get latest
            {
                "$set": {
                    "sortedCrawls": {
                        "$sortArray": {
                            "input": "$finishedCrawls",
                            "sortBy": {"finished": -1},
                        }
                    }
                }
            },
            {"$unset": ["finishedCrawls"]},
            {"$set": {"lastCrawl": {"$arrayElemAt": ["$sortedCrawls", 0]}}},
            {"$set": {"lastCrawlId": "$lastCrawl._id"}},
            {"$set": {"lastCrawlStartTime": "$lastCrawl.started"}},
            {"$set": {"lastCrawlTime": "$lastCrawl.finished"}},
            {"$set": {"lastCrawlState": "$lastCrawl.state"}},
            # Get userid of last started crawl
            {"$set": {"lastStartedBy": "$lastCrawl.userid"}},
            {
                "$lookup": {
                    "from": "users",
                    "localField": "lastStartedBy",
                    "foreignField": "id",
                    "as": "lastStartedByName",
                },
            },
            {
                "$set": {
                    "lastStartedByName": {
                        "$arrayElemAt": ["$lastStartedByName.name", 0]
                    }
                }
            },
            {
                "$set": {
                    "totalSize": {
                        "$sum": {
                            "$map": {
                              "input": "$sortedCrawls.files",
                              "as": "crawlFile",
                              "in": {"$arrayElemAt": ["$$crawlFile.size", 0]}
                            }
                        }
                    }
                }
            },
            # unset
            {"$unset": ["lastCrawl"]},
            {"$unset": ["sortedCrawls"]},
        ]

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if sort_by:
            if sort_by not in ("created, modified, firstSeed, lastCrawlTime"):
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        aggregate.extend(
            [
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "createdBy",
                        "foreignField": "id",
                        "as": "userName",
                    },
                },
                {"$set": {"createdByName": {"$arrayElemAt": ["$userName.name", 0]}}},
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "modifiedBy",
                        "foreignField": "id",
                        "as": "modifiedUserName",
                    },
                },
                {
                    "$set": {
                        "modifiedByName": {
                            "$arrayElemAt": ["$modifiedUserName.name", 0]
                        }
                    }
                },
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

        cursor = self.crawl_configs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        # crawls = await self.crawl_manager.list_running_crawls(oid=org.id)
        crawls, _ = await self.crawl_ops.list_crawls(
            org=org,
            running_only=True,
            # Set high so that when we lower default we still get all running crawls
            page_size=1_000,
        )
        running = {}
        for crawl in crawls:
            running[crawl.cid] = crawl

        configs = []
        for res in items:
            config = CrawlConfigOut.from_dict(res)
            # pylint: disable=invalid-name
            self._add_curr_crawl_stats(config, running.get(config.id))
            configs.append(config)

        return configs, total

    async def get_crawl_config_ids_for_profile(
        self, profileid: uuid.UUID, org: Optional[Organization] = None
    ):
        """Return all crawl configs that are associated with a given profileid"""
        query = {"profileid": profileid, "inactive": {"$ne": True}}
        if org:
            query["oid"] = org.id

        cursor = self.crawl_configs.find(query, projection=["_id", "name"])
        results = await cursor.to_list(length=1000)
        results = [CrawlConfigIdNameOut.from_dict(res) for res in results]
        return results

    async def get_running_crawl(self, crawlconfig: CrawlConfig):
        """Return the id of currently running crawl for this config, if any"""
        # crawls = await self.crawl_manager.list_running_crawls(cid=crawlconfig.id)
        crawls, _ = await self.crawl_ops.list_crawls(
            cid=crawlconfig.id, running_only=True
        )

        if len(crawls) == 1:
            return crawls[0]

        return None

    async def _annotate_with_crawl_stats(self, crawlconfig: CrawlConfigOut):
        """Annotate crawlconfig with information about associated crawls"""
        crawl_stats = await self.crawl_ops.get_latest_crawl_and_count_by_config(
            cid=crawlconfig.id
        )
        crawlconfig.crawlCount = crawl_stats["crawl_count"]
        crawlconfig.lastCrawlId = crawl_stats["last_crawl_id"]
        crawlconfig.lastCrawlStartTime = crawl_stats["last_crawl_started"]
        crawlconfig.lastCrawlTime = crawl_stats["last_crawl_finished"]
        crawlconfig.lastStartedByName = crawl_stats["last_started_by"]
        crawlconfig.lastCrawlState = crawl_stats["last_crawl_state"]
        return crawlconfig

    def _add_curr_crawl_stats(self, crawlconfig, crawl):
        """Add stats from current running crawl, if any"""
        if not crawl:
            return

        crawlconfig.currCrawlId = crawl.id
        crawlconfig.currCrawlStartTime = crawl.started
        crawlconfig.currCrawlState = crawl.state

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
            self._add_curr_crawl_stats(
                crawlconfig, await self.get_running_crawl(crawlconfig)
            )

        user = await self.user_manager.get(crawlconfig.createdBy)
        # pylint: disable=invalid-name
        if user:
            crawlconfig.createdByName = user.name

        modified_user = await self.user_manager.get(crawlconfig.modifiedBy)
        # pylint: disable=invalid-name
        if modified_user:
            crawlconfig.modifiedByName = modified_user.name

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

    async def get_crawl_config_revs(
        self, cid: uuid.UUID, page_size: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        """return all config revisions for crawlconfig"""
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        match_query = {"cid": cid}

        total = await self.config_revs.count_documents(match_query)

        cursor = self.config_revs.find({"cid": cid}, skip=skip, limit=page_size)
        results = await cursor.to_list(length=1000)
        revisions = [ConfigRevision.from_dict(res) for res in results]

        return revisions, total

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

    async def get_crawl_config_search_values(self, org):
        """List unique names, first seeds, and descriptions from all workflows in org"""
        names = await self.crawl_configs.distinct("name", {"oid": org.id})
        descriptions = await self.crawl_configs.distinct("description", {"oid": org.id})
        workflow_ids = await self.crawl_configs.distinct("_id", {"oid": org.id})
        crawl_ids = await self.crawl_ops.crawls.distinct("_id", {"oid": org.id})

        # Remove empty strings
        names = [name for name in names if name]
        descriptions = [description for description in descriptions if description]

        first_seeds = set()
        configs = [config async for config in self.crawl_configs.find({"oid": org.id})]
        for config in configs:
            first_seed = config["config"]["seeds"][0]["url"]
            first_seeds.add(first_seed)

        return {
            "names": names,
            "descriptions": descriptions,
            "firstSeeds": list(first_seeds),
            "workflowIds": workflow_ids,
            "crawlIds": crawl_ids,
        }

    async def run_now(self, cid: str, org: Organization, user: User):
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
            await self.add_new_crawl(crawl_id, crawlconfig, user)
            return crawl_id

        except Exception as exc:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {exc}")


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_crawl_config_api(
    dbclient, mdb, user_dep, user_manager, org_ops, crawl_manager, profiles
):
    """Init /crawlconfigs api routes"""
    # pylint: disable=invalid-name

    ops = CrawlConfigOps(dbclient, mdb, user_manager, org_ops, crawl_manager, profiles)

    router = ops.router

    org_crawl_dep = org_ops.org_crawl_dep
    org_viewer_dep = org_ops.org_viewer_dep

    @router.get("")
    async def get_crawl_configs(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        # createdBy, kept as userid for API compatibility
        userid: Optional[UUID4] = None,
        modifiedBy: Optional[UUID4] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tag: Union[List[str], None] = Query(default=None),
        sortBy: str = None,
        sortDirection: int = -1,
    ):
        # pylint: disable=duplicate-code
        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        crawl_configs, total = await ops.get_crawl_configs(
            org,
            created_by=userid,
            modified_by=modifiedBy,
            first_seed=firstSeed,
            name=name,
            description=description,
            tags=tag,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawl_configs, total, page, pageSize)

    @router.get("/tags")
    async def get_crawl_config_tags(org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl_config_tags(org)

    @router.get("/search-values")
    async def get_crawl_config_search_values(
        org: Organization = Depends(org_viewer_dep),
    ):
        return await ops.get_crawl_config_search_values(org)

    @router.get("/{cid}", response_model=CrawlConfigOut)
    async def get_crawl_config(cid: str, org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl_config_out(uuid.UUID(cid), org)

    @router.get(
        "/{cid}/revs",
        dependencies=[Depends(org_viewer_dep)],
    )
    async def get_crawl_config_revisions(
        cid: str, pageSize: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        revisions, total = await ops.get_crawl_config_revs(
            uuid.UUID(cid), page_size=pageSize, page=page
        )
        return paginated_format(revisions, total, page, pageSize)

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
