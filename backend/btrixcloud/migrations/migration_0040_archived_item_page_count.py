"""
Migration 0040 -- archived item pageCount
"""

from btrixcloud.migrations import BaseMigration


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
            print(
                "Unable to set pageCount for archived items, missing page_ops",
                flush=True,
            )
            return

        async for crawl_raw in crawls_mdb.find({}):
            crawl_id = crawl_raw["_id"]
            try:
                await self.page_ops.set_archived_item_page_counts(crawl_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error saving page counts for archived item {crawl_id}: {err}",
                    flush=True,
                )
