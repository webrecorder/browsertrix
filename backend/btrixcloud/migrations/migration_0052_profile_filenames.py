"""
Migration 0052 - Fix profile filenames in db to be full path from bucket
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

        self.background_job_ops = kwargs.get("background_job_ops")

    async def migrate_up(self) -> None:
        """Perform migration up.

        Add oid prefix to profile resource filenames that don't already have it.
        For any profiles that match, also delete the database record for any
        existing replicas and then spawn new replication jobs.
        """
        profiles_mdb = self.mdb["profiles"]

        match_query = {"resource.filename": {"$regex": r"^profiles"}}

        if self.background_job_ops is None:
            print(
                f"Unable to start migration {MIGRATION_VERSION}, ops class missing",
                flush=True,
            )
            return

        async for profile_res in profiles_mdb.find(match_query):
            profile = Profile.from_dict(profile_res)
            if not profile.resource:
                continue

            existing_filename = profile.resource.filename
            oid = str(profile.oid)
            new_filename = f"{oid}/{existing_filename}"

            if not existing_filename.startswith(oid):
                try:
                    await profiles_mdb.find_one_and_update(
                        {"_id": profile.id},
                        {
                            "$set": {
                                "resource.filename": new_filename,
                                "resource.replicas": [],
                            }
                        },
                    )

                    profile.resource.filename = new_filename
                    profile.resource.replicas = []

                    print(
                        f"Starting background jobs to replicate profile {profile.id}",
                        flush=True,
                    )
                    await self.background_job_ops.create_replica_jobs(
                        profile.oid, profile.resource, str(profile.id), "profile"
                    )
                # pylint: disable=broad-exception-caught
                except Exception as err:
                    print(
                        f"Error fixing filename and replicas for profile {profile.id}: {err}",
                        flush=True,
                    )
