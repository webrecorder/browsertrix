"""
Crawl-related models and types
"""

from datetime import datetime
from enum import Enum

from typing import Optional, List, Dict, Union
from pydantic import BaseModel, UUID4, conint, Field, HttpUrl

from .db import BaseMongoModel
from .orgs import MAX_CRAWL_SCALE


# pylint: disable=invalid-name

# ============================================================================

### CONFIGS ###


# ============================================================================
class JobType(str, Enum):
    """Job Types"""

    URL_LIST = "url-list"
    SEED_CRAWL = "seed-crawl"
    CUSTOM = "custom"


# ============================================================================
class ScopeType(str, Enum):
    """Crawl scope type"""

    PAGE = "page"
    PAGE_SPA = "page-spa"
    PREFIX = "prefix"
    HOST = "host"
    DOMAIN = "domain"
    ANY = "any"
    CUSTOM = "custom"


# ============================================================================
class Seed(BaseModel):
    """Crawl seed"""

    url: HttpUrl
    scopeType: Optional[ScopeType]

    include: Union[str, List[str], None]
    exclude: Union[str, List[str], None]
    sitemap: Union[bool, HttpUrl, None]
    allowHash: Optional[bool]
    depth: Optional[int]
    extraHops: Optional[int]


# ============================================================================
class RawCrawlConfig(BaseModel):
    """Base Crawl Config"""

    seeds: List[Seed]

    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None] = None
    exclude: Union[str, List[str], None] = None

    depth: Optional[int] = -1
    limit: Optional[int] = 0
    extraHops: Optional[int] = 0

    lang: Optional[str]
    blockAds: Optional[bool] = False

    behaviorTimeout: Optional[int]
    pageLoadTimeout: Optional[int]
    pageExtraDelay: Optional[int] = 0

    workers: Optional[int]

    headless: Optional[bool]

    generateWACZ: Optional[bool]
    combineWARC: Optional[bool]

    useSitemap: Optional[bool] = False

    logging: Optional[str]
    behaviors: Optional[str] = "autoscroll,autoplay,autofetch,siteSpecific"


# ============================================================================
class CrawlConfigIn(BaseModel):
    """CrawlConfig input model, submitted via API"""

    schedule: Optional[str] = ""
    runNow: Optional[bool] = False

    config: RawCrawlConfig

    name: str

    description: Optional[str]

    jobType: Optional[JobType] = JobType.CUSTOM

    profileid: Optional[str]

    autoAddCollections: Optional[List[UUID4]] = []
    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    crawlFilenameTemplate: Optional[str]


# ============================================================================
class ConfigRevision(BaseMongoModel):
    """Crawl Config Revision"""

    cid: UUID4

    schedule: Optional[str] = ""

    config: RawCrawlConfig

    profileid: Optional[UUID4]

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    modified: datetime
    modifiedBy: Optional[UUID4]

    rev: int = 0


# ============================================================================
class CrawlConfigCore(BaseMongoModel):
    """Core data shared between crawls and crawlconfigs"""

    schedule: Optional[str] = ""

    jobType: Optional[JobType] = JobType.CUSTOM
    config: RawCrawlConfig

    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)] = 1

    oid: UUID4

    profileid: Optional[UUID4]


# ============================================================================
class CrawlConfig(CrawlConfigCore):
    """Schedulable config"""

    name: Optional[str]
    description: Optional[str]

    created: datetime
    createdBy: Optional[UUID4]

    modified: Optional[datetime]
    modifiedBy: Optional[UUID4]

    autoAddCollections: Optional[List[UUID4]] = []

    inactive: Optional[bool] = False

    rev: int = 0

    crawlAttemptCount: Optional[int] = 0
    crawlCount: Optional[int] = 0
    crawlSuccessfulCount: Optional[int] = 0

    totalSize: Optional[int] = 0

    lastCrawlId: Optional[str]
    lastCrawlStartTime: Optional[datetime]
    lastStartedBy: Optional[UUID4]
    lastCrawlTime: Optional[datetime]
    lastCrawlState: Optional[str]
    lastCrawlSize: Optional[int]

    lastRun: Optional[datetime]

    isCrawlRunning: Optional[bool] = False

    def get_raw_config(self):
        """serialize config for browsertrix-crawler"""
        return self.config.dict(exclude_unset=True, exclude_none=True)


# ============================================================================
class CrawlConfigOut(CrawlConfig):
    """Crawl Config Output"""

    lastCrawlStopping: Optional[bool] = False

    profileName: Optional[str]

    createdByName: Optional[str]
    modifiedByName: Optional[str]
    lastStartedByName: Optional[str]

    firstSeed: Optional[str]


# ============================================================================
class CrawlConfigIdNameOut(BaseMongoModel):
    """Crawl Config id and name output only"""

    name: str


# ============================================================================
class UpdateCrawlConfig(BaseModel):
    """Update crawl config name, crawl schedule, or tags"""

    # metadata: not revision tracked
    name: Optional[str]
    tags: Optional[List[str]]
    description: Optional[str]
    autoAddCollections: Optional[List[UUID4]]

    # crawl data: revision tracked
    schedule: Optional[str]
    profileid: Optional[str]
    crawlTimeout: Optional[int]
    scale: Optional[conint(ge=1, le=MAX_CRAWL_SCALE)]
    crawlFilenameTemplate: Optional[str]
    config: Optional[RawCrawlConfig]


# ============================================================================

### BASE CRAWLS ###


# ============================================================================
class CrawlFile(BaseModel):
    """file from a crawl"""

    filename: str
    hash: str
    size: int
    def_storage_name: Optional[str]

    presignedUrl: Optional[str]
    expireAt: Optional[datetime]


# ============================================================================
class CrawlFileOut(BaseModel):
    """output for file from a crawl (conformance to Data Resource Spec)"""

    name: str
    path: str
    hash: str
    size: int
    crawlId: Optional[str]


# ============================================================================
class BaseCrawl(BaseMongoModel):
    """Base Crawl object (representing crawls, uploads and manual sessions)"""

    id: str

    userid: UUID4
    oid: UUID4

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, int]]

    files: Optional[List[CrawlFile]] = []

    notes: Optional[str]

    errors: Optional[List[str]] = []

    collections: Optional[List[UUID4]] = []

    fileSize: int = 0
    fileCount: int = 0


# ============================================================================
class BaseCrawlOut(BaseMongoModel):
    """Base crawl output model"""

    # pylint: disable=duplicate-code

    type: Optional[str]

    id: str

    userid: UUID4
    oid: UUID4

    userName: Optional[str]

    name: Optional[str]
    description: Optional[str]

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, int]]

    fileSize: int = 0
    fileCount: int = 0

    tags: Optional[List[str]] = []

    notes: Optional[str]

    errors: Optional[List[str]]

    collections: Optional[List[UUID4]] = []

    # automated crawl fields
    cid: Optional[UUID4]
    name: Optional[str]
    description: Optional[str]
    firstSeed: Optional[str]
    seedCount: Optional[int]
    profileName: Optional[str]


# ============================================================================
class BaseCrawlOutWithResources(BaseCrawlOut):
    """includes resources"""

    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class UpdateCrawl(BaseModel):
    """Update crawl"""

    tags: Optional[List[str]] = []
    notes: Optional[str]


# ============================================================================
class DeleteCrawlList(BaseModel):
    """delete crawl list POST body"""

    crawl_ids: List[str]


# ============================================================================

### CRAWLS ###


# ============================================================================
class CrawlScale(BaseModel):
    """scale the crawl to N parallel containers"""

    scale: conint(ge=1, le=MAX_CRAWL_SCALE) = 1


# ============================================================================
class Crawl(BaseCrawl, CrawlConfigCore):
    """Store State of a Crawl (Finished or Running)"""

    type: str = Field("crawl", const=True)

    cid: UUID4

    cid_rev: int = 0

    # schedule: Optional[str]
    manual: Optional[bool]

    stopping: Optional[bool] = False


# ============================================================================
class CrawlOut(Crawl):
    """Output for single crawl, with additional fields"""

    userName: Optional[str]
    name: Optional[str]
    description: Optional[str]
    profileName: Optional[str]
    resources: Optional[List[CrawlFileOut]] = []
    firstSeed: Optional[str]
    seedCount: Optional[int] = 0
    errors: Optional[List[str]]


# ============================================================================
class ListCrawlOut(BaseMongoModel):
    """Crawl output model for list view"""

    # pylint: disable=duplicate-code

    id: str

    userid: UUID4
    userName: Optional[str]

    oid: UUID4
    cid: UUID4
    name: Optional[str]
    description: Optional[str]

    manual: Optional[bool]

    started: datetime
    finished: Optional[datetime]

    state: str

    stats: Optional[Dict[str, int]]

    fileSize: int = 0
    fileCount: int = 0

    tags: Optional[List[str]] = []

    notes: Optional[str]

    firstSeed: Optional[str]
    seedCount: Optional[int] = 0
    errors: Optional[List[str]]

    stopping: Optional[bool] = False

    collections: Optional[List[UUID4]] = []


# ============================================================================
class ListCrawlOutWithResources(ListCrawlOut):
    """Crawl output model used internally with files and resources."""

    files: Optional[List[CrawlFile]] = []
    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class CrawlCompleteIn(BaseModel):
    """Completed Crawl Webhook POST message"""

    id: str

    user: str

    filename: str
    size: int
    hash: str

    completed: Optional[bool] = True
