"""
Migration 0056 - Remove logs for deleted crawls
"""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)


MIGRATION_VERSION = "0056"

NOT_NULLISH = {"$nin": [None, ""]}


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb: AsyncIOMotorDatabase, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Delete crawl logs from database for crawls and orgs that
        have since been deleted, as well as for QA runs that were
        deleted for still-existing crawls.
        """
        # pylint: disable=duplicate-code, too-many-locals
        crawl_logs_mdb = self.mdb["crawl_logs"]
        crawls_mdb = self.mdb["crawls"]

        # DELETED CRAWLS

        crawl_logs_to_delete: list[str] = []

        log_crawl_ids = await crawl_logs_mdb.distinct(
            "crawlId", {"crawlId": NOT_NULLISH}
        )

        crawl_count = len(log_crawl_ids)
        index = 0

        for crawl_id in log_crawl_ids:
            index += 1
            res = await crawls_mdb.find_one({"_id": crawl_id})
            if res is None:
                crawl_logs_to_delete.append(crawl_id)

            if index % 100 == 0:
                logger.info(
                    "crawls_checked_progress",
                    index=index,
                    crawl_count=crawl_count,
                    # pylint: disable=line-too-long
                    unstructured_message=f"Checked {index} of {crawl_count} crawls for logs to delete",
                )

        if crawl_logs_to_delete:
            del_count = len(crawl_logs_to_delete)
            logger.info(
                "crawl_logs_deleted_crawls_summary",
                index=index,
                del_count=del_count,
                # pylint: disable=line-too-long
                unstructured_message=f"Checked {index} crawls, deleting logs for {del_count} deleted crawls",
            )

            try:
                res = await crawl_logs_mdb.delete_many(
                    {"crawlId": {"$in": crawl_logs_to_delete}}
                )
                logger.info(
                    "crawl_log_lines_deleted",
                    deleted_count=res.deleted_count,
                    unstructured_message=f"Deleted {res.deleted_count} crawl log lines",
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "crawl_logs_deleted_crawls_error",
                    unstructured_message="Error deleting crawl logs from deleted crawls",
                )

        # DELETED QA RUNS

        qa_run_logs_to_delete: list[str] = []

        log_qa_run_ids = await crawl_logs_mdb.distinct(
            "qaRunId", {"qaRunId": NOT_NULLISH}
        )

        qa_run_count = len(log_qa_run_ids)
        qa_index = 0

        for qa_run_id in log_qa_run_ids:
            qa_index += 1
            res = await crawls_mdb.find_one(
                {f"qaFinished.{qa_run_id}": {"$exists": True}}
            )
            if res is None:
                qa_run_logs_to_delete.append(qa_run_id)

            if qa_index % 100 == 0:
                logger.info(
                    "qa_runs_checked_progress",
                    qa_index=qa_index,
                    qa_run_count=qa_run_count,
                    # pylint: disable=line-too-long
                    unstructured_message=f"Checked {qa_index} of {qa_run_count} QA runs for logs to delete",
                )

        if qa_run_logs_to_delete:
            qa_del_count = len(qa_run_logs_to_delete)
            logger.info(
                "qa_run_logs_deleted_summary",
                qa_index=qa_index,
                qa_del_count=qa_del_count,
                # pylint: disable=line-too-long
                unstructured_message=f"Checked {qa_index} QA runs, deleting logs for {qa_del_count} deleted runs",
            )

            try:
                res = await crawl_logs_mdb.delete_many(
                    {"qaRunId": {"$in": qa_run_logs_to_delete}}
                )
                logger.info(
                    "qa_run_log_lines_deleted",
                    deleted_count=res.deleted_count,
                    unstructured_message=f"Deleted {res.deleted_count} QA run log lines",
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "qa_run_logs_deleted_error",
                    unstructured_message="Error deleting logs from deleted QA runs",
                )
