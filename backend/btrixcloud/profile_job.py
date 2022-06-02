""" entry point for job which manages a browser (eg. for profile creation) """

import os
import signal
import asyncio

from abc import ABC, abstractmethod


# =============================================================================
class ProfileJob(ABC):
    """ Browser run job """

    job_id = None

    def __init__(self):
        super().__init__()

        self.loop = asyncio.get_event_loop()

        params = {
            "storage_name": os.environ.get("STORAGE_NAME"),
            "storage_path": os.environ.get("STORE_PATH") or "",
            "url": os.environ.get("START_URL"),
            "profile_filename": os.environ.get("PROFILE_PATH") or "",
        }

        self.idle_timeout = int(os.environ["IDLE_TIMEOUT"])

        self.loop.add_signal_handler(signal.SIGUSR1, self.ping_handler)
        self.loop.add_signal_handler(signal.SIGALRM, self.timeout_handler)
        self.loop.add_signal_handler(signal.SIGTERM, self.exit_handler)

        self.loop.create_task(self.async_init("profilebrowser.yaml", params))

    async def async_init(self, template, params):
        """ async init, overridable by subclass """
        await self.init_job_objects(template, params)

    @abstractmethod
    async def init_job_objects(self, filename, params):
        """ base for creating objects """

    @abstractmethod
    async def delete_job_objects(self, job_id):
        """ base for deleting objects """

    def ping_handler(self, *_args):
        """ handle custom signal as ping, extend shutdown timer """

        print(f"signal received, extending timer {self.idle_timeout} secs", flush=True)

        signal.setitimer(signal.ITIMER_REAL, self.idle_timeout, 0)

    def timeout_handler(self):
        """ handle SIGTERM  """
        print("sigterm: shutting down browser...", flush=True)
        self._do_exit()

    def exit_handler(self):
        """ handle SIGALRM """
        print("sigalrm: timer expired ending idle browser...", flush=True)
        self._do_exit()

    def _do_exit(self):
        self.loop.create_task(self.delete_job_objects(f"browser={self.job_id}"))
