"""
Migration 0017 - Store crawl and workflow userName directly in db
"""
from btrixcloud.migrations import BaseMigration

from btrixcloud.emailsender import EmailSender
from btrixcloud.invites import init_invites
from btrixcloud.users import init_user_manager


MIGRATION_VERSION = "0017"


# pylint: disable=too-many-locals, invalid-name
class Migration(BaseMigration):
    """Migration class."""

    def __init__(self, mdb, migration_version=MIGRATION_VERSION):
        super().__init__(mdb, migration_version)

    async def migrate_up(self):
        """Perform migration up.

        Store userName in db for crawls and workflows
        """

        mdb_configs = self.mdb["crawl_configs"]
        mdb_crawls = self.mdb["crawls"]

        email = EmailSender()
        invites = init_invites(self.mdb, email)
        user_manager = init_user_manager(self.mdb, email, invites)

        crawls = [res async for res in mdb_crawls.find({})]
        for crawl in crawls:
            crawl_id = crawl["_id"]
            if crawl.get("userName"):
                continue
            try:
                user = await user_manager.get(crawl["userid"])
                await mdb_crawls.find_one_and_update(
                    {"_id": crawl_id},
                    {"$set": {"userName": user.name}},
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to update userName for crawl {crawl_id}: {err}", flush=True
                )

        configs = [res async for res in mdb_configs.find({})]
        for config in configs:
            cid = config["_id"]
            if config.get("createdByName") and config.get("modifiedByName"):
                continue
            try:
                created_by_name = ""
                modified_by_name = ""
                last_started_by_name = ""

                created_user = await user_manager.get(config["createdBy"])
                if created_user:
                    created_by_name = created_user.name

                modified_user = await user_manager.get(config["modifiedBy"])
                if modified_user:
                    modified_by_name = modified_user.name

                last_started_by = config.get("lastStartedBy")
                if last_started_by:
                    last_started_user = await user_manager.get(last_started_by)
                    if last_started_user:
                        last_started_by_name = last_started_user.name

                await mdb_configs.find_one_and_update(
                    {"_id": cid},
                    {
                        "$set": {
                            "createdByName": created_by_name,
                            "modifiedByName": modified_by_name,
                            "lastStartedByName": last_started_by_name,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Unable to update usernames for crawlconfig {cid}: {err}",
                    flush=True,
                )
