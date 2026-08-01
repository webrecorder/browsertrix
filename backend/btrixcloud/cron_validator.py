"""Validation for cron schedule expressions.

Crawl workflows may define a schedule for scheduled crawls. This module
validates that a schedule is a well-formed cron expression before it is
stored.
"""

import re

from .db import is_lenient_read

# value ranges per position: seconds, minutes, hours, day-of-month, month,
# day-of-week (0 and 7 both mean Sunday)
CRON_FIELD_RANGES = (
    (0, 59),
    (0, 59),
    (0, 23),
    (1, 31),
    (1, 12),
    (0, 7),
)

CRON_MONTH_NAMES = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}

CRON_DOW_NAMES = {
    "SUN": 0,
    "MON": 1,
    "TUE": 2,
    "WED": 3,
    "THU": 4,
    "FRI": 5,
    "SAT": 6,
}

# @ descriptors supported by Kubernetes CronJobs (robfig/cron v3)
CRON_DESCRIPTORS = frozenset(
    {
        "@yearly",
        "@annually",
        "@monthly",
        "@weekly",
        "@daily",
        "@midnight",
        "@hourly",
    }
)

# duration grammar for the '@every <duration>' descriptor (Go time.ParseDuration)
CRON_EVERY_DURATION_RE = re.compile(r"^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$")


def _cron_value_in_range(value: str, lo: int, hi: int, names: dict[str, int]) -> bool:
    """Return True if value is a number or 3-letter name within [lo, hi]"""
    if value in names:
        return lo <= names[value] <= hi
    return value.isdigit() and lo <= int(value) <= hi


def _validate_cron_base(base: str, lo: int, hi: int, names: dict[str, int]) -> bool:
    """Validate a cron field item: '*', a single value, or a range a-b"""
    if base == "*":
        return True
    if "-" in base:
        start, _, end = base.partition("-")
        return _cron_value_in_range(start, lo, hi, names) and _cron_value_in_range(
            end, lo, hi, names
        )
    return _cron_value_in_range(base, lo, hi, names)


def _validate_cron_item(item: str, lo: int, hi: int, names: dict[str, int]) -> bool:
    """Validate a comma-separated cron field item, incl. '/step' suffixes"""
    if "/" in item:
        base, _, step = item.partition("/")
        if not step.isdigit() or int(step) < 1:
            return False
        return _validate_cron_base(base, lo, hi, names)
    return _validate_cron_base(item, lo, hi, names)


def _validate_cron_field(
    field: str, lo: int, hi: int, names: dict[str, int], allow_question: bool
) -> bool:
    """Validate a single cron field (a comma-separated list of items)"""
    if allow_question and field == "?":
        return True
    if field == "*":
        return True
    return all(_validate_cron_item(item, lo, hi, names) for item in field.split(","))


def _validate_cron_descriptor(schedule: str) -> bool:
    """Return True if schedule is a valid '@' descriptor (e.g. @daily, @every 5m)"""
    if schedule in CRON_DESCRIPTORS:
        return True
    if schedule.startswith("@every "):
        duration = schedule[len("@every ") :]
        return bool(duration and CRON_EVERY_DURATION_RE.match(duration))
    return False


def validate_cron_schedule(value: str | None) -> str | None:
    """Validate that a crawl schedule is a well-formed cron expression.

    Supports the vixie-cron grammar (5 or 6 fields, ranges, lists, step
    values and 3-letter month/day names) and the '@' descriptors (@daily,
    @hourly, @every ..., ...) supported by Kubernetes CronJobs.

    Non-string values are not validated here - they are rejected by the
    field's own type validation.
    """
    if not isinstance(value, str) or is_lenient_read() or value == "":
        # non-string values are rejected by the field's own type validation;
        # empty schedules and lenient DB reads are left unchanged
        return value
    if len(value) > 100:
        raise ValueError("invalid cron schedule")
    if "\n" in value or "\r" in value:
        raise ValueError("invalid cron schedule")
    schedule = value.strip()
    if schedule.startswith("@"):
        if not _validate_cron_descriptor(schedule):
            raise ValueError("invalid cron schedule")
        return value
    fields = schedule.split()
    if len(fields) not in (5, 6):
        raise ValueError("invalid cron schedule: expected 5 or 6 fields")
    ranges = CRON_FIELD_RANGES[-len(fields) :]
    dom_idx = len(fields) - 3
    month_idx = len(fields) - 2
    dow_idx = len(fields) - 1
    for i, field in enumerate(fields):
        lo, hi = ranges[i]
        if i == month_idx:
            names = CRON_MONTH_NAMES
        elif i == dow_idx:
            names = CRON_DOW_NAMES
        else:
            names = {}
        # '?' is only valid in the day-of-month / day-of-week fields
        allow_question = i in (dom_idx, dow_idx)
        if not _validate_cron_field(field, lo, hi, names, allow_question):
            raise ValueError("invalid cron schedule")
    return value
