"""entrypoint module for background jobs"""

import asyncio
import os
import sys
import traceback
from uuid import UUID

from .models import BgJobType
from .ops import init_ops


job_type = os.environ.get("BG_JOB_TYPE")
oid = os.environ.get("OID")
crawl_type = os.environ.get("CRAWL_TYPE")
crawl_id = os.environ.get("CRAWL_ID")


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code, too-many-locals, too-many-return-statements
# pylint: disable=too-many-branches
async def main():
    """run background job with access to ops classes"""

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        print(
            "Sorry, the Browsertrix Backend must be run inside a Kubernetes environment.\
             Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
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
    ) = init_ops()

    # Run job (generic)
    if job_type == BgJobType.OPTIMIZE_PAGES:
        try:
            await page_ops.optimize_crawl_pages(version=2)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            traceback.print_exc()
            return 1

    if job_type == BgJobType.CLEANUP_SEED_FILES:
        try:
            await file_ops.cleanup_unused_seed_files()
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            traceback.print_exc()
            return 1

    # Run job (org-specific)
    if not oid:
        print("Org id missing, quitting")
        return 1

    org = await org_ops.get_org_by_id(UUID(oid))
    if not org:
        print("Org id invalid, quitting")
        return 1

    if job_type == BgJobType.DELETE_ORG:
        try:
            await org_ops.delete_org_and_data(org, user_manager)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            traceback.print_exc()
            return 1

    if job_type == BgJobType.RECALCULATE_ORG_STATS:
        try:
            await org_ops.recalculate_storage(org)
            return 0
        # pylint: disable=broad-exception-caught
        except Exception:
            traceback.print_exc()
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
            traceback.print_exc()
            return 1

    print(f"Provided job type {job_type} not currently supported")
    return 1


# # ============================================================================
if __name__ == "__main__":
    return_code = asyncio.run(main())
    sys.exit(return_code)
