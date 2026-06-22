"""Unit tests for background job type dispatch exhaustiveness"""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

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
    started = datetime.now(timezone.utc)
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
    started = datetime.now(timezone.utc)
    data = {"_id": _id, "type": "nonexistent-type", "started": started}

    with pytest.raises(ValueError, match="Unhandled background job type"):
        bg_job_ops._get_job_by_type_from_data(data)
