"""
Migration 0059 - Replace sparse unique index on subscription.subId
with a partialFilterExpression that excludes empty-string subIds
"""

import structlog

from btrixcloud.migrations import BaseMigration

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0059"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Replace the sparse unique index on subscription.subId with a
        partialFilterExpression-based unique index that only enforces
        uniqueness for non-empty subscription IDs.
        """
        orgs_db = self.mdb["organizations"]

        # Find and drop any existing index on subscription.subId
        async for index in orgs_db.list_indexes():
            if index.get("key") == {"subscription.subId": 1}:
                await orgs_db.drop_index(index["name"])
                logger.info(
                    "dropped_old_index",
                    index_name=index["name"],
                )
                break

        # Create the new partial-filter index.
        # $gt: "" excludes empty strings since "" is the lowest string value;
        # combined with $exists: true, this only indexes real subscription IDs.
        await orgs_db.create_index(
            "subscription.subId",
            unique=True,
            partialFilterExpression={
                "$and": [
                    {"subscription.subId": {"$exists": True}},
                    {"subscription.subId": {"$gt": ""}},
                ]
            },
        )
        logger.info("created_new_index")
