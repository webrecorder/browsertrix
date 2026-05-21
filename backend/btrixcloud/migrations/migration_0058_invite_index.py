"""
Migration 0058 - Recreate index for invites
"""

from typing import cast

from motor.motor_asyncio import AsyncIOMotorDatabase

from btrixcloud.emailsender import EmailSender
from btrixcloud.invites import InviteOps
from btrixcloud.migrations import BaseMigration

MIGRATION_VERSION = "0058"


class Migration(BaseMigration):
    """Migration class."""

    # pylint: disable=unused-argument
    def __init__(self, mdb: AsyncIOMotorDatabase, **kwargs):
        self.mdb = mdb
        super().__init__(mdb, migration_version=MIGRATION_VERSION)

    async def migrate_up(self):
        """Perform migration up.

        Delete and recreate invite index
        """
        invites = self.mdb["invites"]
        await invites.drop_indexes()
        invite_ops = InviteOps(self.mdb, cast(EmailSender, None))
        await invite_ops.init_index()
