from typing import Any

INFO: int
WARNING: int
DEBUG: int
ERROR: int
CRITICAL: int

NOTSET: int

class LogRecord:
    exc_info: Any
    levelname: str
    name: str
    funcName: str
    lineno: int
    module: str
    created: float
    msecs: float
    relativeCreated: float
    thread: int
    threadName: str
    process: int
    processName: str
    msg: object
    args: Any
    pathname: str
    filename: str
    stack_info: str | None
    request_id: str
    oid: str
    user_id: str
    def getMessage(self) -> str: ...

class Filter:
    def filter(self, record: LogRecord) -> bool: ...

class Formatter:
    def __init__(self, fmt: str | None = ..., *, datefmt: str | None = ...) -> None: ...
    def format(self, record: LogRecord) -> str: ...
    def formatException(self, ei: Any) -> str: ...

class Handler:
    def addFilter(self, filter: Filter) -> None: ...  # noqa: A002
    def setFormatter(self, fmt: Formatter) -> None: ...
    def setLevel(self, level: int) -> None: ...

class StreamHandler(Handler):
    def __init__(self, stream: Any = ...) -> None: ...

class Logger:
    propagate: bool
    handlers: list[Handler]
    name: str

    def setLevel(self, level: int) -> None: ...
    def addHandler(self, hdlr: Handler) -> None: ...

    # We want to use kwargs for named parameters that we'll then include in the
    # log JSON, but mypy isn't natively aware that we're using a custom logger
    # class that supports arbitrary kwargs. This overrides the default types for
    # logging methods to allow arbitrary kwargs.
    def info(self, msg: object, *args: object, **kwargs: Any) -> None: ...
    def warning(self, msg: object, *args: object, **kwargs: Any) -> None: ...
    def error(self, msg: object, *args: object, **kwargs: Any) -> None: ...
    def debug(self, msg: object, *args: object, **kwargs: Any) -> None: ...
    def critical(self, msg: object, *args: object, **kwargs: Any) -> None: ...
    def exception(self, msg: object, *args: object, **kwargs: Any) -> None: ...
    def log(self, level: int, msg: object, *args: object, **kwargs: Any) -> None: ...
    def getEffectiveLevel(self) -> int: ...
    def _log(
        self,
        level: int,
        msg: object,
        args: Any,
        exc_info: Any = ...,
        extra: Any = ...,
        stack_info: bool = ...,
        stacklevel: int = ...,
        **kwargs: Any,
    ) -> None: ...

def getLogger(name: str | None = ...) -> Logger: ...
def setLoggerClass(klass: type[Logger]) -> None: ...
def basicConfig(**kwargs: Any) -> None: ...
