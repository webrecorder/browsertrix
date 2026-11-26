"""Unit tests for org-scoping of collection pages lookups.

Regression tests for the cross-org disclosure of archived page metadata:
get_collection_crawl_ids() must verify collection ownership against the
requesting org before returning crawl ids (and pages/pageUrlCounts routes
depend on this check).
"""

import uuid

import pytest
from fastapi import HTTPException

from btrixcloud.colls import CollectionOps


def _matches(doc: dict, query: dict) -> bool:
    """Match a doc against a simple equality query, supporting $in and
    array-contains semantics (mongo: {"collectionIds": x} matches arrays)."""
    for key, value in query.items():
        doc_val = doc.get(key)
        if isinstance(value, dict) and "$in" in value:
            if doc_val not in value["$in"]:
                return False
        elif isinstance(doc_val, list):
            if value not in doc_val:
                return False
        elif doc_val != value:
            return False
    return True


class _Cursor:
    """Minimal async-iterable cursor (motor find() returns a cursor, not a coroutine)."""

    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        async def gen():
            for doc in self._docs:
                yield doc

        return gen()


class FakeCollection:
    """Minimal fake for a mongo collection supporting find_one / find"""

    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query):
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(self, query, projection=None):
        docs = [dict(doc) for doc in self.docs if _matches(doc, query)]
        if projection:
            docs = [{k: v for k, v in doc.items() if k in projection} for doc in docs]
        return _Cursor(docs)


class FakeMDB:
    """Minimal fake for the motor mdb object"""

    def __init__(self, collections, crawls):
        self._collections = collections
        self._crawls = crawls

    def __getitem__(self, name):
        if name == "collections":
            return self._collections
        if name == "crawls":
            return self._crawls
        # crawl_configs / pages etc. are unused by these tests
        return FakeCollection([])


@pytest.fixture
def coll_ops():
    org_a = uuid.uuid4()
    org_b = uuid.uuid4()
    coll_a = {"_id": uuid.uuid4(), "oid": org_a, "access": "private"}
    coll_b_public = {"_id": uuid.uuid4(), "oid": org_b, "access": "public"}
    coll_b_private = {"_id": uuid.uuid4(), "oid": org_b, "access": "private"}
    crawl_a_id = uuid.uuid4()
    crawl_b_id = uuid.uuid4()
    crawls = [
        {"_id": crawl_a_id, "oid": org_a, "collectionIds": [coll_a["_id"]]},
        {"_id": crawl_b_id, "oid": org_b, "collectionIds": [coll_b_public["_id"]]},
    ]
    mdb = FakeMDB(
        FakeCollection([coll_a, coll_b_public, coll_b_private]),
        FakeCollection(crawls),
    )
    ops = CollectionOps(mdb, None, None, None, None, None)
    return (
        ops,
        org_a,
        org_b,
        coll_a,
        coll_b_public,
        coll_b_private,
        crawl_a_id,
        crawl_b_id,
    )


@pytest.mark.asyncio
async def test_get_collection_crawl_ids_foreign_org_404(coll_ops):
    """A collection owned by org B must not resolve via org A's id."""
    ops, org_a, _, _, coll_b_public, coll_b_private, _, _ = coll_ops

    with pytest.raises(HTTPException) as exc:
        await ops.get_collection_crawl_ids(coll_b_public["_id"], org_a)
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        await ops.get_collection_crawl_ids(coll_b_private["_id"], org_a)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_collection_crawl_ids_same_org(coll_ops):
    """Own collections (any visibility) resolve to their crawl ids."""
    ops, org_a, org_b, coll_a, coll_b_public, _, crawl_a_id, crawl_b_id = coll_ops

    crawl_ids = await ops.get_collection_crawl_ids(coll_a["_id"], org_a)
    assert crawl_ids == [crawl_a_id]

    crawl_ids = await ops.get_collection_crawl_ids(coll_b_public["_id"], org_b)
    assert crawl_ids == [crawl_b_id]


@pytest.mark.asyncio
async def test_get_collection_crawl_ids_public_access_requirement(coll_ops):
    """public_or_unlisted_only must still reject private collections of the same org."""
    ops, _, org_b, _, coll_b_public, coll_b_private, _, _ = coll_ops

    with pytest.raises(HTTPException) as exc:
        await ops.get_collection_crawl_ids(
            coll_b_private["_id"], org_b, public_or_unlisted_only=True
        )
    assert exc.value.status_code == 404

    crawl_ids = await ops.get_collection_crawl_ids(
        coll_b_public["_id"], org_b, public_or_unlisted_only=True
    )
    assert len(crawl_ids) == 1
