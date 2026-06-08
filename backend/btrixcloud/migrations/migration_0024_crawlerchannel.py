"""
Migration 0024 -- crawlerChannel
"""

import structlog

from btrixcloud.migrations import BaseMigration

logger = structlog.get_logger(__name__)


MIGRATION_VERSION = "0024"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add crawlerChannel to existing workflows and profiles, and update configmaps
        """
        # pylint: disable=duplicate-code
        mdb_crawl_configs = self.mdb["crawl_configs"]
        mdb_profiles = self.mdb["profiles"]

        async for config in mdb_crawl_configs.find(
            {"crawlerChannel": {"$in": ["", None]}}
        ):
            config_id = config["_id"]
            try:
                await mdb_crawl_configs.find_one_and_update(
                    {"_id": config_id},
                    {"$set": {"crawlerChannel": "default"}},
                )
            # pylint: disable=broad-except
            except Exception:
                logger.exception(
                    "migration_crawlerchannel_workflow_error",
                    config_id=config_id,
                    unstructured_message=(
                        f"Error adding crawlerChannel 'default' to workflow {config_id}"
                    ),
                )

        async for profile in mdb_profiles.find({"crawlerChannel": {"$in": ["", None]}}):
            profile_id = profile["_id"]
            try:
                await mdb_profiles.find_one_and_update(
                    {"_id": profile_id},
                    {"$set": {"crawlerChannel": "default"}},
                )
            # pylint: disable=broad-except
            except Exception:
                logger.exception(
                    "migration_crawlerchannel_profile_error",
                    profile_id=profile_id,
                    unstructured_message=(
                        f"Error adding crawlerChannel 'default' to profile {profile_id}"
                    ),
                )
