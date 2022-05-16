""" entry point for K8s crawl job which manages the stateful crawl """

import asyncio
import os
import signal

from .base_job import K8SBaseJob


# =============================================================================
# pylint: disable=too-many-instance-attributes,bare-except,broad-except
class K8SBrowserJob(K8SBaseJob):
    """ Browser run job """

    def __init__(self, loop):
        super().__init__()

        params = {
            "storage_name": os.environ.get("STORAGE_NAME"),
            "storage_path": os.environ.get("STORAGE_PATH") or "",
            "url": os.environ.get("START_URL"),
            "profile_filename": os.environ.get("PROFILE_PATH") or "",
        }

        self.idle_timeout = int(os.environ["IDLE_TIMEOUT"])

        loop.add_signal_handler(signal.SIGUSR1, self.ping_handler)
        loop.add_signal_handler(signal.SIGALRM, self.exit_handler)
        loop.add_signal_handler(signal.SIGTERM, self.exit_handler)

        self.loop = loop
        loop.create_task(self.async_init("profilebrowser.yaml", params))

    def ping_handler(self, *_args):
        """ handle custom signal as ping, extend shutdown timer """

        print(f"signal received, extending timer {self.idle_timeout} secs", flush=True)

        signal.setitimer(signal.ITIMER_REAL, self.idle_timeout, 0)

    def exit_handler(self, *_args):
        """ handle SIGTERM or SIGALRM on time expiry """

        print("timer expired, ending idle browser...", flush=True)

        self.loop.create_task(self.delete_k8s_objects(f"browser={self.job_id}"))


if __name__ == "__main__":
    main_loop = asyncio.get_event_loop()
    K8SBrowserJob(main_loop)
    main_loop.run_forever()
