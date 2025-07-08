"""
Crawl Config API handling
"""

# pylint: disable=too-many-lines

from typing import List, Union, Optional, TYPE_CHECKING, cast, Dict, Tuple

import asyncio
import json
import re
import os
import traceback
from datetime import datetime, timedelta
from uuid import UUID, uuid4
import urllib.parse

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Query
import pymongo

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    CrawlConfigIn,
    ConfigRevision,
    CrawlConfig,
    CrawlConfigOut,
    CrawlOut,
    UpdateCrawlConfig,
    Organization,
    User,
    PaginatedCrawlConfigOutResponse,
    PaginatedSeedResponse,
    PaginatedConfigRevisionResponse,
    FAILED_STATES,
    CrawlerChannel,
    CrawlerChannels,
    StartedResponse,
    SuccessResponse,
    CrawlConfigAddedResponse,
    CrawlConfigSearchValues,
    CrawlConfigUpdateResponse,
    CrawlConfigDeletedResponse,
    CrawlerProxy,
    CrawlerProxies,
    ValidateCustomBehavior,
    RawCrawlConfig,
)
from .utils import (
    dt_now,
    slug_from_name,
    validate_regexes,
    validate_language_code,
    is_url,
    browser_windows_from_scale,
)

if TYPE_CHECKING:
    from .orgs import OrgOps
    from .crawlmanager import CrawlManager
    from .users import UserManager
    from .profiles import ProfileOps
    from .crawls import CrawlOps
    from .colls import CollectionOps
else:
    OrgOps = CrawlManager = UserManager = ProfileOps = CrawlOps = CollectionOps = object


ALLOWED_SORT_KEYS = (
    "created",
    "modified",
    "firstSeed",
    "lastCrawlTime",
    "lastCrawlStartTime",
    "lastRun",
    "name",
)

DEFAULT_PROXY_ID: str | None = os.environ.get("DEFAULT_PROXY_ID")


# ============================================================================
class CrawlConfigOps:
    """Crawl Config Operations"""

    # pylint: disable=too-many-arguments, too-many-instance-attributes, too-many-public-methods

    user_manager: UserManager
    org_ops: OrgOps
    crawl_manager: CrawlManager
    profiles: ProfileOps
    crawl_ops: CrawlOps
    coll_ops: CollectionOps

    crawler_channels: CrawlerChannels
    crawler_images_map: dict[str, str]
    crawler_image_pull_policy_map: dict[str, str]

    paused_expiry_delta: timedelta

    def __init__(
        self,
        dbclient,
        mdb,
        user_manager,
        org_ops,
        crawl_manager,
        profiles,
    ):
        self.dbclient = dbclient
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]
        self.config_revs = mdb["configs_revs"]
        self.user_manager = user_manager
        self.org_ops = org_ops
        self.crawl_manager = crawl_manager
        self.profiles = profiles
        self.profiles.set_crawlconfigs(self)
        self.crawl_ops = cast(CrawlOps, None)
        self.coll_ops = cast(CollectionOps, None)

        self.default_filename_template = os.environ["DEFAULT_CRAWL_FILENAME_TEMPLATE"]
        self.default_crawler_image_pull_policy = os.environ.get(
            "DEFAULT_CRAWLER_IMAGE_PULL_POLICY", "IfNotPresent"
        )

        self.paused_expiry_delta = timedelta(
            minutes=int(os.environ.get("PAUSED_CRAWL_LIMIT_MINUTES", "10080"))
        )

        self.router = APIRouter(
            prefix="/crawlconfigs",
            tags=["crawlconfigs"],
            responses={404: {"description": "Not found"}},
        )

        self._file_rx = re.compile("\\W+")

        self.crawler_images_map = {}
        self.crawler_image_pull_policy_map = {}
        channels = []
        with open(os.environ["CRAWLER_CHANNELS_JSON"], encoding="utf-8") as fh:
            crawler_list = json.loads(fh.read())
            for channel_data in crawler_list:
                channel = CrawlerChannel(**channel_data)
                channels.append(channel)
                self.crawler_images_map[channel.id] = channel.image
                if channel.imagePullPolicy:
                    self.crawler_image_pull_policy_map[channel.id] = (
                        channel.imagePullPolicy
                    )

            self.crawler_channels = CrawlerChannels(channels=channels)

        if "default" not in self.crawler_images_map:
            raise TypeError("The channel list must include a 'default' channel")

        self._crawler_proxies_last_updated = None
        self._crawler_proxies_map = None

        if DEFAULT_PROXY_ID and DEFAULT_PROXY_ID not in self.get_crawler_proxies_map():
            raise ValueError(
                f"Configured proxies must include DEFAULT_PROXY_ID: {DEFAULT_PROXY_ID}"
            )

    def set_crawl_ops(self, ops):
        """set crawl ops reference"""
        self.crawl_ops = ops

    async def init_index(self):
        """init index for crawlconfigs db collection"""
        await self.crawl_configs.create_index(
            [("oid", pymongo.HASHED), ("inactive", pymongo.ASCENDING)]
        )

        await self.crawl_configs.create_index(
            [("oid", pymongo.ASCENDING), ("tags", pymongo.ASCENDING)]
        )

        await self.crawl_configs.create_index(
            [("lastRun", pymongo.DESCENDING), ("modified", pymongo.DESCENDING)]
        )

        await self.crawl_configs.create_index(
            [("name", pymongo.ASCENDING), ("firstSeed", pymongo.ASCENDING)]
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

    async def get_profile_filename(
        self, profileid: Optional[UUID], org: Organization
    ) -> str:
        """lookup filename from profileid"""
        if not profileid:
            return ""

        profile_filename, _ = await self.profiles.get_profile_storage_path_and_proxy(
            profileid, org
        )
        if not profile_filename:
            raise HTTPException(status_code=400, detail="invalid_profile_id")

        return profile_filename

    # pylint: disable=invalid-name, too-many-branches
    async def add_crawl_config(
        self,
        config_in: CrawlConfigIn,
        org: Organization,
        user: User,
    ) -> CrawlConfigAddedResponse:
        """Add new crawl config"""

        # ensure crawlChannel is valid
        if not self.get_channel_crawler_image(config_in.crawlerChannel):
            raise HTTPException(status_code=404, detail="crawler_not_found")

        # Overrides scale if set
        if config_in.browserWindows is None:
            config_in.browserWindows = browser_windows_from_scale(
                cast(int, config_in.scale)
            )

        if self.is_single_page(config_in.config):
            config_in.browserWindows = 1

        profileid = None
        if isinstance(config_in.profileid, UUID):
            profileid = config_in.profileid

        # ensure profile is valid, if provided
        if profileid:
            await self.profiles.get_profile(profileid, org)

        # ensure proxyId is valid and available for org
        if config_in.proxyId:
            if not self.can_org_use_proxy(org, config_in.proxyId):
                raise HTTPException(status_code=404, detail="proxy_not_found")

        if config_in.config.exclude:
            exclude = config_in.config.exclude
            if isinstance(exclude, str):
                exclude = [exclude]
            validate_regexes(exclude)

        self._validate_link_selectors(config_in.config.selectLinks)

        if config_in.config.lang:
            validate_language_code(config_in.config.lang)

        if config_in.config.customBehaviors:
            for url in config_in.config.customBehaviors:
                self._validate_custom_behavior_url_syntax(url)

        now = dt_now()
        crawlconfig = CrawlConfig(
            id=uuid4(),
            oid=org.id,
            createdBy=user.id,
            createdByName=user.name,
            modifiedBy=user.id,
            modifiedByName=user.name,
            created=now,
            modified=now,
            schedule=config_in.schedule,
            config=config_in.config,
            name=config_in.name,
            description=config_in.description,
            tags=config_in.tags,
            jobType=config_in.jobType,
            crawlTimeout=config_in.crawlTimeout,
            maxCrawlSize=config_in.maxCrawlSize,
            browserWindows=config_in.browserWindows,
            autoAddCollections=config_in.autoAddCollections,
            profileid=profileid,
            crawlerChannel=config_in.crawlerChannel,
            crawlFilenameTemplate=config_in.crawlFilenameTemplate,
            proxyId=config_in.proxyId,
        )

        if config_in.runNow:
            crawlconfig.lastStartedBy = user.id
            crawlconfig.lastStartedByName = user.name

        # add  CrawlConfig to DB here
        result = await self.crawl_configs.insert_one(crawlconfig.to_dict())

        await self.crawl_manager.update_scheduled_job(crawlconfig, str(user.id))

        crawl_id = None
        storage_quota_reached = False
        exec_mins_quota_reached = False

        if config_in.runNow:
            try:
                crawl_id = await self.run_now_internal(crawlconfig, org, user)
            except HTTPException as e:
                if e.detail == "storage_quota_reached":
                    storage_quota_reached = True
                elif e.detail == "exec_minutes_quota_reached":
                    exec_mins_quota_reached = True
                print(f"Can't run crawl now: {e.detail}", flush=True)
        else:
            storage_quota_reached = self.org_ops.storage_quota_reached(org)
            exec_mins_quota_reached = self.org_ops.exec_mins_quota_reached(org)

        return CrawlConfigAddedResponse(
            added=True,
            id=str(result.inserted_id),
            run_now_job=crawl_id,
            storageQuotaReached=storage_quota_reached,
            execMinutesQuotaReached=exec_mins_quota_reached,
        )

    def is_single_page(self, config: RawCrawlConfig):
        """return true if this config represents a single page crawl"""
        if not config.seeds or len(config.seeds) != 1:
            return False

        if config.limit == 1:
            return True

        extra_hops = config.seeds[0].extraHops or config.extraHops
        scope_type = config.seeds[0].scopeType or config.scopeType

        return extra_hops == 0 and scope_type == "page"

    def _validate_link_selectors(self, link_selectors: List[str]):
        """Validate link selectors

        Ensure at least one link selector is set and that all the link slectors passed
        follow expected syntax: selector->attribute/property.

        We don't yet check the validity of the CSS selector itself.
        """
        if not link_selectors:
            raise HTTPException(status_code=400, detail="invalid_link_selector")

        for link_selector in link_selectors:
            parts = link_selector.split("->")
            if not len(parts) == 2:
                raise HTTPException(status_code=400, detail="invalid_link_selector")
            if not parts[0] or not parts[1]:
                raise HTTPException(status_code=400, detail="invalid_link_selector")

    def _validate_custom_behavior_url_syntax(self, url: str) -> Tuple[bool, List[str]]:
        """Validate custom behaviors are valid URLs after removing custom git syntax"""
        git_prefix = "git+"
        is_git_repo = False

        if url.startswith(git_prefix):
            is_git_repo = True
            url = url[len(git_prefix) :]

        parts = url.split("?")
        url = parts[0]

        if not is_url(url):
            raise HTTPException(status_code=400, detail="invalid_custom_behavior")

        return is_git_repo, parts

    def ensure_quota_page_limit(self, crawlconfig: CrawlConfig, org: Organization):
        """ensure page limit is set to no greater than quota page limit, if any"""
        if org.quotas.maxPagesPerCrawl and org.quotas.maxPagesPerCrawl > 0:
            if crawlconfig.config.limit and crawlconfig.config.limit > 0:
                crawlconfig.config.limit = min(
                    org.quotas.maxPagesPerCrawl, crawlconfig.config.limit
                )
            else:
                crawlconfig.config.limit = org.quotas.maxPagesPerCrawl

    async def add_new_crawl(
        self,
        crawl_id: str,
        crawlconfig: CrawlConfig,
        user: User,
        org: Organization,
        manual: bool,
    ) -> None:
        """increments crawl count for this config and adds new crawl"""

        started = dt_now()

        self.ensure_quota_page_limit(crawlconfig, org)

        inc = self.inc_crawl_count(crawlconfig.id)
        add = self.crawl_ops.add_new_crawl(
            crawl_id, crawlconfig, user.id, started, manual
        )
        info = self.set_config_current_crawl_info(
            crawlconfig.id, crawl_id, started, user
        )

        await asyncio.gather(inc, add, info)

    async def inc_crawl_count(self, cid: UUID) -> None:
        """inc crawl count for config"""
        await self.crawl_configs.find_one_and_update(
            {"_id": cid, "inactive": {"$ne": True}},
            {"$inc": {"crawlAttemptCount": 1}},
        )

    def check_attr_changed(
        self, crawlconfig: CrawlConfig, update: UpdateCrawlConfig, attr_name: str
    ) -> bool:
        """check if attribute is set and has changed. if not changed, clear it on the update"""
        if getattr(update, attr_name) is not None:
            if getattr(update, attr_name) != getattr(crawlconfig, attr_name):
                return True

        return False

    async def update_crawl_config(
        self, cid: UUID, org: Organization, user: User, update: UpdateCrawlConfig
    ) -> CrawlConfigUpdateResponse:
        # pylint: disable=too-many-locals, too-many-branches, too-many-statements
        """Update name, scale, schedule, and/or tags for an existing crawl config"""

        orig_crawl_config = await self.get_crawl_config(cid, org.id)

        if update.scale:
            update.browserWindows = browser_windows_from_scale(cast(int, update.scale))
            update.scale = None

        if update.config and update.config.exclude:
            exclude = update.config.exclude
            if isinstance(exclude, str):
                exclude = [exclude]
            validate_regexes(exclude)

        if update.config and update.config.selectLinks is not None:
            self._validate_link_selectors(update.config.selectLinks)

        if update.config and update.config.customBehaviors:
            for url in update.config.customBehaviors:
                self._validate_custom_behavior_url_syntax(url)

        if update.config and update.config.lang:
            validate_language_code(update.config.lang)

        if update.config or update.browserWindows:
            if self.is_single_page(update.config or orig_crawl_config.config):
                update.browserWindows = 1

        # indicates if any k8s crawl config settings changed
        changed = False
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "config")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "crawlTimeout")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "maxCrawlSize")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "crawlerChannel")
        )
        changed = changed or (
            self.check_attr_changed(orig_crawl_config, update, "crawlFilenameTemplate")
        )
        changed = changed or self.check_attr_changed(
            orig_crawl_config, update, "browserWindows"
        )

        schedule_changed = self.check_attr_changed(
            orig_crawl_config, update, "schedule"
        )
        changed = changed or schedule_changed

        changed = changed or (
            update.profileid is not None
            and update.profileid != orig_crawl_config.profileid
            and ((not update.profileid) != (not orig_crawl_config.profileid))
        )

        changed = changed or (orig_crawl_config.proxyId != update.proxyId)

        metadata_changed = self.check_attr_changed(orig_crawl_config, update, "name")
        metadata_changed = metadata_changed or self.check_attr_changed(
            orig_crawl_config, update, "description"
        )
        metadata_changed = metadata_changed or (
            update.tags is not None
            and ",".join(orig_crawl_config.tags) != ",".join(update.tags)
        )
        metadata_changed = metadata_changed or (
            update.autoAddCollections is not None
            and sorted(orig_crawl_config.autoAddCollections)
            != sorted(update.autoAddCollections)
        )

        run_now = update.runNow

        if not changed and not metadata_changed and not run_now:
            return CrawlConfigUpdateResponse(
                settings_changed=changed, metadata_changed=metadata_changed
            )

        if changed:
            orig_dict = orig_crawl_config.dict(exclude_unset=True, exclude_none=True)
            orig_dict["cid"] = orig_dict.pop("id", cid)
            orig_dict["id"] = uuid4()

            last_rev = ConfigRevision(**orig_dict)
            last_rev = await self.config_revs.insert_one(last_rev.to_dict())

        # set update query
        query = update.dict(exclude_unset=True)
        query["modifiedBy"] = user.id
        query["modifiedByName"] = user.name
        query["modified"] = dt_now()

        # if empty str, just clear the profile
        if update.profileid == "":
            query["profileid"] = None
        # else, ensure its a valid profile
        elif update.profileid:
            await self.profiles.get_profile(cast(UUID, update.profileid), org)
            query["profileid"] = update.profileid

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

        crawlconfig = CrawlConfig.from_dict(result)

        # update in crawl manager to change schedule
        if schedule_changed:
            try:
                await self.crawl_manager.update_scheduled_job(crawlconfig, str(user.id))

            except Exception as exc:
                print(exc, flush=True)
                # pylint: disable=raise-missing-from
                raise HTTPException(
                    status_code=404, detail=f"Crawl Config '{cid}' not found"
                )

        ret = CrawlConfigUpdateResponse(
            settings_changed=changed,
            metadata_changed=metadata_changed,
            storageQuotaReached=self.org_ops.storage_quota_reached(org),
            execMinutesQuotaReached=self.org_ops.exec_mins_quota_reached(org),
        )

        if run_now:
            crawl_id = await self.run_now(cid, org, user)
            ret.started = crawl_id
        elif update.updateRunning and changed:
            running_crawl = await self.get_running_crawl(cid)
            if running_crawl:
                await self.crawl_manager.update_running_crawl_config(
                    running_crawl.id, crawlconfig
                )
                ret.updatedRunning = True

        return ret

    async def update_usernames(self, userid: UUID, updated_name: str) -> None:
        """Update username references matching userid"""
        for workflow_field in ["createdBy", "modifiedBy", "lastStartedBy"]:
            await self.crawl_configs.update_many(
                {workflow_field: userid},
                {"$set": {f"{workflow_field}Name": updated_name}},
            )

    async def get_crawl_configs(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        created_by: Optional[UUID] = None,
        modified_by: Optional[UUID] = None,
        profileid: Optional[UUID] = None,
        first_seed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        schedule: Optional[bool] = None,
        isCrawlRunning: Optional[bool] = None,
        sort_by: str = "lastRun",
        sort_direction: int = -1,
    ) -> tuple[list[CrawlConfigOut], int]:
        """Get all crawl configs for an organization is a member of"""
        # pylint: disable=too-many-locals,too-many-branches,too-many-statements
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

        if profileid:
            match_query["profileid"] = profileid

        if name:
            match_query["name"] = name

        if description:
            match_query["description"] = description

        if schedule is not None:
            if schedule:
                match_query["schedule"] = {"$nin": ["", None]}
            else:
                match_query["schedule"] = {"$in": ["", None]}

        if isCrawlRunning is not None:
            match_query["isCrawlRunning"] = isCrawlRunning

        # pylint: disable=duplicate-code
        aggregate = [
            {"$match": match_query},
            {"$set": {"firstSeedObject": {"$arrayElemAt": ["$config.seeds", 0]}}},
            {"$set": {"seedCount": {"$size": "$config.seeds"}}},
            # Set firstSeed
            {"$set": {"firstSeed": "$firstSeedObject.url"}},
            {"$unset": ["firstSeedObject", "config"]},
        ]

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if sort_by:
            if sort_by not in ALLOWED_SORT_KEYS:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            sort_query = {sort_by: sort_direction}

            # add secondary sort keys:
            # firstSeed for name
            if sort_by == "name":
                sort_query["firstSeed"] = sort_direction

            # Special case for last-* fields in case crawl is running
            elif sort_by in ("lastRun", "lastCrawlTime", "lastCrawlStartTime"):
                sort_query = {
                    "isCrawlRunning": sort_direction,
                    sort_by: sort_direction,
                    "modified": sort_direction,
                }

            aggregate.extend([{"$sort": sort_query}])

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

        cursor = self.crawl_configs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        configs = []
        for res in items:
            config = CrawlConfigOut.from_dict(res)
            # pylint: disable=invalid-name
            if not config.inactive:
                await self._add_running_curr_crawl_stats(config)
            configs.append(config)

        return configs, total

    async def is_profile_in_use(self, profileid: UUID, org: Organization) -> bool:
        """return true/false if any active workflows exist with given profile"""
        res = await self.crawl_configs.find_one(
            {"profileid": profileid, "inactive": {"$ne": True}, "oid": org.id}
        )
        return res is not None

    async def get_running_crawl(self, cid: UUID) -> Optional[CrawlOut]:
        """Return the id of currently running crawl for this config, if any"""
        # crawls = await self.crawl_manager.list_running_crawls(cid=crawlconfig.id)
        crawls, _ = await self.crawl_ops.list_crawls(cid=cid, running_only=True)

        if len(crawls) == 1:
            return crawls[0]

        return None

    async def stats_recompute_last(self, cid: UUID, size: int, inc_crawls: int = 1):
        """recompute stats by incrementing size counter and number of crawls"""
        update_query: dict[str, object] = {}

        running_crawl = await self.get_running_crawl(cid)

        # If crawl is running, lastCrawl* stats are already for running crawl,
        # so there's nothing to update other than size and crawl count
        if not running_crawl:
            match_query = {
                "cid": cid,
                "finished": {"$ne": None},
                "inactive": {"$ne": True},
            }
            last_crawl = await self.crawls.find_one(
                match_query, sort=[("finished", pymongo.DESCENDING)]
            )

            # Update to reflect last crawl
            if last_crawl:
                last_crawl_finished = last_crawl.get("finished")

                update_query["lastCrawlId"] = str(last_crawl.get("_id"))
                update_query["lastCrawlStartTime"] = last_crawl.get("started")
                update_query["lastStartedBy"] = last_crawl.get("userid")
                update_query["lastStartedByName"] = last_crawl.get("userName")
                update_query["lastCrawlTime"] = last_crawl_finished
                update_query["lastCrawlState"] = last_crawl.get("state")
                update_query["lastCrawlSize"] = sum(
                    file_.get("size", 0) for file_ in last_crawl.get("files", [])
                )
                update_query["lastCrawlStats"] = last_crawl.get("stats")
                update_query["lastCrawlStopping"] = False
                update_query["isCrawlRunning"] = False

                if last_crawl_finished:
                    update_query["lastRun"] = last_crawl_finished
            # If no last crawl exists and no running crawl, reset stats
            else:
                update_query["lastCrawlId"] = None
                update_query["lastCrawlStartTime"] = None
                update_query["lastStartedBy"] = None
                update_query["lastStartedByName"] = None
                update_query["lastCrawlTime"] = None
                update_query["lastCrawlState"] = None
                update_query["lastCrawlSize"] = 0
                update_query["lastCrawlStats"] = None
                update_query["lastRun"] = None
                update_query["isCrawlRunning"] = False

        result = await self.crawl_configs.find_one_and_update(
            {"_id": cid, "inactive": {"$ne": True}},
            {
                "$set": update_query,
                "$inc": {
                    "totalSize": size,
                    "crawlCount": inc_crawls,
                    "crawlSuccessfulCount": inc_crawls,
                },
            },
        )

        return result is not None

    async def _add_running_curr_crawl_stats(self, crawlconfig: CrawlConfigOut):
        """Add stats from current running crawl, if any"""
        crawl = await self.get_running_crawl(crawlconfig.id)
        if not crawl:
            return

        crawlconfig.lastCrawlState = crawl.state
        crawlconfig.lastCrawlSize = crawl.stats.size if crawl.stats else 0
        crawlconfig.lastCrawlStopping = crawl.stopping
        crawlconfig.lastCrawlShouldPause = crawl.shouldPause
        crawlconfig.lastCrawlPausedAt = crawl.pausedAt
        crawlconfig.lastCrawlPausedExpiry = None
        crawlconfig.lastCrawlStats = crawl.stats if crawl.stats else None
        if crawl.pausedAt:
            crawlconfig.lastCrawlPausedExpiry = (
                crawl.pausedAt + self.paused_expiry_delta
            )
        crawlconfig.isCrawlRunning = True

    async def get_crawl_config_out(self, cid: UUID, org: Organization):
        """Return CrawlConfigOut, including state of currently running crawl, if active
        also include inactive crawl configs"""

        crawlconfig = await self.get_crawl_config(
            cid, org.id, active_only=False, config_cls=CrawlConfigOut
        )

        if not crawlconfig.inactive:
            await self._add_running_curr_crawl_stats(crawlconfig)

        if crawlconfig.profileid:
            crawlconfig.profileName = await self.profiles.get_profile_name(
                crawlconfig.profileid, org
            )

        if crawlconfig.config and crawlconfig.config.seeds:
            crawlconfig.firstSeed = crawlconfig.config.seeds[0].url

        crawlconfig.seedCount = await self.get_crawl_config_seed_count(cid, org)

        crawlconfig.config.seeds = None

        return crawlconfig

    async def get_crawl_config_seed_count(self, cid: UUID, org: Organization):
        """Return count of seeds in crawl config"""
        cursor = self.crawl_configs.aggregate(
            [
                {"$match": {"_id": cid, "oid": org.id}},
                {"$project": {"seedCount": {"$size": "$config.seeds"}}},
            ]
        )
        results = await cursor.to_list(length=1)
        result = results[0]
        seed_count = result["seedCount"]
        if seed_count:
            return int(seed_count)
        return 0

    async def get_crawl_config(
        self,
        cid: UUID,
        oid: Optional[UUID] = None,
        active_only: bool = True,
        config_cls=CrawlConfig,
    ):
        """Get crawl config by id"""
        query: dict[str, object] = {"_id": cid}
        if oid:
            query["oid"] = oid
        if active_only:
            query["inactive"] = {"$ne": True}

        res = await self.crawl_configs.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="crawl_config_not_found")

        return config_cls.from_dict(res)

    async def get_crawl_config_revs(
        self, cid: UUID, page_size: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        """return all config revisions for crawlconfig"""
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        match_query = {"cid": cid}

        total = await self.config_revs.count_documents(match_query)

        cursor = self.config_revs.find({"cid": cid}, skip=skip, limit=page_size)
        results = await cursor.to_list(length=page_size)
        revisions = [ConfigRevision.from_dict(res) for res in results]

        return revisions, total

    async def make_inactive_or_delete(
        self,
        crawlconfig: CrawlConfig,
    ):
        """Make config inactive if crawls exist, otherwise move to inactive list"""

        query = {"inactive": True}

        is_running = await self.get_running_crawl(crawlconfig.id) is not None

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
        await self.crawl_manager.delete_crawl_config_by_id(str(crawlconfig.id))

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
        crawl_config = await self.get_crawl_config(cid, org.id, active_only=False)

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

    async def remove_collection_from_all_configs(
        self, coll_id: UUID, org: Organization
    ):
        """remove collection from all autoAddCollection list"""
        await self.crawl_configs.update_many(
            {"oid": org.id, "autoAddCollections": coll_id},
            {"$pull": {"autoAddCollections": coll_id}},
        )

    async def get_crawl_config_tags(self, org):
        """get distinct tags from all crawl configs for this org"""
        tags = await self.crawl_configs.distinct("tags", {"oid": org.id})
        return list(tags)

    async def get_crawl_config_search_values(self, org):
        """List unique names, first seeds, and descriptions from all workflows in org"""
        names = await self.crawl_configs.distinct("name", {"oid": org.id})
        descriptions = await self.crawl_configs.distinct("description", {"oid": org.id})
        workflow_ids = await self.crawl_configs.distinct("_id", {"oid": org.id})

        # Remove empty strings
        names = [name for name in names if name]
        descriptions = [description for description in descriptions if description]

        first_seeds = set()
        async for config in self.crawl_configs.find({"oid": org.id}):
            first_seed = config["config"]["seeds"][0]["url"]
            first_seeds.add(first_seed)

        return {
            "names": names,
            "descriptions": descriptions,
            "firstSeeds": list(first_seeds),
            "workflowIds": workflow_ids,
        }

    async def run_now(self, cid: UUID, org: Organization, user: User) -> str:
        """run new crawl for cid now, if possible"""
        crawlconfig = await self.get_crawl_config(cid, org.id)
        if not crawlconfig:
            raise HTTPException(
                status_code=404, detail=f"Crawl Config '{cid}' not found"
            )

        return await self.run_now_internal(crawlconfig, org, user)

    async def run_now_internal(
        self, crawlconfig: CrawlConfig, org: Organization, user: User
    ) -> str:
        """run new crawl for specified crawlconfig now"""
        self.org_ops.can_write_data(org)

        if await self.get_running_crawl(crawlconfig.id):
            raise HTTPException(status_code=400, detail="crawl_already_running")

        if crawlconfig.proxyId and not self.can_org_use_proxy(org, crawlconfig.proxyId):
            raise HTTPException(status_code=404, detail="proxy_not_found")

        profile_filename = await self.get_profile_filename(crawlconfig.profileid, org)
        storage_filename = (
            crawlconfig.crawlFilenameTemplate or self.default_filename_template
        )

        try:
            crawl_id = await self.crawl_manager.create_crawl_job(
                crawlconfig,
                org.storage,
                userid=str(user.id),
                warc_prefix=self.get_warc_prefix(org, crawlconfig),
                storage_filename=storage_filename,
                profile_filename=profile_filename or "",
                is_single_page=self.is_single_page(crawlconfig.config),
            )
            await self.add_new_crawl(crawl_id, crawlconfig, user, org, manual=True)
            return crawl_id

        except Exception as exc:
            # pylint: disable=raise-missing-from
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Error starting crawl: {exc}")

    async def set_config_current_crawl_info(
        self, cid: UUID, crawl_id: str, crawl_start: datetime, user: User
    ):
        """Set current crawl info in config when crawl begins"""
        result = await self.crawl_configs.find_one_and_update(
            {"_id": cid, "inactive": {"$ne": True}},
            {
                "$set": {
                    "lastCrawlId": crawl_id,
                    "lastCrawlStartTime": crawl_start,
                    "lastCrawlTime": None,
                    "lastRun": crawl_start,
                    "isCrawlRunning": True,
                    "lastStartedBy": user.id,
                    "lastStartedByName": user.name,
                }
            },
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if result:
            return True
        return False

    async def get_seeds(
        self,
        cid: UUID,
        oid: UUID,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        """Get paginated list of seeds for crawlconfig"""
        skip = (page - 1) * page_size
        upper_bound = skip + page_size

        config = await self.get_crawl_config(cid, oid)
        try:
            return config.config.seeds[skip:upper_bound], len(config.config.seeds)
        # pylint: disable=broad-exception-caught
        except Exception:
            return [], 0

    def get_channel_crawler_image(
        self, crawler_channel: Optional[str]
    ) -> Optional[str]:
        """Get crawler image name by id"""
        return self.crawler_images_map.get(crawler_channel or "")

    def get_channel_crawler_image_pull_policy(
        self, crawler_channel: Optional[str]
    ) -> str:
        """Get crawler image name by id"""
        return (
            self.crawler_image_pull_policy_map.get(crawler_channel or "")
            or self.default_crawler_image_pull_policy
        )

    def get_crawler_proxies_map(self) -> dict[str, CrawlerProxy]:
        """Load CrawlerProxy mapping from config"""
        proxies_last_update_path = os.environ["CRAWLER_PROXIES_LAST_UPDATE"]

        if not os.path.isfile(proxies_last_update_path):
            return {}

        # return cached data, when last_update timestamp hasn't changed
        if self._crawler_proxies_last_updated and self._crawler_proxies_map:
            with open(proxies_last_update_path, encoding="utf-8") as fh:
                proxies_last_update = int(fh.read().strip())
                if proxies_last_update == self._crawler_proxies_last_updated:
                    return self._crawler_proxies_map
                self._crawler_proxies_last_updated = proxies_last_update

        crawler_proxies_map: dict[str, CrawlerProxy] = {}
        with open(os.environ["CRAWLER_PROXIES_JSON"], encoding="utf-8") as fh:
            proxy_list = json.loads(fh.read())
            for proxy_data in proxy_list:
                proxy = CrawlerProxy(
                    id=proxy_data["id"],
                    label=proxy_data["label"],
                    description=proxy_data.get("description", ""),
                    country_code=proxy_data.get("country_code", ""),
                    url=proxy_data["url"],
                    has_host_public_key=bool(proxy_data.get("ssh_host_public_key")),
                    has_private_key=bool(proxy_data.get("ssh_private_key")),
                    shared=proxy_data.get("shared", False)
                    or proxy_data["id"] == DEFAULT_PROXY_ID,
                )

                crawler_proxies_map[proxy.id] = proxy

        self._crawler_proxies_map = crawler_proxies_map
        return self._crawler_proxies_map

    def get_crawler_proxies(self):
        """Get CrawlerProxy configuration"""
        return CrawlerProxies(
            default_proxy_id=DEFAULT_PROXY_ID,
            servers=list(self.get_crawler_proxies_map().values()),
        )

    def get_crawler_proxy(self, proxy_id: str) -> Optional[CrawlerProxy]:
        """Get crawlerProxy by id"""
        return self.get_crawler_proxies_map().get(proxy_id)

    def can_org_use_proxy(self, org: Organization, proxy: CrawlerProxy | str) -> bool:
        """Checks if org is able to use proxy"""

        if isinstance(proxy, str):
            _proxy = self.get_crawler_proxy(proxy)
        else:
            _proxy = proxy

        if _proxy is None:
            return False

        return (
            _proxy.shared and org.allowSharedProxies
        ) or _proxy.id in org.allowedProxies

    def get_warc_prefix(self, org: Organization, crawlconfig: CrawlConfig) -> str:
        """Generate WARC prefix slug from org slug, name or url
        if no name is provided, hostname is used from url, otherwise
        url is ignored"""
        name = crawlconfig.name
        if not name:
            if crawlconfig.config.seeds and len(crawlconfig.config.seeds):
                url = str(crawlconfig.config.seeds[0].url)
                parts = urllib.parse.urlsplit(url)
                name = parts.netloc

        name = slug_from_name(name or "")
        prefix = org.slug + "-" + name
        return prefix[:80]

    async def re_add_all_scheduled_cron_jobs(self):
        """Re-add all scheduled workflow cronjobs"""
        match_query = {"schedule": {"$nin": ["", None]}, "inactive": {"$ne": True}}
        async for config_dict in self.crawl_configs.find(match_query):
            config = CrawlConfig.from_dict(config_dict)
            try:
                await self.crawl_manager.update_scheduled_job(config)
                print(f"Updated cronjob for scheduled workflow {config.id}", flush=True)
            # pylint: disable=broad-except
            except Exception as err:
                print(
                    f"Error updating cronjob for scheduled workflow {config.id}: {err}",
                    flush=True,
                )

    async def _validate_behavior_git_repo(self, repo_url: str, branch: str = ""):
        """Validate git repository and branch, if specified, exist and are reachable"""
        cmd = f"git ls-remote {repo_url} HEAD"
        proc = await asyncio.create_subprocess_shell(cmd)
        if await proc.wait() > 0:
            raise HTTPException(
                status_code=404,
                detail="custom_behavior_not_found",
            )

        if branch:
            await asyncio.sleep(0.5)
            git_remote_cmd = (
                f"git ls-remote --exit-code --heads {repo_url} refs/heads/{branch}"
            )
            proc = await asyncio.create_subprocess_shell(git_remote_cmd)
            if await proc.wait() > 0:
                raise HTTPException(
                    status_code=404,
                    detail="custom_behavior_branch_not_found",
                )

    async def _validate_behavior_url(self, url: str):
        """Validate behavior file exists at url"""
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as resp:
                    if resp.status >= 400:
                        raise HTTPException(
                            status_code=404,
                            detail="custom_behavior_not_found",
                        )
        # pylint: disable=raise-missing-from
        except aiohttp.ClientError:
            raise HTTPException(
                status_code=404,
                detail="custom_behavior_not_found",
            )

    async def validate_custom_behavior(self, url: str) -> Dict[str, bool]:
        """Validate custom behavior URL

        Implemented:
        - Ensure URL is valid (after removing custom git prefix and syntax)
        - Ensure URL returns status code < 400
        - Ensure git repository can be reached by git ls-remote and that branch
        exists, if provided
        """
        git_branch = ""

        is_git_repo, url_parts = self._validate_custom_behavior_url_syntax(url)
        url = url_parts[0]

        if is_git_repo and len(url_parts) > 1:
            query_str = url_parts[1]
            try:
                git_branch = urllib.parse.parse_qs(query_str)["branch"][0]
            # pylint: disable=broad-exception-caught
            except (KeyError, IndexError):
                pass

        if is_git_repo:
            await self._validate_behavior_git_repo(url, branch=git_branch)
        else:
            await self._validate_behavior_url(url)

        return {"success": True}


# ============================================================================
# pylint: disable=too-many-locals
async def stats_recompute_all(crawl_configs, crawls, cid: UUID):
    """Re-calculate and update crawl statistics for config.

    Should only be called when a crawl completes from operator or on migration
    when no crawls are running.
    """
    update_query: dict[str, object] = {}

    match_query = {"cid": cid, "finished": {"$ne": None}}
    count = await crawls.count_documents(match_query)
    if count:
        update_query["crawlCount"] = count

        total_size = 0
        successful_count = 0

        last_crawl: Optional[dict[str, object]] = None
        last_crawl_size = 0

        async for res in crawls.find(match_query).sort("finished", pymongo.ASCENDING):
            files = res.get("files", [])
            crawl_size = 0
            for file in files:
                crawl_size += file.get("size", 0)

            total_size += crawl_size

            if res["state"] not in FAILED_STATES:
                successful_count += 1

            last_crawl = res
            last_crawl_size = crawl_size

        # only update last_crawl if no crawls running, otherwise
        # lastCrawl* stats are already for running crawl
        running_crawl = await crawl_configs.get_running_crawl(cid)

        if last_crawl and not running_crawl:
            update_query["totalSize"] = total_size
            update_query["crawlSuccessfulCount"] = successful_count

            update_query["lastCrawlId"] = str(last_crawl.get("_id"))
            update_query["lastCrawlStartTime"] = last_crawl.get("started")
            update_query["lastStartedBy"] = last_crawl.get("userid")
            update_query["lastStartedByName"] = last_crawl.get("userName")
            update_query["lastCrawlState"] = last_crawl.get("state")
            update_query["lastCrawlSize"] = last_crawl_size
            update_query["lastCrawlStats"] = last_crawl.get("stats")
            update_query["lastCrawlStopping"] = False
            update_query["isCrawlRunning"] = False

            last_crawl_finished = last_crawl.get("finished")
            update_query["lastCrawlTime"] = last_crawl_finished

            if last_crawl_finished:
                update_query["lastRun"] = last_crawl_finished

    result = await crawl_configs.find_one_and_update(
        {"_id": cid, "inactive": {"$ne": True}},
        {"$set": update_query},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    return result


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name,too-many-locals,too-many-arguments
def init_crawl_config_api(
    app,
    dbclient,
    mdb,
    user_dep,
    user_manager,
    org_ops,
    crawl_manager,
    profiles,
):
    """Init /crawlconfigs api routes"""
    # pylint: disable=invalid-name

    ops = CrawlConfigOps(dbclient, mdb, user_manager, org_ops, crawl_manager, profiles)

    router = ops.router

    org_crawl_dep = org_ops.org_crawl_dep
    org_viewer_dep = org_ops.org_viewer_dep

    @router.get("", response_model=PaginatedCrawlConfigOutResponse)
    async def get_crawl_configs(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        # createdBy, kept as userid for API compatibility
        userid: Optional[UUID] = None,
        modifiedBy: Optional[UUID] = None,
        profileid: Optional[UUID] = None,
        firstSeed: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tag: Union[List[str], None] = Query(default=None),
        schedule: Optional[bool] = None,
        isCrawlRunning: Optional[bool] = None,
        sortBy: str = "",
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
            profileid=profileid,
            first_seed=firstSeed,
            name=name,
            description=description,
            tags=tag,
            schedule=schedule,
            isCrawlRunning=isCrawlRunning,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(crawl_configs, total, page, pageSize)

    @router.get("/tags", response_model=List[str])
    async def get_crawl_config_tags(org: Organization = Depends(org_viewer_dep)):
        return await ops.get_crawl_config_tags(org)

    @router.get("/search-values", response_model=CrawlConfigSearchValues)
    async def get_crawl_config_search_values(
        org: Organization = Depends(org_viewer_dep),
    ):
        return await ops.get_crawl_config_search_values(org)

    @router.get("/crawler-channels", response_model=CrawlerChannels)
    async def get_crawler_channels(
        # pylint: disable=unused-argument
        org: Organization = Depends(org_crawl_dep),
    ):
        return ops.crawler_channels

    @router.get("/crawler-proxies", response_model=CrawlerProxies)
    async def get_crawler_proxies(
        org: Organization = Depends(org_crawl_dep),
    ):
        return CrawlerProxies(
            default_proxy_id=DEFAULT_PROXY_ID,
            servers=[
                proxy
                for proxy in ops.get_crawler_proxies_map().values()
                if ops.can_org_use_proxy(org, proxy)
            ],
        )

    @app.get("/orgs/all/crawlconfigs/crawler-proxies", response_model=CrawlerProxies)
    async def get_all_crawler_proxies(
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return ops.get_crawler_proxies()

    @router.get("/{cid}/seeds", response_model=PaginatedSeedResponse)
    async def get_crawl_config_seeds(
        cid: UUID,
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        seeds, total = await ops.get_seeds(cid, org.id, pageSize, page)
        return paginated_format(seeds, total, page, pageSize)

    @router.get("/{cid}", response_model=CrawlConfigOut)
    async def get_crawl_config_out(
        cid: UUID, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_crawl_config_out(cid, org)

    @router.get(
        "/{cid}/revs",
        dependencies=[Depends(org_viewer_dep)],
        response_model=PaginatedConfigRevisionResponse,
    )
    async def get_crawl_config_revisions(
        cid: UUID, pageSize: int = DEFAULT_PAGE_SIZE, page: int = 1
    ):
        revisions, total = await ops.get_crawl_config_revs(
            cid, page_size=pageSize, page=page
        )
        return paginated_format(revisions, total, page, pageSize)

    @router.post("/", response_model=CrawlConfigAddedResponse)
    async def add_crawl_config(
        config: CrawlConfigIn,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.add_crawl_config(config, org, user)

    @router.patch(
        "/{cid}",
        dependencies=[Depends(org_crawl_dep)],
        response_model=CrawlConfigUpdateResponse,
    )
    async def update_crawl_config(
        update: UpdateCrawlConfig,
        cid: UUID,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        return await ops.update_crawl_config(cid, org, user, update)

    @router.post("/{cid}/run", response_model=StartedResponse)
    async def run_now(
        cid: UUID,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ) -> dict[str, str]:
        crawl_id = await ops.run_now(cid, org, user)
        return {"started": crawl_id}

    @router.delete("/{cid}", response_model=CrawlConfigDeletedResponse)
    async def make_inactive(cid: UUID, org: Organization = Depends(org_crawl_dep)):
        crawlconfig = await ops.get_crawl_config(cid, org.id)

        return await ops.do_make_inactive(crawlconfig)

    @app.post("/orgs/all/crawlconfigs/reAddCronjobs", response_model=SuccessResponse)
    async def re_add_all_scheduled_cron_jobs(
        user: User = Depends(user_dep),
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        asyncio.create_task(ops.re_add_all_scheduled_cron_jobs())
        return {"success": True}

    @router.post("/validate/custom-behavior", response_model=SuccessResponse)
    async def validate_custom_behavior(
        behavior: ValidateCustomBehavior,
        # pylint: disable=unused-argument
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.validate_custom_behavior(behavior.customBehavior)

    org_ops.router.include_router(router)

    return ops
