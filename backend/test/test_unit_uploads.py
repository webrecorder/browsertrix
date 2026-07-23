"""Unit tests for UploadOps.retry_stuck_uploads"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from btrixcloud.uploads import STUCK_UPLOAD_GRACE_PERIOD, UploadOps


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
def upload_ops():
    """UploadOps with all dependencies mocked"""
    ops = UploadOps(
        mdb=MagicMock(),
        users=MagicMock(),
        orgs=MagicMock(),
        crawl_configs=MagicMock(),
        colls=MagicMock(),
        storage_ops=MagicMock(),
        event_webhook_ops=MagicMock(),
        background_job_ops=MagicMock(),
        crawl_log_ops=MagicMock(),
    )
    ops.background_job_ops.crawl_manager.has_job = AsyncMock(return_value=False)
    ops.background_job_ops.jobs.find_one = AsyncMock(return_value=None)
    ops.background_job_ops.create_postprocess_upload_job = AsyncMock(
        return_value="job-id"
    )
    return ops


def make_upload(crawl_id: str):
    return {
        "_id": crawl_id,
        "oid": uuid4(),
        "type": "upload",
        "state": "processing-upload",
        "started": datetime.now(UTC) - timedelta(hours=1),
    }


def set_stuck_uploads(ops, docs):
    """Configure crawls.find to return the given docs, capturing the query"""
    queries = []

    def find(query):
        queries.append(query)
        return AsyncCursor(list(docs))

    ops.crawls.find = find
    return queries


@pytest.mark.asyncio
async def test_dispatches_job_when_no_job_exists(upload_ops):
    """Stuck upload with no k8s job and no job record gets a fresh job"""
    upload = make_upload("upload-abc")
    set_stuck_uploads(upload_ops, [upload])

    await upload_ops.retry_stuck_uploads()

    upload_ops.background_job_ops.create_postprocess_upload_job.assert_awaited_once_with(
        upload["oid"],
        "upload-abc",
        existing_job_id=None,
    )


@pytest.mark.asyncio
async def test_skips_upload_with_running_k8s_job(upload_ops):
    """Stuck upload with an existing k8s job is left alone"""
    set_stuck_uploads(upload_ops, [make_upload("upload-abc")])
    upload_ops.background_job_ops.crawl_manager.has_job = AsyncMock(
        return_value=True
    )

    await upload_ops.retry_stuck_uploads()

    upload_ops.background_job_ops.crawl_manager.has_job.assert_awaited_once_with(
        "postprocess-upload-upload-abc"
    )
    upload_ops.background_job_ops.create_postprocess_upload_job.assert_not_awaited()


@pytest.mark.asyncio
async def test_redispatches_with_existing_job_id_when_record_exists(upload_ops):
    """Stuck upload with a job record but no k8s job is redispatched,
    reusing the job id to preserve attempt history"""
    upload = make_upload("upload-abc")
    set_stuck_uploads(upload_ops, [upload])
    upload_ops.background_job_ops.jobs.find_one = AsyncMock(
        return_value={"_id": "postprocess-upload-upload-abc", "finished": None}
    )

    await upload_ops.retry_stuck_uploads()

    upload_ops.background_job_ops.create_postprocess_upload_job.assert_awaited_once_with(
        upload["oid"],
        "upload-abc",
        existing_job_id="postprocess-upload-upload-abc",
    )


@pytest.mark.asyncio
async def test_query_scopes_to_stuck_processing_uploads(upload_ops):
    """Query only matches non-deleted uploads in processing past the grace period"""
    queries = set_stuck_uploads(upload_ops, [])
    before = datetime.now(UTC) - STUCK_UPLOAD_GRACE_PERIOD

    await upload_ops.retry_stuck_uploads()

    after = datetime.now(UTC) - STUCK_UPLOAD_GRACE_PERIOD
    assert len(queries) == 1
    query = queries[0]
    assert query["type"] == "upload"
    assert query["state"] == "processing-upload"
    assert query["deleted"] == {"$ne": True}
    cutoff = query["started"]["$lt"]
    # dt_now() truncates to whole seconds, so allow a second of slack
    assert before - timedelta(seconds=1) <= cutoff <= after
