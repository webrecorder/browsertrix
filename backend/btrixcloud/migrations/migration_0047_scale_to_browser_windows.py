"""
Migration 0047 - Convert scale to browserWindows
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import browser_windows_from_pod_count


MIGRATION_VERSION = "0047"


# pylint: disable=duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Calculate and store browserWindows from existing scale on workflows and crawls
        """
        configs_mdb = self.mdb["crawl_configs"]
        crawls_mdb = self.mdb["crawls"]

        async for config_raw in configs_mdb.find({"browserWindows": None}):
            config_id = config_raw["_id"]
            scale = config_raw.get("scale", 1)

            try:
                await configs_mdb.find_one_and_update(
                    {"_id": config_id},
                    {
                        "$set": {
                            "browserWindows": browser_windows_from_pod_count(scale)
                        },
                        # "$unset": {"scale": 1}
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to set browser windows from scale for workflow {config_id}: {err}",
                    flush=True,
                )

        async for crawl_raw in crawls_mdb.find({"browserWindows": None}):
            crawl_id = crawl_raw["_id"]
            scale = crawl_raw.get("scale", 1)

            try:
                await crawls_mdb.find_one_and_update(
                    {"_id": crawl_id},
                    {
                        "$set": {
                            "browserWindows": browser_windows_from_pod_count(scale)
                        },
                        # "$unset": {"scale": 1}
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to set browser windows from scale for crawl {crawl_id}: {err}",
                    flush=True,
                )
