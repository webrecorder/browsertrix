"""
Migration 0019 - Organization slug
"""

import structlog

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import slug_from_name

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0019"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add slug to all existing orgs.
        """
        # pylint: disable=duplicate-code
        mdb_orgs = self.mdb["organizations"]
        async for org in mdb_orgs.find({"slug": {"$eq": None}}):
            oid = org["_id"]
            slug = slug_from_name(org["name"])
            try:
                await mdb_orgs.find_one_and_update(
                    {"_id": oid}, {"$set": {"slug": slug}}
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "migration_org_slug_error",
                    org_id=oid,
                    unstructured_message=f"Error adding slug to org {oid}",
                )
