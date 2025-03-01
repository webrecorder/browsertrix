"""entrypoint module for init_container, handles db migration"""

import os
import sys
import asyncio

from .ops import init_ops
from .db import update_and_prepare_db


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code
async def main() -> None:
    """init migrations"""

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        print(
            "Sorry, the Browsertrix Backend must be run inside a Kubernetes environment.\
             Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting"
        )
        sys.exit(1)

    (
        org_ops,
        crawl_config_ops,
        _,
        crawl_ops,
        _,
        page_ops,
        coll_ops,
        _,
        storage_ops,
        background_job_ops,
        _,
        user_manager,
        invite_ops,
        _,
        mdb,
    ) = init_ops()

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
        {},
    )

    return 0

# # ============================================================================
if __name__ == "__main__":
    return_code = asyncio.run(main())
    sys.exit(return_code)
