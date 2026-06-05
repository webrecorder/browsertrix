"""
Migration 0038 - Organization lastCrawlFinished field
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)

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
            logger.warning(
                "missing_org_ops_for_last_crawl_finished",
                unstructured_message="Unable to set lastCrawlFinished for orgs, missing org_ops",
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
            except Exception:
                logger.exception(
                    "error_setting_last_crawl_finished",
                    oid=oid,
                    unstructured_message=f"Error setting lastCrawlFinished for org {oid}",
                )
