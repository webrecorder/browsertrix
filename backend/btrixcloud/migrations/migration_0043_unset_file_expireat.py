"""
Migration 0043 - Remove expireAt and presignedUrl from files, now stored in separate collection
"""

import structlog

from btrixcloud.migrations import BaseMigration

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

MIGRATION_VERSION = "0043"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.crawls = mdb["crawls"]

    async def migrate_up(self) -> None:
        """Perform migration up."""

        logger.info(
            "clearing_crawl_file_wacz_presigned_urls",
            unstructured_message="Clearing crawl file WACZ presigned URLs",
        )
        await self.crawls.update_many(
            {},
            {
                "$unset": {
                    "files.$[].presignedUrl": None,
                    "files.$[].expireAt": None,
                }
            },
        )

        # Clear presign for QA crawl files
        qa_query = {
            "type": "crawl",
            "qaFinished": {"$nin": [None, {}]},
        }

        total = await self.crawls.count_documents(qa_query)
        index = 1

        async for crawl_with_qa in self.crawls.find(qa_query):
            logger.info(
                "clearing_qa_wacz_presigned_urls",
                index=index,
                total=total,
                unstructured_message=f"Clearing QA WACZ presigned URLs, crawl {index}/{total}",
            )
            index += 1

            qa_finished = crawl_with_qa.get("qaFinished")
            if not qa_finished:
                continue
            for qa_run_id in qa_finished:
                await self.crawls.find_one_and_update(
                    {"_id": crawl_with_qa.get("id")},
                    {
                        "$set": {
                            f"qaFinished.{qa_run_id}.files.$[].presignedUrl": None,
                            f"qaFinished.{qa_run_id}.files.$[].expireAt": None,
                        }
                    },
                )
