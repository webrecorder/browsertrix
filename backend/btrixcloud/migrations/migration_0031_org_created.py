"""
Migration 0031 - Organization created field
"""

from btrixcloud.migrations import BaseMigration

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
                print(f"Created date set for org {oid}", flush=True)
            except IndexError:
                print(
                    f"Error setting created date for org {oid}, no workflows exist to set date from",
                    flush=True,
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error setting created date for org {oid} from first workflow: {err}",
                    flush=True,
                )
