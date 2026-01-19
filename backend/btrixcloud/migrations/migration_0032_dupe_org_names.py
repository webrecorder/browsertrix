"""
Migration 0032 - Case-insensitive org name duplicates
"""

from uuid import UUID

from pymongo.errors import DuplicateKeyError

from btrixcloud.migrations import BaseMigration
from btrixcloud.utils import slug_from_name

MIGRATION_VERSION = "0032"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Check for case-insensitive duplicate org names and slugs.
        If found, rename org/slug as necessary to avoid duplicates
        regardless of case.
        """
        orgs_db = self.mdb["organizations"]

        org_name_set = set()
        org_slug_set = set()

        cursor = orgs_db.find({})
        async for org_dict in cursor:
            name = org_dict.get("name", "")
            slug = org_dict.get("slug", "")

            rename_org = False

            if name.lower() in org_name_set:
                rename_org = True
            else:
                org_name_set.add(name.lower())

            if slug.lower() in org_slug_set:
                rename_org = True
            else:
                org_slug_set.add(slug.lower())

            if rename_org:
                await self.update_org_name_and_slug(
                    orgs_db, org_name_set, org_slug_set, name, org_dict.get("_id")
                )

    # pylint: disable=too-many-arguments
    async def update_org_name_and_slug(
        self,
        orgs_db,
        org_name_set: set[str],
        org_slug_set: set[str],
        old_name: str,
        oid: UUID,
    ):
        """Rename org"""
        count = 2
        suffix = f" {count}"

        while True:
            org_name = f"{old_name}{suffix}"
            org_slug = slug_from_name(org_name)

            if org_name.lower() in org_name_set or org_slug.lower() in org_slug_set:
                count += 1
                suffix = f" {count}"
                continue

            try:
                await orgs_db.find_one_and_update(
                    {"_id": oid}, {"$set": {"slug": org_slug, "name": org_name}}
                )
                print(
                    f"Renamed org {oid} to {org_name} with slug {org_slug}", flush=True
                )
                break
            except DuplicateKeyError:
                # pylint: disable=raise-missing-from
                count += 1
                suffix = f" {count}"
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(f"Error renaming org {oid}: {err}", flush=True)
                break
