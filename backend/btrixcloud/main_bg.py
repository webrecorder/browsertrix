"""entrypoint module for background jobs"""

import asyncio
import os
import sys
from uuid import UUID

import structlog

from .logger import init_logging, set_log_context
from .models import BgJobType
from .ops import init_ops
from .utils import btrix_env

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

job_type = os.environ.get("BG_JOB_TYPE")
oid = os.environ.get("OID")
crawl_type = os.environ.get("CRAWL_TYPE")
crawl_id = os.environ.get("CRAWL_ID")
coll_id = os.environ.get("COLLECTION_ID")


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code, too-many-locals, too-many-return-statements
# pylint: disable=too-many-branches, too-many-statements
async def main():
    """run background job with access to ops classes"""

    init_logging()

    logger.info("starting", btrix_env=btrix_env)

    if oid:
        set_log_context(oid=oid)

    crawl_logger = logger.bind(
        job_type=job_type,
        crawl_type=crawl_type,
        crawl_id=crawl_id,
        coll_id=coll_id
    )

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        logger.critical(
            "kubernetes_not_detected",
            message=(
                "Sorry, the Browsertrix Backend must be run inside a Kubernetes environment. "
                "Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
            ),
        )
        return 1

    (
        org_ops,
        _,
        _,
        _,
        _,
        page_ops,
        coll_ops,
        _,
        _,
        _,
        _,
        user_manager,
        _,
        file_ops,
        _,
        _,
        _,
        _,
    ) = init_ops()

    # Run job (generic)
    if job_type == BgJobType.OPTIMIZE_PAGES:
        try:
            await page_ops.optimize_crawl_pages(version=2)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            crawl_logger.exception(
                "bg_job_failed",
                unstructured_message="optimize_pages failed",
            )
            return 1

    if job_type == BgJobType.CLEANUP_SEED_FILES:
        try:
            await file_ops.cleanup_unused_seed_files()
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            crawl_logger.exception(
                "bg_job_failed",
                unstructured_message="cleanup_seed_files failed",
            )
            return 1

    # Run job (org-specific)
    if not oid:
        crawl_logger.error(
            "org_id_missing",
            unstructured_message="Org id missing, quitting",
        )
        return 1

    org = await org_ops.get_org_by_id(UUID(oid))
    if not org:
        crawl_logger.error(
            "org_id_invalid",
            unstructured_message="Org id invalid, quitting",
        )
        return 1

    if job_type == BgJobType.DELETE_ORG:
        try:
            await org_ops.delete_org_and_data(org, user_manager)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            crawl_logger.exception(
                "bg_job_failed",
                unstructured_message="delete_org_and_data failed",
            )
            return 1

    if job_type == BgJobType.RECALCULATE_ORG_STATS:
        try:
            await org_ops.recalculate_storage(org)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            crawl_logger.exception(
                "bg_job_failed",
                unstructured_message="recalculate_storage failed",
            )
            return 1

    if job_type == BgJobType.READD_ORG_PAGES:
        try:
            if not crawl_id:
                await page_ops.re_add_all_crawl_pages(org, crawl_type=crawl_type)
            else:
                await page_ops.re_add_crawl_pages(crawl_id=crawl_id, oid=org.id)

            await coll_ops.recalculate_org_collection_stats(org)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            crawl_logger.exception(
                "bg_job_failed",
                unstructured_message="readd_org_pages failed",
            )
            return 1

    if job_type == BgJobType.UPDATE_COLL_STATS:
        crawl_logger.info(
            "collection_update_started",
            unstructured_message=f"Updating collection {coll_id}",
        )
        count = 0
        try:
            # Loop check so that if a collection is modified again since update
            # calculation started, the job will re-calculate the stats again
            # before quitting
            while True:
                if not await coll_ops.should_update_stats(UUID(coll_id), org.id):
                    break

                count += 1
                crawl_logger.debug(
                    "collection_update_iteration",
                    count=count,
                    unstructured_message=f"Starting update number {count}",
                )
                await coll_ops.update_collection_stats(UUID(coll_id), org.id)

            crawl_logger.info(
                "collection_update_complete",
                unstructured_message=(
                    "No changes to collection since start of last update, job complete"
                ),
            )
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            crawl_logger.exception(
                "bg_job_failed",
                unstructured_message="update_collection_stats failed",
            )
            return 1

    crawl_logger.critical(
        "unsupported_job_type",
        unstructured_message=f"Provided job type {job_type} not currently supported",
    )
    return 1


# # ============================================================================
if __name__ == "__main__":
    return_code = asyncio.run(main())
    sys.exit(return_code)
