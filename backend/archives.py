from typing import List, Optional, TypeVar
from pydantic import BaseModel, UUID4, validator
from fastapi import APIRouter, Depends
from users import User
import uuid
from bson.objectid import ObjectId

class Archive(BaseModel):
    #id: Optional[UUID4]
    title: Optional[str]
    user: Optional[UUID4]


class S3Archive(Archive):
    endpoint_url: Optional[str]
    is_public: Optional[bool]

    #@validator("id", pre=True, always=True)
    #def default_id(cls, v):
    #    return v or uuid.uuid4()


def init_archives_api(app, db, user_dep: User):
    archives_coll = db["archives"]

    router = APIRouter(
        prefix="/archives",
        tags=["archives"],
        responses={404: {"description": "Not found"}},
    )

    @router.get("/")
    async def get_archives(user: User=Depends(user_dep)):
        cursor = archives_coll.find({})
        results = await cursor.to_list(length=1000)
        return {"archives": [{"id": str(res["_id"]), "title": res["title"], "endpoint_url": res["endpoint_url"]} for res in results]}

    @router.get("/{id}")
    async def get_archives(id: str, user: User=Depends(user_dep)):
        res = await archives_coll.find_one(ObjectId(id))
        print(res)
        if not res:
            return {}

        return {"id": id, "title": res["title"], "endpoint_url": res["endpoint_url"]}

    @router.post("/")
    async def add_archive(archive: S3Archive, user: User = Depends(user_dep)):
        archive.user = user.id
        print(archive.user)
        res = await archives_coll.insert_one(archive.dict())
        return {"added": str(res.inserted_id)}

    app.include_router(router)

