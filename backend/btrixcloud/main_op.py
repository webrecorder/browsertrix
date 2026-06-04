"""entrypoint module for operator"""

import logging
import os
import sys

from fastapi import FastAPI

from .logger import create_request_logging_middleware, init_logging
from .operator import init_operator_api
from .ops import init_ops
from .utils import register_exit_handler

logger = logging.getLogger(__name__)


app_root = FastAPI()

app_root.middleware("http")(create_request_logging_middleware(logger))


# ============================================================================
# pylint: disable=too-many-function-args, duplicate-code
def main():
    """init operator"""

    # pylint: disable=import-outside-toplevel
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        # pylint: disable=line-too-long
        logger.critical(
            "kubernetes_not_detected",
            unstructured_message="Sorry, the Browsertrix Backend must be run inside a Kubernetes environment. "
            "Kubernetes not detected (KUBERNETES_SERVICE_HOST is not set), Exiting",
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
        crawl_log_ops,
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
        crawl_log_ops,
    )


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    init_logging()
    register_exit_handler()
    settings = main()
    await settings.async_init()
