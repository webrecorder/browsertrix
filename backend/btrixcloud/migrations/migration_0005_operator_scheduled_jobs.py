"""
Migration 0005 - Updating scheduled cron jobs after Operator changes
"""
import os

from btrixcloud.crawlconfigs import CrawlConfig, UpdateCrawlConfig
from btrixcloud.crawlmanager import CrawlManager
from btrixcloud.k8sapi import K8sAPI
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0005"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Find existing workflows with schedule and create new crawl_cron_jobs
        from template for each, then delete existing scheduled jobs from
        crawler namespace.

        Additionally update the configmap for crawl configs with scale > 1
        or crawlTimeout > 0.
        """
        # pylint: disable=too-many-locals
        crawl_configs = self.mdb["crawl_configs"]
        crawl_manager = CrawlManager()

        # Update configmap for crawl configs that have non-zero timeout or scale > 1
        match_query = {"$or": [{"crawlTimeout": {"$gt": 0}}, {"scale": {"$gt": 1}}]}
        configs_to_update = [res async for res in crawl_configs.find(match_query)]
        for config_dict in configs_to_update:
            config = CrawlConfig.from_dict(config_dict)
            crawl_manager.update_crawl_config(
                config,
                UpdateCrawlConfig(scale=config.scale, crawlTimeout=config.crawlTimeout),
            )

        # Update scheduled jobs
        scheduled_workflows = [
            res async for res in crawl_configs.find({"schedule": {"$nin": ["", None]}})
        ]
        if not scheduled_workflows:
            return

        # Create new crawl cron jobs
        for config_dict in scheduled_workflows:
            cid = str(config_dict["_id"])
            cron_job_id = f"sched-{cid[:12]}"
            params = {
                "id": cron_job_id,
                "cid": cid,
                "image": crawl_manager.job_image,
                "image_pull_policy": crawl_manager.job_image_pull_policy,
                "schedule": config_dict["schedule"],
            }
            data = crawl_manager.templates.env.get_template(
                "crawl_cron_job.yaml"
            ).render(params)
            k8s_objects = await crawl_manager.create_from_yaml(
                data, crawl_manager.cron_namespace
            )
            assert len(k8s_objects) == 1

        # Delete existing scheduled jobs from crawler namespace
        k8s_api_instance = K8sAPI()
        crawler_namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        await k8s_api_instance.batch_api.delete_collection_namespaced_cron_job(
            namespace=crawler_namespace
        )
        result = await k8s_api_instance.batch_api.list_namespaced_cron_job(
            namespace=crawler_namespace
        )
        assert len(result.items) == 0
