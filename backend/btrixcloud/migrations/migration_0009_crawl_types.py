"""
Migration 0009 - Crawl types
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)


MIGRATION_VERSION = "0009"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add type "crawl" to all existing crawls that don't already have a type
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        try:
            await crawls.update_many(
                {"type": {"$eq": None}}, {"$set": {"type": "crawl"}}
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "migration_add_crawl_type_error",
                unstructured_message="Error adding type 'crawl' to existing crawls",
            )
