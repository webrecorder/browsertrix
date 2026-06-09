"""Structured logging configuration for Browsertrix backend.

Uses structlog for structured JSON logging in production and human-readable
output in development. Integrates with the standard library logging module
so third-party libraries (uvicorn, motor, etc.) are formatted consistently.

Keyword arguments passed to log calls become distinct JSON fields:

    logger.info("updating_collection", coll_id=coll_id, oid=oid)
    # => {"event": "updating_collection", "coll_id": "abc123", "oid": "..."}
"""

import logging
import os
import sys
import time
from collections.abc import Mapping
from contextvars import Token
from uuid import UUID, uuid4

import structlog
from structlog.contextvars import (
    bind_contextvars,
    clear_contextvars,
    reset_contextvars,
    unbind_contextvars,
)
from structlog.typing import EventDict, Processor

from .version import __branch__, __commit_hash__, __version__


def set_log_context(
    *, oid: str | UUID = "", user_id: str | UUID = ""
) -> Mapping[str, Token]:
    """Set org and user context for the current request scope.

    Returns the keys that were bound so they can be unbound later.
    """
    kwargs: dict[str, str] = {}
    if oid:
        kwargs["oid"] = str(oid)
    if user_id:
        kwargs["user_id"] = str(user_id)
    if kwargs:
        tokens = bind_contextvars(**kwargs)
        return tokens
    return {}


def clear_log_context(tokens: Mapping[str, Token] | None = None) -> None:
    """Clear org and user context.

    If keys are provided, only those keys are unbound. Otherwise all
    structlog context variables are cleared.
    """
    if tokens is not None:
        reset_contextvars(**tokens)
    else:
        clear_contextvars()


def create_request_logging_middleware(logger):
    """Return an ASGI middleware that logs every request with
    method, path, status, duration, request_id, client_addr, and
    http_version."""

    def _get_client_addr(request):
        client = request.client
        if client:
            return f"{client.host}:{client.port}"
        return ""

    SKIP_PATHS = ("/healthz", "/healthzStartup")

    async def request_logging_middleware(request, call_next):
        if request.url.path in SKIP_PATHS:
            return await call_next(request)

        clear_contextvars()
        request_id = uuid4().hex[:8]
        bind_contextvars(request_id=request_id)
        start_time = time.time()
        try:
            response = await call_next(request)
        # pylint: disable=broad-exception-caught
        except Exception as e:
            logger.exception(
                "http_unhandled_exception",
                http_method=request.method,
                http_path=request.url.path,
                client_addr=_get_client_addr(request),
                http_version=request.scope.get("http_version", ""),
            )
            raise e
        finally:
            duration = time.time() - start_time
            logger.debug(
                "http_request",
                http_method=request.method,
                http_path=request.url.path,
                http_status=response.status_code,
                duration=duration,
                client_addr=_get_client_addr(request),
                http_version=request.scope.get("http_version", ""),
            )
            unbind_contextvars("request_id")
            clear_log_context()
        return response

    return request_logging_middleware


def add_version_context(
    logger: structlog.stdlib.BoundLogger, method_name: str, event_dict: EventDict
) -> structlog.stdlib.BoundLogger:
    event_dict["btrix_version"] = __version__
    event_dict["btrix_commit_hash"] = __commit_hash__
    event_dict["btrix_branch"] = __branch__
    return event_dict


SHARED_PROCESSORS: list[Processor] = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_log_level,
    structlog.stdlib.add_logger_name,
    add_version_context,
    structlog.stdlib.ExtraAdder(),
    structlog.stdlib.PositionalArgumentsFormatter(),
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
    structlog.processors.UnicodeDecoder(),
    structlog.processors.CallsiteParameterAdder(
        {
            structlog.processors.CallsiteParameter.FILENAME,
            structlog.processors.CallsiteParameter.FUNC_NAME,
            structlog.processors.CallsiteParameter.LINENO,
        }
    ),
]


def init_logging() -> None:
    """Configure structlog and the root logger.

    - Log format: JSON if LOG_FORMAT=json, else human-readable text (dev format).
    - Log level from LOG_LEVEL env var (default DEBUG).
    """
    log_format_json = os.environ.get("LOG_FORMAT", "") == "json"

    log_level = os.environ.get("LOG_LEVEL", "DEBUG").upper()
    level = getattr(logging, log_level, logging.DEBUG)

    for noisy in (
        "aiohttp",
        "motor",
        "pymongo",
        "aiobotocore",
        "kubernetes_asyncio",
        "kubernetes",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    structlog.configure(
        processors=SHARED_PROCESSORS
        + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    if log_format_json:
        formatter = structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=SHARED_PROCESSORS,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.JSONRenderer(),
            ],
        )
    else:
        formatter = structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=SHARED_PROCESSORS,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.dev.ConsoleRenderer(colors=True),
            ],
        )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    btrix_logger = logging.getLogger("btrixcloud")
    btrix_logger.setLevel(level)
    btrix_logger.handlers.clear()
    btrix_logger.propagate = True

    # pylint: disable=no-member
    for name in list(logging.root.manager.loggerDict.keys()):
        if name.startswith(("uvicorn", "gunicorn")):
            lg = logging.getLogger(name)
            lg.handlers.clear()
            lg.propagate = True
