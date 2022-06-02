""" Swarn Runner """
import os
import json

import aiohttp

from ..archives import S3Storage

from .utils import (
    get_templates_dir,
    run_swarm_stack,
    delete_swarm_stack,
    get_service,
    get_service_labels,
    set_service_label,
    ping_containers,
    create_config,
    delete_configs,
)

from ..crawlmanager import BaseCrawlManager


# ============================================================================
class SwarmManager(BaseCrawlManager):
    """ Docker Crawl Manager Interface"""

    # pylint: disable=too-many-instance-attributes,too-many-public-methods
    def __init__(self):
        super().__init__(get_templates_dir())

        self.storages = {
            "default": S3Storage(
                name="default",
                access_key=os.environ["STORE_ACCESS_KEY"],
                secret_key=os.environ["STORE_SECRET_KEY"],
                endpoint_url=os.environ["STORE_ENDPOINT_URL"],
                access_endpoint_url=os.environ["STORE_ACCESS_ENDPOINT_URL"],
            )
        }

    async def check_storage(self, storage_name, is_default=False):
        """ check if storage_name is valid storage """
        # if not default, don't validate
        if not is_default:
            return True

        # if default, ensure name is in default storages list
        return self.storages[storage_name]

    async def get_default_storage(self, name):
        """ return default storage by name """
        return self.storages[name]

    async def _create_from_yaml(self, id_, yaml_data):
        await self.loop.run_in_executor(None, run_swarm_stack, id_, yaml_data)

    async def ping_profile_browser(self, browserid):
        """ return ping profile browser """
        return await self.loop.run_in_executor(
            None,
            ping_containers,
            f"job-{browserid}_job",
            "SIGUSR1",
        )

    async def get_profile_browser_metadata(self, browserid):
        """ get browser profile labels """
        return await self.loop.run_in_executor(
            None, get_service_labels, f"job-{browserid}_job"
        )

    async def delete_profile_browser(self, browserid):
        """ delete browser job, if it is a profile browser job """
        return await self.loop.run_in_executor(
            None, delete_swarm_stack, f"job-{browserid}"
        )

    def _add_extra_crawl_job_params(self, params):
        """ add extra crawl job params """
        params["mongo_user"] = os.environ["MONGO_INITDB_ROOT_USERNAME"]
        params["mongo_pass"] = os.environ["MONGO_INITDB_ROOT_PASSWORD"]

    async def _create_config_map(self, crawlconfig, **kwargs):
        """ create config map for config """

        data = json.dumps(crawlconfig.get_raw_config())

        labels = {
            "btrix.crawlconfig": str(crawlconfig.id),
            "btrix.archive": str(crawlconfig.aid),
        }

        await self.loop.run_in_executor(
            None, create_config, f"crawl-config-{crawlconfig.id}", data, labels
        )

        data = json.dumps(kwargs)

        await self.loop.run_in_executor(
            None, create_config, f"crawl-opts-{crawlconfig.id}", data, labels
        )

    async def _update_scheduled_job(self, crawlconfig):
        """ update schedule on crawl job """

        cid = str(crawlconfig.id)

        crawl_id = f"sched-{cid[:12]}"
        stack_name = f"job-{crawl_id}"
        service_name = f"{stack_name}_job"

        label_name = "swarm.cronjob.schedule"

        cron_job = await self.loop.run_in_executor(None, get_service, service_name)

        if cron_job:
            curr_schedule = cron_job.spec.labels.get(label_name)

            if crawlconfig.schedule and crawlconfig.schedule != curr_schedule:
                await self.loop.run_in_executor(
                    None,
                    set_service_label,
                    service_name,
                    f"{label_name}={crawlconfig.schedule}",
                )

            if not crawlconfig.schedule:
                # if currently running, ping container to exit on current job
                # otherwise, delete!
                if not await self.loop.run_in_executor(
                    None,
                    ping_containers,
                    service_name,
                    "SIGUSR1",
                ):
                    await self.loop.run_in_executor(
                        None, delete_swarm_stack, stack_name
                    )

            return

        if not crawlconfig.schedule:
            return

        data = await self._load_job_template(
            crawlconfig, crawl_id, manual=False, schedule=crawlconfig.schedule
        )

        await self._create_from_yaml(f"job-{crawl_id}", data)

    async def _post_to_job(self, crawl_id, aid, path, data=None):
        """ make a POST request to the container for specified crawl job """
        async with aiohttp.ClientSession() as session:
            async with session.request(
                "POST", f"http://job-{crawl_id}_job:8000{path}", json=data
            ) as resp:
                await resp.json()

    async def _delete_crawl_configs(self, label):
        """ delete crawl configs by specified label """
        await self.loop.run_in_executor(None, delete_configs, label)
