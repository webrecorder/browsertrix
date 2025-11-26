"""k8s utils"""

import asyncio
import csv
import io
import json
import signal
import os
import sys
import re
import math

from datetime import datetime, timezone
from typing import Optional, Dict, Union, List, Any
from urllib.parse import urlparse
from uuid import UUID

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from iso639 import is_language
from pymongo.collation import Collation
from pymongo.errors import DuplicateKeyError
from slugify import slugify


default_origin = os.environ.get("APP_ORIGIN", "")

browsers_per_pod = int(os.environ.get("NUM_BROWSERS", 1))

case_insensitive_collation = Collation(locale="en", strength=1)


class JSONSerializer(json.JSONEncoder):
    """Serializer class for json.dumps with UUID and datetime support"""

    def default(self, o: Any) -> str:
        """JSON serialization conversion function."""

        if isinstance(o, UUID):
            return str(o)

        if isinstance(o, datetime):
            return date_to_str(o)

        return super().default(o)


def get_templates_dir() -> str:
    """return directory containing templates for loading"""
    return os.path.join(os.path.dirname(__file__), "templates")


def str_to_date(string: str) -> Optional[datetime]:
    """convert k8s date string to datetime"""
    return datetime.fromisoformat(string) if string else None


def date_to_str(dt_val: datetime) -> str:
    """convert date to isostring with "Z" """
    return dt_val.isoformat().replace("+00:00", "Z")


def dt_now() -> datetime:
    """get current ts"""
    return datetime.now(timezone.utc).replace(microsecond=0)


def register_exit_handler() -> None:
    """register exit handler to exit on SIGTERM"""
    loop = asyncio.get_running_loop()

    def exit_handler():
        """sigterm handler"""
        print("SIGTERM received, exiting")
        sys.exit(1)

    loop.add_signal_handler(signal.SIGTERM, exit_handler)


def parse_jsonl_log_messages(log_lines: list[str]) -> list[dict]:
    """parse json-l error strings from redis/db into json"""
    parsed_log_lines = []
    for log_line in log_lines:
        if not log_line:
            continue
        try:
            result = json.loads(log_line)
            parsed_log_lines.append(result)
        except json.JSONDecodeError as err:
            print(
                f"Error decoding json-l log line: {log_line}. Error: {err}",
                flush=True,
            )
    return parsed_log_lines


def is_bool(stri: Optional[str]) -> bool:
    """Check if the string parameter is stringly true"""
    if stri:
        return stri.lower() in ("true", "1", "yes", "on")
    return False


def is_falsy_bool(stri: Optional[str]) -> bool:
    """Check if the string parameter is stringly false"""
    if stri:
        return stri.lower() in ("false", "0", "no", "off")
    return False


def is_url(url: str) -> bool:
    """Check if string is a valid URL"""
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except ValueError:
        return False


def str_list_to_bools(str_list: List[str], allow_none=True) -> List[Union[bool, None]]:
    """Return version of input string list cast to bool or None, ignoring other values"""
    output: List[Union[bool, None]] = []
    for val in str_list:
        if is_bool(val):
            output.append(True)
        if is_falsy_bool(val):
            output.append(False)
        if val.lower() in ("none", "null") and allow_none:
            output.append(None)
    return output


def slug_from_name(name: str) -> str:
    """Generate slug from name"""
    return slugify(name.replace("'", ""))


def validate_slug(slug: str) -> None:
    """Validate org slug, raise HTTPException if invalid

    Slugs must contain alphanumeric characters and dashes (-) only.
    """
    if re.match(r"^[\w-]+$", slug) is None:
        raise HTTPException(status_code=400, detail="invalid_slug")


def stream_dict_list_as_csv(
    data: List[Dict[str, Union[str, int]]], filename: str
) -> StreamingResponse:
    """Stream list of dictionaries as CSV with attachment filename header"""
    if not data:
        raise HTTPException(status_code=404, detail="crawls_not_found")

    keys = data[0].keys()

    buffer = io.StringIO()
    dict_writer = csv.DictWriter(buffer, keys, quoting=csv.QUOTE_NONNUMERIC)
    dict_writer.writeheader()
    dict_writer.writerows(data)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"},
    )


def get_duplicate_key_error_field(err: DuplicateKeyError) -> str:
    """Get name of duplicate field from pymongo DuplicateKeyError"""
    allowed_fields = ("name", "slug", "subscription.subId")

    if err.details:
        key_value = err.details.get("keyValue")
        if key_value:
            for field in key_value.keys():
                if field in allowed_fields:
                    return field

    return "name"


def get_origin(headers) -> str:
    """Return origin of the received request"""
    if not headers:
        return default_origin

    scheme = headers.get("x-forwarded-proto")
    host = headers.get("host")
    if not scheme or not host:
        return default_origin

    return scheme + "://" + host


def validate_regexes(regexes: List[str]):
    """Validate regular expressions, raise HTTPException if invalid"""
    for regex in regexes:
        try:
            re.compile(regex)
        except re.error:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=400, detail="invalid_regex")


def validate_language_code(lang: str):
    """Validate ISO-639-1 language code, raise HTTPException if invalid"""
    if not is_language(lang, "pt1"):
        raise HTTPException(status_code=400, detail="invalid_lang")


def scale_from_browser_windows(
    browser_windows: int, custom_browsers_per_pod=None
) -> int:
    """Return number of pods for given number of browser windows"""
    return math.ceil(browser_windows / (custom_browsers_per_pod or browsers_per_pod))


def browser_windows_from_scale(scale: int) -> int:
    """Return number of browser windows from specified scale"""
    return scale * browsers_per_pod
