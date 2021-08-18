"""
Archive API handling
"""
import os
import uuid
from typing import Optional, List


from pydantic import BaseModel, UUID4
from fastapi import APIRouter, Depends, HTTPException

from db import BaseMongoModel

from users import User


# ============================================================================
class S3Storage(BaseModel):
    """S3 Storage Model"""

    type: str = "S3Storage"
    name: str
    endpoint_url: str
    access_key: str
    secret_key: str
    is_public: Optional[bool]


# ============================================================================
class Archive(BaseMongoModel):
    """Archive Base Model"""

    name: str
    users: List[UUID4]
    admin_user: UUID4
    storage: S3Storage


# ============================================================================
class ArchiveOps:
    """Archive API operations"""

    def __init__(self, db):
        self.archives = db["archives"]
        self.router = None
        self.archive_dep = None

    async def add_archive(self, archive: Archive):
        """Add new archive"""
        return await self.archives.insert_one(archive.to_dict())

    @staticmethod
    def get_endpoint_url(base, id_):
        """Get endpoint for a specific archive from base"""
        return os.path.join(base, id_) + "/"

    async def create_new_archive_for_user(
        self,
        archive_name: str,
        base_endpoint_url: str,
        access_key: str,
        secret_key: str,
        user: User,
    ):
        # pylint: disable=too-many-arguments
        """Create new archive with default storage for new user"""

        id_ = str(uuid.uuid4())

        endpoint_url = self.get_endpoint_url(base_endpoint_url, id_)

        storage = S3Storage(
            endpoint_url=endpoint_url,
            access_key=access_key,
            secret_key=secret_key,
            name="default",
        )

        archive = Archive(
            id=id_,
            name=archive_name,
            admin_user=user.id,
            users=[user.id],
            storage=storage,
        )

        print(f"Created New Archive with storage at {endpoint_url}")
        await self.add_archive(archive)

    async def get_archives_for_user(self, user: User):
        """Get all archives a user is a member of"""
        cursor = self.archives.find({"users": user.id})
        results = await cursor.to_list(length=1000)
        return [Archive.from_dict(res) for res in results]

    async def get_archive_for_user_by_id(self, uid: str, user: User):
        """Get an archive for user by unique id"""
        res = await self.archives.find_one({"_id": uid, "users": user.id})
        return Archive.from_dict(res)


# ============================================================================
def init_archives_api(app, mdb, user_dep: User):
    """Init archives api router for /archives"""
    ops = ArchiveOps(mdb)

    async def archive_dep(aid: str, user: User = Depends(user_dep)):
        archive = await ops.get_archive_for_user_by_id(aid, user)
        if not archive:
            raise HTTPException(status_code=404, detail=f"Archive '{aid}' not found")

        return archive

    router = APIRouter(
        prefix="/archives/{aid}",
        tags=["archives"],
        dependencies=[Depends(archive_dep)],
        responses={404: {"description": "Not found"}},
    )

    ops.router = router
    ops.archive_dep = archive_dep

    @app.get("/archives", tags=["archives"])
    async def get_archives(user: User = Depends(user_dep)):
        results = await ops.get_archives_for_user(user)
        return {"archives": [res.serialize() for res in results]}

    @router.get("")
    async def get_archive(archive: Archive = Depends(archive_dep)):
        return archive.serialize()

    # @router.post("/{id}/storage")
    # async def add_storage(storage: S3Storage, user: User = Depends(user_dep)):
    #    storage.user = user.id
    #    res = await ops.add_storage(storage)
    #    return {"added": str(res.inserted_id)}

    return ops
