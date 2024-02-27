"""
Migration 0026 -- Crawl Pages
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import gather_tasks_with_concurrency


MIGRATION_VERSION = "0026"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)
        self.page_ops = kwargs["page_ops"]

    async def migrate_up(self):
        """Perform migration up.

        Add pages to database for each crawl without them, pulling from WACZ files.
        """
        # pylint: disable=duplicate-code
        crawls_mdb = self.mdb["crawls"]
        pages_mdb = self.mdb["pages"]

        crawl_ids = await crawls_mdb.distinct(
            "_id", {"type": "crawl", "finished": {"$ne": None}}
        )
        crawl_ids_with_pages = await pages_mdb.distinct("crawl_id")

        crawl_ids_no_pages = list(set(crawl_ids) - set(crawl_ids_with_pages))
        if not crawl_ids_no_pages:
            return

        all_coroutines = []

        for crawl_id in crawl_ids_no_pages:
            current_coroutine = self.page_ops.add_crawl_pages_to_db_from_wacz(crawl_id)
            all_coroutines.append(current_coroutine)

        try:
            await gather_tasks_with_concurrency(*all_coroutines)
        # pylint: disable=broad-exception-caught, raise-missing-from
        except Exception as err:
            print(f"Error adding pages to db: {err}", flush=True)
