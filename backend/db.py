"""
Browsertrix API Mongo DB initialization
"""

import os
import motor.motor_asyncio


DATABASE_URL = (
    f"mongodb://root:example@{os.environ.get('MONGO_HOST', 'localhost')}:27017"
)


def init_db():
    """ initializde the mongodb connector """
    client = motor.motor_asyncio.AsyncIOMotorClient(
        DATABASE_URL, uuidRepresentation="standard"
    )

    mdb = client["browsertrixcloud"]

    return mdb
