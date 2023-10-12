"""
Migration 0020 - Organization Slug
"""
from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import slug_from_name


MIGRATION_VERSION = "0020"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Convert storages to new storage ref system
        - If default storage, convert to string
        - If custom storage, add storage, convert to new name
        """
        # pylint: disable=duplicate-code
        mdb_orgs = self.mdb["organizations"]
        async for org in mdb_orgs.find({}}):
            oid = org["_id"]
            storage = org["storage"]

            if not isinstance(storage, dict):
                continue

            if storage.get("type") == "default":
                storage_ref = storage.get("name")

            elif storage.get("type") 



            slug = slug_from_name(org["name"])
            try:
                await mdb_orgs.find_one_and_update(
                    {"_id": oid}, {"$set": {"slug": slug}}
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Error adding slug to org {oid}: {err}", flush=True)
