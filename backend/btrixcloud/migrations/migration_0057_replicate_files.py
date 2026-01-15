"""
Migration 0057 - Replicate any unreplicated crawl and profile files
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import BaseCrawl, Profile, BgJobType


MIGRATION_VERSION = "0057"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.background_job_ops = kwargs.get("background_job_ops")

    # pylint: disable=too-many-locals
    async def migrate_up(self):
        """Perform migration up.

        Identify files from archived items and profiles that should have been
        replicated but weren't, and start new background jobs to re-replicate
        the files if there isn't already an in-progress job to do the same.
        """
        orgs_mdb = self.mdb["organizations"]
        jobs_mdb = self.mdb["jobs"]
        crawls_mdb = self.mdb["crawls"]
        profiles_mdb = self.mdb["profiles"]

        if self.background_job_ops is None:
            print(
                "Unable to replicate unreplicated files, missing required ops",
                flush=True,
            )
            return

        # Future-proof in anticipation of custom storage - do not attempt to
        # replicate files for orgs that don't have a replica location configured
        orgs_with_replicas = []
        async for org in orgs_mdb.find(
            {"storageReplicas.0": {"$exists": True}}, projection=["_id"]
        ):
            orgs_with_replicas.append(org["_id"])

        # Archived items

        crawls_match_query = {
            "oid": {"$in": orgs_with_replicas},
            "files": {"$elemMatch": {"replicas": {"$in": [None, []]}}},
        }
        async for crawl_raw in crawls_mdb.find(crawls_match_query):
            crawl = BaseCrawl.from_dict(crawl_raw)
            for file_ in crawl.files:
                if not file_.replicas:
                    # Check that there isn't an in-progress job for this file
                    if await jobs_mdb.find(
                        {
                            "type": BgJobType.CREATE_REPLICA.value,
                            "object_id": crawl.id,
                            "object_type": crawl.type,
                            "file_path": file_.filename,
                            "started": {"$ne": None},
                            "finished": None,
                        }
                    ):
                        continue

                    try:
                        await self.background_job_ops.create_replica_jobs(
                            crawl.oid, file_, crawl.id, crawl.type
                        )
                    # pylint: disable=broad-exception-caught
                    except Exception as err:
                        print(
                            f"Error replicating unreplicated file for item {crawl.id}: {err}",
                            flush=True,
                        )

        # Profiles

        profiles_match_query = {
            "oid": {"$in": orgs_with_replicas},
            "resource.replicas": {"$in": [None, []]},
        }
        async for profile_raw in profiles_mdb.find(profiles_match_query):
            profile = Profile.from_dict(profile_raw)

            if not profile.resource:
                continue

            # Check there isn't already an in-progress job for this profile
            if await jobs_mdb.find(
                {
                    "type": BgJobType.CREATE_REPLICA.value,
                    "object_id": profile.id,
                    "object_type": "profile",
                    "file_path": profile.resource.filename,
                    "started": {"$ne": None},
                    "finished": None,
                }
            ):
                continue

            try:
                await self.background_job_ops.create_replica_jobs(
                    profile.oid, profile.resource, profile.id, "profile"
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error replicating unreplicated file for profile {profile.id}: {err}",
                    flush=True,
                )
