# mypy: disable-error-code="union-attr"
""" mongodb wrapper for users from fastapi users """

from typing import Optional, Type

# from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import UUID4

from .models import UserDB


# pylint: disable=missing-function-docstring
# ============================================================================
class MongoDBUserDatabase:
    """
    Database adapter for MongoDB.

    :param user_db_model: Pydantic model of a DB representation of a user.
    :param collection: Collection instance from `motor`.
    """

    collection = None  #: AsyncIOMotorCollection

    def __init__(
        self, user_db_model: Type[UserDB], collection  # AsyncIOMotorCollection,
    ):
        self.user_db_model = user_db_model
        self.collection = collection
        self.initialized = False

    async def get(self, id_: UUID4) -> Optional[UserDB]:
        await self._initialize()

        user = await self.collection.find_one({"id": id_})
        return self.user_db_model(**user) if user else None

    async def get_by_email(self, email: str) -> Optional[UserDB]:
        await self._initialize()

        user = await self.collection.find_one({"email": email})
        return self.user_db_model(**user) if user else None

    async def create(self, user: UserDB) -> UserDB:
        await self._initialize()

        await self.collection.insert_one(user.dict())
        return user

    async def update(self, user: UserDB) -> UserDB:
        await self._initialize()

        await self.collection.replace_one({"id": user.id}, user.dict())
        return user

    async def delete(self, user: UserDB) -> None:
        await self._initialize()

        await self.collection.delete_one({"id": user.id})

    async def _initialize(self):
        if not self.initialized:
            await self.collection.create_index("id", unique=True)
            await self.collection.create_index("email", unique=True)
            self.initialized = True
