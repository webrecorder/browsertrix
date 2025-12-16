"""
Migration 0055 - Recompute workflow crawl stats
"""

from motor.motor_asyncio import AsyncIOMotorDatabase

from btrixcloud.crawlconfigs import stats_recompute_all
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0055"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb: AsyncIOMotorDatabase, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.crawl_config_ops = kwargs.get("crawl_config_ops")

    async def migrate_up(self):
        """Perform migration up.

        Recompute crawl workflow stats to fix issue with failed crawls
        being added to successfulCrawlCount and workflow size totals.
        """
        # pylint: disable=duplicate-code
        crawl_configs = self.mdb["crawl_configs"]
        crawls = self.mdb["crawls"]

        if self.crawl_config_ops is None:
            print(
                f"Unable to set run migration {MIGRATION_VERSION}, missing crawl_config_ops",
                flush=True,
            )
            return

        count = 0
        async for config in crawl_configs.find({"inactive": {"$ne": True}}):
            config_id = config["_id"]
            try:
                await stats_recompute_all(
                    self.crawl_config_ops, crawl_configs, crawls, config_id
                )
                count += 1
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update workflow {config_id}: {err}", flush=True)

            if count % 100 == 0:
                print(f"Migrated {count} workflows")

        print(f"Migrated {count} workflows total, done")
