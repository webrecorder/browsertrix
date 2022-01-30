"""
Browsertrix API Mongo DB initialization
"""

import os
from typing import Optional

import motor.motor_asyncio

from pydantic import BaseModel, UUID4


DATABASE_URL = (
    f"mongodb://root:example@{os.environ.get('MONGO_HOST', 'localhost')}:27017"
)


# ============================================================================
def init_db():
    """initializde the mongodb connector"""
    client = motor.motor_asyncio.AsyncIOMotorClient(
        DATABASE_URL, uuidRepresentation="standard"
    )

    mdb = client["browsertrixcloud"]

    return mdb


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
