"""
Migration 0031 - Organization created field
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)

MIGRATION_VERSION = "0031"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Add created field to orgs without one, based on first workflow creation date.
        """
        # pylint: disable=duplicate-code, line-too-long
        orgs_db = self.mdb["organizations"]
        crawl_configs_db = self.mdb["crawl_configs"]

        cursor = orgs_db.find({"created": None})
        async for org_dict in cursor:
            oid = org_dict.get("_id")
            try:
                cursor = crawl_configs_db.find({"oid": oid}).sort("created", 1).limit(1)
                workflows = await cursor.to_list(length=1)
                workflow_dict = workflows[0]
                workflow_created = workflow_dict.get("created")
                await orgs_db.find_one_and_update(
                    {"_id": oid}, {"$set": {"created": workflow_created}}
                )
                logger.info(
                    "org_created_date_set",
                    oid=oid,
                    unstructured_message=f"Created date set for org {oid}",
                )
            except IndexError:
                logger.error(
                    "error_setting_org_created_date_no_workflows",
                    oid=oid,
                    unstructured_message=f"Error setting created date for org {oid}, no workflows exist to set date from",
                )
            # pylint: disable=broad-exception-caught
            except Exception:
                logger.exception(
                    "error_setting_org_created_date_from_workflow",
                    oid=oid,
                    unstructured_message=f"Error setting created date for org {oid} from first workflow",
                )
