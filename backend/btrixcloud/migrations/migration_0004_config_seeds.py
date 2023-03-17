"""
Migration 0002 - Ensuring all config.seeds are Seeds not HttpUrls
"""
from pydantic import HttpUrl

from btrixcloud.crawlconfigs import Seed
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0004"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Convert any crawlconfig.config.seed HttpUrl values to Seeds with url value.
        """
        crawl_configs = self.mdb["crawl_configs"]
        crawl_config_results = [res async for res in crawl_configs.find({})]
        for config_dict in crawl_config_results:
            migrated_seeds = []
            for seed in config_dict["config"]["seeds"]:
                if isinstance(seed, HttpUrl):
                    new_seed = Seed(url=seed)
                    migrated_seeds.append(new_seed)
                elif isinstance(seed, Seed):
                    migrated_seeds.append(seed)

            await crawl_configs.find_one_and_update(
                {"_id": config_dict["_id"]},
                {"$set": {"config.seeds": migrated_seeds}},
            )

        # Test migration
        crawl_config_results = [res async for res in crawl_configs.find({})]
        for config_dict in crawl_config_results:
            for seed in config_dict["config"]["seeds"]:
                assert isinstance(seed, Seed)
