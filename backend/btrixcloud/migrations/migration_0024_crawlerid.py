"""
Migration 0024 -- crawlerId
"""
from btrixcloud.crawlmanager import CrawlManager
from btrixcloud.migrations import BaseMigration
from btrixcloud.models import CrawlConfig, UpdateCrawlConfig


MIGRATION_VERSION = "0024"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Add crawlerId to existing workflows and profiles, and update configmaps
        """
        # pylint: disable=duplicate-code
        mdb_crawl_configs = self.mdb["crawl_configs"]
        mdb_profiles = self.mdb["profiles"]

        async for config in mdb_crawl_configs.find({"crawlerId": {"$in": ["", None]}}):
            config_id = config["_id"]
            try:
                await mdb_crawl_configs.find_one_and_update(
                    {"_id": config_id},
                    {"$set": {"crawlerId": "latest"}},
                )
            # pylint: disable=broad-except
            except Exception as err:
                print(
                    f"Error adding crawlerId 'latest' to workflow {config_id}: {err}",
                    flush=True,
                )

        async for profile in mdb_profiles.find({"crawlerId": {"$in": ["", None]}}):
            profile_id = profile["_id"]
            try:
                await mdb_profiles.find_one_and_update(
                    {"_id": profile_id},
                    {"$set": {"crawlerId": "latest"}},
                )
            # pylint: disable=broad-except
            except Exception as err:
                print(
                    f"Error adding crawlerId 'latest' to profile {profile_id}: {err}",
                    flush=True,
                )

        # Update configmaps
        crawl_manager = CrawlManager()
        match_query = {"crawlerId": {"$in": ["", None]}}
        async for config_dict in mdb_crawl_configs.find(match_query):
            config = CrawlConfig.from_dict(config_dict)
            try:
                await crawl_manager.update_crawl_config(
                    config, UpdateCrawlConfig(crawlerId="latest")
                )
            # pylint: disable=broad-except
            except Exception as exc:
                print(
                    "Skip configmap migration due to error, likely missing config",
                    exc,
                )
