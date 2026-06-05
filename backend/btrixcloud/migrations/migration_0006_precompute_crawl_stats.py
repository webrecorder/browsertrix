"""
Migration 0006 - Precomputing workflow crawl stats
"""

import logging

from btrixcloud.crawlconfigs import stats_recompute_all
from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)


MIGRATION_VERSION = "0006"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.crawl_config_ops = kwargs.get("crawl_config_ops")

    async def migrate_up(self):
        """Perform migration up.

        Add data on workflow crawl statistics that was previously dynamically
        computed when needed to the database.
        """
        # pylint: disable=duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawls = self.mdb["crawls"]

        if self.crawl_config_ops is None:
            logger.warning(
                "migration_missing_dependency",
                migration_version=MIGRATION_VERSION,
                dependency="crawl_config_ops",
                # pylint: disable=line-too-long
                unstructured_message=f"Unable to run migration {MIGRATION_VERSION}, missing crawl_config_ops",
            )
            return

        async for config in crawl_configs.find({"inactive": {"$ne": True}}):
            config_id = config["_id"]
            try:
                await stats_recompute_all(
                    self.crawl_config_ops, crawl_configs, crawls, config_id
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "migration_workflow_update_error",
                    config_id=config_id,
                    unstructured_message=f"Unable to update workflow {config_id}",
                )
