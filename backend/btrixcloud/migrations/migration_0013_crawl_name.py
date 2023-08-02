"""
Migration 0013 - Copy config name to crawls
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0013"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Copy crawl config names to associated crawls.
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        crawl_configs = self.mdb["crawl_configs"]

        configs = [res async for res in crawl_configs.find({"inactive": {"$ne": True}})]
        if not configs:
            return

        for config in configs:
            config_id = config["_id"]
            try:
                if not config.get("name"):
                    continue
                await crawls.update_many(
                    {"cid": config_id}, {"$set": {"name": config.get("name")}}
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to set name for crawls from with config {config_id}: {err}",
                    flush=True,
                )
