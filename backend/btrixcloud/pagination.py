"""API pagination module

These classes override fastapi-pagination's max page size of 50
"""

from typing import TypeVar, Generic

from fastapi import Query

from fastapi_pagination.default import Page as BasePage, Params as BaseParams

T = TypeVar("T")


# pylint: disable=too-few-public-methods
class Params(BaseParams):
    """Custom Params class to increase page size"""

    size: int = Query(1_000, ge=1, le=2_000, description="Page size")


# pylint: disable=too-few-public-methods
class Page(BasePage[T], Generic[T]):
    """Custom Page class to implement Params"""

    __params_type__ = Params
