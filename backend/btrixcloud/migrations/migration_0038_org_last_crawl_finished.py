"""
Migration 0038 - Organization lastCrawlFinished field
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0038"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.org_ops = kwargs.get("org_ops")

    async def migrate_up(self):
        """Perform migration up. Set lastCrawlFinished for each org."""
        # pylint: disable=duplicate-code, line-too-long
        if self.org_ops is None:
            print(
                "Unable to set lastCrawlFinished for orgs, missing org_ops", flush=True
            )
            return

        orgs_db = self.mdb["organizations"]
        async for org_dict in orgs_db.find({}):
            oid = org_dict.get("_id")

            if org_dict.get("lastCrawlFinished"):
                continue

            try:
                await self.org_ops.set_last_crawl_finished(oid)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error setting lastCrawlFinished for org {oid}: {err}",
                    flush=True,
                )
