"""
Migration 0009 - Crawl types
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0009"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Add type "crawl" to all existing crawls that don't already have a type
        """
        crawls = self.mdb["crawls"]
        try:
            await crawls.update_many(
                {"type": {"$eq": None}}, {"$set": {"type": "crawl"}}
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(f"Error adding type 'crawl' to existing crawls: {err}", flush=True)
