"""
Migration 0046 - Invalid language codes
"""

from iso639 import is_language

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0046"


# pylint: disable=duplicate-code
class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Replace any invalid ISO-639-1 language codes that may be saved in
        the database with "en".
        """
        configs_mdb = self.mdb["crawl_configs"]
        orgs_mdb = self.mdb["organizations"]

        # Fix workflows
        async for config_raw in configs_mdb.find({"config.lang": {"$ne": None}}):
            config_id = config_raw["_id"]

            try:
                lang = config_raw["config"]["lang"]
            except KeyError:
                continue

            if not is_language(lang, "pt1"):
                print(
                    f"Invalid language code {lang} found for workflow {config_id}. Fixing.",
                    flush=True,
                )
                try:
                    await configs_mdb.find_one_and_update(
                        {"_id": config_id},
                        {"$set": {"config.lang": "en"}},
                    )
                # pylint: disable=broad-exception-caught
                except Exception as err:
                    print(
                        f"Unable to update language code for workflow {config_id}: {err}",
                        flush=True,
                    )

        # Fix org defaults
        async for org_raw in orgs_mdb.find({"crawlingDefaults.lang": {"$ne": None}}):
            oid = org_raw["_id"]

            try:
                lang = org_raw["crawlingDefaults"]["lang"]
            except KeyError:
                continue

            if not is_language(lang, "pt1"):
                print(
                    f"Invalid language code {lang} found in org {oid} crawling defaults. Fixing.",
                    flush=True,
                )
                try:
                    await orgs_mdb.find_one_and_update(
                        {"_id": oid},
                        {"$set": {"crawlingDefaults.lang": "en"}},
                    )
                # pylint: disable=broad-exception-caught
                except Exception as err:
                    print(
                        f"Unable to update default language code for org {oid}: {err}",
                        flush=True,
                    )
