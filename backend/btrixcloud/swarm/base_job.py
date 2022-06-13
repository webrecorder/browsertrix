""" base k8s job driver """

import os
import asyncio
import signal

import sys
import yaml

from fastapi.templating import Jinja2Templates

from .utils import get_templates_dir, get_runner
from ..utils import random_suffix

runner = get_runner()


# =============================================================================
# pylint: disable=too-many-instance-attributes,bare-except,broad-except
class SwarmJobMixin:
    """ Crawl Job State """

    def __init__(self):
        self.secrets_prefix = "/var/run/secrets/"
        self.shared_config_file = os.environ.get("SHARED_JOB_CONFIG")
        self.custom_config_file = os.environ.get("CUSTOM_JOB_CONFIG")

        self.curr_storage = {}

        self.job_id = os.environ.get("JOB_ID")

        # in case id is modified below, should be able to delete self
        self.orig_job_id = self.job_id

        self.remove_schedule = False
        self.is_scheduled = os.environ.get("RUN_MANUAL") == "0"

        if self.is_scheduled:
            self.job_id += "-" + random_suffix()

        self.prefix = os.environ.get("STACK_PREFIX", "stack-")

        if self.custom_config_file:
            self._populate_env(self.secrets_prefix + self.custom_config_file)

        self.templates = Jinja2Templates(directory=get_templates_dir())

        super().__init__()

    def _populate_env(self, filename):
        with open(filename, encoding="utf-8") as fh_config:
            params = yaml.safe_load(fh_config)

        for key in params:
            val = params[key]
            if isinstance(val, str):
                os.environ[key] = val

    async def init_job_objects(self, template, extra_params=None):
        """ init swarm objects from specified template with given extra_params """
        loop = asyncio.get_running_loop()
        loop.add_signal_handler(signal.SIGUSR1, self.unschedule_job)

        if self.shared_config_file:
            with open(
                self.secrets_prefix + self.shared_config_file, encoding="utf-8"
            ) as fh_config:
                params = yaml.safe_load(fh_config)
        else:
            params = {}

        params["id"] = self.job_id

        if extra_params:
            params.update(extra_params)

        params["storage_name"] = os.environ.get("STORAGE_NAME", "default")

        await self._do_create(loop, template, params)

    async def delete_job_objects(self, _):
        """ remove swarm service stack """
        loop = asyncio.get_running_loop()
        await self._do_delete(loop)

        if not self.is_scheduled or self.remove_schedule:
            print("Removed other objects, removing ourselves", flush=True)
            await loop.run_in_executor(
                None, runner.delete_service_stack, f"job-{self.orig_job_id}"
            )
        else:
            sys.exit(0)

        return True

    def unschedule_job(self):
        """ mark job as unscheduled """
        print("Unscheduled, will delete when finished", flush=True)
        self.remove_schedule = True

    async def _do_create(self, loop, template, params):
        data = self.templates.env.get_template(template).render(params)
        return await loop.run_in_executor(
            None, runner.run_service_stack, self.prefix + self.job_id, data
        )

    async def _do_delete(self, loop):
        await loop.run_in_executor(
            None, runner.delete_service_stack, self.prefix + self.job_id
        )
