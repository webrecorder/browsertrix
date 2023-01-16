"""
Browsertrix API Mongo DB initialization
"""
import asyncio
import importlib.util
import os
import urllib
import time
from typing import Optional

import motor.motor_asyncio
from pydantic import BaseModel, UUID4

from .worker import by_one_worker


# ============================================================================
def resolve_db_url():
    """get the mongo db url, either from MONGO_DB_URL or
    from separate username, password and host settings"""
    db_url = os.environ.get("MONGO_DB_URL")
    if db_url:
        return db_url

    mongo_user = urllib.parse.quote_plus(os.environ["MONGO_INITDB_ROOT_USERNAME"])
    mongo_pass = urllib.parse.quote_plus(os.environ["MONGO_INITDB_ROOT_PASSWORD"])
    mongo_host = os.environ["MONGO_HOST"]

    return f"mongodb://{mongo_user}:{mongo_pass}@{mongo_host}:27017"


# ============================================================================
def init_db():
    """initialize the mongodb connector"""

    db_url = resolve_db_url()

    client = motor.motor_asyncio.AsyncIOMotorClient(
        db_url,
        uuidRepresentation="standard",
        connectTimeoutMS=120000,
        serverSelectionTimeoutMS=120000,
    )

    mdb = client["browsertrixcloud"]

    return client, mdb


# ============================================================================
@by_one_worker("/app/btrixcloud/worker-pid.file")
async def run_db_migrations(mdb):
    """Run database migrations."""
    migrations_path = "/app/btrixcloud/migrations"
    module_files = [
        f
        for f in os.listdir(migrations_path)
        if not os.path.isdir(os.path.join(migrations_path, f))
        and not f.startswith("__")
    ]
    for module_file in module_files:
        module_path = os.path.join(migrations_path, module_file)
        try:
            migration_name = os.path.basename(module_file).rstrip(".py")
            spec = importlib.util.spec_from_file_location(
                f".migrations.{migration_name}", module_path
            )
            assert spec
            migration_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(migration_module)
            migration = migration_module.Migration(mdb)
            await migration.run()
        except ImportError as err:
            print(
                f"Error importing Migration class from module {module_file}: {err}",
                flush=True,
            )


# ============================================================================
class BaseMongoModel(BaseModel):
    """Base pydantic model that is also a mongo doc"""

    id: Optional[UUID4]

    @property
    def id_str(self):
        """Return id as str"""
        return str(self.id)

    @classmethod
    def from_dict(cls, data):
        """convert dict from mongo to a class"""
        if not data:
            return None
        data["id"] = data.pop("_id")
        return cls(**data)

    def serialize(self, **opts):
        """convert class to dict"""
        return self.dict(
            exclude_unset=True, exclude_defaults=True, exclude_none=True, **opts
        )

    def to_dict(self, **opts):
        """convert to dict for mongo"""
        res = self.dict(**opts)
        res["_id"] = res.pop("id", "")
        return res
