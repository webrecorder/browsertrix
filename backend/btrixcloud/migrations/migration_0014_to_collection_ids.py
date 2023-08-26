"""
Migration 0014 - collections to collectionIDs
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0014"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Rename crawl 'collections' field to 'collectionIds'
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        try:
            await crawls.update_many({}, {"$rename": {"collections": "collectionIds"}})
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error renaming crawl 'collections' to 'collectionIds': {err}",
                flush=True,
            )
