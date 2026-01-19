"""
Migration 0028 - Page files and errors
"""

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import Page, Crawl

MIGRATION_VERSION = "0028"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Update older crawls and their pages:
        - Add crawl.filePageCount and crawl.errorPageCount
        - Set Page.isFile and Page.isError
        """
        pages_db = self.mdb["pages"]
        crawls_db = self.mdb["crawls"]

        cursor = crawls_db.find({"type": "crawl", "filePageCount": None})
        async for crawl_dict in cursor:
            try:
                crawl = Crawl.from_dict(crawl_dict)
                crawl.filePageCount = 0
                crawl.errorPageCount = 0

                cursor = pages_db.find({"crawl_id": crawl.id})
                async for page_dict in cursor:
                    page = Page.from_dict(page_dict)

                    page.compute_page_type()
                    if page.isFile:
                        crawl.filePageCount += 1

                    if page.isError:
                        crawl.errorPageCount += 1

                    if page.isFile or page.isError:
                        await pages_db.find_one_and_update(
                            {"_id": page.id},
                            {
                                "$set": page.dict(
                                    include={"isFile": True, "isError": True}
                                )
                            },
                        )

                await crawls_db.find_one_and_update(
                    {"_id": crawl.id, "type": "crawl"},
                    {
                        "$set": crawl.dict(
                            include={"filePageCount": True, "errorPageCount": True}
                        )
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                crawl_id = crawl_dict.get("_id")
                print(
                    f"Error updating page counts and pages for crawl {crawl_id}: {err}",
                    flush=True,
                )
