"""
Migration 0010 - Precomputing collection total size
"""
from btrixcloud.colls import update_collection_counts_and_tags
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0010"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Recompute collection data to include totalSize.
        """
        # pylint: disable=duplicate-code
        colls = self.mdb["collections"]
        crawls = self.mdb["crawls"]

        colls_to_update = [res async for res in colls.find({})]
        if not colls_to_update:
            return

        for coll in colls_to_update:
            coll_id = coll["_id"]
            try:
                await update_collection_counts_and_tags(colls, crawls, coll_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update collection {coll_id}: {err}", flush=True)
