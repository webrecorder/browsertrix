"""
Migration 0051 - Ensure failOnContentCheck is not set for workflows without profiles
"""

from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0051"


# pylint: disable=duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self) -> None:
        """Perform migration up.

        Unset failOnContentCheck for workflows that don't have a profile set
        """
        crawl_configs_mdb = self.mdb["crawl_configs"]

        try:
            await crawl_configs_mdb.update_many(
                {"profileid": None, "config.failOnContentCheck": True},
                {"$set": {"config.failOnContentCheck": False}},
            )

        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error unsetting failOnContentCheck for configs without profiles: {err}",
                flush=True,
            )
