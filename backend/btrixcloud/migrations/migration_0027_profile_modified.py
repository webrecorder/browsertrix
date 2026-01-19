"""
Migration 0027 - Profile modified date fallback
"""

from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0027"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        If profile doesn't have modified date, set to created
        """
        # pylint: disable=duplicate-code
        profiles = self.mdb["profiles"]
        try:
            await profiles.update_many(
                {"modified": None}, [{"$set": {"modified": "$created"}}]
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error adding modified date to profiles: {err}",
                flush=True,
            )
