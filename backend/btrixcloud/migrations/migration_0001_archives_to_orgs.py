"""
Migration 0001 - Archives to Orgs
"""
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

    MIGRATION_VERSION = "0001"

    def __init__(self, mdb):
        self.mdb = mdb

    async def get_db_version(self):
        """Get current db version from database."""
        db_version = None
        version_collection = self.mdb["version"]
        version_record = await version_collection.find_one()
        if not version_record:
            return db_version
        try:
            db_version = version_record["version"]
        except KeyError:
            pass
        return db_version

    async def set_db_version(self):
        """Set db version to version_number."""
        version_collection = self.mdb["version"]
        await version_collection.find_one_and_update(
            {}, {"$set": {"version": self.MIGRATION_VERSION}}, upsert=True
        )

    async def migrate_up_needed(self):
        """Verify migration up is needed and return boolean indicator."""
        db_version = await self.get_db_version()
        print(f"Current database version before migration: {db_version}")
        print(f"Migration available to apply: {self.MIGRATION_VERSION}")
        # Databases from prior to migrations will not have a version set.
        if not db_version:
            return True
        if db_version < self.MIGRATION_VERSION:
            return True
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
                await self.set_db_version()
            except OperationFailure as err:
                print(f"Error running migration {self.MIGRATION_VERSION}: {err}")
                return

        else:
            print("No migration to apply - skipping", flush=True)
            return

        print("Deleting existing indexes", flush=True)
        await self.delete_indexes()

        print(f"Database successfully migrated to {self.MIGRATION_VERSION}", flush=True)
