"""
Migration 0045 - Recalculate crawl filePageCount and errorPageCount
"""

from btrixcloud.migrations import BaseMigration


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

        Recalculate collection stats to get top host names
        """
        crawls_mdb = self.mdb["crawls"]

        if self.page_ops is None:
            print(
                "Unable to reset crawl page counts, missing page_ops",
                flush=True,
            )
            return

        # Reset filePageCount and errorPageCount to 0 for all crawls
        await crawls_mdb.update_many(
            {},
            {
                "$set": {
                    "filePageCount": 0,
                    "errorPageCount": 0,
                }
            },
        )

        # Recalculate filePageCount and errorPageCount for every crawl
        async for crawl_raw in crawls_mdb.find({}):
            crawl_id = crawl_raw["_id"]
            try:
                await self.page_ops.update_crawl_file_and_error_counts(crawl_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to update page counts for crawl {crawl_id}: {err}",
                    flush=True,
                )
