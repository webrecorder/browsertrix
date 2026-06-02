"""
Migration 0010 - Precomputing collection total size
"""

import logging
from typing import cast

from btrixcloud.background_jobs import BackgroundJobOps
from btrixcloud.colls import CollectionOps
from btrixcloud.crawlmanager import CrawlManager
from btrixcloud.migrations import BaseMigration
from btrixcloud.orgs import OrgOps
from btrixcloud.storages import StorageOps
from btrixcloud.webhooks import EventWebhookOps

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0010"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Recompute collection data to include totalSize.
        """
        # pylint: disable=duplicate-code
        coll_ops = CollectionOps(
            self.mdb,
            cast(OrgOps, None),
            cast(StorageOps, None),
            cast(CrawlManager, None),
            cast(EventWebhookOps, None),
            cast(BackgroundJobOps, None),
        )

        async for coll in coll_ops.collections.find({}):
            coll_id = coll["_id"]
            try:
                await coll_ops.update_collection_stats(coll_id, coll["oid"])
            # pylint: disable=broad-exception-caught
            except Exception as err:
                logger.warning(
                    "migration_collection_update_warning",
                    collection_id=coll_id,
                    error=str(err),
                    unstructured_message=f"Unable to update collection {coll_id}: {err}",
                )
