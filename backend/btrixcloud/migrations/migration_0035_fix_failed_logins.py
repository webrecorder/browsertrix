"""
Migration 0035 -- fix model for failed logins
"""

from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0035"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Set created from attempted.attempted
        """
        failed_logins = self.mdb["logins"]

        try:
            res = await failed_logins.update_many(
                {"attempted.attempted": {"$exists": 1}},
                [{"$set": {"attempted": "$attempted.attempted"}}],
            )
            updated = res.modified_count
            print(f"{updated} failed logins fixed", flush=True)
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error fixing failed logins: {err}",
                flush=True,
            )
