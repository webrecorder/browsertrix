"""
Migration 0057 - Remove background jobs for deleted orgs from db
"""

from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorDatabase

from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0057"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb: AsyncIOMotorDatabase, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Delete background jobs from deleted orgs from the database.
        """
        # pylint: disable=duplicate-code
        jobs_mdb = self.mdb["jobs"]
        orgs_mdb = self.mdb["organizations"]

        job_orgs_to_delete: list[UUID] = []

        job_oids = await jobs_mdb.distinct("oid", {})

        for oid in job_oids:
            res = await orgs_mdb.find_one({"_id": oid})
            if res is None:
                job_orgs_to_delete.append(oid)

        if job_orgs_to_delete:
            del_count = len(job_orgs_to_delete)
            print(
                f"Deleting background jobs for {del_count} deleted orgs",
                flush=True,
            )

            try:
                await jobs_mdb.delete_many({"oid": {"$in": job_orgs_to_delete}})
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Error deleting jobs from deleted orgs: {err}", flush=True)
