"""
Migration 0026 - Crawl reviewStatus type
"""

from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0026"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Switch crawl.reviewStatus from string to int between 1-5
        """
        # pylint: disable=duplicate-code
        crawls = self.mdb["crawls"]
        try:
            await crawls.update_many(
                {"reviewStatus": {"$eq": "good"}}, {"$set": {"reviewStatus": 5}}
            )
            await crawls.update_many(
                {"reviewStatus": {"$eq": "acceptable"}}, {"$set": {"reviewStatus": 3}}
            )
            await crawls.update_many(
                {"reviewStatus": {"$eq": "failure"}}, {"$set": {"reviewStatus": 1}}
            )
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error modifying existing crawl reviewStatuses to ints: {err}",
                flush=True,
            )
