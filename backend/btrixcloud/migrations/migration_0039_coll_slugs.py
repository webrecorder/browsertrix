"""
Migration 0039 -- collection slugs
"""

from uuid import UUID

import structlog
import pymongo
from pymongo.errors import DuplicateKeyError

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import case_insensitive_collation, slug_from_name

logger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0039"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def dedup_slug(
        self, name: str, slug_base: str, coll_id: UUID, colls_mdb
    ) -> None:
        """attempt to set slug, if duplicate, append suffix until a valid slug is found
        also update original name with same suffix"""
        slug = slug_base
        count = 1

        while True:
            try:
                await colls_mdb.find_one_and_update(
                    {"_id": coll_id},
                    {"$set": {"slug": slug}},
                )
                break
            except DuplicateKeyError:
                # pylint: disable=raise-missing-from
                count += 1
                slug = f"{slug_base}-{count}"

        if count > 1:
            logger.info(
                "duplicate_collection_name_renamed",
                name=name,
                count=count,
                unstructured_message=f"Duplicate collection name '{name}' set to '{name} {count}'",
            )
            await colls_mdb.find_one_and_update(
                {"_id": coll_id}, {"$set": {"name": f"{name} {count}"}}
            )

    async def migrate_up(self):
        """Perform migration up.

        Add slug to collections that don't have one yet, based on name
        """
        colls_mdb = self.mdb["collections"]

        await colls_mdb.drop_indexes()

        # set slug to random value to ensure uniqueness
        await colls_mdb.update_many(
            {}, [{"$set": {"slug": {"$toString": {"$rand": {}}}}}]
        )

        await colls_mdb.create_index(
            [("oid", pymongo.ASCENDING), ("slug", pymongo.ASCENDING)],
            unique=True,
            collation=case_insensitive_collation,
        )

        async for coll_raw in colls_mdb.find({}):
            coll_id = coll_raw["_id"]
            try:
                name = coll_raw.get("name", "")
                slug = slug_from_name(name)
                await self.dedup_slug(name, slug, coll_id, colls_mdb)
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "error_saving_slug_for_collection",
                    coll_id=coll_id,
                    unstructured_message=f"Error saving slug for collection {coll_id}",
                )

        await colls_mdb.create_index(
            [("oid", pymongo.ASCENDING), ("name", pymongo.ASCENDING)],
            unique=True,
            collation=case_insensitive_collation,
        )
