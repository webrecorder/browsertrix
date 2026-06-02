"""
Migration 0037 -- upload pages
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import Organization, UploadedCrawl

MIGRATION_VERSION = "0037"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.background_job_ops = kwargs.get("background_job_ops")
        self.page_ops = kwargs.get("page_ops")
        self.coll_ops = kwargs.get("coll_ops")

    async def migrate_up(self):
        """Perform migration up.

        Start background jobs to parse uploads and add their pages to db
        """
        if not self.background_job_ops or not self.page_ops or not self.coll_ops:
            print("Unable to start migration, missing ops", flush=True)
            return

        mdb_orgs = self.mdb["organizations"]
        mdb_crawls = self.mdb["crawls"]

        uploads_query = {"type": "upload"}

        # Re-add pages for all uploads
        upload_count = await mdb_crawls.count_documents(uploads_query)
        current_index = 1

        async for res in mdb_crawls.find(uploads_query):
            upload = UploadedCrawl.from_dict(res)
            print(
                f"Adding pages for upload {current_index}/{upload_count}",
                flush=True,
            )

            try:
                await self.page_ops.re_add_crawl_pages(upload.id, upload.oid)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error adding pages for upload {upload.id}: {err}",
                    flush=True,
                )
            current_index += 1

        # Update collections to account for new pages
        async for org_dict in mdb_orgs.find({}):
            org = Organization.from_dict(org_dict)
            try:
                await self.coll_ops.recalculate_org_collection_stats(org)
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error updating collections after adding pages for org {org.id}: {err}",
                    flush=True,
                )
