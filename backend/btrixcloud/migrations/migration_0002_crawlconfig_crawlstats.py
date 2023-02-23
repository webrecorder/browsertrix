"""
Migration 0002 - Dropping CrawlConfig crawl stats
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0002"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Drop crawl statistics fields from crawl_config collection documents
        as these are now generated dynamically from a join as needed in API
        endpoints.
        """
        crawl_configs = self.mdb["crawl_configs"]
        await crawl_configs.update_many({}, {"$unset": {"crawlCount": 1}})
        await crawl_configs.update_many({}, {"$unset": {"lastCrawlId": 1}})
        await crawl_configs.update_many({}, {"$unset": {"lastCrawlTime": 1}})
        await crawl_configs.update_many({}, {"$unset": {"lastCrawlState": 1}})
