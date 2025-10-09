"""
Migration 0052 - Fix profile filenames, ensure it's full path with org id
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import Profile


MIGRATION_VERSION = "0052"


# pylint: disable=duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self) -> None:
        """Perform migration up.

        Add oid prefix to profile resource filenames that don't already have it
        """
        profiles_mdb = self.mdb["profiles"]

        async for profile_res in profiles_mdb.find({}):
            profile = Profile.from_dict(profile_res)
            if not profile.resource:
                continue

            existing_filename = profile.resource.filename
            oid = str(profile.oid)

            if not existing_filename.startswith(oid):
                try:
                    await profiles_mdb.find_one_and_update(
                        {"_id": profile.id},
                        {"$set": {"resource.filename": f"{oid}/{existing_filename}"}},
                    )
                # pylint: disable=broad-exception-caught
                except Exception as err:
                    print(
                        f"Error updating filename for profile {profile.name} ({profile.id}): {err}",
                        flush=True,
                    )
