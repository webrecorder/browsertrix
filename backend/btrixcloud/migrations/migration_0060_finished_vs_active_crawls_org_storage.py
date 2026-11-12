"""
Migration 0060 - Separately track bytes stored for finished and active crawls on org
"""

import structlog

from btrixcloud.migrations import BaseMigration

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0060"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.org_ops = kwargs.get("org_ops")
        self.crawl_ops = kwargs.get("crawl_ops")

    async def migrate_up(self):
        """Perform migration up.

        For each org, recalculate org storage statistics to account for active
        vs. finished crawls.
        """
        migration_logger = logger.bind(migration_version=MIGRATION_VERSION)

        if self.org_ops is None or self.crawl_ops is None:
            migration_logger.warning(
                "crawls_size_migration_missing_ops",
            )
            return

        orgs_db = self.mdb["organizations"]

        match_query = {
            "$or": [
                {"bytesStoredFinishedCrawls": None},
                {"bytesStoredActiveCrawls": None},
            ]
        }

        total = await orgs_db.count_documents(match_query)
        migration_logger.bind(total=total)
        index = 0

        async for org_dict in orgs_db.find(match_query):
            oid = org_dict.get("_id")

            index += 1
            migration_logger.debug(
                "calculating_org_crawls_storage", index=index, oid=oid
            )

            try:
                _ = await self.org_ops.get_org_by_id(oid)

                # Recalculate all totals just to be safe, since we had some
                # size bugs around QA WACZs and upload replacement
                (
                    total_size,
                    crawls_size,
                    finished_crawls_size,
                    active_crawls_size,
                    uploads_size,
                ) = self.crawl_ops.calculate_org_crawl_file_storage(oid)

                await orgs_db.find_one_and_update(
                    {"_id": oid},
                    {
                        "$set": {
                            "bytesStored": total_size,
                            "bytesStoredCrawls": crawls_size,
                            "bytesStoredFinishedCrawls": finished_crawls_size,
                            "bytesStoredActiveCrawls": active_crawls_size,
                            "bytesStoredUploads": uploads_size,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                migration_logger.exception(
                    "org_crawls_storage_calculation_error",
                )
