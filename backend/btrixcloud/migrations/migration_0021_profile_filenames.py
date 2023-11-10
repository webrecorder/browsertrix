"""
Migration 0021 - Profile filenames
"""
from btrixcloud.migrations import BaseMigration
from btrixcloud.crawlmanager import CrawlManager


MIGRATION_VERSION = "0021"


# pylint: disable=duplicate-code, broad-exception-caught
class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Add `profiles/` prefix to all profile filenames without it and
        update configmaps.
        """
        mdb_profiles = self.mdb["profiles"]
        async for profile in mdb_profiles.find({}):
            profile_id = profile["_id"]
            file_ = profile.get("resource")
            if not file_:
                continue

            filename = file_.get("filename")
            if not filename:
                continue

            if not filename.startswith("profiles/"):
                try:
                    await mdb_profiles.find_one_and_update(
                        {"_id": profile_id},
                        {"$set": {"resource.filename": f"profiles/{filename}"}},
                    )
                except Exception as err:
                    print(
                        f"Error updating filename for profile {profile['name']}: {err}",
                        flush=True,
                    )

        # Update profile filenames in configmaps
        crawl_manager = CrawlManager()
        match_query = {"profileid": {"$nin": ["", None]}}
        async for config_dict in crawl_configs.find(match_query):
            config = CrawlConfig.from_dict(config_dict)

            profile_res = await mdb_profiles.find_one({"_id": config.profileid})
            if not profile_res:
                continue

            resource = profile_res.get("resource")
            if not resource:
                continue

            print(
                f"Updating CronJob for Crawl Config {config.id}: profile_filename: {resource.filename}"
            )
            try:
                await crawl_manager.update_crawl_config(
                    config, UpdateCrawlConfig(), profile_filename=resource.filename
                )
            # pylint: disable=broad-except
            except Exception as exc:
                print(
                    "Skip crawl config migration due to error, likely missing config",
                    exc,
                )
