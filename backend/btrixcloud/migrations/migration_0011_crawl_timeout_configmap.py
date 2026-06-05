"""
Migration 0011 - Remove None CRAWL_TIMEOUT values from configmaps
"""

import logging
import os

from btrixcloud.k8sapi import K8sAPI
from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)


MIGRATION_VERSION = "0011"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Replace any None values in configmaps for CRAWL_TIMEOUT with 0.
        """
        k8s_api_instance = K8sAPI()
        crawler_namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        config_maps = await k8s_api_instance.core_api.list_namespaced_config_map(
            namespace=crawler_namespace
        )
        for item in config_maps.items:
            try:
                crawl_timeout = item.data["CRAWL_TIMEOUT"]
                if crawl_timeout not in (None, "None"):
                    continue

                item.data["CRAWL_TIMEOUT"] = "0"

                await k8s_api_instance.core_api.patch_namespaced_config_map(
                    name=item.metadata.name, namespace=crawler_namespace, body=item
                )

            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "migration_configmap_timeout_error",
                    unstructured_message="Error modifying configmap CRAWL_TIMEOUT value",
                )
