"""
Migration 0027 - Profile modified date fallback
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)


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
        except Exception:
            logger.exception(
                "migration_profile_modified_error",
                unstructured_message="Error adding modified date to profiles",
            )
