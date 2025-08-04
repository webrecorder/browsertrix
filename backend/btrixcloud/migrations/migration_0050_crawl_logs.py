"""
Migration 0050 - Move crawl logs to seperate mongo collection
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0050"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.crawl_log_ops = kwargs.get("crawl_log_ops")

    async def migrate_up(self):
        """Perform migration up. Move crawl logs to separate mongo collection."""
        # pylint: disable=duplicate-code, line-too-long
        if self.crawl_log_ops is None:
            print("Unable to move logs, missing ops", flush=True)
            return

        crawls_mdb = self.mdb["crawls"]

        # TODO: Also migrate qaFinished errors?

        match_query = {
            "type": "crawl",
            "$or": [{"errors": {"$ne": None}}, {"behaviorLogs": {"$ne": None}}],
        }

        async for crawl_dict in crawls_mdb.find(match_query):
            crawl_id = crawl_dict["_id"]
            error_logs = crawl_dict.get("errors", [])
            behavior_logs = crawl_dict.get("behaviorLogs", [])

            try:
                while error_logs:
                    error_log = error_logs.pop(0)
                    await self.crawl_log_ops.add_log_line(
                        crawl_id=crawl_id,
                        oid=crawl_dict["oid"],
                        is_qa=False,
                        log_line=error_log,
                        qa_run_id=None,
                    )

                while behavior_logs:
                    behavior_log = behavior_logs.pop(0)
                    await self.crawl_log_ops.add_log_line(
                        crawl_id=crawl_id,
                        oid=crawl_dict["oid"],
                        is_qa=False,
                        log_line=behavior_log,
                        qa_run_id=None,
                    )

                await crawls_mdb.find_one_and_update(
                    {"_id": crawl_id},
                    {
                        "$set": {
                            "errors": None,
                            "behaviorLogs": None,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error moving logs for crawl {crawl_id}: {err}",
                    flush=True,
                )
