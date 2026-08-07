"""Unit tests for PageOps page-count idempotency"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from btrixcloud.pages import PageOps


class AsyncCursor:
    """Minimal async-iterable stand-in for a motor cursor"""

    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._docs:
            raise StopAsyncIteration
        return self._docs.pop(0)


@pytest.fixture
def page_ops():
    ops = PageOps(
        mdb=MagicMock(),
        crawl_ops=MagicMock(),
        org_ops=MagicMock(),
        storage_ops=MagicMock(),
        background_job_ops=MagicMock(),
        coll_ops=MagicMock(),
    )
    return ops


@pytest.mark.asyncio
async def test_recompute_sets_exact_counts(page_ops: PageOps):
    """Without a page list, counts are recomputed from the pages collection
    and $set (idempotent), not $inc'd"""
    page_ops.pages.find = lambda q: AsyncCursor(
        [
            {"isFile": True, "isError": False},
            {"isFile": True, "isError": True},
            {"isFile": False, "isError": True},
            {"isFile": False, "isError": False},
        ]
    )
    page_ops.crawls.find_one_and_update = AsyncMock()

    await page_ops.update_crawl_file_and_error_counts("crawl-1")

    page_ops.crawls.find_one_and_update.assert_awaited_once()
    args, _ = page_ops.crawls.find_one_and_update.call_args
    assert args[0] == {"_id": "crawl-1"}
    assert args[1] == {"$set": {"filePageCount": 2, "errorPageCount": 2}}


@pytest.mark.asyncio
async def test_all_duplicate_insert_does_not_raise_or_inc(page_ops: PageOps):
    """A batch that is entirely duplicates (a re-run) must not raise and must
    not touch counts - reconciliation happens via the idempotent recompute"""
    insert_result = MagicMock()
    insert_result.inserted_ids = []
    page_ops.pages.insert_many = AsyncMock(return_value=insert_result)
    page_ops.crawls.find_one_and_update = AsyncMock()

    page = MagicMock()
    page.to_dict = lambda **kwargs: {"_id": "p1"}
    # Must not raise
    await page_ops._add_pages_to_db("crawl-1", [page], ordered=False)

    page_ops.crawls.find_one_and_update.assert_not_awaited()
