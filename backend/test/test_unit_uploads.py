"""Unit tests for UploadOps.retry_stuck_uploads"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from btrixcloud.models import DeleteCrawlList
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
    upload_ops.background_job_ops.crawl_manager.has_job = AsyncMock(return_value=True)

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
async def test_raises_when_dispatch_fails(upload_ops):
    """If dispatching fails and no job exists, the run fails loudly"""
    set_stuck_uploads(upload_ops, [make_upload("upload-abc")])
    upload_ops.background_job_ops.create_postprocess_upload_job = AsyncMock(
        return_value=None
    )

    with pytest.raises(RuntimeError, match="1 stuck upload"):
        await upload_ops.retry_stuck_uploads()


@pytest.mark.asyncio
async def test_no_raise_when_dispatch_loses_race(upload_ops):
    """If dispatching returns None but the job now exists, another creator
    won the race, so not a failure"""
    set_stuck_uploads(upload_ops, [make_upload("upload-abc")])
    upload_ops.background_job_ops.create_postprocess_upload_job = AsyncMock(
        return_value=None
    )
    # First call: initial running-job check; second: post-dispatch re-check
    upload_ops.background_job_ops.crawl_manager.has_job = AsyncMock(
        side_effect=[False, True]
    )

    await upload_ops.retry_stuck_uploads()


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


def make_crawl(userid):
    """Fake crawl with the fields that delete_crawls reads"""
    return SimpleNamespace(
        id="upload-abc",
        type="upload",
        userid=userid,
        files=[],
        cid=None,
        state="complete",
        collectionIds=None,
    )


@pytest.mark.asyncio
async def test_delete_crawls_unauthorized_does_not_mark_deleted(upload_ops: UploadOps):
    """A 403 delete attempt must not set the deleted marker, which would
    otherwise abort upload post-processing, which relies on the current files"""
    org = SimpleNamespace(id=uuid4(), is_owner=lambda u: False)
    upload_ops.get_base_crawl = AsyncMock(return_value=make_crawl(userid=uuid4()))
    upload_ops.crawls.find_one_and_update = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await upload_ops.delete_crawls(
            org,
            DeleteCrawlList(crawl_ids=["upload-abc"]),
            "upload",
            user=MagicMock(id=uuid4()),
        )

    assert exc_info.value.status_code == 403
    upload_ops.crawls.find_one_and_update.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_crawls_owner_marks_deleted(upload_ops: UploadOps):
    """Delete sets the deleted marker before files are removed"""
    org = SimpleNamespace(id=uuid4(), is_owner=lambda u: True)
    upload_ops.get_base_crawl = AsyncMock(return_value=make_crawl(userid=uuid4()))
    upload_ops.crawls.find_one_and_update = AsyncMock()
    upload_ops.crawls.delete_many = AsyncMock(
        return_value=SimpleNamespace(deleted_count=1)
    )
    upload_ops.page_ops = SimpleNamespace(delete_crawl_pages=AsyncMock())
    upload_ops.crawl_log_ops.delete_crawl_logs = AsyncMock()
    upload_ops._delete_crawl_files = AsyncMock(return_value=(0, []))
    upload_ops.orgs.inc_org_bytes_stored = AsyncMock()
    upload_ops.orgs.set_last_crawl_finished = AsyncMock()
    upload_ops.orgs.storage_quota_reached = MagicMock(return_value=False)
    upload_ops.event_webhook_ops.create_upload_deleted_notification = AsyncMock()

    await upload_ops.delete_crawls(
        org, DeleteCrawlList(crawl_ids=["upload-abc"]), "upload"
    )

    upload_ops.crawls.find_one_and_update.assert_awaited_once_with(
        {"_id": "upload-abc", "oid": org.id, "type": "upload"},
        {"$set": {"deleted": True}},
    )


@pytest.mark.asyncio
async def test_upload_stream_rejects_replace_while_processing(upload_ops: UploadOps):
    """Replacing an upload whose post-processing job is still running would
    delete its files out from under the job, so it should fail"""
    org = SimpleNamespace(id=uuid4(), storage=MagicMock())
    upload_ops.get_upload = AsyncMock(
        return_value=SimpleNamespace(state="processing-upload")
    )

    with pytest.raises(HTTPException) as exc_info:
        await upload_ops.upload_stream(
            AsyncMock(),
            "test.wacz",
            None,
            None,
            None,
            None,
            org,
            MagicMock(),
            "upload-abc",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "upload_still_processing"


@pytest.mark.asyncio
async def test_upload_stream_allows_replace_when_finished(upload_ops: UploadOps):
    """A fully processed upload can be replaced, reusing its id"""
    org = SimpleNamespace(id=uuid4(), storage=MagicMock())
    upload_ops.get_upload = AsyncMock(
        return_value=SimpleNamespace(
            id="upload-abc", state="complete", files=[], storage=MagicMock()
        )
    )
    upload_ops.storage_ops.do_upload_multipart = AsyncMock(return_value=True)
    upload_ops.page_ops = SimpleNamespace(delete_crawl_pages=AsyncMock())
    upload_ops._create_upload = AsyncMock(
        return_value={"id": "upload-abc", "added": True}
    )

    with patch("btrixcloud.uploads.FilePreparer") as fp:
        fp.return_value.upload_name = "uploads/x/test-abc.wacz"
        fp.return_value.get_crawl_file.return_value = SimpleNamespace(
            filename="uploads/x/test-abc.wacz", hash="abc", size=10
        )

        result = await upload_ops.upload_stream(
            AsyncMock(),
            "test.wacz",
            None,
            None,
            None,
            None,
            org,
            MagicMock(),
            "upload-abc",
        )

    assert result["id"] == "upload-abc"
    upload_ops._create_upload.assert_awaited_once()
    # the id is reused for the replacement upload
    assert upload_ops._create_upload.call_args[0][5] == "upload-abc"


def setup_split(upload_ops: UploadOps, find_result: dict | None):
    """Configure mocks for a _split_multiwacz run with one child.

    find_result: value returned by crawls.find_one_and_update (None = split
    not applied, i.e. crawl deleted or already split).
    """

    org = SimpleNamespace(
        id=uuid4(),
        storage=MagicMock(),
        quotas=SimpleNamespace(storageQuota=0),
        bytesStored=0,
    )

    original = SimpleNamespace(filename="uploads/x/original.wacz", size=100)
    child = SimpleNamespace(filename="child.wacz", file_size=60, size=60)

    upload_ops.storage_ops.do_upload_multipart = AsyncMock(return_value=True)
    upload_ops.storage_ops.delete_file_object = AsyncMock(return_value=True)
    upload_ops.storage_ops.get_presigned_url = AsyncMock(
        return_value=("http://presigned.example/upload", None)
    )
    upload_ops.presigned_urls.delete_one = AsyncMock()
    upload_ops.background_job_ops.create_delete_replica_jobs = AsyncMock(
        return_value={"added": True, "ids": []}
    )
    upload_ops.crawls.find_one_and_update = AsyncMock(return_value=find_result)
    upload_ops.orgs.inc_org_bytes_stored = AsyncMock()

    crawl_file = SimpleNamespace(
        filename="uploads/x/child-abc.wacz",
        size=60,
        hash="abc123",
        model_dump=lambda: {"filename": "uploads/x/child-abc.wacz", "size": 60},
    )
    return org, original, child, crawl_file


async def run_split(upload_ops: UploadOps, find_result: dict | None):
    """Run _split_multiwacz with storage/zip/fileprep mocked out"""

    org, original, child, crawl_file = setup_split(upload_ops, find_result)

    with (
        patch("btrixcloud.uploads.FilePreparer") as fp,
        patch("btrixcloud.uploads.RemoteZip"),
    ):
        fp.return_value.upload_name = "uploads/x/child-abc.wacz"
        fp.return_value.get_crawl_file.return_value = crawl_file
        fp.return_value.add_chunk = lambda b: None
        await upload_ops._split_multiwacz(
            "x", org, "http://example/orig.wacz", [child], original
        )
    return original


@pytest.mark.asyncio
async def test_split_query_requires_original_present(upload_ops: UploadOps):
    """The split update only matches if the original file is still in files,
    so a stale retry does not re-apply the split or its size diff"""
    original = await run_split(upload_ops, find_result={"_id": "x"})

    query = upload_ops.crawls.find_one_and_update.call_args[0][0]
    assert query["files.filename"] == original.filename
    assert query["_id"] == "x"


@pytest.mark.asyncio
async def test_split_stale_retry_does_not_inc_org_bytes(upload_ops: UploadOps):
    """When the split is not applied (find_one_and_update returns None because
    the original is already gone), org bytes stored must NOT be incremented"""
    await run_split(upload_ops, find_result=None)

    upload_ops.orgs.inc_org_bytes_stored.assert_not_awaited()


@pytest.mark.asyncio
async def test_split_refreshes_presigned_url_before_child_upload(
    upload_ops: UploadOps,
):
    """The parent's presigned URL is re-signed before each child download so
    a split that outlasts the URL lifetime can still complete"""
    org, original, child, crawl_file = setup_split(upload_ops, find_result={"_id": "x"})

    with (
        patch("btrixcloud.uploads.FilePreparer") as fp,
        patch("btrixcloud.uploads.RemoteZip"),
    ):
        fp.return_value.upload_name = "uploads/x/child-abc.wacz"
        fp.return_value.get_crawl_file.return_value = crawl_file
        fp.return_value.add_chunk = lambda b: None
        await upload_ops._split_multiwacz(
            "x", org, "http://example/orig.wacz", [child], original
        )

    upload_ops.storage_ops.get_presigned_url.assert_awaited_once_with(
        org, original, force_update=True
    )
