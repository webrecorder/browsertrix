"""Structured logging configuration for Browsertrix backend.

Produces JSON to stdout in production (for Loki) and human-readable text in dev.

Keyword arguments passed to log calls become distinct JSON fields for searchability:

    logger.info("Updating collection %s", coll_id, coll_id=coll_id, oid=oid)
    # => {"message": "Updating collection abc123", "coll_id": "abc123", "oid": "..."}
"""

import json
import logging
import os
import sys
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from fastapi.responses import JSONResponse

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
oid_var: ContextVar[str] = ContextVar("oid", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")


def set_log_context(*, oid: str = "", user_id: str = "") -> None:
    """Set org and user context for the current request scope."""
    if oid:
        oid_var.set(str(oid))
    if user_id:
        user_id_var.set(str(user_id))


def clear_log_context() -> None:
    """Clear org and user context. Called by middleware after each request."""
    oid_var.set("")
    user_id_var.set("")


def create_request_logging_middleware(logger: logging.Logger):
    """Return an ASGI middleware that logs every request with
    method, path, status, duration, and request_id."""

    async def request_logging_middleware(request, call_next):
        request_id = uuid4().hex[:8]
        request_id_var.set(request_id)
        start_time = time.time()
        try:
            response = await call_next(request)
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "http_unhandled_exception",
                http_method=request.method,
                http_path=request.url.path,
            )
            response = JSONResponse(
                status_code=500, content={"detail": "internal_error"}
            )
        duration = time.time() - start_time
        logger.debug(
            "http_request",
            http_method=request.method,
            http_path=request.url.path,
            http_status=response.status_code,
            duration=duration,
        )
        request_id_var.set("")
        clear_log_context()
        return response

    return request_logging_middleware


class BtrixLogger(logging.Logger):
    """Logger subclass that routes keyword args into structured JSON fields."""

    _STANDARD_KWARGS = frozenset({"exc_info", "extra", "stack_info", "stacklevel"})

    # pylint: disable=too-many-arguments
    def _log(
        self,
        level,
        msg,
        args,
        exc_info=None,
        extra=None,
        stack_info=False,
        stacklevel=1,
        **kwargs,
    ):
        structured_fields = {
            k: v for k, v in kwargs.items() if k not in self._STANDARD_KWARGS
        }
        if structured_fields:
            if extra is None:
                extra = {}
            extra["btrix_extra"] = structured_fields
        super()._log(
            level,
            msg,
            args,
            exc_info=exc_info,
            extra=extra,
            stack_info=stack_info,
            stacklevel=stacklevel + 1,
        )


logging.setLoggerClass(BtrixLogger)


# pylint: disable=too-few-public-methods
class ContextFilter(logging.Filter):
    """Inject contextvar values into log records, unpack btrix_extra."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.oid = oid_var.get()
        record.user_id = user_id_var.get()
        btrix_extra = getattr(record, "btrix_extra", None)
        if btrix_extra:
            for key, value in btrix_extra.items():
                setattr(record, f"btrix_{key}", value)
        return True


def _json_default(obj):
    """Serialize non-JSON-native types used in structured log fields.

    Falls back to repr() for anything else so that log lines are never lost.
    """
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, set):
        return list(obj)
    return repr(obj)


class JSONFormatter(logging.Formatter):
    """Emit log records as flat JSON objects on stdout for Loki ingestion."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        for field in ("request_id", "oid", "user_id"):
            val = getattr(record, field, "")
            if val:
                log_entry[field] = val
        for attr_name, attr_value in record.__dict__.items():
            if attr_name.startswith("btrix_") and attr_name != "btrix_extra":
                log_entry[attr_name[6:]] = attr_value
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, default=_json_default)


DEV_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s"
)


class DevFormatter(logging.Formatter):
    """Dev formatter that renders structured kwargs alongside the message."""

    def format(self, record: logging.LogRecord) -> str:
        main_msg = record.getMessage()

        extra_parts = []
        for field in ("request_id", "oid", "user_id"):
            val = getattr(record, field, "")
            if val:
                extra_parts.append(f"{field}={val}")
        for attr_name, attr_value in sorted(record.__dict__.items()):
            if attr_name.startswith("btrix_") and attr_name != "btrix_extra":
                extra_parts.append(f"{attr_name[6:]}={attr_value}")

        if extra_parts:
            main_msg += "  " + " ".join(extra_parts)

        original_msg, original_args = record.msg, record.args
        record.msg, record.args = main_msg, ()
        try:
            formatted = super().format(record)
            return formatted.replace("\n", "\\n")
        finally:
            record.msg, record.args = original_msg, original_args


def init_logging() -> None:
    """Configure the 'btrixcloud' logger hierarchy.

    - LOG_FORMAT=json  → JSON to stdout.
    - LOG_FORMAT=text  → human-readable text to stdout (dev format).
    - unset            → auto: JSON if KUBERNETES_SERVICE_HOST is set, else dev.

    - Log level from LOG_LEVEL env var (default DEBUG).
    """
    log_format = os.environ.get("LOG_FORMAT", "")
    if log_format:
        is_prod = log_format == "json"
    else:
        is_prod = bool(os.environ.get("KUBERNETES_SERVICE_HOST"))

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

    btrix_logger = logging.getLogger("btrixcloud")
    btrix_logger.setLevel(level)
    btrix_logger.propagate = False

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(ContextFilter())

    if is_prod:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(DevFormatter(DEV_FORMAT, datefmt="%Y-%m-%d %H:%M:%S"))

    btrix_logger.handlers.clear()
    btrix_logger.addHandler(handler)
