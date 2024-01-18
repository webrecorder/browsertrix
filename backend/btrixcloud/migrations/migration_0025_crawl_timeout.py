"""
Migration 0025 -- workflow crawlTimeout to 0
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0025"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Set crawlTimeout to 0 in any workflows where it is not set
        """
        # pylint: disable=duplicate-code
        mdb_crawl_configs = self.mdb["crawl_configs"]
        try:
            await mdb_crawl_configs.update_many(
                {"crawlTimeout": None},
                {"$set": {"crawlTimeout": 0}},
            )
        except Exception as err:
            print(
                "Error updating null crawlconfig crawlTimeouts to 0",
                flush=True,
            )
