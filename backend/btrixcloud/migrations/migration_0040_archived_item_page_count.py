"""
Migration 0040 -- archived item pageCount
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0040"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.page_ops = kwargs.get("page_ops")

    async def migrate_up(self):
        """Perform migration up.

        Calculate and store pageCount for archived items that don't have it yet
        """
        crawls_mdb = self.mdb["crawls"]

        if self.page_ops is None:
            logger.warning(
                "archived_item_page_count_missing_page_ops",
                unstructured_message="Unable to set pageCount for archived items, missing page_ops",
            )
            return

        async for crawl_raw in crawls_mdb.find({}):
            crawl_id = crawl_raw["_id"]
            try:
                await self.page_ops.set_archived_item_page_counts(crawl_id)
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "archived_item_page_count_save_error",
                    crawl_id=crawl_id,
                    unstructured_message=f"Error saving page counts for archived item {crawl_id}",
                )
