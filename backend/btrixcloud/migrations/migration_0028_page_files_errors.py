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

        cursor = self.crawls_db.find({"type": "crawl", "filePageCount": None})
        async for crawl_dict in cursor:
            try:
                crawl = Crawl.from_dict(crawl_dict)
                crawl.filePageCount = 0
                crawl.errorPageCount = 0

                cursor = self.pages_db.find({"crawl_id": crawl.id})
                async for page_dict in cursor:
                    page = Page.from_dict(page_dict)

                    if page.loadState == 2 and "html" not in page.mime:
                        crawl.filePageCount += 1
                        page.isFile = True
                    else:
                        page.isFile = False

                    if page.loadState == 0:
                        crawl.errorPageCount += 1
                        page.isError = True
                    else:
                        page.isError = False

                    await self.pages_db.find_one_and_update(
                        {"_id": page.id}, {"$set": page.to_dict()}
                    )

                await self.crawls_db.find_one_and_update(
                    {"_id": crawl.id, "type": "crawl"}, {"$set": crawl.to_dict()}
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                crawl_id = crawl_dict.get("_id")
                print(
                    f"Error updating page counts and pages for crawl {crawl_id}: {err}",
                    flush=True,
                )
