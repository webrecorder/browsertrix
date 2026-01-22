"""
Migration 0056 - Fix failed background jobs with success and finished unset
"""

from datetime import timedelta
import os

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import dt_now


MIGRATION_VERSION = "0056"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Identify background jobs that failed but never had finished or success
        updated in database and correct them in the database so that they can
        be restarted via the retry endpoints.

        We don't want to modify jobs that are still in process or subject to
        the replica deletion delay, so target jobs that are either (replica delay
        deltion + 1) or 7 days old, whichever is greater.
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
            await jobs_mdb.update_many(
                match_query,
                {
                    "$set": {
                        "success": False,
                        "finished": started_before,
                    }
                },
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error updating failed background jobs: {err}",
                flush=True,
            )
