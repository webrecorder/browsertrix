"""Validation for crawl storage filename templates.

Crawl workflows may customize the filename template used for archived
files. This module validates that a template can be safely used as an S3
object key before it is stored.
"""

import re

from .db import is_lenient_read

# Filename templates are used to generate S3 object keys, so any characters
# that are valid in an S3 key are allowed, except control characters
# (including line breaks). The crawler's @-placeholders (@ts, @hostname,
# @hostsuffix, @id) are plain characters and need no special handling.
CRAWL_FILENAME_TEMPLATE_RE = re.compile(r"^[^\x00-\x1f\x7f-\x9f]+$")


def validate_crawl_filename_template(value: str | None) -> str | None:
    """Validate that a crawl filename template is a usable S3 object key.

    Any characters that can be stored in an S3-compatible bucket are
    allowed; only control characters (newlines, tabs, etc.) are rejected.
    Relative path components are allowed, but not path traversal ('.'/'..'
    components or a leading '/').

    Non-string values are not validated here - they are rejected by the
    field's own type validation.
    """
    if not isinstance(value, str) or is_lenient_read() or value == "":
        # non-string values are rejected by the field's own type validation;
        # empty templates and lenient DB reads are left unchanged
        return value
    # keep filenames below 768 characters (s3 key limit is 1024 bytes, but
    # we only allow 768 to account for other parts of the path)
    if len(value) > 768 or not CRAWL_FILENAME_TEMPLATE_RE.match(value):
        raise ValueError("invalid crawl filename template")
    # reject path traversal: no absolute paths, no '.'/'..' path components
    if value.startswith("/") or any(part in (".", "..") for part in value.split("/")):
        raise ValueError("invalid crawl filename template")
    return value
