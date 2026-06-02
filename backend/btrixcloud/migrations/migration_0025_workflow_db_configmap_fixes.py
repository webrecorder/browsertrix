"""
Migration 0025 -- fix workflow database and configmap issues.
"""

from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0025"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Set crawlTimeout to 0 in any workflows where it is not set, and
        update configmap for each workflow to include crawlerChannel.
        """
        mdb_crawl_configs = self.mdb["crawl_configs"]
        try:
            await mdb_crawl_configs.update_many(
                {"crawlTimeout": None},
                {"$set": {"crawlTimeout": 0}},
            )
        # pylint: disable=broad-except
        except Exception:
            print(
                "Error updating null crawlconfig crawlTimeouts to 0",
                flush=True,
            )
