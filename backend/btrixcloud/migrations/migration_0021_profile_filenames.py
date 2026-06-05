"""
Migration 0021 - Profile filenames
"""

import logging

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import Profile

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0021"


# pylint: disable=duplicate-code, broad-exception-caught
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add `profiles/` prefix to all profile filenames without it
        """
        mdb_profiles = self.mdb["profiles"]

        async for profile_res in mdb_profiles.find({}):
            profile = Profile.from_dict(profile_res)
            if not profile.resource:
                continue

            filename = profile.resource.filename
            if not filename.startswith("profiles/"):
                try:
                    await mdb_profiles.find_one_and_update(
                        {"_id": profile.id},
                        {"$set": {"resource.filename": f"profiles/{filename}"}},
                    )
                except Exception:
                    logger.exception(
                        "migration_profile_filename_error",
                        profile_name=profile.name,
                        unstructured_message=f"Error updating filename for profile {profile.name}",
                    )
