"""
Migration 0006 - Precomputing workflow crawl stats
"""
from btrixcloud.crawlconfigs import update_config_crawl_stats
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0006"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Add data on workflow crawl statistics that was previously dynamically
        computed when needed to the database.
        """
        crawl_configs = self.mdb["crawl_configs"]
        crawls = self.mdb["crawls"]

        configs = [res async for res in crawl_configs.find({"inactive": {"$ne": True}})]
        if not configs:
            return

        for config in configs:
            config_id = config["_id"]
            try:
                await update_config_crawl_stats(crawl_configs, crawls, config_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update workflow {config_id}: {err}", flush=True)
