"""
Migration 0021 - Profile filenames
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0021"


# pylint: disable=duplicate-code, broad-exception-caught
class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Add `profiles/` prefix to all profile filenames without it.
        """
        mdb_profiles = self.mdb["profiles"]
        async for profile in mdb_profiles.find({}):
            profile_id = profile["_id"]
            file_ = profile.get("resource")
            if not file_:
                continue

            filename = file_.get("filename")
            if not filename:
                continue

            if not filename.startswith("profiles/"):
                try:
                    await mdb_profiles.find_one_and_update(
                        {"_id": profile_id},
                        {"$set": {"resource.filename": f"profiles/{filename}"}},
                    )
                except Exception as err:
                    print(
                        f"Error updating filename for profile {profile['name']}: {err}",
                        flush=True,
                    )
