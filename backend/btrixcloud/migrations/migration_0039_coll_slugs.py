"""
Migration 0039 -- collection slugs
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import slug_from_name


MIGRATION_VERSION = "0039"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add slug to collections that don't have one yet, based on name
        """
        colls_mdb = self.mdb["collections"]

        async for coll_raw in colls_mdb.find({"slug": None}):
            coll_id = coll_raw["_id"]
            try:
                await colls_mdb.find_one_and_update(
                    {"_id": coll_id},
                    {"$set": {"slug": slug_from_name(coll_raw.get("name", ""))}},
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error saving slug for collection {coll_id}: {err}",
                    flush=True,
                )
