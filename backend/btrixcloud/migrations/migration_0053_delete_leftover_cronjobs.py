"""
Migration 0053 - Delete leftover cron jobs
"""

from uuid import UUID

from fastapi import HTTPException

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0053"


# pylint: disable=duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.org_ops = kwargs.get("org_ops")
        self.background_job_ops = kwargs.get("background_job_ops")
        self.crawl_manager = kwargs.get("crawl_manager")

    async def migrate_up(self) -> None:
        """Perform migration up.

        Delete replica deletion cron jobs and config cron jobs from deleted orgs
        that were left over accidentally, as well as replica deletion cron jobs
        that completed (succeeded or failed) but were never cleaned up.
        """
        if self.crawl_manager is None:
            print("Unable to clean up leftover cron jobs, missing ops", flush=True)
            return

        bg_cron_jobs = await self.crawl_manager.list_cron_jobs()
        for cron_job in bg_cron_jobs:
            metadata = cron_job.metadata

            job_type = metadata.labels.get("job_type", "")
            if metadata.labels.get("role") == "cron-job":
                job_type = "scheduled crawl"

            oid = metadata.labels.get("btrix.org")
            if oid:
                await self.delete_job_if_org_deleted(UUID(oid), metadata.name, job_type)

            if job_type == "delete-replica":
                await self.delete_replica_delete_job_if_finished(metadata.name)

    async def delete_job_if_org_deleted(
        self, oid: UUID, job_name: str, job_type: str
    ) -> None:
        """Delete job if it belongs to a deleted org"""
        if self.org_ops is None or self.crawl_manager is None:
            print(f"Skipping cron job {job_name} org check, missing ops", flush=True)
            return

        org_exists = True

        try:
            _ = await self.org_ops.get_org_by_id(oid)
        except HTTPException:
            org_exists = False

        if not org_exists:
            try:
                await self.crawl_manager.delete_cron_job_by_name(job_name)
                print(
                    f"Deleted cron job {job_name} (type: {job_type}) from deleted org",
                    flush=True,
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error deleting cron job {job_name} (type: {job_type}): {err}",
                    flush=True,
                )

    async def delete_replica_delete_job_if_finished(self, job_name: str) -> None:
        """Delete replica delete job if finished"""
        if self.background_job_ops is None or self.crawl_manager is None:
            print(
                f"Skipping cron job {job_name} finished check, missing ops", flush=True
            )
            return

        try:
            job = await self.background_job_ops.get_background_job(job_name)
            if job.finished and job.success is not None:
                await self.crawl_manager.delete_cron_job_by_name(job_name)
                # pylint: disable=line-too-long
                print(
                    f"Deleted replica delete job {job_name} (success: {job.success}, org: {job.oid})",
                    flush=True,
                )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error deleting replica delete cron job {job_name}: {err}",
                flush=True,
            )
