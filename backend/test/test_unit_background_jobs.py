"""Unit tests for background job type dispatch exhaustiveness"""

import uuid
from datetime import UTC, datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from kubernetes_asyncio.client.exceptions import ApiException
from kubernetes_asyncio.utils.create_from_yaml import FailToCreateError

from btrixcloud.background_jobs import BackgroundJobOps
from btrixcloud.models import (
    BgJobType,
    CleanupSeedFilesJob,
    CreateReplicaJob,
    DeleteOrgJob,
    DeleteReplicaJob,
    OptimizePagesJob,
    PostProcessUploadJob,
    ReAddOrgPagesJob,
    RecalculateOrgStatsJob,
    RetryStuckUploadsJob,
    UpdateCollStatsJob,
)

JOB_TYPE_TO_CLASS = {
    BgJobType.CREATE_REPLICA: CreateReplicaJob,
    BgJobType.DELETE_REPLICA: DeleteReplicaJob,
    BgJobType.DELETE_ORG: DeleteOrgJob,
    BgJobType.RECALCULATE_ORG_STATS: RecalculateOrgStatsJob,
    BgJobType.READD_ORG_PAGES: ReAddOrgPagesJob,
    BgJobType.OPTIMIZE_PAGES: OptimizePagesJob,
    BgJobType.CLEANUP_SEED_FILES: CleanupSeedFilesJob,
    BgJobType.UPDATE_COLL_STATS: UpdateCollStatsJob,
    BgJobType.POSTPROCESS_UPLOAD: PostProcessUploadJob,
    BgJobType.RETRY_STUCK_UPLOADS: RetryStuckUploadsJob,
}

_TYPE_EXTRAS = {
    BgJobType.CREATE_REPLICA: {
        "file_path": "/test/path",
        "object_type": "crawl",
        "object_id": "test-object",
        "replica_storage": {"name": "test-storage"},
    },
    BgJobType.DELETE_REPLICA: {
        "file_path": "/test/path",
        "object_type": "crawl",
        "object_id": "test-object",
        "replica_storage": {"name": "test-storage"},
    },
}


@pytest.fixture
def bg_job_ops():
    return BackgroundJobOps(
        mdb=MagicMock(),
        email=MagicMock(),
        user_manager=MagicMock(),
        org_ops=MagicMock(),
        crawl_manager=MagicMock(),
        storage_ops=MagicMock(),
    )


def test_mapping_covers_all_enum_members():
    assert set(JOB_TYPE_TO_CLASS.keys()) == set(BgJobType), (
        f"Missing mapping for: {set(BgJobType) - set(JOB_TYPE_TO_CLASS.keys())}"
    )


def test_get_job_by_type_maps_all_enum_values(bg_job_ops):
    _id = str(uuid.uuid4())
    started = datetime.now(UTC)
    oid = str(uuid.uuid4())
    collection_id = str(uuid.uuid4())
    crawl_id = "test-crawl-id"

    type_extras = dict(_TYPE_EXTRAS)
    type_extras.update(
        {
            BgJobType.UPDATE_COLL_STATS: {
                "oid": oid,
                "collection_id": collection_id,
            },
            BgJobType.POSTPROCESS_UPLOAD: {
                "oid": oid,
                "crawl_id": crawl_id,
            },
        }
    )

    for member in BgJobType:
        data = {
            "_id": _id,
            "type": member.value,
            "started": started,
            **type_extras.get(member, {}),
        }
        result = bg_job_ops._get_job_by_type_from_data(data)
        expected_cls = JOB_TYPE_TO_CLASS[member]
        assert isinstance(result, expected_cls), (
            f"Expected {expected_cls.__name__}, got {type(result).__name__} "
            f"for type {member.value}"
        )
        assert result.type == member


def test_unknown_type_raises(bg_job_ops):
    _id = str(uuid.uuid4())
    started = datetime.now(UTC)
    data = {"_id": _id, "type": "nonexistent-type", "started": started}

    with pytest.raises(ValueError, match="Unhandled background job type"):
        bg_job_ops._get_job_by_type_from_data(data)


@pytest.mark.asyncio
async def test_postprocess_upload_job_conflict_treated_as_success(bg_job_ops):
    """A 409 conflict on job creation means the job already exists and will
    do the work - return the job id rather than failing"""
    bg_job_ops.crawl_manager.run_postprocess_upload_job = AsyncMock(
        side_effect=FailToCreateError([ApiException(status=409)])
    )

    oid = uuid.uuid4()
    crawl_id = "upload-test-crawl"

    # Fresh dispatch: returns the deterministic job id
    job_id = await bg_job_ops.create_postprocess_upload_job(oid, crawl_id)
    assert job_id == f"postprocess-upload-{crawl_id}"

    # Retry dispatch: returns the existing job id
    existing = f"postprocess-upload-{crawl_id}"
    job_id = await bg_job_ops.create_postprocess_upload_job(
        oid, crawl_id, existing_job_id=existing
    )
    assert job_id == existing

    # The winning creator owns the database record - we must not touch it
    bg_job_ops.jobs.find_one_and_update.assert_not_called()


@pytest.mark.asyncio
async def test_postprocess_upload_job_other_create_failure_returns_none(bg_job_ops):
    """A non-conflict creation failure still returns None"""
    bg_job_ops.crawl_manager.run_postprocess_upload_job = AsyncMock(
        side_effect=FailToCreateError([ApiException(status=500)])
    )

    job_id = await bg_job_ops.create_postprocess_upload_job(
        uuid.uuid4(), "upload-test-crawl"
    )
    assert job_id is None
