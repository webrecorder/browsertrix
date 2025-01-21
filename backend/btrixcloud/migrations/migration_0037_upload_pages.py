"""
Migration 0037 -- upload pages
"""

from uuid import UUID

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0037"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.background_job_ops = kwargs.get("background_job_ops")
        self.page_ops = kwargs.get("page_ops")

    async def org_upload_pages_already_added(self, oid: UUID) -> bool:
        """Check if upload pages have already been added for this org"""
        if self.page_ops is None:
            print(
                f"page_ops missing, assuming pages need to be added for org {oid}",
                flush=True,
            )
            return False

        mdb_crawls = self.mdb["crawls"]
        async for upload in mdb_crawls.find({"oid": oid, "type": "upload"}):
            upload_id = upload["_id"]
            _, total = await self.page_ops.list_page_snapshots(upload_id)
            if total > 0:
                return True
        return False

    async def migrate_up(self):
        """Perform migration up.

        Start background jobs to parse uploads and add their pages to db
        """
        if self.background_job_ops is None:
            print(
                "Unable to start background job, missing background_job_ops", flush=True
            )
            return

        mdb_orgs = self.mdb["organizations"]
        async for org in mdb_orgs.find():
            oid = org["_id"]

            pages_already_added = await self.org_upload_pages_already_added(oid)

            if pages_already_added:
                print(
                    f"Skipping org {oid}, upload pages already added to db", flush=True
                )
                continue

            try:
                await self.background_job_ops.create_re_add_org_pages_job(
                    oid, crawl_type="upload"
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error starting background job to add upload pges to org {oid}: {err}",
                    flush=True,
                )
