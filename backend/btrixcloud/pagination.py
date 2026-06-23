"""API pagination"""

from typing import TypedDict

DEFAULT_PAGE_SIZE = 1_000


class PaginatedResponse[T](TypedDict):
    """Paginated response type."""

    items: list[T] | None
    total: int
    page: int
    pageSize: int


# ============================================================================
def paginated_format[T](
    items: list[T] | None,
    total: int,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> PaginatedResponse[T]:
    """Return items in paged format."""
    return {"items": items, "total": total, "page": page, "pageSize": page_size}
