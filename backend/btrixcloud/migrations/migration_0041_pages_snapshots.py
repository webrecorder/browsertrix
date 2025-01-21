"""
Migration 0041 - Rationalize page and snapshot counts
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0041"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.coll_ops = kwargs.get("coll_ops")

    async def migrate_up(self):
        """Perform migration up.

        Recalculate collections to get new page and snapshot counts
        """
        colls_mdb = self.mdb["collections"]

        if self.coll_ops is None:
            print(
                "Unable to set collection page and snapshot counts, missing coll_ops",
                flush=True,
            )
            return

        async for coll in colls_mdb.collections.find({}):
            coll_id = coll["_id"]
            try:
                await self.coll_ops.update_collection_counts_and_tags(coll_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Unable to update collection {coll_id}: {err}", flush=True)
