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

        try:
            res = await crawls_db.update_many(
                {"files.crc32": {"$exists": 1}},
                {"$unset": {"files.$[].crc32": 1}},
            )
            updated = res.modified_count
            print(f"{updated} crawls migrated to remove crc32 from files", flush=True)
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error migrating crawl files to remove crc32: {err}",
                flush=True,
            )
