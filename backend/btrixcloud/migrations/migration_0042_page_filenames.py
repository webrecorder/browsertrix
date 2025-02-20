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

        self.background_job_ops = kwargs.get("background_job_ops")

    async def migrate_up(self):
        """Perform migration up.

        Optimize crawl pages for optimized replay in background job by adding
        filename, isSeed, depth, and favIconUrl as needed.
        """
        if self.background_job_ops is None:
            print(
                "Unable to start background job to optimize pages, ops class missing",
                flush=True,
            )
            return

        try:
            await self.background_job_ops.create_optimize_crawl_pages_job()
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Unable to start background job to optimize pages: {err}",
                flush=True,
            )
