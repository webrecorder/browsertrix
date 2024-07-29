"""
Migration 0034 -- remove crc32 from CrawlFile
"""

from btrixcloud.migrations import BaseMigration


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

        await crawls_db.update_many(
            {"files": {"$ne": []}}, {"$unset": {"files.$[].crc32": 1}}
        )
