"""
Migration 0020 - New Storage Ref System
"""
from btrixcloud.migrations import BaseMigration


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
        async for org in mdb_orgs.find({"storage.custom": None}):
            oid = org["_id"]
            storage = org["storage"]

            if storage.get("type") == "default":
                update_dict = {
                    "storage": {"name": storage.get("name"), "custom": False}
                }

            elif storage.get("type") == "s3":
                update_dict = {
                    "storage": {"name": storage.get("name"), "custom": True},
                    "customStorages": {"custom": storage},
                }

            try:
                await mdb_orgs.find_one_and_update({"_id": oid}, {"$set": update_dict})
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Error updating storage for {oid}: {err}", flush=True)
