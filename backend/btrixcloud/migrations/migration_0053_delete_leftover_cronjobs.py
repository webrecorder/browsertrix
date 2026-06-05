"""
Migration 0053 - Delete leftover cron and crawl jobs
"""

import logging
from uuid import UUID

from fastapi import HTTPException

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)

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

        Delete replica deletion cron jobs, config cron jobs, and crawl jobs
        from deleted orgs that were left over accidentally, as well as replica
        deletion cron jobs that completed (succeeded or failed) but were never
        cleaned up.
        """
        if self.crawl_manager is None:
            logger.warning(
                "cron_job_cleanup_missing_ops",
                unstructured_message="Unable to clean up leftover cron jobs, missing ops",
            )
            return

        bg_cron_jobs = await self.crawl_manager.list_cron_jobs()
        for cron_job in bg_cron_jobs:
            metadata = cron_job.metadata

            oid = metadata.labels.get("btrix.org")
            if oid:
                await self.delete_cron_job_if_org_deleted(UUID(oid), metadata.name)

            if metadata.labels.get("job_type") == "delete-replica":
                await self.delete_replica_delete_job_if_finished(metadata.name)

        crawl_jobs = await self.crawl_manager.list_crawl_jobs()
        for crawl_job in crawl_jobs:
            labels = crawl_job.get("metadata", {}).get("labels", {})
            oid = labels.get("btrix.org", "")
            crawl_id = labels.get("crawl", "")

            if oid and crawl_id:
                await self.delete_crawl_job_if_org_deleted(UUID(oid), crawl_id)

    async def _org_exists(self, oid: UUID) -> bool:
        """Check if org with given UUID exists"""
        if self.org_ops is None:
            return True
        try:
            _ = await self.org_ops.get_org_by_id(oid)
            return True
        except HTTPException:
            pass
        return False

    async def delete_cron_job_if_org_deleted(self, oid: UUID, job_name: str) -> None:
        """Delete cron job if it belongs to a deleted org"""
        if self.crawl_manager is None:
            logger.warning(
                "cron_job_org_check_skipped_missing_ops",
                job_name=job_name,
                unstructured_message=f"Skipping cron job {job_name} org check, missing ops",
            )
            return

        org_exists = await self._org_exists(oid)
        if not org_exists:
            try:
                await self.crawl_manager.delete_cron_job_by_name(job_name)
                logger.info(
                    "cron_job_deleted_from_deleted_org",
                    job_name=job_name,
                    unstructured_message=f"Deleted cron job {job_name} from deleted org",
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "cron_job_delete_error",
                    job_name=job_name,
                    unstructured_message=f"Error deleting cron job {job_name}",
                )

    async def delete_replica_delete_job_if_finished(self, job_name: str) -> None:
        """Delete replica delete cron job if finished"""
        if self.background_job_ops is None or self.crawl_manager is None:
            logger.warning(
                "replica_delete_job_finished_check_skipped_missing_ops",
                job_name=job_name,
                unstructured_message=f"Skipping cron job {job_name} finished check, missing ops",
            )
            return

        try:
            job = await self.background_job_ops.get_background_job(job_name)
            if job.finished and job.success is not None:
                await self.crawl_manager.delete_cron_job_by_name(job_name)
                # pylint: disable=line-too-long
                logger.info(
                    "replica_delete_job_deleted",
                    job_name=job_name,
                    success=job.success,
                    oid=job.oid,
                    unstructured_message=f"Deleted replica delete job {job_name} (success: {job.success}, org: {job.oid})",
                )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "replica_delete_cron_job_error",
                job_name=job_name,
                unstructured_message=f"Error deleting replica delete cron job {job_name}",
            )

    async def delete_crawl_job_if_org_deleted(self, oid: UUID, crawl_id: str) -> None:
        """Delete crawl job if it belongs to a deleted org"""
        if self.crawl_manager is None:
            logger.warning(
                "crawl_job_org_check_skipped_missing_ops",
                crawl_id=crawl_id,
                # pylint: disable=line-too-long
                unstructured_message=f"Skipping crawl job crawljob-{crawl_id} org check, missing ops",
            )
            return

        org_exists = await self._org_exists(oid)
        if not org_exists:
            resp = await self.crawl_manager.delete_crawl_job(crawl_id)
            if resp.get("success"):
                logger.info(
                    "crawl_job_deleted_from_deleted_org",
                    crawl_id=crawl_id,
                    unstructured_message=f"Deleted crawl job crawljob-{crawl_id} from deleted org",
                )

            error = resp.get("error")
            if error:
                logger.exception(
                    "crawl_job_delete_error",
                    crawl_id=crawl_id,
                    error=error,
                    # pylint: disable=line-too-long
                    unstructured_message=f"Error deleting crawl job crawljob-{crawl_id} from deleted org",
                )
