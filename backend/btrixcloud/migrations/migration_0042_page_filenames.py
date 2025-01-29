"""
Migration 0042 - Add filename to pages
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0042"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.page_ops = kwargs.get("page_ops")

    async def migrate_up(self):
        """Perform migration up.

        Add filename to all pages that don't currently have it stored,
        iterating through each archived item and its WACZ files as necessary
        """
        pages_mdb = self.mdb["pages"]

        crawl_ids_to_update = set()

        if self.page_ops is None:
            print(
                "Unable to add filename to pages, missing page_ops",
                flush=True,
            )
            return

        async for page_raw in pages_mdb.find({"filename": None}):
            crawl_id = page_raw.get("crawl_id")
            if crawl_id:
                crawl_ids_to_update.add(crawl_id)

        for crawl_id in crawl_ids_to_update:
            try:
                await self.page_ops.add_crawl_wacz_filename_to_pages(crawl_id)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error adding filename to pages in item {crawl_id}: {err}",
                    flush=True,
                )
