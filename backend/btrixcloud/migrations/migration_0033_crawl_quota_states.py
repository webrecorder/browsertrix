"""
Migration 0033 - Standardizing quota-based crawl states
"""

import structlog

from btrixcloud.migrations import BaseMigration

logger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0033"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Migrate skipped_quota_reached state to skipped_storage_quota_reached
        Migrate stopped_quota_reached to stopped_time_quota_reached
        Also update lastCrawlStates in workflows with these states
        """
        crawls_db = self.mdb["crawls"]
        crawl_configs_db = self.mdb["crawl_configs"]

        ## CRAWLS ##

        try:
            res = await crawls_db.update_many(
                {"type": "crawl", "state": "skipped_quota_reached"},
                {"$set": {"state": "skipped_storage_quota_reached"}},
            )
            updated = res.modified_count
            logger.info(
                "skipped_quota_reached_crawls_migrated",
                updated=updated,
                unstructured_message=f"{updated} crawls with state skipped_quota_reached migrated",
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "error_migrating_skipped_quota_reached_crawls",
                unstructured_message="Error migrating crawls with state skipped_quota_reached",
            )

        try:
            res = await crawls_db.update_many(
                {"type": "crawl", "state": "stopped_quota_reached"},
                {"$set": {"state": "stopped_time_quota_reached"}},
            )
            updated = res.modified_count
            logger.info(
                "stopped_quota_reached_crawls_migrated",
                updated=updated,
                unstructured_message=f"{updated} crawls with state stopped_quota_reached migrated",
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "error_migrating_stopped_quota_reached_crawls",
                unstructured_message="Error migrating crawls with state stopped_quota_reached",
            )

        ## WORKFLOWS ##

        try:
            res = await crawl_configs_db.update_many(
                {"lastCrawlState": "skipped_quota_reached"},
                {"$set": {"lastCrawlState": "skipped_storage_quota_reached"}},
            )
            updated = res.modified_count
            logger.info(
                "skipped_quota_reached_workflows_migrated",
                updated=updated,
                unstructured_message=(
                    f"{updated} crawl configs with lastCrawlState skipped_quota_reached migrated"
                ),
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "error_migrating_skipped_quota_reached_workflows",
                unstructured_message=(
                    "Error migrating crawlconfigs with lastCrawlState skipped_quota_reached"
                ),
            )

        try:
            res = await crawl_configs_db.update_many(
                {"lastCrawlState": "stopped_quota_reached"},
                {"$set": {"lastCrawlState": "stopped_time_quota_reached"}},
            )
            updated = res.modified_count
            logger.info(
                "stopped_quota_reached_workflows_migrated",
                updated=updated,
                unstructured_message=(
                    f"{updated} crawl configs with lastCrawlState stopped_quota_reached migrated"
                ),
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "error_migrating_stopped_quota_reached_workflows",
                unstructured_message=(
                    "Error migrating crawl configs with lastCrawlState stopped_quota_reached"
                ),
            )
