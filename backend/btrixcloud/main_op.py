"""entrypoint module for operator"""

import os
import sys

from fastapi import FastAPI

from .operator import init_operator_api
from .ops import init_ops
from .utils import register_exit_handler


app_root = FastAPI()


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code
def main():
    """init operator"""

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
        event_webhook_ops,
        _,
        _,
        _,
        _,
        _,
    ) = init_ops()

    return init_operator_api(
        app_root,
        crawl_config_ops,
        crawl_ops,
        org_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
        page_ops,
    )


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    register_exit_handler()
    settings = main()
    await settings.async_init()
