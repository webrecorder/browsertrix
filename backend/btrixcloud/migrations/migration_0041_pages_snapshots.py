"""
Migration 0041 - Rationalize page counts
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0041"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.coll_ops = kwargs.get("coll_ops")

    async def migrate_up(self):
        """Perform migration up.

        Recalculate collections to get new page and unique page counts
        """
        colls_mdb = self.mdb["collections"]

        if self.coll_ops is None:
            logger.warning(
                "collection_page_counts_missing_coll_ops",
                unstructured_message="Unable to set collection page counts, missing coll_ops",
            )
            return

        async for coll in colls_mdb.find({}):
            coll_id = coll["_id"]
            try:
                await self.coll_ops.update_collection_stats(coll_id, coll["oid"])
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "collection_page_counts_update_error",
                    coll_id=coll_id,
                    unstructured_message=f"Unable to update page counts for collection {coll_id}",
                )
