"""
Migration 0007 - Workflows changes

- Rename colls to autoAddCollections
- Re-calculate workflow crawl stats to populate crawlSuccessfulCount
"""

import structlog

from btrixcloud.crawlconfigs import stats_recompute_all
from btrixcloud.migrations import BaseMigration

logger = structlog.get_logger(__name__)


MIGRATION_VERSION = "0007"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.crawl_config_ops = kwargs.get("crawl_config_ops")

    async def migrate_up(self):
        """Perform migration up."""
        # pylint: disable=duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawls = self.mdb["crawls"]

        if self.crawl_config_ops is None:
            logger.warning(
                "migration_missing_dependency",
                migration_version=MIGRATION_VERSION,
                dependency="crawl_config_ops",
                unstructured_message=(
                    f"Unable to run migration {MIGRATION_VERSION}, missing crawl_config_ops"
                ),
            )
            return

        # Update workflows crawl stats to populate crawlSuccessfulCount
        async for config in crawl_configs.find({"inactive": {"$ne": True}}):
            config_id = config["_id"]
            try:
                await stats_recompute_all(
                    self.crawl_config_ops, crawl_configs, crawls, config_id
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.warning(
                    "migration_workflow_update_warning",
                    config_id=config_id,
                    exc_info=True,
                    unstructured_message=f"Unable to update workflow {config_id}",
                )

        # Make sure crawls have collections array
        await crawls.update_many({"collections": None}, {"$set": {"collections": []}})

        # Rename colls to autoAddCollections
        await crawl_configs.update_many({}, {"$unset": {"autoAddCollections": 1}})
        await crawl_configs.update_many(
            {}, {"$rename": {"colls": "autoAddCollections"}}
        )
        await crawl_configs.update_many({}, {"$unset": {"colls": 1}})
