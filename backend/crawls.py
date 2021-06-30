"""
Crawl Config API handling
"""

from typing import List

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from bson.objectid import ObjectId

from users import User


# ============================================================================
class CrawlConfig(BaseModel):
    """ Base Crawl Config"""
    scopeType: str
    seeds: List[str]


# ============================================================================
class CrawlConfigOut(CrawlConfig):
    """ Crawl Config Response with id"""
    id: str


# ============================================================================
class CrawlOps:
    """ Crawl Config Operations"""
    def __init__(self, mdb):
        self.crawl_configs = mdb["crawl_configs"]

    async def add_crawl_config(self, config: CrawlConfig, user: User):
        """ Add new crawl config"""
        data = config.dict()
        data["user"] = user.id
        return await self.crawl_configs.insert_one(data)

    async def update_crawl_config(self, config: CrawlConfig, user: User):
        """ Update crawl config"""
        data = config.dict()
        data["user"] = user.id
        return await self.crawl_configs.replace_one(data)

    async def delete_crawl_config(self, _id: str):
        """ Delete config"""
        return await self.crawl_configs.delete_one(ObjectId(_id))

    async def get_crawl_configs(self, user: User):
        """ Get all configs for user"""
        cursor = self.crawl_configs.find({"user": user.id})
        results = await cursor.to_list(length=1000)
        return [CrawlConfigOut(id=str(data["_id"]), **data) for data in results]

    async def get_crawl_config(self, _id: str, user: User):
        """ Get config by id"""
        data = await self.crawl_configs.find_one({"_id": ObjectId(_id), "user": user.id})
        return CrawlConfigOut(id=str(data["_id"]), **data)


# ============================================================================
def init_crawl_config_api(app, mdb, user_dep: User):
    """ Init /crawlconfigs api routes"""
    ops = CrawlOps(mdb)

    router = APIRouter(
        prefix="/crawlconfigs",
        tags=["crawlconfigs"],
        responses={404: {"description": "Not found"}},
    )

    @router.get("/")
    async def get_crawl_configs(user: User = Depends(user_dep)):
        results = await ops.get_crawl_configs(user)
        print(results)
        return {"crawl_configs": results}

    @router.get("/{id}")
    async def get_crawl_config(_id: str, user: User = Depends(user_dep)):
        res = await ops.get_crawl_config(_id, user)
        print(res)
        if not res:
            return {}

        return res

    @router.post("/")
    async def add_crawl_config(config: CrawlConfig, user: User = Depends(user_dep)):
        res = await ops.add_crawl_config(config, user)
        return {"added": str(res.inserted_id)}

    app.include_router(router)

    return ops
