"""
Browsertrix API Mongo DB initialization
"""

import os
from typing import Optional

import motor.motor_asyncio

from pydantic import BaseModel, UUID4


# ============================================================================
def resolve_db_url():
    """get the mongo db url, either from MONGO_DB_URL or
    from separate username, password and host settings"""
    db_url = os.environ.get("MONGO_DB_URL")
    if db_url:
        return db_url

    mongo_user = os.environ["MONGO_INITDB_ROOT_USERNAME"]
    mongo_pass = os.environ["MONGO_INITDB_ROOT_PASSWORD"]
    mongo_host = os.environ["MONGO_HOST"]

    return f"mongodb://{mongo_user}:{mongo_pass}@{mongo_host}:27017"


# ============================================================================
def init_db():
    """initializde the mongodb connector"""

    db_url = resolve_db_url()

    client = motor.motor_asyncio.AsyncIOMotorClient(
        db_url, uuidRepresentation="standard"
    )

    mdb = client["browsertrixcloud"]

    return client, mdb


# ============================================================================
class BaseMongoModel(BaseModel):
    """Base pydantic model that is also a mongo doc"""

    id: Optional[UUID4]

    @property
    def id_str(self):
        """ Return id as str """
        return str(self.id)

    @classmethod
    def from_dict(cls, data):
        """convert dict from mongo to an Archive"""
        if not data:
            return None
        data["id"] = data.pop("_id")
        return cls(**data)

    def serialize(self, **opts):
        """convert Archive to dict"""
        return self.dict(
            exclude_unset=True, exclude_defaults=True, exclude_none=True, **opts
        )

    def to_dict(self, **opts):
        """convert to dict for mongo"""
        res = self.dict(**opts)
        res["_id"] = res.pop("id", "")
        return res
