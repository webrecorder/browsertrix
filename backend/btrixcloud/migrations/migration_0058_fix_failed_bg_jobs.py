"""
Migration 0058 - Fix failed background jobs with success and finished unset
"""

import logging
import os
from datetime import timedelta

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import dt_now

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0058"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Identify background jobs that failed but never had finished or success
        updated in database and correct them in the database.

        We don't want to modify jobs that are still in process or subject to
        the replica deletion delay, so target jobs that are either (replica delay
        deletion + 1) or 7 days old, whichever is greater.
        """
        jobs_mdb = self.mdb["jobs"]

        replica_deletion_days = int(os.environ.get("REPLICA_DELETION_DELAY_DAYS", 0))
        days_delta = max(replica_deletion_days + 1, 7)
        started_before = dt_now() - timedelta(days=days_delta)

        match_query = {
            "finished": None,
            "success": None,
            "started": {"$lte": started_before},
        }

        try:
            res = await jobs_mdb.update_many(
                match_query,
                {
                    "$set": {
                        "success": False,
                        "finished": started_before,
                    }
                },
            )
            updated = res.modified_count
            logger.info("updated_bg_job_records", count=updated)
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception("failed_to_update_bg_job_records")
