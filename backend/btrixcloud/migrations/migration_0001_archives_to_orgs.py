"""
Migration 0001 - Archives to Orgs
"""
import os

from pymongo.errors import InvalidName, OperationFailure


class Migration:
    """Migration class."""

    COLLECTIONS_AID_TO_OID = [
        "collections",
        "crawl_configs",
        "crawls",
        "invites",
        "profiles",
    ]

    MIGRATION_NAME = os.path.basename(__file__)

    def __init__(self, mdb):
        self.mdb = mdb

    async def migrate_up_needed(self):
        """Verify migration up is needed and return boolean indicator."""
        # archives collection was renamed to organizations.
        collection_names = await self.mdb.list_collection_names()
        if "archives" in collection_names or "organizations" not in collection_names:
            return True

        # aid field in these collections was renamed to oid.
        for collection in self.COLLECTIONS_AID_TO_OID:
            try:
                current_coll = self.mdb[collection]
                first_doc = await current_coll.find_one()

                if not first_doc:
                    continue

                try:
                    first_doc["aid"]
                    return True
                except KeyError:
                    pass

                try:
                    first_doc["oid"]
                except KeyError:
                    return True

            except InvalidName:
                continue

        return False

    async def delete_indexes(self):
        """Delete existing indexes for all collections.

        These will be recreated when the backend APIs are initialized.
        """
        collection_names = await self.mdb.list_collection_names()
        for collection in collection_names:
            try:
                current_coll = self.mdb[collection]
                await current_coll.drop_indexes()
            except InvalidName:
                continue

    async def migrate_up(self):
        """Perform migration up."""
        # Rename archives collection to organizations
        org_collection = self.mdb["archives"]
        try:
            await org_collection.rename("organizations", dropTarget=True)
        except OperationFailure as err:
            print(f"Error renaming archives to organizations: {err}")

        # Rename aid fields to oid
        for collection in self.COLLECTIONS_AID_TO_OID:
            current_coll = self.mdb[collection]
            await current_coll.update_many({}, {"$rename": {"aid": "oid"}})

    def migrate_down(self):
        """Perform migration down."""
        raise NotImplementedError("Downward migrations not yet added")

    async def run(self):
        """Run migrations."""
        if await self.migrate_up_needed():
            print("Performing migration up", flush=True)
            try:
                await self.migrate_up()
            except OperationFailure as err:
                print(f"Error running migration {self.MIGRATION_NAME}: {err}")
                return

        else:
            print("No migrations to apply - skipping", flush=True)
            return

        print("Deleting existing indexes", flush=True)
        await self.delete_indexes()

        print(f"Migration {self.MIGRATION_NAME} successfully completed", flush=True)
