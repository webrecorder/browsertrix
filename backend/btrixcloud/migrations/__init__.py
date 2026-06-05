"""
BaseMigration class to subclass in each migration module
"""

import logging
import os

from pymongo.errors import OperationFailure

logger = logging.getLogger(__name__)


class MigrationError(Exception):
    """Custom migration exception class"""


class BaseMigration:
    """Base Migration class."""

    def __init__(self, mdb, migration_version="0001"):
        self.mdb = mdb
        self.migration_version = migration_version
        self.rerun_from_migration = os.environ.get("RERUN_FROM_MIGRATION")

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
        """Set db version to migration_version."""
        version_collection = self.mdb["version"]
        await version_collection.find_one_and_update(
            {}, {"$set": {"version": self.migration_version}}, upsert=True
        )

    async def migrate_up_needed(self, ignore_rerun=False):
        """Verify migration up is needed and return boolean indicator."""
        db_version = await self.get_db_version()
        logger.info(
            "migration_version_check",
            db_version=db_version,
            available_version=self.migration_version,
            # pylint: disable=line-too-long
            unstructured_message=f"Current database version before migration: {db_version}, migration available: {self.migration_version}",
        )
        # Databases from prior to migrations will not have a version set.
        if not db_version:
            return True
        if db_version < self.migration_version:
            return True

        if (
            not ignore_rerun
            and self.rerun_from_migration
            and self.rerun_from_migration <= self.migration_version
        ):
            logger.info(
                "migration_rerunning",
                migration_version=self.migration_version,
                rerun_from=self.rerun_from_migration,
                unstructured_message=f"Rerunning migrations from: {self.migration_version}",
            )
            return True
        return False

    async def migrate_up(self):
        """Perform migration up."""
        raise NotImplementedError(
            "Not implemented in base class - implement in subclass"
        )

    async def run(self):
        """Run migrations."""
        if await self.migrate_up_needed():
            logger.info(
                "migration_performing",
                migration_version=self.migration_version,
                unstructured_message="Performing migration up",
            )
            try:
                await self.migrate_up()
                await self.set_db_version()
            except OperationFailure as err:
                logger.exception(
                    "migration_error",
                    migration_version=self.migration_version,
                    unstructured_message=f"Error running migration {self.migration_version}",
                )
                return False

        else:
            logger.info(
                "migration_skipped",
                migration_version=self.migration_version,
                unstructured_message="No migration to apply - skipping",
            )
            return False

        logger.info(
            "migration_completed",
            migration_version=self.migration_version,
            unstructured_message=f"Database successfully migrated to {self.migration_version}",
        )
        return True
