"""
Migration 0055 - Recompute workflow crawl stats
"""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from btrixcloud.crawlconfigs import stats_recompute_all
from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0055"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb: AsyncIOMotorDatabase, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.crawl_config_ops = kwargs.get("crawl_config_ops")

    async def migrate_up(self):
        """Perform migration up.

        Recompute crawl workflow stats to fix issue with failed crawls
        being added to successfulCrawlCount and workflow size totals.
        """
        # pylint: disable=duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawls = self.mdb["crawls"]

        if self.crawl_config_ops is None:
            logger.warning(
                "crawlconfig_stats_recompute_missing_ops",
                migration_version=MIGRATION_VERSION,
                # pylint: disable=line-too-long
                unstructured_message=f"Unable to set run migration {MIGRATION_VERSION}, missing crawl_config_ops",
            )
            return

        count = 0
        async for config in crawl_configs.find({"inactive": {"$ne": True}}):
            config_id = config["_id"]
            try:
                await stats_recompute_all(
                    self.crawl_config_ops, crawl_configs, crawls, config_id
                )
                count += 1
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.warning(
                    "workflow_stats_update_warning",
                    config_id=config_id,
                    exc_info=True,
                    unstructured_message=f"Unable to update workflow {config_id}",
                )

            if count % 100 == 0:
                logger.info(
                    "workflows_migrated_progress",
                    count=count,
                    unstructured_message=f"Migrated {count} workflows",
                )

        logger.info(
            "workflows_migrated_total",
            count=count,
            unstructured_message=f"Migrated {count} workflows total, done",
        )
