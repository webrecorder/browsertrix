"""
Migration 0015 - Calculate and store org storage usage
"""
from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0015"


class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Calculate and store org storage usage
        """
        orgs = self.mdb["orgs"]
        crawls = self.mdb["crawls"]
        profiles = self.mdb["profiles"]

        orgs = [res async for res in orgs.find({})]
        for org in orgs:
            oid = org.get("id")

            bytes_stored = 0

            crawls = [res async for res in crawls.find({"oid": oid})]
            for crawl in crawls:
                for crawl_file in crawl.get("files", []):
                    bytes_stored += crawl_file.get("size", 0)

            profiles = [res async for res in profiles.find({"oid": org["id"]})]
            for profile in profiles:
                profile_file = profile.get("resource")
                if profile_file:
                    bytes_stored += profile_file.get("size", 0)

            try:
                await orgs.find_one_and_update(
                    {"_id": oid}, {"$set": {"bytesStored": bytes_stored}}
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to set bytes stored for org {oid}: {err}",
                    flush=True,
                )
