""" entrypoint module for operator """

import signal
import sys
import asyncio

from fastapi import FastAPI
from .operator import init_operator_webhook


API_PREFIX = "/api"
app_root = FastAPI(
    docs_url=API_PREFIX + "/docs",
    redoc_url=API_PREFIX + "/redoc",
    openapi_url=API_PREFIX + "/openapi.json",
)


def main():
    """main init"""
    init_operator_webhook(app_root)


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, exit_handler)

    main()


def exit_handler():
    """sigterm handler"""
    print("SIGTERM received, exiting")
    sys.exit(1)
