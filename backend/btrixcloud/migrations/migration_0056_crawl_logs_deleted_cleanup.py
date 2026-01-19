"""
Migration 0056 - Remove logs for deleted crawls
"""

from motor.motor_asyncio import AsyncIOMotorDatabase

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0056"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb: AsyncIOMotorDatabase, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Delete crawl logs from database for crawls and orgs that
        have since been deleted.
        """
        # pylint: disable=duplicate-code
        crawl_logs_mdb = self.mdb["crawl_logs"]
        crawls_mdb = self.mdb["crawls"]

        crawl_logs_to_delete: list[str] = []

        log_crawl_ids = await crawl_logs_mdb.distinct("crawlId", {})

        crawl_count = len(log_crawl_ids)
        index = 0

        for crawl_id in log_crawl_ids:
            index += 1
            res = await crawls_mdb.find({"_id": crawl_id})
            if res is None:
                crawl_logs_to_delete.append(crawl_id)

            if index % 100 == 0:
                print(
                    f"Checked {index} of {crawl_count} crawls for logs to delete",
                    flush=True,
                )

        if crawl_logs_to_delete:
            del_count = len(crawl_logs_to_delete)
            print(
                f"Checked {index} crawls, deleting logs for {del_count} deleted crawls",
                flush=True,
            )

            try:
                await crawl_logs_mdb.delete_many(
                    {"crawlId": {"$in": crawl_logs_to_delete}}
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error deleting crawl logs from deleted crawls: {err}", flush=True
                )
