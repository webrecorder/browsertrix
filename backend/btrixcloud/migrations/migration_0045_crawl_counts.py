"""
Migration 0045 - Recalculate crawl filePageCount and errorPageCount
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0045"


# pylint: disable=duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.page_ops = kwargs.get("page_ops")

    async def migrate_up(self):
        """Perform migration up.

        Recalculate crawl filePageCount and errorPageCount for all crawls
        """
        crawls_mdb = self.mdb["crawls"]

        if self.page_ops is None:
            logger.warning(
                "crawl_page_counts_missing_page_ops",
                unstructured_message="Unable to reset crawl page counts, missing page_ops",
            )
            return

        match_query = {
            "$or": [{"errorPageCount": {"$gt": 0}}, {"filePageCount": {"$gt": 0}}]
        }
        async for crawl_raw in crawls_mdb.find(match_query, projection=["_id"]):
            crawl_id = crawl_raw["_id"]

            try:
                # Reset filePageCount and errorPageCount to 0
                await crawls_mdb.find_one_and_update(
                    {"_id": crawl_id},
                    {
                        "$set": {
                            "filePageCount": 0,
                            "errorPageCount": 0,
                        }
                    },
                )

                # Re-increment filePageCount and errorPageCount
                await self.page_ops.update_crawl_file_and_error_counts(crawl_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                logger.warning(
                    "crawl_page_counts_update_error",
                    crawl_id=crawl_id,
                    error=err,
                    # pylint: disable=line-too-long
                    unstructured_message=f"Unable to update page counts for crawl {crawl_id}: {err}",
                )
