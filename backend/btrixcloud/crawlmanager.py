""" shared crawl manager implementation """

import os
import asyncio
import datetime
import secrets

from abc import ABC, abstractmethod

from fastapi.templating import Jinja2Templates

from .db import resolve_db_url


# ============================================================================
class BaseCrawlManager(ABC):
    """abstract crawl manager"""

    def __init__(self, templates):
        super().__init__()

        self.job_image = os.environ["JOB_IMAGE"]
        self.job_pull_policy = os.environ.get("JOB_PULL_POLICY", "Always")

        self.no_delete_jobs = os.environ.get("NO_DELETE_JOBS", "0") != "0"

        self.crawler_node_type = os.environ.get("CRAWLER_NODE_TYPE", "")

        self.templates = Jinja2Templates(directory=templates)

        self.loop = asyncio.get_running_loop()

    # pylint: disable=too-many-arguments
    async def run_profile_browser(
        self,
        userid,
        oid,
        url,
        storage=None,
        storage_name=None,
        baseprofile=None,
        profile_path=None,
    ):
        """run browser for profile creation"""

        # if default storage, use name and path + profiles/
        if storage:
            storage_name = storage.name
            storage_path = storage.path + "profiles/"
        # otherwise, use storage name and existing path from secret
        else:
            storage_path = ""

        await self.check_storage(storage_name)

        browserid = f"prf-{secrets.token_hex(5)}"

        params = {
            "id": browserid,
            "userid": str(userid),
            "oid": str(oid),
            "job_image": self.job_image,
            "job_pull_policy": self.job_pull_policy,
            "storage_name": storage_name,
            "storage_path": storage_path or "",
            "baseprofile": baseprofile or "",
            "profile_path": profile_path,
            "idle_timeout": os.environ.get("IDLE_TIMEOUT", "60"),
            "url": url,
            "env": os.environ,
        }

        data = self.templates.env.get_template("profile_job.yaml").render(params)

        await self._create_from_yaml(f"job-{browserid}", data)

        return browserid

    async def add_crawl_config(
        self,
        crawlconfig,
        storage,
        run_now,
        out_filename,
        profile_filename,
    ):
        """add new crawl as cron job, store crawl config in configmap"""

        if storage.type == "default":
            storage_name = storage.name
            storage_path = storage.path
        else:
            storage_name = str(crawlconfig.oid)
            storage_path = ""

        await self.check_storage(storage_name)

        # Create Config Map
        await self._create_config_map(
            crawlconfig,
            STORE_PATH=storage_path,
            STORE_FILENAME=out_filename,
            STORAGE_NAME=storage_name,
            USER_ID=str(crawlconfig.userid),
            ORG_ID=str(crawlconfig.oid),
            CRAWL_CONFIG_ID=str(crawlconfig.id),
            PROFILE_FILENAME=profile_filename,
        )

        crawl_id = None

        if run_now:
            crawl_id = await self._create_manual_job(crawlconfig)

        await self._update_scheduled_job(crawlconfig)

        return crawl_id

    # pylint: disable=unused-argument
    async def run_crawl_config(self, crawlconfig, userid=None):
        """Run crawl job for cron job based on specified crawlconfig
        optionally set different user"""

        return await self._create_manual_job(crawlconfig)

    async def update_crawlconfig_schedule_or_scale(
        self, crawlconfig, scale=None, schedule=None
    ):
        """Update the schedule or scale for existing crawl config"""

        if schedule is not None:
            await self._update_scheduled_job(crawlconfig)

        if scale is not None:
            await self._update_config_initial_scale(crawlconfig, scale)

        return True

    async def shutdown_crawl(self, crawl_id, oid, graceful=True):
        """Request a crawl cancelation or stop by calling an API
        on the job pod/container, returning the result"""
        return await self._post_to_job(
            crawl_id, oid, "/stop" if graceful else "/cancel"
        )

    async def scale_crawl(self, crawl_id, oid, scale=1):
        """Set the crawl scale (job parallelism) on the specified job"""

        return await self._post_to_job(crawl_id, oid, f"/scale/{scale}")

    async def change_crawl_config(self, crawl_id, oid, new_cid):
        """Change crawl config and restart"""

        return await self._post_to_job(crawl_id, oid, f"/change_config/{new_cid}")

    async def delete_crawl_configs_for_org(self, org):
        """Delete all crawl configs for given org"""
        return await self._delete_crawl_configs(f"btrix.org={org}")

    async def delete_crawl_config_by_id(self, cid):
        """Delete all crawl configs by id"""
        return await self._delete_crawl_configs(f"btrix.crawlconfig={cid}")

    async def _create_manual_job(self, crawlconfig):
        cid = str(crawlconfig.id)
        ts_now = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        crawl_id = f"manual-{ts_now}-{cid[:12]}"

        data = await self._load_job_template(crawlconfig, crawl_id, manual=True)

        # create job directly
        await self._create_from_yaml(f"job-{crawl_id}", data)

        return crawl_id

    async def _load_job_template(self, crawlconfig, job_id, manual, schedule=None):
        params = {
            "id": job_id,
            "cid": str(crawlconfig.id),
            "userid": str(crawlconfig.userid),
            "oid": str(crawlconfig.oid),
            "job_image": self.job_image,
            "job_pull_policy": self.job_pull_policy,
            "manual": "1" if manual else "0",
            "crawler_node_type": self.crawler_node_type,
            "schedule": schedule,
            "env": os.environ,
            "mongo_db_url": resolve_db_url(),
            "tags": ",".join(crawlconfig.tags),
        }

        return self.templates.env.get_template("crawl_job.yaml").render(params)

    async def _update_config_initial_scale(self, crawlconfig, scale):
        """update initial scale in config, if needed (k8s only)"""

    @abstractmethod
    async def check_storage(self, storage_name, is_default=False):
        """check if given storage is valid"""

    @abstractmethod
    async def _create_from_yaml(self, id_, yaml_data):
        """check if given storage is valid"""

    @abstractmethod
    async def _create_config_map(self, crawlconfig, **kwargs):
        """create config map for config"""

    @abstractmethod
    async def _update_scheduled_job(self, crawlconfig):
        """update schedule on crawl job"""

    @abstractmethod
    async def _post_to_job(self, crawl_id, oid, path, data=None):
        """make a POST request to the container for specified crawl job"""

    @abstractmethod
    async def _delete_crawl_configs(self, label):
        """delete crawl configs by specified label"""
