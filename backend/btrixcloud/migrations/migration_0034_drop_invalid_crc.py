"""
Migration 0034 -- remove crc32 from CrawlFile
"""

import structlog

from btrixcloud.migrations import BaseMigration

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0034"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Remove crc32 field from all crawl files
        """
        crawls_db = self.mdb["crawls"]

        try:
            res = await crawls_db.update_many(
                {"files.crc32": {"$exists": 1}},
                {"$unset": {"files.$[].crc32": 1}},
            )
            updated = res.modified_count
            logger.info(
                "crawls_crc32_removed",
                updated=updated,
                unstructured_message=f"{updated} crawls migrated to remove crc32 from files",
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "error_migrating_crawl_files_remove_crc32",
                unstructured_message="Error migrating crawl files to remove crc32",
            )
