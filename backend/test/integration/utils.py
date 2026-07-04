"""Test utilities."""

import ast


def read_in_chunks(fh, blocksize=1024):
    """Lazy function (generator) to read a file piece by piece.
    Default chunk size: 1k."""
    while True:
        data = fh.read(blocksize)
        if not data:
            break
        yield data


def _get_log_event(caplog, event_name: str):
    """Find a structlog record by event name and return its parsed data dict."""
    for record in caplog.records:
        if event_name in record.getMessage():
            try:
                return record, ast.literal_eval(record.getMessage())
            except (ValueError, SyntaxError):
                pass
    return None, {}
