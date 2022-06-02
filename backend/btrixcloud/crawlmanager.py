""" shared crawl manager implementation """

import os
import asyncio
import datetime

from abc import ABC, abstractmethod

from fastapi.templating import Jinja2Templates

from .utils import random_suffix


# ============================================================================
class BaseCrawlManager(ABC):
    """ abstract crawl manager """

    def __init__(self, templates):
        super().__init__()

        self.crawler_image = os.environ["CRAWLER_IMAGE"]
        self.job_image = os.environ["JOB_IMAGE"]

        self.no_delete_jobs = os.environ.get("NO_DELETE_JOBS", "0") != "0"

        self.templates = Jinja2Templates(directory=templates)

        self.loop = asyncio.get_running_loop()

    # pylint: disable=too-many-arguments
    async def run_profile_browser(
        self,
        userid,
        aid,
        url,
        storage=None,
        storage_name=None,
        baseprofile=None,
        profile_path=None,
    ):
        """run browser for profile creation """

        # if default storage, use name and path + profiles/
        if storage:
            storage_name = storage.name
            storage_path = storage.path + "profiles/"
        # otherwise, use storage name and existing path from secret
        else:
            storage_path = ""

        await self.check_storage(storage_name)

        browserid = f"prf-{random_suffix()}"

        params = {
            "id": browserid,
            "userid": str(userid),
            "aid": str(aid),
            "job_image": self.job_image,
            "storage_name": storage_name,
            "storage_path": storage_path or "",
            "baseprofile": baseprofile or "",
            "profile_path": profile_path,
            "url": url,
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
            storage_name = str(crawlconfig.aid)
            storage_path = ""

        await self.check_storage(storage_name)

        # Create Config Map
        await self._create_config_map(
            crawlconfig,
            STORE_PATH=storage_path,
            STORE_FILENAME=out_filename,
            STORAGE_NAME=storage_name,
            USER_ID=str(crawlconfig.userid),
            ARCHIVE_ID=str(crawlconfig.aid),
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
        """ Update the schedule or scale for existing crawl config """

        if schedule is not None:
            await self._update_scheduled_job(crawlconfig)

        if scale is not None:
            await self._update_config_initial_scale(crawlconfig, scale)

        return True

    async def stop_crawl(self, crawl_id, aid, graceful=True):
        """Attempt to stop crawl, either gracefully by issuing a SIGTERM which
        will attempt to finish current pages

        OR, abruptly by first issueing a SIGABRT, followed by SIGTERM, which
        will terminate immediately"""
        return await self._post_to_job(
            crawl_id, aid, "/cancel" if not graceful else "/stop"
        )

    async def scale_crawl(self, crawl_id, aid, scale=1):
        """ Set the crawl scale (job parallelism) on the specified job """

        return await self._post_to_job(crawl_id, aid, f"/scale/{scale}")

    async def delete_crawl_configs_for_archive(self, archive):
        """Delete all crawl configs for given archive"""
        return await self._delete_crawl_configs(f"btrix.archive={archive}")

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
            "aid": str(crawlconfig.aid),
            "job_image": self.job_image,
            "manual": "1" if manual else "0",
            "schedule": schedule,
        }

        self._add_extra_crawl_job_params(params)

        return self.templates.env.get_template("crawl_job.yaml").render(params)

    def _add_extra_crawl_job_params(self, params):
        """ add extra params for crawl job template, if any (swarm only) """

    async def _update_config_initial_scale(self, crawlconfig, scale):
        """ update initial scale in config, if needed (k8s only) """

    @abstractmethod
    async def check_storage(self, storage_name, is_default=False):
        """ check if given storage is valid """

    @abstractmethod
    async def _create_from_yaml(self, id_, yaml_data):
        """ check if given storage is valid """

    @abstractmethod
    async def _create_config_map(self, crawlconfig, **kwargs):
        """ create config map for config """

    @abstractmethod
    async def _update_scheduled_job(self, crawlconfig):
        """ update schedule on crawl job """

    @abstractmethod
    async def _post_to_job(self, crawl_id, aid, path, data=None):
        """ make a POST request to the container for specified crawl job """

    @abstractmethod
    async def _delete_crawl_configs(self, label):
        """ delete crawl configs by specified label """
