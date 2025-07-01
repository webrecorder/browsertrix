"""
Migration 0049 - Recalculate org storage for seed file and thumbnail size
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0049"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.org_ops = kwargs.get("org_ops")

    async def migrate_up(self):
        """Perform migration up. Recalculate storage for each org."""
        # pylint: disable=duplicate-code, line-too-long
        if self.org_ops is None:
            print("Unable to recalculate org storage, missing org_ops", flush=True)
            return

        orgs_db = self.mdb["organizations"]
        async for org_dict in orgs_db.find({}):
            oid = org_dict.get("_id")

            try:
                org = await self.org_ops.get_org_by_id(oid)
                await self.org_ops.recalculate_storage(org)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error recalculating storage for org {oid}: {err}",
                    flush=True,
                )
