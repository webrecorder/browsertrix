"""
Migration 0014 - collections to collectionIDs
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)


MIGRATION_VERSION = "0014"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Rename crawl 'collections' field to 'collectionIds'
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        try:
            await crawls.update_many({}, {"$rename": {"collections": "collectionIds"}})
        # pylint: disable=broad-exception-caught
        except Exception as err:
            logger.error(
                "migration_rename_field_error",
                error=str(err),
                # pylint: disable=line-too-long
                unstructured_message=f"Error renaming crawl 'collections' to 'collectionIds': {err}",
            )
