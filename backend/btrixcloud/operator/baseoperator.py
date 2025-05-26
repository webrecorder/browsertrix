"""Base Operator class for all operators"""

import asyncio
import os
from typing import TYPE_CHECKING, Any
from kubernetes.utils import parse_quantity

import yaml
from btrixcloud.k8sapi import K8sAPI
from btrixcloud.utils import is_bool


if TYPE_CHECKING:
    from btrixcloud.crawlconfigs import CrawlConfigOps
    from btrixcloud.crawls import CrawlOps
    from btrixcloud.orgs import OrgOps
    from btrixcloud.colls import CollectionOps
    from btrixcloud.storages import StorageOps
    from btrixcloud.webhooks import EventWebhookOps
    from btrixcloud.users import UserManager
    from btrixcloud.background_jobs import BackgroundJobOps
    from btrixcloud.pages import PageOps
    from redis.asyncio.client import Redis
else:
    CrawlConfigOps = CrawlOps = OrgOps = CollectionOps = Redis = object
    StorageOps = EventWebhookOps = UserManager = BackgroundJobOps = PageOps = object


# ============================================================================
class K8sOpAPI(K8sAPI):
    """Additional k8s api for operators"""

    has_pod_metrics: bool
    enable_auto_resize: bool
    max_crawler_memory_size: int

    def __init__(self):
        super().__init__()
        self.config_file = "/config/config.yaml"
        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

        self.has_pod_metrics = False
        self.enable_auto_resize = False
        self.max_crawler_memory_size = 0

        self.compute_crawler_resources()
        self.compute_profile_resources()

    def compute_crawler_resources(self) -> None:
        """compute memory / cpu resources for crawlers"""
        p = self.shared_params
        num_workers = max(int(p["crawler_browser_instances"]), 1)
        try:
            qa_num_workers = max(int(p["qa_browser_instances"]), 1)
        # pylint: disable=bare-except
        except:
            # default to 1 for now for best results (to revisit in the future)
            qa_num_workers = 1

        crawler_memory, crawler_cpu = self.compute_for_num_browsers(num_workers)
        qa_memory, qa_cpu = self.compute_for_num_browsers(qa_num_workers)

        print("crawler resources")
        print(f"cpu = {crawler_cpu} qa: {qa_cpu}")
        print(f"memory = {crawler_memory} qa: {qa_memory}")

        max_crawler_memory_size = 0
        max_crawler_memory = os.environ.get("MAX_CRAWLER_MEMORY")
        if max_crawler_memory:
            max_crawler_memory_size = int(parse_quantity(max_crawler_memory))

        self.max_crawler_memory_size = max_crawler_memory_size or crawler_memory

        print(f"max crawler memory size: {self.max_crawler_memory_size}")

        p["crawler_cpu"] = crawler_cpu
        p["crawler_memory"] = crawler_memory
        p["crawler_workers"] = num_workers
        p["qa_cpu"] = qa_cpu
        p["qa_memory"] = qa_memory
        p["qa_workers"] = qa_num_workers

    def compute_for_num_browsers(self, num_browsers) -> tuple[int, float]:
        """compute memory, cpu for given num of browsers"""
        p = self.shared_params

        if not p.get("crawler_memory"):
            base = parse_quantity(p["crawler_memory_base"])
            extra = parse_quantity(p["crawler_extra_memory_per_browser"])

            # memory is always an int
            crawler_memory = int(base + (num_browsers - 1) * extra)
        else:
            crawler_memory = int(parse_quantity(p["crawler_memory"]))

        if not p.get("crawler_cpu"):
            base = parse_quantity(p["crawler_cpu_base"])
            extra = parse_quantity(p["crawler_extra_cpu_per_browser"])

            # cpu is a floating value of cpu cores
            crawler_cpu = float(base + (num_browsers - 1) * extra)

        else:
            crawler_cpu = float(parse_quantity(p["crawler_cpu"]))

        return crawler_memory, crawler_cpu

    def compute_profile_resources(self) -> None:
        """compute memory /cpu resources for a single profile browser"""
        p = self.shared_params
        # if no profile specific options provided, default to crawler base for one browser
        profile_cpu = parse_quantity(
            p.get("profile_browser_cpu") or p["crawler_cpu_base"]
        )
        profile_memory = parse_quantity(
            p.get("profile_browser_memory") or p["crawler_memory_base"]
        )
        p["profile_cpu"] = profile_cpu
        p["profile_memory"] = profile_memory

        print("profile browser resources")
        print(f"cpu = {profile_cpu}")
        print(f"memory = {profile_memory}")

    async def async_init(self) -> None:
        """perform any async init here"""
        self.has_pod_metrics = await self.is_pod_metrics_available()
        print("Pod Metrics Available:", self.has_pod_metrics)

        self.enable_auto_resize = self.has_pod_metrics and is_bool(
            os.environ.get("ENABLE_AUTO_RESIZE_CRAWLERS")
        )
        print("Auto-Resize Enabled", self.enable_auto_resize)


# pylint: disable=too-many-instance-attributes, too-many-arguments
# ============================================================================
class BaseOperator:
    """BaseOperator"""

    k8s: K8sOpAPI
    crawl_config_ops: CrawlConfigOps
    crawl_ops: CrawlOps
    org_ops: OrgOps
    coll_ops: CollectionOps
    storage_ops: StorageOps
    background_job_ops: BackgroundJobOps
    event_webhook_ops: EventWebhookOps
    page_ops: PageOps
    user_ops: UserManager

    def __init__(
        self,
        k8s,
        crawl_config_ops,
        crawl_ops,
        org_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
        page_ops,
    ):
        self.k8s = k8s
        self.crawl_config_ops = crawl_config_ops
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.coll_ops = coll_ops
        self.storage_ops = storage_ops
        self.background_job_ops = background_job_ops
        self.event_webhook_ops = event_webhook_ops
        self.page_ops = page_ops
        self.user_ops = crawl_config_ops.user_manager

        # to avoid background tasks being garbage collected
        # see: https://stackoverflow.com/a/74059981
        self.bg_tasks = set()

    def init_routes(self, app) -> None:
        """init routes for this operator"""

    def run_task(self, func) -> None:
        """add bg tasks to set to avoid premature garbage collection"""
        task = asyncio.create_task(func)
        self.bg_tasks.add(task)
        task.add_done_callback(self.bg_tasks.discard)

    def load_from_yaml(self, filename, params) -> list[Any]:
        """load and parse k8s template from yaml file"""
        return list(
            yaml.safe_load_all(
                self.k8s.templates.env.get_template(filename).render(params)
            )
        )
