"""
Migration 0016 - Updating scheduled cron jobs after Operator changes v2
"""

import logging
import os

from btrixcloud.crawlmanager import CrawlManager
from btrixcloud.migrations import BaseMigration
from btrixcloud.models import CrawlConfig

logger = logging.getLogger(__name__)


MIGRATION_VERSION = "0016"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Find existing workflows with schedule and create new crawl_cron_jobs
        from template, back in crawlers workspace and using noop image
        """
        # pylint: disable=too-many-locals, duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawl_manager = CrawlManager()

        # Update configmap for crawl configs that have non-zero timeout or scale > 1
        match_query = {"schedule": {"$nin": ["", None]}}
        async for config_dict in crawl_configs.find(match_query):
            config = CrawlConfig.from_dict(config_dict)
            logger.info(
                "crawl_config_cronjob_updating",
                config_id=config.id,
                schedule=config.schedule,
                unstructured_message=(
                    f"Updating CronJob for Crawl Config {config.id}: schedule: {config.schedule}"
                ),
            )
            try:
                await crawl_manager.update_scheduled_job(config)
            # pylint: disable=broad-except
            except Exception as exc:
                logger.warning(
                    "migration_crawl_config_skip",
                    exc_info=True,
                    unstructured_message=(
                        f"Skip crawl config migration due to error, likely missing config {exc}"
                    ),
                )

        # Delete existing scheduled jobs from default namespace
        default_namespace = os.environ.get("DEFAULT_NAMESPACE", "default")

        logger.info(
            "migration_deleting_cronjobs",
            namespace=default_namespace,
            unstructured_message="Deleting cronjobs from default namespace",
        )

        await crawl_manager.batch_api.delete_collection_namespaced_cron_job(
            namespace=default_namespace, label_selector="btrix.crawlconfig"
        )
        result = await crawl_manager.batch_api.list_namespaced_cron_job(
            namespace=default_namespace, label_selector="btrix.crawlconfig"
        )
        assert len(result.items) == 0
