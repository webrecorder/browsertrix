"""
Migration 0036 -- collection access
"""

from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0036"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Move from Collection.isPublic cool to Collection.access enum
        """
        colls_mdb = self.mdb["collections"]

        # Set non-public collections to private
        try:
            await colls_mdb.update_many(
                {"isPublic": False},
                {"$set": {"access": "private"}, "$unset": {"isPublic": 1}},
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error migrating private collections: {err}",
                flush=True,
            )

        # Set public collections to unlisted
        try:
            await colls_mdb.update_many(
                {"isPublic": True},
                {"$set": {"access": "unlisted"}, "$unset": {"isPublic": 1}},
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error migrating public unlisted collections: {err}",
                flush=True,
            )
