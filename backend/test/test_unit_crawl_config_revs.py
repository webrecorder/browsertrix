"""Unit tests for org-scoping of crawl config revision lookups.

Regression tests for the cross-org raw config disclosure via
GET /orgs/{oid}/crawlconfigs/{cid}/revs: revision history must only be
returned when the crawl config belongs to the requesting org.
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, mock_open, patch

import pytest
from fastapi import HTTPException

from btrixcloud.crawlconfigs import CrawlConfigOps


def _matches(doc: dict, query: dict) -> bool:
    """Match a doc against a simple equality query, supporting $in."""
    for key, value in query.items():
        doc_val = doc.get(key)
        if isinstance(value, dict) and "$in" in value:
            if doc_val not in value["$in"]:
                return False
        elif doc_val != value:
            return False
    return True


class _Cursor:
    """Minimal async-iterable cursor with motor's to_list()."""

    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        async def gen():
            for doc in self._docs:
                yield doc

        return gen()

    async def to_list(self, length=None):
        return list(self._docs)


class FakeCollection:
    """Minimal fake for a mongo collection supporting the queries used here."""

    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query):
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    async def count_documents(self, query):
        return sum(1 for doc in self.docs if _matches(doc, query))

    def find(self, query, **kwargs):
        return _Cursor([dict(doc) for doc in self.docs if _matches(doc, query)])


class FakeMDB:
    """Minimal fake for the motor mdb object."""

    def __init__(self, crawl_configs, config_revs):
        self._crawl_configs = crawl_configs
        self._config_revs = config_revs

    def __getitem__(self, name):
        if name == "crawl_configs":
            return self._crawl_configs
        if name == "configs_revs":
            return self._config_revs
        return FakeCollection([])


@pytest.fixture
def crawl_config_ops(monkeypatch):
    """CrawlConfigOps backed by fake collections, other deps mocked."""
    monkeypatch.setenv("DEFAULT_CRAWL_FILENAME_TEMPLATE", "")
    monkeypatch.setenv("CRAWLER_CHANNELS_JSON", "")

    org_a = uuid.uuid4()
    org_b = uuid.uuid4()
    now = datetime.now(UTC)
    config_a = {
        "_id": uuid.uuid4(),
        "oid": org_a,
        "name": "config-a",
        "created": now,
        "config": {"scopeType": "prefix"},
    }
    config_b_inactive = {
        "_id": uuid.uuid4(),
        "oid": org_b,
        "name": "config-b",
        "inactive": True,
        "created": now,
        "config": {"scopeType": "prefix"},
    }
    rev_a = {
        "_id": uuid.uuid4(),
        "cid": config_a["_id"],
        "rev": 1,
        "config": {"scopeType": "prefix"},
        "modified": datetime.now(UTC),
    }
    mdb = FakeMDB(
        FakeCollection([config_a, config_b_inactive]),
        FakeCollection([rev_a]),
    )
    with patch(
        "builtins.open",
        mock_open(read_data='[{"id": "default", "image": ""}]'),
    ):
        ops = CrawlConfigOps(
            dbclient=MagicMock(),
            mdb=mdb,
            user_manager=MagicMock(),
            org_ops=MagicMock(),
            crawl_manager=MagicMock(),
            profiles=MagicMock(),
            file_ops=MagicMock(),
            storage_ops=MagicMock(),
        )
    return ops, org_a, org_b, config_a, config_b_inactive


@pytest.mark.asyncio
async def test_get_crawl_config_revs_foreign_org_404(crawl_config_ops):
    """A config owned by org B must not return revisions via org A."""
    ops, org_a, _, _, config_b_inactive = crawl_config_ops

    with pytest.raises(HTTPException) as exc:
        await ops.get_crawl_config_revs(config_b_inactive["_id"], org_a)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_crawl_config_revs_same_org(crawl_config_ops):
    """Own configs return their revision history."""
    ops, org_a, _, config_a, _ = crawl_config_ops

    revisions, total = await ops.get_crawl_config_revs(config_a["_id"], org_a)
    assert total == 1
    assert len(revisions) == 1
    assert revisions[0].cid == config_a["_id"]


@pytest.mark.asyncio
async def test_get_crawl_config_revs_deactivated_config_still_accessible(
    crawl_config_ops,
):
    """Deactivated configs of the same org must still expose their revisions."""
    ops, _, org_b, _, config_b_inactive = crawl_config_ops

    revisions, total = await ops.get_crawl_config_revs(config_b_inactive["_id"], org_b)
    assert total == 0
    assert revisions == []
