"""
Migration 0046 - Invalid language codes
"""

import logging

from btrixcloud.migrations import BaseMigration

logger = logging.getLogger(__name__)


MIGRATION_VERSION = "0046"

ISO_639_1_CODES = [
    "aa",
    "ab",
    "af",
    "ak",
    "am",
    "ar",
    "an",
    "as",
    "av",
    "ae",
    "ay",
    "az",
    "ba",
    "bm",
    "be",
    "bn",
    "bi",
    "bo",
    "bs",
    "br",
    "bg",
    "ca",
    "cs",
    "ch",
    "ce",
    "cu",
    "cv",
    "kw",
    "co",
    "cr",
    "cy",
    "da",
    "de",
    "dv",
    "dz",
    "el",
    "en",
    "eo",
    "et",
    "eu",
    "ee",
    "fo",
    "fa",
    "fj",
    "fi",
    "fr",
    "fy",
    "ff",
    "gd",
    "ga",
    "gl",
    "gv",
    "gn",
    "gu",
    "ht",
    "ha",
    "sh",
    "he",
    "hz",
    "hi",
    "ho",
    "hr",
    "hu",
    "hy",
    "ig",
    "io",
    "ii",
    "iu",
    "ie",
    "ia",
    "id",
    "ik",
    "is",
    "it",
    "jv",
    "ja",
    "kl",
    "kn",
    "ks",
    "ka",
    "kr",
    "kk",
    "km",
    "ki",
    "rw",
    "ky",
    "kv",
    "kg",
    "ko",
    "kj",
    "ku",
    "lo",
    "la",
    "lv",
    "li",
    "ln",
    "lt",
    "lb",
    "lu",
    "lg",
    "mh",
    "ml",
    "mr",
    "mk",
    "mg",
    "mt",
    "mn",
    "mi",
    "ms",
    "my",
    "na",
    "nv",
    "nr",
    "nd",
    "ng",
    "ne",
    "nl",
    "nn",
    "nb",
    "no",
    "ny",
    "oc",
    "oj",
    "or",
    "om",
    "os",
    "pa",
    "pi",
    "pl",
    "pt",
    "ps",
    "qu",
    "rm",
    "ro",
    "rn",
    "ru",
    "sg",
    "sa",
    "si",
    "sk",
    "sl",
    "se",
    "sm",
    "sn",
    "sd",
    "so",
    "st",
    "es",
    "sq",
    "sc",
    "sr",
    "ss",
    "su",
    "sw",
    "sv",
    "ty",
    "ta",
    "tt",
    "te",
    "tg",
    "tl",
    "th",
    "ti",
    "to",
    "tn",
    "ts",
    "tk",
    "tr",
    "tw",
    "ug",
    "uk",
    "ur",
    "uz",
    "ve",
    "vi",
    "vo",
    "wa",
    "wo",
    "xh",
    "yi",
    "yo",
    "za",
    "zh",
    "zu",
]


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
        crawls_mdb = self.mdb["crawls"]
        orgs_mdb = self.mdb["organizations"]

        # Workflows
        try:
            result = await configs_mdb.update_many(
                {"config.lang": {"$nin": [None, *ISO_639_1_CODES]}},
                {"$set": {"config.lang": "en"}},
            )
            logger.info(
                "fixed_invalid_lang_workflows",
                modified_count=result.modified_count,
                # pylint: disable=line-too-long
                unstructured_message=f"Fixed invalid language code for {result.modified_count} workflows",
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "invalid_lang_workflows_update_error",
                unstructured_message="Unable to update invalid language codes for crawl workflows",
            )

        # Crawls
        try:
            result = await crawls_mdb.update_many(
                {"config.lang": {"$nin": [None, *ISO_639_1_CODES]}},
                {"$set": {"config.lang": "en"}},
            )
            logger.info(
                "fixed_invalid_lang_crawls",
                modified_count=result.modified_count,
                # pylint: disable=line-too-long
                unstructured_message=f"Fixed invalid language code for {result.modified_count} crawls",
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "invalid_lang_crawls_update_error",
                unstructured_message="Unable to update invalid language codes for crawls",
            )

        # Org crawling defaults
        try:
            result = await orgs_mdb.update_many(
                {"crawlingDefaults.lang": {"$nin": [None, *ISO_639_1_CODES]}},
                {"$set": {"crawlingDefaults.lang": "en"}},
            )
            logger.info(
                "fixed_invalid_lang_orgs",
                modified_count=result.modified_count,
                # pylint: disable=line-too-long
                unstructured_message=f"Fixed invalid language code for {result.modified_count} orgs",
            )
        # pylint: disable=broad-exception-caught
        except Exception:
            logger.exception(
                "invalid_lang_orgs_update_error",
                unstructured_message="Unable to update invalid language codes for org crawling defaults",
            )
