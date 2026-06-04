"""entrypoint module for init_container, handles db migration"""

import asyncio
import logging
import os
import sys

from .logger import init_logging
from .db import ensure_feature_version, update_and_prepare_db
from .ops import init_ops

logger = logging.getLogger(__name__)


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code
async def main() -> int:
    """init migrations"""
    init_logging()

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        # pylint: disable=line-too-long
        logger.fatal(
            "kubernetes_not_detected",
            unstructured_message="Sorry, the Browsertrix Backend must be run inside a Kubernetes environment. "
            "Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting",
        )
        return 1

    (
        org_ops,
        crawl_config_ops,
        _,
        crawl_ops,
        _,
        page_ops,
        coll_ops,
        profile_ops,
        storage_ops,
        background_job_ops,
        _,
        user_manager,
        invite_ops,
        file_ops,
        crawl_log_ops,
        crawl_manager,
        dbclient,
        mdb,
    ) = init_ops()

    await ensure_feature_version(dbclient)

    await update_and_prepare_db(
        mdb,
        user_manager,
        org_ops,
        crawl_ops,
        crawl_config_ops,
        coll_ops,
        invite_ops,
        storage_ops,
        page_ops,
        background_job_ops,
        file_ops,
        crawl_log_ops,
        profile_ops,
        crawl_manager,
    )

    return 0


# # ============================================================================
if __name__ == "__main__":
    return_code = asyncio.run(main())
    sys.exit(return_code)
