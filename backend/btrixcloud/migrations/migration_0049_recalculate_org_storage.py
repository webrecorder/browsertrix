"""
Migration 0049 - Recalculate org storage for seed file and thumbnail size
"""

from btrixcloud.migrations import BaseMigration


MIGRATION_VERSION = "0049"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb, **kwargs):
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

        self.org_ops = kwargs.get("org_ops")
        self.coll_ops = kwargs.get("coll_ops")
        self.file_ops = kwargs.get("file_ops")

    async def migrate_up(self):
        """Perform migration up. Add thumbnail and seed file storage to orgs."""
        # pylint: disable=duplicate-code, line-too-long
        if self.org_ops is None or self.coll_ops is None or self.file_ops is None:
            print("Unable to recalculate org storage, missing ops", flush=True)
            return

        orgs_db = self.mdb["organizations"]

        match_query = {
            "$or": [{"bytesStoredSeedFiles": None}, {"bytesStoredThumbnails": None}]
        }

        async for org_dict in orgs_db.find(match_query):
            oid = org_dict.get("_id")

            try:
                org = await self.org_ops.get_org_by_id(oid)

                seed_file_size = await self.file_ops.calculate_seed_file_storage(oid)
                thumbnail_size = await self.coll_ops.calculate_thumbnail_storage(oid)

                await orgs_db.find_one_and_update(
                    {"_id": oid},
                    {
                        "$set": {
                            "bytesStored": org.bytesStored
                            + seed_file_size
                            + thumbnail_size,
                            "bytesStoredSeedFiles": seed_file_size,
                            "bytesStoredThumbnails": thumbnail_size,
                        }
                    },
                )
            # pylint: disable=broad-exception-caught
            except Exception as err:
                print(
                    f"Error recalculating storage for org {oid}: {err}",
                    flush=True,
                )
