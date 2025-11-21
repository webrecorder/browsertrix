"""
Migration 0054 -- clear proxyId on workflows that have profile set
using proxyId from profile always
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0054"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Unset proxyId on workflows that have a profileid set
        """
        crawl_configs = self.mdb["crawl_configs"]

        # Set non-public collections to private
        try:
            await crawl_configs.update_many(
                {"profileid": {"$ne": None}, "proxyId": {"$ne": None}},
                {"$set": {"proxyId": None}},
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error update crawl_configs: {err}",
                flush=True,
            )
