"""
Migration 0059 - Remove per-file tracking of file replicas in database
"""

import structlog

from btrixcloud.migrations import BaseMigration

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0059"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Remove replicas array from all crawl and profile files.
        """
        crawls_mdb = self.mdb["crawls"]
        profiles_mdb = self.mdb["profiles"]

        try:
            res = await crawls_mdb.update_many(
                {"files": {"$nin": [None, []]}},
                {"$unset": {"files.$[].replicas": 1}},
            )
            updated = res.modified_count
            logger.info("updated_crawl_files", count=updated)
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception("failed_to_update_crawl_files")

        try:
            res = await profiles_mdb.update_many(
                {"resource": {"$ne": None}},
                {"$unset": {"resource.replicas": 1}},
            )
            updated = res.modified_count
            logger.info("updated_profile_files", count=updated)
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception("failed_to_update_profile_files")
