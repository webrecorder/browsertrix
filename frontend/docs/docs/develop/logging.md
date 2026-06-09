# Logging

Browsertrix's backend uses [structlog](https://www.structlog.org/) for handling structured logs. At the top of each file, you'll notice a `logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)` statement. Logs can then be emitted using `logger.debug()`, `logger.info()`, `logger.warning()`, `logger.error()`, and `logger.critical()`. `logger.exception()` is also available for handling exceptions.

Each log call should have a message that is `snake_case`d and be structured using keyword arguments to provide context about the log message, e.g. `logger.info("user_logged_in", user_id=123, username="browsertrix-user")`. The main message should never be interpolated — use keyword arguments to provide context instead.

Many log lines will include an `unstructured_message` keyword argument: this is a holdover from previous logging formats and should be avoided in new code — it's intended to allow for easier searching and filtering across logs spanning the previous `print`-based logs and the newer structured logs.
