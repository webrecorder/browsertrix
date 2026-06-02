"""
Migration 0057 - Remove background jobs for deleted orgs from db
"""

import logging
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorDatabase

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import BgJobType

logger = logging.getLogger(__name__)

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

        job_oids = await jobs_mdb.distinct("oid", {"oid": {"$ne": None}})

        for oid in job_oids:
            res = await orgs_mdb.find_one({"_id": oid})
            if res is None:
                job_orgs_to_delete.append(oid)

        if job_orgs_to_delete:
            del_count = len(job_orgs_to_delete)
            logger.info(
                "background_jobs_deleting_for_deleted_orgs",
                del_count=del_count,
                unstructured_message=f"Deleting background jobs for {del_count} deleted orgs",
            )

            try:
                res = await jobs_mdb.delete_many(
                    {
                        "oid": {"$in": job_orgs_to_delete},
                        # Maintain consistency with behavior moving forward, to
                        # retain only the one org deletion background job from
                        # deleted orgs
                        "type": {"$ne": BgJobType.DELETE_ORG},
                    }
                )
                logger.info(
                    "background_jobs_deleted_from_db",
                    deleted_count=res.deleted_count,
                    unstructured_message=f"Deleted {res.deleted_count} jobs from database",
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                logger.error(
                    "background_jobs_deleted_orgs_error",
                    error=err,
                    unstructured_message=f"Error deleting jobs from deleted orgs: {err}",
                )
