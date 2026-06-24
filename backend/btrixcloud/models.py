"""
Crawl-related models and types
"""

# pylint: disable=invalid-name, too-many-lines
from __future__ import annotations

import base64
import hashlib
import math
import mimetypes
import os
from datetime import datetime
from enum import IntEnum, StrEnum
from typing import Annotated, Any, Literal, Self, get_args, get_origin
from uuid import UUID

from pydantic import (
    AnyHttpUrl as AnyHttpUrlNonStr,
)
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    RootModel,
    TypeAdapter,
    create_model,
    model_validator,
    validate_email,
)
from pydantic import (
    EmailStr as CasedEmailStr,
)
from pydantic import (
    HttpUrl as HttpUrlNonStr,
)
from slugify import slugify
from typing_extensions import deprecated

# from fastapi_users import models as fastapi_users_models
from .db import LENIENT_ON_READ, BaseMongoModel
from .utils import is_bool

# num browsers per crawler instance
NUM_BROWSERS = int(os.environ.get("NUM_BROWSERS", 2))

# browser window for constraint (preferred over scale if provided)
MAX_BROWSER_WINDOWS = os.environ.get("MAX_BROWSER_WINDOWS") or 0

# crawl scale for constraint
# pylint: disable=invalid-name
if MAX_BROWSER_WINDOWS:
    MAX_BROWSER_WINDOWS = int(MAX_BROWSER_WINDOWS)
    MAX_CRAWL_SCALE = math.ceil(MAX_BROWSER_WINDOWS / NUM_BROWSERS)
else:
    MAX_CRAWL_SCALE = int(os.environ.get("MAX_CRAWL_SCALE", 3))
    MAX_BROWSER_WINDOWS = MAX_CRAWL_SCALE * NUM_BROWSERS

# Presign duration must be less than 604800 seconds (one week),
# so set this one minute short of a week
PRESIGN_MINUTES_MAX = 10079
PRESIGN_MINUTES_DEFAULT = PRESIGN_MINUTES_MAX

# Expire duration seconds for presigned urls
PRESIGN_DURATION_MINUTES = int(
    os.environ.get("PRESIGN_DURATION_MINUTES") or PRESIGN_MINUTES_DEFAULT
)
PRESIGN_DURATION_SECONDS = min(PRESIGN_DURATION_MINUTES, PRESIGN_MINUTES_MAX) * 60

# Minimum part size for file uploads
MIN_UPLOAD_PART_SIZE = 10000000

# enable dedupe by default
DEDUPE_FEATURE_ENABLED_DEFAULT = is_bool(
    os.environ.get("DEDUPE_FEATURE_ENABLED_DEFAULT")
)


# annotated types
# ============================================================================

EmptyStr = Annotated[str, Field(min_length=0, max_length=0)]

Scale = Annotated[
    int,
    Field(strict=True, ge=1, le=MAX_CRAWL_SCALE),
    deprecated("Use browserWindows instead"),
]
BrowserWindowCount = Annotated[int, Field(strict=True, ge=1, le=MAX_BROWSER_WINDOWS)]
ReviewStatus = Annotated[int, Field(strict=True, ge=1, le=5)] | None

any_http_url_adapter = TypeAdapter(AnyHttpUrlNonStr)
AnyHttpUrl = Annotated[
    str, BeforeValidator(lambda value: str(any_http_url_adapter.validate_python(value)))
]

http_url_adapter = TypeAdapter(HttpUrlNonStr)
HttpUrl = Annotated[
    str, BeforeValidator(lambda value: str(http_url_adapter.validate_python(value)))
]

Name = Annotated[str, Field(min_length=1, max_length=1000), LENIENT_ON_READ]
NameOrEmptyStr = Annotated[str, Field(min_length=0, max_length=1000), LENIENT_ON_READ]
Description = Annotated[str | None, Field(max_length=5000), LENIENT_ON_READ]
Tag = Annotated[str, Field(min_length=1, max_length=80), LENIENT_ON_READ]

CollectionName = Annotated[str, Field(min_length=1, max_length=80), LENIENT_ON_READ]
CollectionSlug = Annotated[str, Field(min_length=1, max_length=80), LENIENT_ON_READ]
CollectionCaption = Annotated[str | None, Field(max_length=1000), LENIENT_ON_READ]

OrgName = Annotated[str, Field(min_length=1, max_length=50), LENIENT_ON_READ]
OrgPublicDescription = Annotated[str | None, Field(max_length=400), LENIENT_ON_READ]


# pylint: disable=too-few-public-methods
class EmailStr(CasedEmailStr):
    """EmailStr type that lowercases the full email"""

    @classmethod
    def _validate(cls, value: CasedEmailStr, /) -> CasedEmailStr:
        return validate_email(value)[1].lower()


# ============================================================================
class UserRole(IntEnum):
    """User role"""

    VIEWER = 10
    CRAWLER = 20
    OWNER = 40
    SUPERADMIN = 100


# ============================================================================

### INVITES ###


# ============================================================================
class InvitePending(BaseMongoModel):
    """An invite for a new user, with an email and invite token as id"""

    id: UUID
    created: datetime
    tokenHash: str
    inviterEmail: EmailStr
    fromSuperuser: bool | None = False
    oid: UUID | None = None
    role: UserRole = UserRole.VIEWER
    email: EmailStr | None = None
    # set if existing user
    userid: UUID | None = None


# ============================================================================
class InviteOut(BaseModel):
    """Single invite output model"""

    created: datetime
    inviterEmail: EmailStr | None = None
    inviterName: str | None = None
    fromSuperuser: bool
    oid: UUID | None = None
    orgName: str | None = None
    orgSlug: str | None = None
    role: UserRole = UserRole.VIEWER
    email: EmailStr | None = None
    firstOrgAdmin: bool = False


# ============================================================================
class InviteRequest(BaseModel):
    """Request to invite another user"""

    email: EmailStr


# ============================================================================
class InviteToOrgRequest(InviteRequest):
    """Request to invite another user to an organization"""

    role: UserRole


# ============================================================================
class AddToOrgRequest(InviteRequest):
    """Request to add a new user to an organization directly"""

    role: UserRole
    password: str
    name: str


# ============================================================================
class InviteAddedResponse(BaseModel):
    """Response for API endpoints that add resource and return id and name"""

    added: bool
    id: UUID
    invited: str
    token: UUID


# ============================================================================

### MAIN USER MODEL ###


# ============================================================================
class User(BaseModel):
    """
    User Model
    """

    id: UUID

    name: str = ""
    email: EmailStr
    is_superuser: bool = False
    is_verified: bool = False

    hashed_password: str

    def dict(self, *a, **kw):
        """ensure invites / hashed_password never serialize, just in case"""
        exclude = kw.get("exclude") or set()
        exclude.add("invites")
        exclude.add("hashed_password")
        return super().dict(*a, **kw)


# ============================================================================
class FailedLogin(BaseMongoModel):
    """
    Failed login model
    """

    attempted: datetime
    email: str

    # Consecutive failed logins, reset to 0 on successful login or after
    # password is reset. On failed_logins >= 5 within the hour before this
    # object is deleted, the user is unable to log in until they reset their
    # password.
    count: int = 1


# ============================================================================
class UserOrgInfoOut(BaseModel):
    """org per user"""

    id: UUID

    name: str
    slug: str
    default: bool
    role: UserRole


# ============================================================================

### CRAWL STATES

# ============================================================================
TYPE_RUNNING_STATES = Literal[
    "running", "pending-wait", "generate-wacz", "uploading-wacz", "rate-limited"
]
RUNNING_STATES = get_args(TYPE_RUNNING_STATES)

TYPE_MANUALLY_PAUSED_STATES = Literal["paused"]

TYPE_AUTO_PAUSED_STATES = Literal[
    "paused_storage_quota_reached",
    "paused_time_quota_reached",
    "paused_org_readonly",
    "paused_rate_limit_time_reached",
]

AUTO_PAUSED_STATES = get_args(TYPE_AUTO_PAUSED_STATES)

TYPE_PAUSED_STATES = Literal[
    TYPE_MANUALLY_PAUSED_STATES,
    TYPE_AUTO_PAUSED_STATES,
]
PAUSED_STATES = get_args(TYPE_PAUSED_STATES)

TYPE_WAITING_NOT_PAUSED_STATES = Literal[
    "starting", "waiting_capacity", "waiting_org_limit", "waiting_dedupe_index"
]
WAITING_NOT_PAUSED_STATES = get_args(TYPE_WAITING_NOT_PAUSED_STATES)

TYPE_UPLOAD_STATES = Literal["processing-upload"]
UPLOAD_STATES = get_args(TYPE_UPLOAD_STATES)

TYPE_WAITING_STATES = Literal[TYPE_PAUSED_STATES, TYPE_WAITING_NOT_PAUSED_STATES]
WAITING_STATES = [*PAUSED_STATES, *WAITING_NOT_PAUSED_STATES]

TYPE_FAILED_STATES = Literal[
    "canceled",
    "failed",
    "failed_not_logged_in",
    "skipped_storage_quota_reached",
    "skipped_time_quota_reached",
]
FAILED_STATES = get_args(TYPE_FAILED_STATES)

TYPE_SUCCESSFUL_STATES = Literal[
    "complete",
    "stopped_by_user",
    "stopped_pause_expired",
    "stopped_storage_quota_reached",
    "stopped_time_quota_reached",
    "stopped_org_readonly",
]
SUCCESSFUL_STATES = get_args(TYPE_SUCCESSFUL_STATES)
SUCCESSFUL_AND_PAUSED_STATES = [*PAUSED_STATES, *SUCCESSFUL_STATES]

TYPE_RUNNING_AND_WAITING_STATES = Literal[TYPE_WAITING_STATES, TYPE_RUNNING_STATES]
RUNNING_AND_WAITING_STATES = [*WAITING_STATES, *RUNNING_STATES]

RUNNING_AND_STARTING_ONLY = ["starting", *RUNNING_STATES]

TYPE_NON_RUNNING_STATES = Literal[TYPE_FAILED_STATES, TYPE_SUCCESSFUL_STATES]
NON_RUNNING_STATES = [*FAILED_STATES, *SUCCESSFUL_STATES]

TYPE_ALL_CRAWL_STATES = Literal[
    TYPE_RUNNING_AND_WAITING_STATES, TYPE_NON_RUNNING_STATES, TYPE_UPLOAD_STATES
]
ALL_CRAWL_STATES = [*RUNNING_AND_WAITING_STATES, *NON_RUNNING_STATES, *UPLOAD_STATES]


# ============================================================================

### CRAWL TYPES

# ============================================================================
TYPE_CRAWL_TYPES = Literal["crawl", "upload"]
CRAWL_TYPES = get_args(TYPE_CRAWL_TYPES)


# ============================================================================
class CrawlStats(BaseModel):
    """Crawl Stats for pages and size"""

    found: int = 0
    done: int = 0
    size: int = 0

    req_crawls: list[str] = []


# ============================================================================

### CRAWL CONFIGS ###


# ============================================================================
class JobType(StrEnum):
    """Job Types"""

    URL_LIST = "url-list"
    SEED_CRAWL = "seed-crawl"
    CUSTOM = "custom"


# ============================================================================
class ScopeType(StrEnum):
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
    scopeType: ScopeType | None = None

    include: str | list[str] | None = None
    exclude: str | list[str] | None = None
    sitemap: bool | HttpUrl | None = None
    allowHash: bool | None = None
    depth: int | None = None
    extraHops: int | None = None


# ============================================================================
class RawCrawlConfig(BaseModel):
    """Base Crawl Config"""

    seeds: list[Seed] | None = []

    seedFileId: UUID | None = None

    scopeType: ScopeType | None = ScopeType.PREFIX

    include: str | list[str] | None = None
    exclude: str | list[str] | None = None

    depth: int | None = -1
    limit: int | None = 0
    extraHops: int | None = 0

    lang: str | None = None
    blockAds: bool | None = False

    behaviorTimeout: int | None = None
    pageLoadTimeout: int | None = None
    pageExtraDelay: int | None = 0
    postLoadDelay: int | None = 0

    workers: int | None = None

    headless: bool | None = None

    generateWACZ: bool | None = None
    combineWARC: bool | None = None

    useSitemap: bool | None = False
    useRobots: bool | None = False

    failOnFailedSeed: bool | None = False
    failOnContentCheck: bool | None = False

    logging: str | None = None
    behaviors: str | None = "autoscroll,autoplay,autofetch,siteSpecific"
    customBehaviors: list[str] = []

    userAgent: str | None = None

    selectLinks: list[str] = ["a[href]->href"]
    clickSelector: str = "a"

    alwaysAddBehaviorLinks: bool | None = False

    saveStorage: bool | None = False


# ============================================================================
class CrawlConfigIn(BaseModel):
    """CrawlConfig input model, submitted via API"""

    schedule: str | None = ""
    runNow: bool = False

    config: RawCrawlConfig

    name: NameOrEmptyStr

    description: Description = ""

    jobType: JobType | None = JobType.CUSTOM

    profileid: UUID | EmptyStr | None = None
    crawlerChannel: str = "default"
    proxyId: str | None = None

    autoAddCollections: list[UUID] | None = []
    dedupeCollId: UUID | EmptyStr | None = None

    tags: list[Tag] | None = []

    crawlTimeout: int = 0
    maxCrawlSize: int = 0

    scale: Annotated[Scale, Field(deprecated=True)] = 1

    # Overrides scale if set
    browserWindows: BrowserWindowCount | None = None

    crawlFilenameTemplate: str | None = None

    shareable: bool = False


# ============================================================================
class ConfigRevision(BaseMongoModel):
    """Crawl Config Revision"""

    cid: UUID

    schedule: str | None = ""

    config: RawCrawlConfig

    profileid: UUID | None = None
    crawlerChannel: str | None = None
    proxyId: str | None = None

    crawlTimeout: int | None = 0
    maxCrawlSize: int | None = 0
    scale: Annotated[Scale | None, Field(deprecated=True)] = 1
    browserWindows: BrowserWindowCount | None = 2

    modified: datetime
    modifiedBy: UUID | None = None

    rev: int = 0


# ============================================================================
class CrawlConfigCore(BaseMongoModel):
    """Core data shared between crawls and crawlconfigs"""

    schedule: str | None = ""

    jobType: JobType | None = JobType.CUSTOM
    config: RawCrawlConfig | None = None

    tags: list[Tag] | None = []

    crawlTimeout: int | None = 0
    maxCrawlSize: int | None = 0

    scale: Annotated[Scale | None, Field(deprecated=True)] = None
    browserWindows: BrowserWindowCount = 2

    oid: UUID

    profileid: UUID | None = None
    crawlerChannel: str | None = None
    proxyId: str | None = None

    firstSeed: str = ""
    seedCount: int = 0

    dedupeCollId: UUID | None = None


# ============================================================================
class CrawlConfigAdditional(BaseModel):
    """Additional fields shared by CrawlConfig and CrawlConfigOut."""

    name: NameOrEmptyStr | None = None
    description: Description | None = None

    created: datetime
    createdBy: UUID | None = None

    modified: datetime | None = None
    modifiedBy: UUID | None = None

    autoAddCollections: list[UUID] | None = []

    inactive: bool | None = False

    rev: int = 0

    crawlAttemptCount: int | None = 0
    crawlCount: int | None = 0
    crawlSuccessfulCount: int | None = 0

    totalSize: int | None = 0

    lastCrawlId: str | None = None
    lastCrawlStartTime: datetime | None = None
    lastStartedBy: UUID | None = None
    lastCrawlTime: datetime | None = None
    lastCrawlState: str | None = None
    lastCrawlSize: int | None = None

    lastRun: datetime | None = None

    isCrawlRunning: bool | None = False

    crawlFilenameTemplate: str | None = None

    shareable: bool | None = False


# ============================================================================
class CrawlConfig(CrawlConfigCore, CrawlConfigAdditional):
    """Schedulable config"""

    id: UUID

    config: RawCrawlConfig
    createdByName: str | None = None
    modifiedByName: str | None = None
    lastStartedByName: str | None = None

    def get_raw_config(self):
        """serialize config for browsertrix-crawler"""
        return self.config.dict(exclude_unset=True, exclude_none=True)


# ============================================================================
class CrawlConfigOut(CrawlConfigCore, CrawlConfigAdditional):
    """Crawl Config Output"""

    id: UUID

    lastCrawlStopping: bool | None = False
    lastCrawlShouldPause: bool | None = False
    lastCrawlPausedAt: datetime | None = None
    lastCrawlPausedExpiry: datetime | None = None
    lastCrawlStats: CrawlStats | None = None
    profileName: str | None = None

    createdByName: str | None = None
    modifiedByName: str | None = None
    lastStartedByName: str | None = None


# ============================================================================
class UpdateCrawlConfig(BaseModel):
    """Update crawl config name, crawl schedule, or tags"""

    # metadata: not revision tracked
    name: NameOrEmptyStr | None = None
    tags: list[Tag] | None = None
    description: Description = None
    autoAddCollections: list[UUID] | None = None
    dedupeCollId: UUID | EmptyStr | None = None
    runNow: bool = False
    updateRunning: bool = False

    # crawl data: revision tracked
    schedule: str | None = None
    profileid: UUID | EmptyStr | None = None
    crawlerChannel: str | None = None
    proxyId: str | None = None
    crawlTimeout: int | None = None
    maxCrawlSize: int | None = None
    scale: Annotated[Scale | None, Field(deprecated=True)] = None
    browserWindows: BrowserWindowCount | None = None
    crawlFilenameTemplate: str | None = None
    config: RawCrawlConfig | None = None
    shareable: bool | None = None


# ============================================================================
class CrawlConfigDefaults(BaseModel):
    """Crawl Config Org Defaults"""

    crawlTimeout: int | None = None
    maxCrawlSize: int | None = None

    pageLoadTimeout: int | None = None
    postLoadDelay: int | None = None
    behaviorTimeout: int | None = None
    pageExtraDelay: int | None = None

    blockAds: bool | None = None

    profileid: UUID | None = None
    crawlerChannel: str | None = None
    proxyId: str | None = None

    lang: str | None = None

    userAgent: str | None = None

    exclude: list[str] | None = None

    customBehaviors: list[str] = []

    dedupeCollId: UUID | None = None


# ============================================================================
class CrawlConfigAddedResponse(BaseModel):
    """Response model for adding crawlconfigs"""

    added: bool
    id: str
    run_now_job: str | None = None
    storageQuotaReached: bool
    execMinutesQuotaReached: bool
    errorDetail: str | None = None


# ============================================================================
class TagCount(BaseModel):
    """Response model for crawlconfig/crawl tag count"""

    tag: str
    count: int


# ============================================================================
class TagsResponse(BaseModel):
    """Response model for crawlconfig/crawl tags"""

    tags: list[TagCount]


# ============================================================================
class CrawlConfigSearchValues(BaseModel):
    """Response model for adding crawlconfigs"""

    names: list[str]
    descriptions: list[str]
    firstSeeds: list[str]
    workflowIds: list[UUID]


# ============================================================================
class CrawlConfigUpdateResponse(BaseModel):
    """Response model for updating crawlconfigs"""

    updated: bool = True
    settings_changed: bool
    metadata_changed: bool
    updatedRunning: bool = False

    storageQuotaReached: bool | None = False
    execMinutesQuotaReached: bool | None = False

    started: str | None = None


# ============================================================================
class CrawlConfigDeletedResponse(BaseModel):
    """Response model for deleting crawlconfigs"""

    success: bool
    status: str


# ============================================================================
class ValidateCustomBehavior(BaseModel):
    """Input model for validating custom behavior URL/Git reference"""

    customBehavior: str


# ============================================================================

### CRAWLER VERSIONS ###


# ============================================================================
class CrawlerChannel(BaseModel):
    """Crawler version available to use in workflows"""

    id: str
    image: str
    imagePullPolicy: str | None = None


# ============================================================================
class CrawlerChannels(BaseModel):
    """List of CrawlerChannel instances for API"""

    channels: list[CrawlerChannel] = []


# ============================================================================

### PROXIES ###


class CrawlerProxy(BaseModel):
    """proxy definition"""

    id: str
    url: str
    label: str
    description: str = ""
    country_code: str = ""
    has_host_public_key: bool = False
    has_private_key: bool = False
    shared: bool = False


# ============================================================================
class CrawlerProxies(BaseModel):
    """List of CrawlerProxy instances for API"""

    default_proxy_id: str | None = None
    servers: list[CrawlerProxy] = []


# ============================================================================
class OrgProxies(BaseModel):
    """Org proxy settings for API"""

    allowSharedProxies: bool
    allowedProxies: list[str]


# ============================================================================

### BASE CRAWLS ###


# ============================================================================
class StorageRef(BaseModel):
    """Reference to actual storage"""

    name: str
    custom: bool | None = False

    def __init__(self, *args, **kwargs):
        if args:
            if args[0].startswith("cs-"):
                super().__init__(name=args[0][2:], custom=True)
            else:
                super().__init__(name=args[0], custom=False)
        else:
            super().__init__(**kwargs)

    def __str__(self):
        if not self.custom:
            return self.name
        return "cs-" + self.name

    def get_storage_secret_name(self, oid: str) -> str:
        """get k8s secret name for this storage and oid"""
        if not self.custom:
            return "storage-" + self.name
        return f"storage-cs-{self.name}-{oid[:12]}"

    def get_storage_extra_path(self, oid: str) -> str:
        """return extra path added to the endpoint
        using oid for default storages, no extra path for custom"""
        if not self.custom:
            return oid + "/"
        return ""


# ============================================================================
class PresignedUrl(BaseMongoModel):
    """Base model for presigned url"""

    id: str
    url: str
    oid: UUID
    signedAt: datetime


# ============================================================================
class BaseFile(BaseModel):
    """Base model for crawl and profile files"""

    filename: str
    hash: str
    size: int
    storage: StorageRef

    replicas: list[StorageRef] | None = []


# ============================================================================
class CrawlFile(BaseFile):
    """file from a crawl"""


# ============================================================================
class CrawlFileOut(BaseModel):
    """output for file from a crawl (conformance to Data Resource Spec)"""

    name: str
    path: str
    hash: str
    size: int

    crawlId: str | None = None
    numReplicas: int = 0
    expireAt: str | None = None
    fromDependency: bool = False


# ============================================================================
class CrawlDedupeStats(BaseModel):
    """Dedupe stats for crawl"""

    uniqueHashes: int = 0
    totalUrls: int = 0
    dupeUrls: int = 0
    conservedSize: int = 0


# ============================================================================
class CoreCrawlable(BaseModel):
    # pylint: disable=too-few-public-methods
    """Core properties for crawlable run (crawl or qa run)"""

    id: str

    userid: UUID
    userName: str | None = None

    started: datetime
    finished: datetime | None = None

    state: str

    crawlExecSeconds: int = 0

    image: str | None = None

    stats: CrawlStats | None = CrawlStats()

    files: list[CrawlFile] = []

    fileSize: int = 0
    fileCount: int = 0


# ============================================================================
class BaseCrawl(CoreCrawlable, BaseMongoModel):
    """Base Crawl object (representing crawls, uploads and manual sessions)"""

    type: TYPE_CRAWL_TYPES

    oid: UUID
    cid: UUID | None = None

    name: str | None = ""

    description: str | None = ""

    tags: list[str] | None = []

    collectionIds: list[UUID] | None = []

    reviewStatus: ReviewStatus = None

    pageCount: int | None = 0
    uniquePageCount: int | None = 0

    filePageCount: int | None = 0
    errorPageCount: int | None = 0

    isMigrating: bool | None = None
    version: int | None = None

    requiresCrawls: list[str] | None = []
    requiredByCrawls: list[str] | None = []


# ============================================================================
class CollIdName(BaseModel):
    """Collection id and name object"""

    id: UUID
    name: str


# ============================================================================
class CrawlOut(BaseMongoModel):
    """Crawl output model, shared across all crawl types"""

    # pylint: disable=duplicate-code

    type: TYPE_CRAWL_TYPES

    id: str

    userid: UUID
    userName: str | None = None
    oid: UUID

    profileid: UUID | None = None

    name: str | None = None
    description: str | None = None

    started: datetime
    finished: datetime | None = None

    state: str

    stats: CrawlStats | None = None

    fileSize: int = 0
    fileCount: int = 0
    pendingSize: int = 0

    # computed only if dependencies are looked up
    fileSizeWithDeps: int | None = None

    tags: list[str] | None = []

    dedupeCollId: UUID | None = None
    collectionIds: list[UUID] | None = []

    crawlExecSeconds: int = 0
    qaCrawlExecSeconds: int = 0

    # automated crawl fields
    config: RawCrawlConfig | None = None
    cid: UUID | None = None
    firstSeed: str | None = None
    seedCount: int | None = None
    profileName: str | None = None
    stopping: bool | None = False
    shouldPause: bool | None = False
    pausedAt: datetime | None = None
    manual: bool = False
    cid_rev: int | None = None
    scale: Annotated[Scale | None, Field(deprecated=True)] = None
    browserWindows: BrowserWindowCount = 2

    storageQuotaReached: bool | None = False
    execMinutesQuotaReached: bool | None = False

    crawlerChannel: str = "default"
    proxyId: str | None = None
    image: str | None = None

    reviewStatus: ReviewStatus = None

    qaRunCount: int = 0
    activeQAStats: CrawlStats | None = None
    lastQAState: str | None = None
    lastQAStarted: datetime | None = None

    pageCount: int | None = 0
    uniquePageCount: int | None = 0
    filePageCount: int | None = 0
    errorPageCount: int | None = 0

    # Set to older version by default, crawls with optimized
    # pages will have this explicitly set to 2
    version: int | None = 1

    # Retained for backward compatibility
    errors: Annotated[list[str] | None, Field(default=[], deprecated=True)]
    behaviorLogs: Annotated[list[str] | None, Field(default=[], deprecated=True)]

    # Linked Crawls for dedupe
    requiresCrawls: list[str] | None = []
    requiredByCrawls: list[str] | None = []

    # computed only if dependencies are looked up
    missingRequiresCrawls: list[str] | None = None

    dedupeStats: CrawlDedupeStats | None = None


# ============================================================================
class UpdateCrawl(BaseModel):
    """Update crawl"""

    name: NameOrEmptyStr | None = None
    description: Description = None
    tags: list[Tag] | None = None
    collectionIds: list[UUID] | None = []
    reviewStatus: ReviewStatus = None


# ============================================================================
class DeleteCrawlList(BaseModel):
    """delete crawl list POST body"""

    crawl_ids: list[str]


# ============================================================================
class DeleteQARunList(BaseModel):
    """delete qa run list POST body"""

    qa_run_ids: list[str]


# ============================================================================
class CrawlSearchValuesResponse(BaseModel):
    """Response model for crawl search values"""

    ids: list[str]
    names: list[str]
    descriptions: list[str]
    firstSeeds: list[str]


# ============================================================================
class CrawlQueueResponse(BaseModel):
    """Response model for GET crawl queue"""

    total: int
    results: list[AnyHttpUrl]
    matched: list[AnyHttpUrl]


# ============================================================================
class MatchCrawlQueueResponse(BaseModel):
    """Response model for match crawl queue"""

    total: int
    matched: list[AnyHttpUrl]
    nextOffset: int


# ============================================================================

### AUTOMATED CRAWLS ###


# ============================================================================
class CrawlScale(BaseModel):
    """scale the crawl to N parallel containers or windows"""

    scale: Annotated[Scale | None, Field(deprecated=True)] = None
    browserWindows: BrowserWindowCount | None = None


# ============================================================================
class QARun(CoreCrawlable, BaseModel):
    """Subdocument to track QA runs for given crawl"""


# ============================================================================
class QARunWithResources(QARun):
    """QA crawl output model including resources"""

    resources: list[CrawlFileOut] | None = []


# ============================================================================
class QARunOut(BaseModel):
    """QA Run Output"""

    id: str

    userName: str | None = None

    started: datetime
    finished: datetime | None = None

    state: str

    crawlExecSeconds: int = 0

    stats: CrawlStats = CrawlStats()


# ============================================================================
class QARunBucketStats(BaseModel):
    """Model for per-bucket aggregate stats results"""

    lowerBoundary: str
    count: int


# ============================================================================
class QARunAggregateStatsOut(BaseModel):
    """QA Run aggregate stats out"""

    screenshotMatch: list[QARunBucketStats]
    textMatch: list[QARunBucketStats]


# ============================================================================
class Crawl(BaseCrawl, CrawlConfigCore):
    """Store State of a Crawl (Finished or Running)"""

    type: Literal["crawl"] = "crawl"

    cid: UUID

    config: RawCrawlConfig

    cid_rev: int = 0

    # schedule: Optional[str]
    manual: bool = False

    stopping: bool | None = False
    shouldPause: bool | None = False

    qaCrawlExecSeconds: int = 0

    qa: QARun | None = None
    qaFinished: dict[str, QARun] | None = {}

    pendingSize: int = 0

    autoPausedEmailsSent: bool = False

    dedupeStats: CrawlDedupeStats | None = None


# ============================================================================
class CrawlCompleteIn(BaseModel):
    """Completed Crawl Webhook POST message"""

    id: str

    user: str

    filename: str
    size: int
    hash: str

    completed: bool | None = True


# ============================================================================
class CrawlScaleResponse(BaseModel):
    """Response model for modifying crawl scale"""

    scaled: bool
    browserWindows: int


# ============================================================================

### UPLOADED CRAWLS ###


# ============================================================================
class UploadedCrawl(BaseCrawl):
    """Store State of a Crawl Upload"""

    name: Name

    type: Literal["upload"] = "upload"
    image: None = None


# ============================================================================
class UpdateUpload(UpdateCrawl):
    """Update modal that also includes name"""

    name: Name | None


# ============================================================================
class FilePreparer:
    """wrapper to compute digest / name for streaming upload"""

    def __init__(self, prefix, filename):
        self.upload_size = 0
        self.upload_hasher = hashlib.sha256()
        self.upload_name = prefix + "-" + self.prepare_filename(filename)

    def add_chunk(self, chunk):
        """add chunk for file"""
        self.upload_size += len(chunk)
        self.upload_hasher.update(chunk)

    def get_crawl_file(self, storage: StorageRef):
        """get crawl file"""
        return CrawlFile(
            filename=self.upload_name,
            hash=self.upload_hasher.hexdigest(),
            size=self.upload_size,
            storage=storage,
        )

    def prepare_filename(self, filename):
        """prepare filename by sanitizing and adding extra string
        to avoid duplicates"""
        name, ext = os.path.splitext(filename)
        name = slugify(name.rsplit("/", 1)[-1])
        randstr = base64.b32encode(os.urandom(5)).lower()
        return name + "-" + randstr.decode("utf-8") + ext


# ============================================================================

### LOGS ###


# ============================================================================
class CrawlLogLine(BaseMongoModel):
    """Model for crawler log lines"""

    id: UUID

    crawlId: str
    oid: UUID

    qaRunId: str | None = None

    timestamp: datetime
    logLevel: str
    context: str
    message: str
    details: dict[str, Any] | None = None

    @property
    def is_qa(self) -> bool:
        """return true if log line is from qa run"""
        return bool(self.qaRunId)


# ============================================================================

### USER-UPLOADED FILES ###


# ============================================================================
class PublicUserFileOut(BaseModel):
    """public output for user-uploaded file stored on other document

    Public User Upload File (used for collection thumbnails).
    Conforms to Data Resource Spec.
    """

    name: str
    path: str
    hash: str
    size: int

    mime: str


# ============================================================================
class UserFileOut(PublicUserFileOut):
    """output for user-uploaded file as stored on other document,
    additional non-public fields included
    Conforms to Data Resource Spec.
    """

    originalFilename: str
    mime: str
    userid: UUID
    userName: str
    created: datetime


# ============================================================================
class UserFile(BaseFile):
    """User-uploaded file stored on anther mongo document

    Base user uploaded file (currently used for collection thumbnails).
    Conforms to Data Resource Spec.
    """

    originalFilename: str
    mime: str
    userid: UUID
    userName: str
    created: datetime

    async def get_absolute_presigned_url(
        self, org, storage_ops, headers: dict | None
    ) -> str:
        """Get presigned URL as absolute URL"""
        presigned_url, _ = await storage_ops.get_presigned_url(org, self)
        return storage_ops.resolve_relative_access_path(presigned_url, headers) or ""

    async def get_file_out(
        self, org, storage_ops, headers: dict | None = None
    ) -> UserFileOut:
        """Get UserFileOut with new presigned url"""
        return UserFileOut(
            name=self.filename,
            path=await self.get_absolute_presigned_url(org, storage_ops, headers),
            hash=self.hash,
            size=self.size,
            originalFilename=self.originalFilename,
            mime=self.mime,
            userid=self.userid,
            userName=self.userName,
            created=self.created,
        )

    async def get_public_file_out(
        self, org, storage_ops, headers: dict | None = None
    ) -> PublicUserFileOut:
        """Get PublicUserFileOut with new presigned url"""
        return PublicUserFileOut(
            name=self.filename,
            path=await self.get_absolute_presigned_url(org, storage_ops, headers),
            hash=self.hash,
            size=self.size,
            mime=self.mime,
        )


# ============================================================================
class UserFilePreparer(FilePreparer):
    """Wrapper for user streaming uploads"""

    # pylint: disable=too-many-arguments, too-many-function-args

    def __init__(
        self,
        prefix,
        filename,
        original_filename: str,
        user: User,
        created: datetime,
    ):
        super().__init__(prefix, filename)

        self.original_filename = original_filename
        self.mime, _ = mimetypes.guess_type(original_filename) or ("image/jpeg", None)
        self.userid = user.id
        self.user_name = user.name
        self.created = created

    def get_user_file(
        self,
        storage: StorageRef,
    ) -> UserFile:
        """get user-uploaded file"""
        return UserFile(
            filename=self.upload_name,
            hash=self.upload_hasher.hexdigest(),
            size=self.upload_size,
            storage=storage,
            originalFilename=self.original_filename,
            mime=self.mime,
            userid=self.userid,
            userName=self.user_name,
            created=self.created,
        )


# ============================================================================
class SeedFileOut(UserFileOut):
    """Output model for user-uploaded seed files"""

    id: UUID
    oid: UUID
    type: str

    firstSeed: str | None = None
    seedCount: int | None = None


# ============================================================================
class SeedFile(UserFile, BaseMongoModel):
    """Stores user-uploaded file files in 'file_uploads' mongo collection
    Used with crawl workflows
    """

    type: Literal["seedFile"] = "seedFile"

    id: UUID
    oid: UUID

    firstSeed: str | None = None
    seedCount: int | None = None

    async def get_file_out(
        self, org, storage_ops, headers: dict | None = None
    ) -> SeedFileOut:
        """Get SeedFileOut with new presigned url"""
        return SeedFileOut(
            name=self.filename,
            path=await self.get_absolute_presigned_url(org, storage_ops, headers),
            hash=self.hash,
            size=self.size,
            originalFilename=self.originalFilename,
            mime=self.mime,
            userid=self.userid,
            userName=self.userName,
            created=self.created,
            id=self.id,
            oid=self.oid,
            type=self.type,
            firstSeed=self.firstSeed,
            seedCount=self.seedCount,
        )


# ============================================================================

### PAGES ###


# ============================================================================
class PageReviewUpdate(BaseModel):
    """Update model for page manual review/approval"""

    approved: bool | None = None


# ============================================================================
class PageNoteIn(BaseModel):
    """Input model for adding page notes"""

    text: str


# ============================================================================
class PageNoteEdit(BaseModel):
    """Input model for editing page notes"""

    id: UUID
    text: str


# ============================================================================
class PageNoteDelete(BaseModel):
    """Delete model for page notes"""

    delete_list: list[UUID] = []


# ============================================================================
class PageNote(BaseModel):
    """Model for page notes, tracking user and time"""

    id: UUID
    text: Annotated[str, Field(max_length=5000)]
    created: datetime
    userid: UUID
    userName: str


# ============================================================================
class PageQACompare(BaseModel):
    """Model for updating pages from QA run"""

    screenshotMatch: float | None = None
    textMatch: float | None = None
    resourceCounts: dict[str, int] | None = None


# ============================================================================
class Page(BaseMongoModel):
    """Core page data, no QA"""

    id: UUID

    oid: UUID
    crawl_id: str

    # core page data
    url: AnyHttpUrl
    title: str | None = None
    ts: datetime | None = None
    loadState: int | None = None
    status: int | None = None
    mime: str | None = None
    filename: str | None = None
    depth: int | None = None
    favIconUrl: str | None = None
    isSeed: bool | None = False

    # manual review
    userid: UUID | None = None
    modified: datetime | None = None
    approved: bool | None = None
    notes: list[PageNote] = []

    isFile: bool | None = False
    isError: bool | None = False

    def compute_page_type(self):
        """sets self.isFile or self.isError flags"""
        self.isFile = False
        self.isError = False
        if self.loadState == 2:
            # pylint: disable=unsupported-membership-test
            if self.mime and "html" not in self.mime:
                self.isFile = True
            elif self.title is None and self.status == 200:
                self.isFile = True

        elif self.loadState == 0:
            self.isError = True


# ============================================================================
class PageWithAllQA(Page):
    """Model for core page data + qa"""

    # automated heuristics, keyed by QA run id
    qa: dict[str, PageQACompare] | None = {}


# ============================================================================
class PageOut(Page):
    """Model for pages output, no QA"""

    status: int = 200


# ============================================================================
class PageOutWithSingleQA(Page):
    """Page out with single QA entry"""

    qa: PageQACompare | None = None


# ============================================================================
class PageNoteAddedResponse(BaseModel):
    """Model for response to adding page"""

    added: bool
    data: PageNote


# ============================================================================
class PageNoteUpdatedResponse(BaseModel):
    """Model for response to updating page"""

    updated: bool
    data: PageNote


# ============================================================================
class PageIdTimestamp(BaseModel):
    """Simplified model for page info to include in PageUrlCount"""

    pageId: UUID
    ts: datetime | None = None
    status: int = 200


# ============================================================================
class PageUrlCount(BaseModel):
    """Model for counting pages by URL"""

    url: AnyHttpUrl
    count: int = 0
    snapshots: list[PageIdTimestamp] = []


# ============================================================================
class ResourcesOnly(BaseModel):
    """Resources-only response"""

    resources: list[CrawlFileOut] | None = []


# ============================================================================
class CrawlOutWithResources(CrawlOut):
    """Crawl output model including resources"""

    resources: list[CrawlFileOut] | None = []
    collections: list[CollIdName] | None = []

    initialPages: list[PageOut] = []
    pagesQueryUrl: str = ""
    downloadUrl: str | None = None


# ============================================================================

### COLLECTIONS ###

TYPE_DEDUPE_INDEX_STATES = Literal[
    "initing", "importing", "ready", "purging", "idle", "saving", "saved", "crawling"
]
DEDUPE_INDEX_STATES = get_args(TYPE_DEDUPE_INDEX_STATES)


TYPE_INDEX_JOB_TYPES = Literal["import", "purge", "commit", "cancel"]

INDEX_JOB_TYPES = get_args(TYPE_INDEX_JOB_TYPES)


# ============================================================================
class CollAccessType(StrEnum):
    """Collection access types"""

    PRIVATE = "private"
    UNLISTED = "unlisted"
    PUBLIC = "public"


# ============================================================================
class CollectionThumbnailSource(BaseModel):
    """The page source for a thumbnail"""

    url: AnyHttpUrl
    urlTs: datetime
    urlPageId: UUID


# ============================================================================
class PreloadResource(BaseModel):
    """Resources that will preloaded in RWP"""

    name: str
    crawlId: str


# ============================================================================
class HostCount(BaseModel):
    """Host Count"""

    host: str
    count: int


# ============================================================================
class DedupeIndexFile(BaseFile):
    """serialize dedupe index"""

    type: Literal["redis", "kvrocks"] = "kvrocks"


# ============================================================================
class DedupeIndexStats(BaseModel):
    """stats from collection dedupe index"""

    totalUrls: int = 0
    dupeUrls: int = 0

    conservedSize: int = 0

    totalCrawls: int = 0
    totalCrawlSize: int = 0

    removedCrawls: int = 0
    removedCrawlSize: int = 0

    # import / purge progress
    updateProgress: float = 0

    # for internal use for now
    uniqueHashes: int = 0
    estimatedRedundantSize: int = 0


# ============================================================================
class Collection(BaseMongoModel):
    """Org collection structure"""

    id: UUID
    name: CollectionName
    slug: CollectionSlug
    oid: UUID
    description: Description = None
    caption: CollectionCaption = None

    created: datetime | None = None
    modified: datetime | None = None

    lastStatsUpdateStarted: datetime | None = None

    crawlCount: int | None = 0
    pageCount: int | None = 0
    uniquePageCount: int | None = 0
    totalSize: int | None = 0

    dateEarliest: datetime | None = None
    dateLatest: datetime | None = None

    # Sorted by count, descending
    tags: list[str] | None = []

    access: CollAccessType = CollAccessType.PRIVATE

    homeUrl: AnyHttpUrl | None = None
    homeUrlTs: datetime | None = None
    homeUrlPageId: UUID | None = None

    thumbnail: UserFile | None = None
    thumbnailSource: CollectionThumbnailSource | None = None
    defaultThumbnailName: str | None = None

    allowPublicDownload: bool | None = True

    previousSlugs: list[str] = []

    indexLastSavedAt: datetime | None = None
    indexFile: DedupeIndexFile | None = None
    indexState: TYPE_DEDUPE_INDEX_STATES | None = None

    indexStats: DedupeIndexStats | None = None

    # size of db on disk when in use
    indexDiskSpaceUsed: int | None = None


# ============================================================================
class CollIn(BaseModel):
    """Collection Passed in By User"""

    name: CollectionName
    slug: CollectionSlug | None = None
    description: Description = None
    caption: CollectionCaption = None
    crawlIds: list[str] | None = []

    access: CollAccessType = CollAccessType.PRIVATE

    defaultThumbnailName: str | None = None
    allowPublicDownload: bool = True

    hasDedupeIndex: bool = False


# ============================================================================
class CollOut(BaseMongoModel):
    """Collection output model with annotations."""

    id: UUID
    name: str
    slug: str
    oid: UUID
    description: str | None = None
    caption: str | None = None
    created: datetime | None = None
    modified: datetime | None = None

    lastStatsUpdateStarted: datetime | None = None

    crawlCount: int | None = 0
    pageCount: int | None = 0
    uniquePageCount: int | None = 0
    totalSize: int | None = 0

    dateEarliest: datetime | None = None
    dateLatest: datetime | None = None

    # Sorted by count, descending
    tags: list[str] | None = []

    access: CollAccessType = CollAccessType.PRIVATE

    homeUrl: AnyHttpUrl | None = None
    homeUrlTs: datetime | None = None
    homeUrlPageId: UUID | None = None

    resources: list[CrawlFileOut] = []
    thumbnail: UserFileOut | None = None
    thumbnailSource: CollectionThumbnailSource | None = None
    defaultThumbnailName: str | None = None

    allowPublicDownload: bool = True

    initialPages: list[PageOut] = []
    preloadResources: list[PreloadResource] = []
    pagesQueryUrl: str = ""
    downloadUrl: str | None = None

    topPageHosts: list[HostCount] = []

    indexLastSavedAt: datetime | None = None
    indexState: TYPE_DEDUPE_INDEX_STATES | None = None

    indexStats: DedupeIndexStats | None = None

    runningUpdatesCount: int = 0


# ============================================================================
class PublicCollOut(BaseMongoModel):
    """Collection output model with annotations."""

    id: UUID
    name: str
    slug: str
    oid: UUID
    orgName: str
    orgPublicProfile: bool
    description: str | None = None
    caption: str | None = None
    created: datetime | None = None
    modified: datetime | None = None

    lastStatsUpdateStarted: datetime | None = None

    crawlCount: int | None = 0
    pageCount: int | None = 0
    uniquePageCount: int | None = 0
    totalSize: int | None = 0

    dateEarliest: datetime | None = None
    dateLatest: datetime | None = None

    access: CollAccessType = CollAccessType.PUBLIC

    homeUrl: AnyHttpUrl | None = None
    homeUrlTs: datetime | None = None

    resources: list[CrawlFileOut] = []
    thumbnail: PublicUserFileOut | None = None
    thumbnailSource: CollectionThumbnailSource | None = None
    defaultThumbnailName: str | None = None

    allowPublicDownload: bool = True

    topPageHosts: list[HostCount] = []

    runningUpdatesCount: int = 0


# ============================================================================
class UpdateColl(BaseModel):
    """Update collection"""

    name: CollectionName | None = None
    slug: CollectionSlug | None = None
    description: Description = None
    caption: CollectionCaption = None
    access: CollAccessType | None = None
    defaultThumbnailName: str | None = None
    allowPublicDownload: bool | None = None
    thumbnailSource: CollectionThumbnailSource | None = None
    hasDedupeIndex: bool | None = None


# ============================================================================
class UpdateCollHomeUrl(BaseModel):
    """Update home url for collection"""

    pageId: UUID | None = None


# ============================================================================
class CollectionAddRemove(BaseModel):
    """Items to add or remove from collection"""

    crawlIds: list[str] = []
    crawlconfigIds: list[UUID] = []


# ============================================================================
class CollectionSearchValuesResponse(BaseModel):
    """Response model for collections search values"""

    names: list[str]


# ============================================================================
class CollectionAllResponse(BaseModel):
    """Response model for '$all' collection endpoint"""

    resources: list[CrawlFileOut] = []


# ============================================================================
class DeleteDedupeIndex(BaseModel):
    """Options for deleting dedupe index on collection"""

    removeFromWorkflows: bool = False


# ============================================================================

### ORGS ###


# ============================================================================
class UpdateRole(InviteToOrgRequest):
    """Update existing role for user"""


# ============================================================================
class RemoveFromOrg(InviteRequest):
    """Remove this user from org"""


# ============================================================================
class RemovePendingInvite(InviteRequest):
    """Delete pending invite to org by email"""


# ============================================================================
class RenameOrg(BaseModel):
    """Rename an existing org"""

    name: OrgName
    slug: str | None = None


# ============================================================================
class UpdateOrgNote(BaseModel):
    """Update org note"""

    note: str | None = None


# ============================================================================
class PublicOrgDetails(BaseModel):
    """Model for org details that are available in public profile"""

    name: str
    description: str = ""
    url: str = ""


# ============================================================================
class OrgPublicCollections(BaseModel):
    """Model for listing public collections in org"""

    org: PublicOrgDetails

    collections: list[PublicCollOut] = []


# ============================================================================
class OrgStorageRefs(BaseModel):
    """Input model for setting primary storage + optional replicas"""

    storage: StorageRef

    storageReplicas: list[StorageRef] = []


# ============================================================================
class S3StorageIn(BaseModel):
    """Custom S3 Storage input model"""

    type: Literal["s3"] = "s3"

    name: str

    access_key: str
    secret_key: str
    endpoint_url: str
    bucket: str
    access_endpoint_url: str | None = None
    access_addressing_style: Literal["virtual", "path"] = "virtual"
    region: str = ""


# ============================================================================
class S3Storage(BaseModel):
    """S3 Storage Model"""

    type: Literal["s3"] = "s3"

    endpoint_url: str
    endpoint_no_bucket_url: str
    access_key: str
    secret_key: str
    access_endpoint_url: str
    access_addressing_style: Literal["virtual", "path"] = "virtual"
    region: str = ""


# ============================================================================
# Subscriptions
# ============================================================================


class SubscriptionStatus(StrEnum):
    """Statuses to be displayed in org banner"""

    ACTIVE = "active"
    TRIALING = "trialing"
    TRIALING_CANCELED = "trialing_canceled"
    PAUSED_PAYMENT_FAILED = "paused_payment_failed"
    CANCELLED = "cancelled"

    PAYMENT_NEVER_MADE = "payment_never_made"
    """
    used to track subscription attempts where payment was never made.
    these subscription events do not get sent to Browsertrix, but may
    be sent to other services
    """


REASON_PAUSED = "subscriptionPaused"
REASON_CANCELED = "subscriptionCanceled"

SubscriptionEventType = Literal["create", "import", "update", "cancel", "add-minutes"]


# ============================================================================
class OrgQuotas(BaseModel):
    """Organization quotas (settable by superadmin)"""

    storageQuota: int = 0
    maxExecMinutesPerMonth: int = 0

    maxConcurrentCrawls: int = 0
    maxPagesPerCrawl: int = 0

    extraExecMinutes: int = 0
    giftedExecMinutes: int = 0


# ============================================================================
class OrgQuotasIn(BaseModel):
    """Update for existing OrgQuotas"""

    storageQuota: int | None = None
    maxExecMinutesPerMonth: int | None = None

    maxConcurrentCrawls: int | None = None
    maxPagesPerCrawl: int | None = None

    extraExecMinutes: int | None = None
    giftedExecMinutes: int | None = None


# ============================================================================
class Plan(BaseModel):
    """Available Browsertrix plan, from env"""

    id: str
    name: str
    org_quotas: OrgQuotas
    testmode: bool = False


# ============================================================================
class PlansResponse(BaseModel):
    """Response for plans api endpoint"""

    plans: list[Plan]


# ============================================================================
class SubscriptionEventOut(BaseModel):
    """Fields to add to output models for subscription events"""

    oid: UUID
    timestamp: datetime
    type: SubscriptionEventType


# ============================================================================
class SubscriptionCreate(BaseModel):
    """create new subscription"""

    subId: str
    status: SubscriptionStatus
    planId: str

    firstAdminInviteEmail: EmailStr
    quotas: OrgQuotas | None = None


# ============================================================================
class SubscriptionCreateOut(SubscriptionCreate, SubscriptionEventOut):
    """Output model for subscription creation event"""

    type: Literal["create"] = "create"


# ============================================================================
class SubscriptionImport(BaseModel):
    """import subscription to existing org"""

    subId: str
    status: SubscriptionStatus
    planId: str
    oid: UUID


# ============================================================================
class SubscriptionImportOut(SubscriptionImport, SubscriptionEventOut):
    """Output model for subscription import event"""

    type: Literal["import"] = "import"


# ============================================================================
class SubscriptionUpdate(BaseModel):
    """update subscription data"""

    subId: str
    status: SubscriptionStatus
    planId: str

    futureCancelDate: datetime | None = None
    quotas: OrgQuotasIn | None = None


# ============================================================================
class SubscriptionUpdateOut(SubscriptionUpdate, SubscriptionEventOut):
    """Output model for subscription update event"""

    type: Literal["update"] = "update"


# ============================================================================
class SubscriptionCancel(BaseModel):
    """cancel subscription"""

    subId: str


# ============================================================================
class SubscriptionCancelOut(SubscriptionCancel, SubscriptionEventOut):
    """Output model for subscription cancellation event"""

    type: Literal["cancel"] = "cancel"


# ============================================================================
class SubscriptionAddMinutes(BaseModel):
    """Represents a purchase of additional minutes"""

    oid: UUID
    minutes: int
    totalPrice: float
    currency: str
    paymentId: str


# ============================================================================
class SubscriptionAddMinutesOut(SubscriptionAddMinutes, SubscriptionEventOut):
    """SubscriptionAddMinutes output model"""

    type: Literal["add-minutes"] = "add-minutes"


# ============================================================================
SubscriptionEventAny = (
    SubscriptionCreate
    | SubscriptionUpdate
    | SubscriptionCancel
    | SubscriptionImport
    | SubscriptionAddMinutes
)

SubscriptionEventAnyOut = (
    SubscriptionCreateOut
    | SubscriptionUpdateOut
    | SubscriptionCancelOut
    | SubscriptionImportOut
    | SubscriptionAddMinutesOut
)


# ============================================================================
class SubscriptionTrialEndReminder(BaseModel):
    """Email reminder that subscription will end soon"""

    subId: str
    behavior_on_trial_end: Literal["cancel", "continue", "read-only"]


# ============================================================================
class SubscriptionPortalUrlRequest(BaseModel):
    """Request for subscription update pull"""

    returnUrl: str

    subId: str
    planId: str

    bytesStored: int
    execSeconds: int


# ============================================================================
class SubscriptionPortalUrlResponse(BaseModel):
    """Response for subscription update pull"""

    portalUrl: str = ""


# ============================================================================
class AddonMinutesPricing(BaseModel):
    """Addon minutes pricing"""

    value: float
    currency: str


# ============================================================================
class CheckoutAddonMinutesRequest(BaseModel):
    """Request for additional minutes checkout session"""

    orgId: str
    subId: str
    minutes: int | None = None
    return_url: str


class CheckoutAddonMinutesResponse(BaseModel):
    """Response for additional minutes checkout session"""

    checkoutUrl: str


# ============================================================================
class Subscription(BaseModel):
    """subscription data"""

    model_config = ConfigDict(use_attribute_docstrings=True)

    subId: str
    status: SubscriptionStatus
    planId: str

    futureCancelDate: datetime | None = None
    # pylint: disable=C0301
    """When in a trial, future cancel date is the trial end date; when not in a trial, future cancel date is the date the subscription will be canceled, if set."""

    readOnlyOnCancel: bool = False


# ============================================================================
class SubscriptionCanceledResponse(BaseModel):
    """Response model for subscription cancel"""

    deleted: bool
    canceled: bool


# ============================================================================
# User Org Info With Subs
# ============================================================================
class UserOrgInfoOutWithSubs(UserOrgInfoOut):
    """org per user with sub info"""

    readOnly: bool
    readOnlyReason: str | None = None

    subscription: Subscription | None = None


# ============================================================================
class UserOutNoId(BaseModel):
    """Output User Model, no ID"""

    name: str = ""
    email: EmailStr
    orgs: list[UserOrgInfoOut | UserOrgInfoOutWithSubs]
    is_verified: bool = False


# ============================================================================
class UserOut(UserOutNoId):
    """Output User Model"""

    id: UUID
    is_superuser: bool = False


# ============================================================================
# Feature Flags
# ============================================================================


class ValidatedFeatureFlags(BaseModel):
    """Base class for feature flags with validation."""

    @model_validator(mode="after")
    def validate_all_fields(self) -> Self:
        """Ensure all fields have descriptions and are bools."""
        missing_descriptions = []
        non_bool_fields = []

        for field_name, field_info in self.model_fields.items():
            # Check for missing descriptions
            if not field_info.description:
                missing_descriptions.append(field_name)

            # Check if field type is bool (handles Annotated[bool, ...])
            annotation = field_info.annotation
            if get_origin(annotation) is Annotated:
                actual_type = get_args(annotation)[0]
            else:
                actual_type = annotation

            if actual_type is not bool:
                non_bool_fields.append(f"{field_name} (type: {actual_type})")

        if missing_descriptions:
            raise ValueError(
                f"The following fields are missing descriptions: {', '.join(missing_descriptions)}"
            )

        if non_bool_fields:
            raise ValueError(
                f"The following fields must be bool type: {', '.join(non_bool_fields)}"
            )

        return self


def make_feature_flags_partial(model_cls: type[BaseModel]) -> type[BaseModel]:
    """Return a partial model for feature flags without validation inheritance.

    This creates a model where all fields are optional (bool | None) but doesn't
    inherit from the original model to avoid the ValidatedFeatureFlags validator
    that checks for exact bool types.
    """
    new_fields = {}

    for f_name, f_info in model_cls.model_fields.items():
        f_dct = f_info.asdict()  # type: ignore

        # Create a new field that's bool | None with the same description
        new_fields[f_name] = (
            Annotated[
                (
                    bool | None,
                    Field(description=f_dct.get("description"), default=None),  # type: ignore
                )
            ],
            None,
        )

    return create_model(  # type: ignore
        f"{model_cls.__name__}Partial",
        **new_fields,
    )


# ============================================================================
# Feature Flags - Edit here
# ============================================================================


class FeatureFlags(ValidatedFeatureFlags):
    """Feature flags for an organization"""

    dedupeEnabled: bool = Field(
        description="Enable deduplication options for an org. Intended for beta-testing dedupe.",
        default=DEDUPE_FEATURE_ENABLED_DEFAULT,
    )


# ============================================================================


FeatureFlagsPartial = make_feature_flags_partial(FeatureFlags)


class FeatureFlagStats(BaseModel):
    """Output model for feature flags"""

    model_config = ConfigDict(use_attribute_docstrings=True)

    name: str

    description: str

    count: int
    """Number of organizations that have this feature flag enabled."""


# ============================================================================
# ORGS
# ============================================================================
class OrgReadOnlyOnCancel(BaseModel):
    """Make org readOnly on subscription cancellation instead of deleting"""

    readOnlyOnCancel: bool


# ============================================================================
class OrgCreate(BaseModel):
    """Create a new org"""

    name: OrgName
    slug: str | None = None
    planId: str | None = None
    quotas: OrgQuotas | None = None
    note: str | None = None


# ============================================================================
class OrgQuotaUpdate(BaseModel):
    """Organization quota update (to track changes over time)"""

    modified: datetime
    update: OrgQuotas
    subEventId: str | None = None


# ============================================================================
class OrgQuotaUpdateOut(BaseModel):
    """Organization quota update output for admins"""

    modified: datetime
    update: OrgQuotas


# ============================================================================
class OrgReadOnlyUpdate(BaseModel):
    """Organization readonly update"""

    readOnly: bool
    readOnlyReason: str | None = None


# ============================================================================
class OrgPublicProfileUpdate(BaseModel):
    """Organization enablePublicProfile update"""

    enablePublicProfile: bool | None = None
    publicDescription: OrgPublicDescription = None
    publicUrl: str | None = None


# ============================================================================
class OrgWebhookUrls(BaseModel):
    """Organization webhook URLs"""

    crawlStarted: AnyHttpUrl | None = None
    crawlFinished: AnyHttpUrl | None = None
    crawlDeleted: AnyHttpUrl | None = None
    qaAnalysisStarted: AnyHttpUrl | None = None
    qaAnalysisFinished: AnyHttpUrl | None = None
    crawlReviewed: AnyHttpUrl | None = None
    uploadFinished: AnyHttpUrl | None = None
    uploadDeleted: AnyHttpUrl | None = None
    addedToCollection: AnyHttpUrl | None = None
    removedFromCollection: AnyHttpUrl | None = None
    collectionDeleted: AnyHttpUrl | None = None


# ============================================================================
class OrgOut(BaseMongoModel):
    """Organization API output model"""

    id: UUID
    name: OrgName
    slug: str
    users: dict[str, Any] = {}

    created: datetime | None = None

    default: bool = False
    bytesStored: int
    bytesStoredCrawls: int
    bytesStoredUploads: int
    bytesStoredProfiles: int
    bytesStoredSeedFiles: int = 0
    bytesStoredThumbnails: int = 0
    bytesStoredDedupeIndexes: int = 0
    origin: AnyHttpUrl | None = None

    storageQuotaReached: bool | None = False
    execMinutesQuotaReached: bool | None = False

    # total usage and exec time
    usage: dict[str, int] | None = {}
    crawlExecSeconds: dict[str, int] = {}

    # qa only usage + exec time
    qaUsage: dict[str, int] | None = {}
    qaCrawlExecSeconds: dict[str, int] = {}

    # exec time limits
    monthlyExecSeconds: dict[str, int] = {}
    extraExecSeconds: dict[str, int] = {}
    giftedExecSeconds: dict[str, int] = {}

    extraExecSecondsAvailable: int = 0
    giftedExecSecondsAvailable: int = 0

    quotas: OrgQuotas = OrgQuotas()
    quotaUpdates: list[OrgQuotaUpdateOut] | None = []

    webhookUrls: OrgWebhookUrls | None = OrgWebhookUrls()

    readOnly: bool | None = False
    readOnlyReason: str | None = None

    subscription: Subscription | None = None

    allowSharedProxies: bool = False
    allowedProxies: list[str] = []
    crawlingDefaults: CrawlConfigDefaults | None = None

    lastCrawlFinished: datetime | None = None

    enablePublicProfile: bool = False
    publicDescription: OrgPublicDescription = ""
    publicUrl: str = ""

    featureFlags: FeatureFlags = FeatureFlags()

    note: str | None = None


# ============================================================================
class Organization(BaseMongoModel):
    """Organization Base Model"""

    id: UUID
    name: OrgName
    slug: str
    users: dict[str, UserRole] = {}

    created: datetime | None = None

    default: bool = False

    storage: StorageRef
    storageReplicas: list[StorageRef] = []
    customStorages: dict[str, S3Storage] = {}

    bytesStored: int = 0
    bytesStoredCrawls: int = 0
    bytesStoredUploads: int = 0
    bytesStoredProfiles: int = 0
    bytesStoredSeedFiles: int = 0
    bytesStoredThumbnails: int = 0
    bytesStoredDedupeIndexes: int = 0

    # total usage + exec time
    usage: dict[str, int] = {}
    crawlExecSeconds: dict[str, int] = {}

    # qa only usage + exec time
    qaUsage: dict[str, int] = {}
    qaCrawlExecSeconds: dict[str, int] = {}

    # exec time limits
    monthlyExecSeconds: dict[str, int] = {}
    extraExecSeconds: dict[str, int] = {}
    giftedExecSeconds: dict[str, int] = {}

    extraExecSecondsAvailable: int = 0
    giftedExecSecondsAvailable: int = 0

    quotas: OrgQuotas = OrgQuotas()
    quotaUpdates: list[OrgQuotaUpdate] | None = []

    webhookUrls: OrgWebhookUrls | None = OrgWebhookUrls()

    origin: AnyHttpUrl | None = None

    readOnly: bool | None = False
    readOnlyReason: str | None = None

    subscription: Subscription | None = None

    # Internal note
    note: str | None = None

    allowSharedProxies: bool = False
    allowedProxies: list[str] = []
    crawlingDefaults: CrawlConfigDefaults | None = None

    lastCrawlFinished: datetime | None = None

    enablePublicProfile: bool = False
    publicDescription: OrgPublicDescription = None
    publicUrl: str | None = None

    featureFlags: FeatureFlags = FeatureFlags()

    def is_owner(self, user):
        """Check if user is owner"""
        return self._is_auth(user, UserRole.OWNER)

    def is_crawler(self, user):
        """Check if user can crawl (write)"""
        return self._is_auth(user, UserRole.CRAWLER)

    def is_viewer(self, user):
        """Check if user can view (read)"""
        return self._is_auth(user, UserRole.VIEWER)

    def _is_auth(self, user, value):
        """Check if user has at least specified permission level"""
        if user.is_superuser:
            return True

        res = self.users.get(str(user.id))
        if not res:
            return False

        return res >= value

    async def serialize_for_user(self, user: User, user_manager) -> OrgOut:
        """Serialize result based on current user access"""

        exclude = {"storage"}

        if not self.is_owner(user):
            exclude.add("users")
            exclude.add("note")

        if not self.is_crawler(user):
            exclude.add("usage")
            exclude.add("crawlExecSeconds")

        result = self.to_dict(
            exclude_unset=True,
            exclude_none=True,
            exclude=exclude,
        )

        if self.is_owner(user):
            result["users"] = {}

            keys = list(self.users.keys())
            user_list = await user_manager.get_user_names_by_ids(keys)

            for org_user in user_list:
                id_ = str(org_user["id"])
                role = self.users.get(id_)
                if not role:
                    continue

                email = org_user.get("email")
                if not email:
                    continue

                result["users"][email] = {
                    "role": role,
                    "name": org_user.get("name", ""),
                    "email": email,
                }

        return OrgOut.from_dict(result)


# ============================================================================
class OrgOutExport(Organization):
    """Org out for export"""

    # Additional field so export contains user names and emails
    userDetails: list[dict[str, str | int | UUID]] | None = None

    async def serialize_for_export(self, user_manager):
        """Serialize result with users for org export"""

        result = self.to_dict()
        user_details = []
        keys = list(self.users.keys())
        user_list = await user_manager.get_user_names_by_ids(keys)

        for org_user in user_list:
            id_ = str(org_user["id"])
            role = self.users.get(id_)
            if not role:
                continue

            user_details.append(
                {
                    "id": id_,
                    "role": role.value,
                    "name": org_user.get("name", ""),
                    "email": org_user.get("email", ""),
                }
            )

        result["userDetails"] = user_details
        return self.from_dict(result)


# ============================================================================
class OrgMetrics(BaseModel):
    """Organization API metrics model"""

    storageUsedBytes: int
    storageUsedCrawls: int
    storageUsedUploads: int
    storageUsedProfiles: int
    storageUsedSeedFiles: int
    storageUsedThumbnails: int
    storageUsedDedupeIndexes: int
    storageQuotaBytes: int
    archivedItemCount: int
    crawlCount: int
    uploadCount: int
    pageCount: int
    crawlPageCount: int
    uploadPageCount: int
    profileCount: int
    workflowsRunningCount: int
    maxConcurrentCrawls: int
    workflowsQueuedCount: int
    collectionsCount: int
    publicCollectionsCount: int


# ============================================================================
class OrgImportExportData(BaseModel):
    """Model for org import/export data"""

    dbVersion: str
    org: dict[str, Any]
    profiles: list[dict[str, Any]]
    workflows: list[dict[str, Any]]
    workflowRevisions: list[dict[str, Any]]
    items: list[dict[str, Any]]
    pages: list[dict[str, Any]]
    collections: list[dict[str, Any]]


# ============================================================================
class OrgImportExport(BaseModel):
    """Model for org import/export"""

    data: OrgImportExportData


# ============================================================================
class OrgInviteResponse(BaseModel):
    """Model for org invite response"""

    invited: str
    token: UUID


# ============================================================================
class OrgAcceptInviteResponse(BaseModel):
    """Model for org invite response"""

    added: bool
    org: OrgOut


# ============================================================================
class OrgDeleteInviteResponse(BaseModel):
    """Model for org invite response"""

    removed: bool
    count: int


# ============================================================================
class OrgSlugsResponse(BaseModel):
    """Model for org slugs response"""

    slugs: list[str]


# ============================================================================
class OrgImportResponse(BaseModel):
    """Model for org import response"""

    imported: bool


# ============================================================================

### PAGINATION ###


# ============================================================================
class PaginatedResponse(BaseModel):
    """Paginated response model"""

    total: int
    page: int
    pageSize: int


# ============================================================================

### PROFILES ###


# ============================================================================
class ProfileFile(BaseFile):
    """file for storing profile data"""


# ============================================================================
class Profile(BaseMongoModel):
    """Browser profile"""

    id: UUID

    name: str
    description: str | None = ""

    userid: UUID
    oid: UUID

    origins: list[str]
    resource: ProfileFile | None = None

    created: datetime | None = None
    createdBy: UUID | None = None
    createdByName: str | None = None
    modified: datetime | None = None
    modifiedBy: UUID | None = None
    modifiedByName: str | None = None

    modifiedCrawlDate: datetime | None = None
    modifiedCrawlId: str | None = None
    modifiedCrawlCid: UUID | None = None

    baseid: UUID | None = None
    crawlerChannel: str | None = None
    proxyId: str | None = None

    inUse: bool = False

    tags: list[str] | None = []


# ============================================================================
class ProfileBrowserMetadata(BaseModel):
    """Profile metadata stored in ProfileJob labels"""

    browser: str

    oid: str = Field(alias="btrix.org")
    userid: UUID = Field(alias="btrix.user")
    baseprofile: UUID | None = Field(alias="btrix.baseprofile", default=None)
    storage: str = Field(alias="btrix.storage")

    profileid: UUID

    proxyid: str = ""
    crawlerChannel: str

    committing: str | None = None


# ============================================================================
class UrlIn(BaseModel):
    """Request to set url"""

    url: HttpUrl


# ============================================================================
class ProfileLaunchBrowserIn(UrlIn):
    """Request to launch new browser for creating profile"""

    profileId: UUID | None = None
    crawlerChannel: str = "default"
    proxyId: str | None = None


# ============================================================================
class BrowserId(BaseModel):
    """Profile id on newly created profile"""

    browserid: str


# ============================================================================
class ProfileCreate(BaseModel):
    """Create new profile for browser id"""

    browserid: str
    name: Name
    description: Description = ""
    tags: list[Tag] | None = []


# ============================================================================
class ProfileUpdate(ProfileCreate):
    """Update existing profile with new browser profile or metadata only"""

    # browserid optional if only updating metadata
    browserid: str = ""


# ============================================================================
class ProfilePingResponse(BaseModel):
    """Response model for pinging profile"""

    success: bool
    origins: list[AnyHttpUrl]


# ============================================================================
class ProfileBrowserGetUrlResponse(BaseModel):
    """Response model for profile get URL endpoint"""

    path: str
    password: str
    oid: UUID
    auth_bearer: str
    scale: float
    url: AnyHttpUrl


# ============================================================================
class ProfileSearchValuesResponse(BaseModel):
    """Response model for profiles search values"""

    names: list[str]


# ============================================================================

### USERS ###


# ============================================================================
class UserCreate(BaseModel):
    """
    User Creation Model exposed to API
    """

    email: EmailStr
    password: str

    name: str | None = ""

    inviteToken: UUID | None = None


# ============================================================================
class UserUpdateEmailName(BaseModel):
    """
    Update email and/or name
    """

    email: EmailStr | None = None
    name: str | None = None


# ============================================================================
class UserUpdatePassword(BaseModel):
    """
    Update password, requires current password to reset
    """

    email: EmailStr
    password: str
    newPassword: str


# ============================================================================

### WEBHOOKS ###


# ============================================================================
class WebhookNotificationBody(BaseModel):
    """Base POST body model for webhook notifications"""

    # Store as str, not UUID, to make JSON-serializable
    orgId: str


# ============================================================================
class WebhookEventType(StrEnum):
    """Webhook Event Types"""

    CRAWL_STARTED = "crawlStarted"
    CRAWL_FINISHED = "crawlFinished"
    CRAWL_DELETED = "crawlDeleted"

    QA_ANALYSIS_STARTED = "qaAnalysisStarted"
    QA_ANALYSIS_FINISHED = "qaAnalysisFinished"

    CRAWL_REVIEWED = "crawlReviewed"

    UPLOAD_FINISHED = "uploadFinished"
    UPLOAD_DELETED = "uploadDeleted"

    ADDED_TO_COLLECTION = "addedToCollection"
    REMOVED_FROM_COLLECTION = "removedFromCollection"
    COLLECTION_DELETED = "collectionDeleted"


# ============================================================================
class BaseCollectionItemBody(WebhookNotificationBody):
    """Webhook notification base POST body for collection changes"""

    collectionId: str
    itemIds: list[str]
    downloadUrl: str


# ============================================================================
class CollectionItemAddedBody(BaseCollectionItemBody):
    """Webhook notification POST body for collection additions"""

    event: Literal[WebhookEventType.ADDED_TO_COLLECTION] = (
        WebhookEventType.ADDED_TO_COLLECTION
    )


# ============================================================================
class CollectionItemRemovedBody(BaseCollectionItemBody):
    """Webhook notification POST body for collection removals"""

    event: Literal[WebhookEventType.REMOVED_FROM_COLLECTION] = (
        WebhookEventType.REMOVED_FROM_COLLECTION
    )


# ============================================================================
class CollectionDeletedBody(WebhookNotificationBody):
    """Webhook notification base POST body for collection changes"""

    event: Literal[WebhookEventType.COLLECTION_DELETED] = (
        WebhookEventType.COLLECTION_DELETED
    )
    collectionId: str


# ============================================================================
class BaseArchivedItemBody(WebhookNotificationBody):
    """Webhook notification POST body for when archived item is started or finished"""

    itemId: str


# ============================================================================
class BaseArchivedItemFinishedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when archived item is finished"""

    resources: list[CrawlFileOut]
    state: str


# ============================================================================
class CrawlStartedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when crawl starts"""

    scheduled: bool = False
    event: Literal[WebhookEventType.CRAWL_STARTED] = WebhookEventType.CRAWL_STARTED


# ============================================================================
class CrawlFinishedBody(BaseArchivedItemFinishedBody):
    """Webhook notification POST body for when crawl finishes"""

    event: Literal[WebhookEventType.CRAWL_FINISHED] = WebhookEventType.CRAWL_FINISHED


# ============================================================================
class CrawlDeletedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when crawl is deleted"""

    event: Literal[WebhookEventType.CRAWL_DELETED] = WebhookEventType.CRAWL_DELETED


# ============================================================================
class UploadFinishedBody(BaseArchivedItemFinishedBody):
    """Webhook notification POST body for when upload finishes"""

    event: Literal[WebhookEventType.UPLOAD_FINISHED] = WebhookEventType.UPLOAD_FINISHED


# ============================================================================
class UploadDeletedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when upload finishes"""

    event: Literal[WebhookEventType.UPLOAD_DELETED] = WebhookEventType.UPLOAD_DELETED


# ============================================================================
class QaAnalysisStartedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when qa analysis run starts"""

    event: Literal[WebhookEventType.QA_ANALYSIS_STARTED] = (
        WebhookEventType.QA_ANALYSIS_STARTED
    )

    qaRunId: str


# ============================================================================
class QaAnalysisFinishedBody(BaseArchivedItemFinishedBody):
    """Webhook notification POST body for when qa analysis run finishes"""

    event: Literal[WebhookEventType.QA_ANALYSIS_FINISHED] = (
        WebhookEventType.QA_ANALYSIS_FINISHED
    )

    qaRunId: str


# ============================================================================
class CrawlReviewedBody(BaseArchivedItemBody):
    """Webhook notification POST body for when crawl is reviewed in qa"""

    event: Literal[WebhookEventType.CRAWL_REVIEWED] = WebhookEventType.CRAWL_REVIEWED

    reviewStatus: ReviewStatus
    reviewStatusLabel: str
    description: str | None = None


# ============================================================================
class WebhookNotification(BaseMongoModel):
    """Base POST body model for webhook notifications"""

    event: WebhookEventType
    oid: UUID
    body: (
        CrawlStartedBody
        | CrawlFinishedBody
        | CrawlDeletedBody
        | QaAnalysisStartedBody
        | QaAnalysisFinishedBody
        | CrawlReviewedBody
        | UploadFinishedBody
        | UploadDeletedBody
        | CollectionItemAddedBody
        | CollectionItemRemovedBody
        | CollectionDeletedBody
    )
    success: bool = False
    attempts: int = 0
    created: datetime
    lastAttempted: datetime | None = None


# ============================================================================

### BACKGROUND JOBS ###


# ============================================================================
class BgJobType(StrEnum):
    """Background Job Types"""

    CREATE_REPLICA = "create-replica"
    DELETE_REPLICA = "delete-replica"
    DELETE_ORG = "delete-org"
    RECALCULATE_ORG_STATS = "recalculate-org-stats"
    READD_ORG_PAGES = "readd-org-pages"
    OPTIMIZE_PAGES = "optimize-pages"
    CLEANUP_SEED_FILES = "cleanup-seed-files"
    UPDATE_COLL_STATS = "update-coll-stats"
    POSTPROCESS_UPLOAD = "postprocess-upload"


# ============================================================================
class BackgroundJob(BaseMongoModel):
    """Model for tracking background jobs"""

    id: str
    type: BgJobType
    oid: UUID | None = None
    success: bool | None = None
    started: datetime
    finished: datetime | None = None

    previousAttempts: list[dict[str, datetime | None]] | None = None


# ============================================================================
class CreateReplicaJob(BackgroundJob):
    """Model for tracking create of replica jobs"""

    type: Literal[BgJobType.CREATE_REPLICA] = BgJobType.CREATE_REPLICA
    file_path: str
    object_type: str
    object_id: str
    replica_storage: StorageRef


# ============================================================================
class DeleteReplicaJob(BackgroundJob):
    """Model for tracking deletion of replica jobs"""

    type: Literal[BgJobType.DELETE_REPLICA] = BgJobType.DELETE_REPLICA
    file_path: str
    object_type: str
    object_id: str
    replica_storage: StorageRef
    schedule: str | None = None


# ============================================================================
class DeleteOrgJob(BackgroundJob):
    """Model for tracking deletion of org data jobs"""

    type: Literal[BgJobType.DELETE_ORG] = BgJobType.DELETE_ORG


# ============================================================================
class RecalculateOrgStatsJob(BackgroundJob):
    """Model for tracking jobs to recalculate org stats"""

    type: Literal[BgJobType.RECALCULATE_ORG_STATS] = BgJobType.RECALCULATE_ORG_STATS


# ============================================================================
class ReAddOrgPagesJob(BackgroundJob):
    """Model for tracking jobs to readd pages for an org or single crawl"""

    type: Literal[BgJobType.READD_ORG_PAGES] = BgJobType.READD_ORG_PAGES
    crawl_type: str | None = None
    crawl_id: str | None = None


# ============================================================================
class OptimizePagesJob(BackgroundJob):
    """Model for tracking jobs to optimize pages across all orgs"""

    type: Literal[BgJobType.OPTIMIZE_PAGES] = BgJobType.OPTIMIZE_PAGES


# ============================================================================
class CleanupSeedFilesJob(BackgroundJob):
    """Model for tracking jobs to cleanup unused seed files"""

    type: Literal[BgJobType.CLEANUP_SEED_FILES] = BgJobType.CLEANUP_SEED_FILES


# ============================================================================
class UpdateCollStatsJob(BackgroundJob):
    """Model for tracking jobs to readd pages for an org or single crawl"""

    type: Literal[BgJobType.UPDATE_COLL_STATS] = BgJobType.UPDATE_COLL_STATS
    oid: UUID
    collection_id: UUID


# ============================================================================
class PostProcessUploadJob(BackgroundJob):
    """Model for tracking jobs to post-process uploaded crawls"""

    type: Literal[BgJobType.POSTPROCESS_UPLOAD] = BgJobType.POSTPROCESS_UPLOAD
    oid: UUID
    crawl_id: str


# ============================================================================
# Union of all job types, for response model

AnyJob = RootModel[
    CreateReplicaJob
    | DeleteReplicaJob
    | BackgroundJob
    | DeleteOrgJob
    | RecalculateOrgStatsJob
    | ReAddOrgPagesJob
    | OptimizePagesJob
    | CleanupSeedFilesJob
    | UpdateCollStatsJob
    | PostProcessUploadJob
]


# ============================================================================

### GENERIC RESPONSE MODELS ###


# ============================================================================
class UpdatedResponse(BaseModel):
    """Response for update API endpoints"""

    updated: bool


# ============================================================================
class SuccessResponse(BaseModel):
    """Response for API endpoints that return success"""

    success: bool


# ============================================================================
class SuccessResponseId(SuccessResponse):
    """Response for API endpoints that return success and a background job id"""

    id: str | None = None


# ============================================================================
class SuccessResponseStorageQuota(SuccessResponse):
    """Response for API endpoints that return success and storageQuotaReached"""

    storageQuotaReached: bool


# ============================================================================
class StartedResponse(BaseModel):
    """Response for API endpoints that start crawls"""

    started: str


# ============================================================================
class StartedResponseBool(BaseModel):
    """Response for API endpoints that start a background job"""

    started: bool


# ============================================================================
class AddedResponse(BaseModel):
    """Response for API endpoints that return added"""

    added: bool


# ============================================================================
class AddedResponseId(AddedResponse):
    """Response for API endpoints that return added + id"""

    id: UUID


# ============================================================================
class AddedResponseName(AddedResponse):
    """Response for API endpoints that add resources and return name"""

    name: str


# ============================================================================
class AddedResponseIdQuota(AddedResponse):
    """Response for API endpoints that return str id and storageQuotaReached"""

    id: str
    storageQuotaReached: bool


# ============================================================================
class AddedResponseIdName(AddedResponse):
    """Response for API endpoints that add resource and return id and name"""

    id: UUID
    name: str


# ============================================================================
class DeletedResponse(BaseModel):
    """Response for delete API endpoints"""

    deleted: bool


# ============================================================================
class DeletedResponseId(DeletedResponse):
    """Response for delete API endpoints that return job id"""

    id: str


# ============================================================================
class DeletedResponseQuota(DeletedResponse):
    """Response for delete API endpoints"""

    storageQuotaReached: bool


# ============================================================================
class DeletedCountResponse(BaseModel):
    """Response for delete API endpoints that return count"""

    deleted: int


# ============================================================================
class DeletedCountResponseQuota(DeletedCountResponse):
    """Response for delete API endpoints"""

    storageQuotaReached: bool


# ============================================================================
class RemovedResponse(BaseModel):
    """Response for API endpoints for removing resources"""

    removed: bool


# ============================================================================
class EmptyResponse(BaseModel):
    """Response for API endpoints that return nothing"""


# ============================================================================

### SPECIFIC PAGINATED RESPONSE MODELS ###


# ============================================================================
class PaginatedBackgroundJobResponse(PaginatedResponse):
    """Response model for paginated background jobs"""

    items: list[AnyJob]


# ============================================================================
class PaginatedCrawlOutResponse(PaginatedResponse):
    """Response model for paginated crawls"""

    items: list[CrawlOut | CrawlOutWithResources]


# ============================================================================
class PaginatedCollOutResponse(PaginatedResponse):
    """Response model for paginated collections"""

    items: list[CollOut]


# ============================================================================
class PaginatedCrawlConfigOutResponse(PaginatedResponse):
    """Response model for paginated crawlconfigs"""

    items: list[CrawlConfigOut]


# ============================================================================
class PaginatedSeedResponse(PaginatedResponse):
    """Response model for paginated seeds"""

    items: list[Seed]


# ============================================================================
class PaginatedConfigRevisionResponse(PaginatedResponse):
    """Response model for paginated crawlconfig revisions"""

    items: list[ConfigRevision]


# ============================================================================
class PaginatedOrgOutResponse(PaginatedResponse):
    """Response model for paginated orgs"""

    items: list[OrgOut]


# ============================================================================
class PaginatedInvitePendingResponse(PaginatedResponse):
    """Response model for paginated orgs"""

    items: list[InviteOut]


# ============================================================================
class PaginatedPageOutResponse(PaginatedResponse):
    """Response model for paginated pages"""

    items: list[PageOut]


# ============================================================================
class PageOutItemsResponse(BaseModel):
    """Response model for pages without total"""

    items: list[PageOut]


# ============================================================================
class PaginatedPageOutWithQAResponse(PaginatedResponse):
    """Response model for paginated pages with single QA info"""

    items: list[PageOutWithSingleQA]


# ============================================================================
class PaginatedProfileResponse(PaginatedResponse):
    """Response model for paginated profiles"""

    items: list[Profile]


# ============================================================================
class PaginatedSubscriptionEventResponse(PaginatedResponse):
    """Response model for paginated subscription events"""

    items: list[SubscriptionEventAnyOut]


# ============================================================================
class PaginatedWebhookNotificationResponse(PaginatedResponse):
    """Response model for paginated webhook notifications"""

    items: list[WebhookNotification]


# ============================================================================
class PaginatedCrawlLogResponse(PaginatedResponse):
    """Response model for crawl logs"""

    items: list[CrawlLogLine]


# ============================================================================
class PaginatedUserOutResponse(PaginatedResponse):
    """Response model for user emails with org info"""

    items: list[UserOutNoId]


# ============================================================================
class PaginatedUserFileResponse(PaginatedResponse):
    """Response model for user-uploaded files (e.g. seed files)"""

    items: list[SeedFileOut]


# ============================================================================
class PageUrlCountResponse(BaseModel):
    """Response model for page count by url"""

    items: list[PageUrlCount]


# FILTER UTILITIES


# ============================================================================
class ListFilterType(StrEnum):
    """Combination type for query filters that accept lists"""

    OR = "or"
    AND = "and"
