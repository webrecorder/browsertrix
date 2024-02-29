""" Base Operator class for all operators """

import asyncio
from typing import TYPE_CHECKING

import yaml
from btrixcloud.k8sapi import K8sAPI


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


# pylint: disable=too-many-instance-attributes, too-many-arguments
# ============================================================================
class BaseOperator(K8sAPI):
    """BaseOperator"""

    crawl_config_ops: CrawlConfigOps
    crawl_ops: CrawlOps
    orgs_ops: OrgOps
    coll_ops: CollectionOps
    storage_ops: StorageOps
    event_webhook_ops: EventWebhookOps
    background_job_ops: BackgroundJobOps
    user_ops: UserManager
    page_ops: PageOps

    def __init__(
        self,
        crawl_config_ops,
        crawl_ops,
        org_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
        page_ops,
    ):
        super().__init__()

        self.crawl_config_ops = crawl_config_ops
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.coll_ops = coll_ops
        self.storage_ops = storage_ops
        self.background_job_ops = background_job_ops
        self.event_webhook_ops = event_webhook_ops
        self.page_ops = page_ops

        self.user_ops = crawl_config_ops.user_manager

        self.config_file = "/config/config.yaml"
        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

        # to avoid background tasks being garbage collected
        # see: https://stackoverflow.com/a/74059981
        self.bg_tasks = set()

    def init_routes(self, app):
        """ init routes for this operator """

    async def async_init(self):
        """ perform any async init necessary """

    def run_task(self, func):
        """add bg tasks to set to avoid premature garbage collection"""
        task = asyncio.create_task(func)
        self.bg_tasks.add(task)
        task.add_done_callback(self.bg_tasks.discard)

    def load_from_yaml(self, filename, params):
        """load and parse k8s template from yaml file"""
        return list(
            yaml.safe_load_all(self.templates.env.get_template(filename).render(params))
        )
