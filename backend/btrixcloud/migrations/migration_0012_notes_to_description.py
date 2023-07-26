"""
Migration 0012 - Notes to description
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0012"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Rename crawl notes field to description.
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        try:
            await crawls.update_many({}, {"$rename": {"notes": "description"}})
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(f"Error renaming crawl notes to description: {err}", flush=True)
