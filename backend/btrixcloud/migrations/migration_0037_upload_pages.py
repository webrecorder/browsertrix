"""
Migration 0037 -- upload pages
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0037"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.background_job_ops = kwargs.get("background_job_ops")

    async def migrate_up(self):
        """Perform migration up.

        Start background jobs to parse uploads and add their pages to db
        """
        mdb_orgs = self.mdb["organizations"]
        async for org in mdb_orgs.find():
            oid = org["_id"]
            try:
                await self.background_job_ops.create_re_add_org_pages_job(
                    oid, type_filter="upload"
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error starting background job to add upload pges to org {oid}: {err}",
                    flush=True,
                )
