"""
Migration 0028 - Page files and errors
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.crawlmanager import CrawlManager

MIGRATION_VERSION = "0029"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """delete all workflow-scoped configmaps"""
        crawl_manager = CrawlManager()
        await crawl_manager.core_api.delete_collection_namespaced_config_map(
            namespace=crawl_manager.namespace, label_selector="btrix.crawlconfig"
        )
