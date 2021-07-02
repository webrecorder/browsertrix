"""
Crawl Config API handling
"""

from typing import List, Union, Optional
from enum import Enum

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from bson.objectid import ObjectId

from users import User


# ============================================================================
class ScopeType(str, Enum):
    """Crawl scope type"""

    PAGE = "page"
    PREFIX = "prefix"
    HOST = "host"
    ANY = "any"
    NONE = "none"


# ============================================================================
class Seed(BaseModel):
    """Crawl seed"""

    url: str
    type: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None]
    exclude: Union[str, List[str], None]
    sitemap: Union[bool, str, None]
    allowHash: Optional[bool]
    depth: Optional[int]


# ============================================================================
class BaseCrawlConfig(BaseModel):
    """Base Crawl Config"""

    seeds: List[Union[str, Seed]]

    collection: Optional[str] = "my-web-archive"

    scopeType: Optional[ScopeType] = ScopeType.PREFIX
    scope: Union[str, List[str], None] = ""
    exclude: Union[str, List[str], None] = ""

    depth: Optional[int] = -1
    limit: Optional[int] = 0

    workers: Optional[int] = 1

    headless: Optional[bool] = False

    generateWACZ: Optional[bool] = False
    combineWARC: Optional[bool] = False

    logging: Optional[str] = ""
    behaviors: Optional[str] = "autoscroll"


# ============================================================================
class CrawlConfig(BaseCrawlConfig):
    """Schedulable config"""

    schedule: Optional[str] = ""
    storageName: Optional[str] = "default"


# ============================================================================
class CrawlConfigOut(CrawlConfig):
    """Crawl Config Response with id"""

    id: str


# ============================================================================
def to_crawl_config(data, uid=None):
    """Convert mongo result to CrawlConfigOut"""
    return CrawlConfigOut(id=str(uid or data["_id"]), **data) if data else None


# ============================================================================
class CrawlOps:
    """Crawl Config Operations"""

    def __init__(self, mdb, storage_ops, crawl_manager):
        self.crawl_configs = mdb["crawl_configs"]
        self.storage_ops = storage_ops
        self.crawl_manager = crawl_manager
        self.default_crawl_params = [
            "--collection",
            "data",
            "--timeout",
            "90",
            "--logging",
            "behaviors",
        ]

    async def add_crawl_config(self, config: CrawlConfig, user: User):
        """Add new crawl config"""
        data = config.dict()
        data["user"] = user.id

        storage = await self.storage_ops.get_storage_by_name(config.storageName, user)

        if not storage:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid Config: Storage '{config.storageName}' not found",
            )

        result = await self.crawl_configs.insert_one(data)
        out = to_crawl_config(data, result.inserted_id)
        await self.crawl_manager.add_crawl_config(
            out.dict(), str(user.id), storage, self.default_crawl_params
        )
        return result

    async def update_crawl_config(self, config: CrawlConfig, user: User):
        """Update crawl config"""
        data = config.dict()
        data["user"] = user.id
        return await self.crawl_configs.replace_one(data)

    async def delete_crawl_config(self, _id: str, user: User):
        """Delete config"""
        await self.crawl_manager.delete_crawl_configs(f"btrix.crawlconfig={_id}")
        return self.crawl_configs.delete_one({"_id": ObjectId(_id), "user": user.id})

    async def delete_crawl_configs(self, user: User):
        """Delete all crawl configs for user"""
        await self.crawl_manager.delete_crawl_configs(f"btrix.user={user.id}")
        return await self.crawl_configs.delete_many({"user": user.id})

    async def get_crawl_configs(self, user: User):
        """Get all configs for user"""
        cursor = self.crawl_configs.find({"user": user.id})
        results = await cursor.to_list(length=1000)
        return [to_crawl_config(data) for data in results]

    async def get_crawl_config(self, _id: str, user: User):
        """Get config by id"""
        data = await self.crawl_configs.find_one(
            {"_id": ObjectId(_id), "user": user.id}
        )
        return to_crawl_config(data)


# ============================================================================
# pylint: disable=redefined-builtin,invalid-name
def init_crawl_config_api(app, mdb, user_dep: User, storage_ops, crawl_manager):
    """Init /crawlconfigs api routes"""
    ops = CrawlOps(mdb, storage_ops, crawl_manager)

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

    @router.delete("/")
    async def delete_crawl_configs(user: User = Depends(user_dep)):
        result = await ops.delete_crawl_configs(user)
        return {"deleted": result.deleted_count}

    @router.delete("/{id}")
    async def delete_crawl_config(id: str, user: User = Depends(user_dep)):
        result = await ops.delete_crawl_config(id, user)
        if not result or not result.deleted_count:
            raise HTTPException(status_code=404, detail="Crawl Config Not Found")

        return {"deleted": 1}

    @router.get("/{id}")
    async def get_crawl_config(id: str, user: User = Depends(user_dep)):
        res = await ops.get_crawl_config(id, user)
        if not res:
            raise HTTPException(status_code=404, detail="Crawl Config Not Found")

        return res

    @router.post("/")
    async def add_crawl_config(config: CrawlConfig, user: User = Depends(user_dep)):
        res = await ops.add_crawl_config(config, user)
        return {"added": str(res.inserted_id)}

    app.include_router(router)

    return ops
