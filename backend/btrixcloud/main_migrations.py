"""entrypoint module for init_container, handles db migration"""

import os
import sys
import asyncio

from .ops import init_ops
from .db import update_and_prepare_db, ensure_feature_version


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code
async def main() -> int:
    """init migrations"""

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        print(
            "Sorry, the Browsertrix Backend must be run inside a Kubernetes environment.\
             Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
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

    await storage_ops.create_default_bucket()

    return 0


# # ============================================================================
if __name__ == "__main__":
    return_code = asyncio.run(main())
    sys.exit(return_code)
