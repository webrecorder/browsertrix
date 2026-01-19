"""
Migration 0048 - Calculate firstSeed/seedCount and store directly in database
"""

from typing import cast, List, Dict, Any

from btrixcloud.migrations import BaseMigration
from btrixcloud.models import CrawlConfig, Crawl, Seed

MIGRATION_VERSION = "0048"


# pylint: disable=duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self) -> None:
        """Perform migration up.

        Calculate firstSeed and seedCount for workflows and store in db
        """
        crawls_mdb = self.mdb["crawls"]
        crawl_configs_mdb = self.mdb["crawl_configs"]

        match_query = {"$or": [{"firstSeed": None}, {"seedCount": None}]}

        # Workflows
        async for config_raw in crawl_configs_mdb.find(match_query):
            config = CrawlConfig.from_dict(config_raw)

            try:
                if not config.config.seeds:
                    print(
                        f"Unable to find seeds for config {config.id}, skipping",
                        flush=True,
                    )
                    continue

                seeds = cast(List[Seed], config.config.seeds)
                seed_count = len(seeds)
                first_seed = seeds[0].url

                await crawl_configs_mdb.find_one_and_update(
                    {"_id": config.id},
                    {
                        "$set": {
                            "firstSeed": first_seed,
                            "seedCount": seed_count,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to update seed info for workflow {config.id}: {err}",
                    flush=True,
                )

        # Crawls
        crawl_query: Dict[str, Any] = {
            "type": "crawl",
            "$or": [
                {"firstSeed": {"$in": [None, ""]}},
                {"seedCount": {"$in": [None, 0]}},
            ],
        }
        async for crawl_raw in crawls_mdb.find(crawl_query):
            crawl_id = crawl_raw["_id"]
            try:
                crawl = Crawl.from_dict(crawl_raw)
                config_raw = await crawl_configs_mdb.find_one({"_id": crawl.cid})

                seed_count = config_raw.get("seedCount", 0)
                first_seed = config_raw.get("firstSeed", "")

                await crawls_mdb.find_one_and_update(
                    {"_id": crawl_id},
                    {
                        "$set": {
                            "firstSeed": first_seed,
                            "seedCount": seed_count,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to update seed info for crawl {crawl_id}: {err}",
                    flush=True,
                )
