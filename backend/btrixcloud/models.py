"""
Crawl-related models and types
"""

from datetime import datetime
from enum import Enum, IntEnum
from uuid import UUID
import base64
import hashlib
import mimetypes
import os

from typing import Optional, List, Dict, Union, Literal, Any, get_args
from typing_extensions import Annotated

from pydantic import (
    BaseModel,
    Field,
    HttpUrl as HttpUrlNonStr,
    AnyHttpUrl as AnyHttpUrlNonStr,
    EmailStr as CasedEmailStr,
    validate_email,
    RootModel,
    BeforeValidator,
    TypeAdapter,
)
from slugify import slugify

# from fastapi_users import models as fastapi_users_models

from .db import BaseMongoModel

# crawl scale for constraint
MAX_CRAWL_SCALE = int(os.environ.get("MAX_CRAWL_SCALE", 3))

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

# annotated types
# ============================================================================

EmptyStr = Annotated[str, Field(min_length=0, max_length=0)]

Scale = Annotated[int, Field(strict=True, ge=1, le=MAX_CRAWL_SCALE)]
ReviewStatus = Optional[Annotated[int, Field(strict=True, ge=1, le=5)]]

any_http_url_adapter = TypeAdapter(AnyHttpUrlNonStr)
AnyHttpUrl = Annotated[
    str, BeforeValidator(lambda value: str(any_http_url_adapter.validate_python(value)))
]

http_url_adapter = TypeAdapter(HttpUrlNonStr)
HttpUrl = Annotated[
    str, BeforeValidator(lambda value: str(http_url_adapter.validate_python(value)))
]


# pylint: disable=too-few-public-methods
class EmailStr(CasedEmailStr):
    """EmailStr type that lowercases the full email"""

    @classmethod
    def _validate(cls, value: CasedEmailStr, /) -> CasedEmailStr:
        return validate_email(value)[1].lower()


# pylint: disable=invalid-name, too-many-lines
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
    fromSuperuser: Optional[bool] = False
    oid: Optional[UUID] = None
    role: UserRole = UserRole.VIEWER
    email: Optional[EmailStr] = None
    # set if existing user
    userid: Optional[UUID] = None


# ============================================================================
class InviteOut(BaseModel):
    """Single invite output model"""

    created: datetime
    inviterEmail: Optional[EmailStr] = None
    inviterName: Optional[str] = None
    fromSuperuser: bool
    oid: Optional[UUID] = None
    orgName: Optional[str] = None
    orgSlug: Optional[str] = None
    role: UserRole = UserRole.VIEWER
    email: Optional[EmailStr] = None
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
class UserOut(BaseModel):
    """Output User model"""

    id: UUID

    name: str = ""
    email: EmailStr
    is_superuser: bool = False
    is_verified: bool = False

    orgs: List[UserOrgInfoOut]


# ============================================================================
class UserEmailWithOrgInfo(BaseModel):
    """Output model for getting user email list with org info for each"""

    email: EmailStr
    orgs: List[UserOrgInfoOut]


# ============================================================================

### CRAWL STATES

# ============================================================================
TYPE_RUNNING_STATES = Literal[
    "running", "pending-wait", "generate-wacz", "uploading-wacz"
]
RUNNING_STATES = get_args(TYPE_RUNNING_STATES)

TYPE_WAITING_STATES = Literal["starting", "waiting_capacity", "waiting_org_limit"]
WAITING_STATES = get_args(TYPE_WAITING_STATES)

TYPE_FAILED_STATES = Literal[
    "canceled",
    "failed",
    "skipped_storage_quota_reached",
    "skipped_time_quota_reached",
]
FAILED_STATES = get_args(TYPE_FAILED_STATES)

TYPE_SUCCESSFUL_STATES = Literal[
    "complete",
    "stopped_by_user",
    "stopped_storage_quota_reached",
    "stopped_time_quota_reached",
    "stopped_org_readonly",
]
SUCCESSFUL_STATES = get_args(TYPE_SUCCESSFUL_STATES)

TYPE_RUNNING_AND_WAITING_STATES = Literal[TYPE_WAITING_STATES, TYPE_RUNNING_STATES]
RUNNING_AND_WAITING_STATES = [*WAITING_STATES, *RUNNING_STATES]

RUNNING_AND_STARTING_ONLY = ["starting", *RUNNING_STATES]

TYPE_NON_RUNNING_STATES = Literal[TYPE_FAILED_STATES, TYPE_SUCCESSFUL_STATES]
NON_RUNNING_STATES = [*FAILED_STATES, *SUCCESSFUL_STATES]

TYPE_ALL_CRAWL_STATES = Literal[
    TYPE_RUNNING_AND_WAITING_STATES, TYPE_NON_RUNNING_STATES
]
ALL_CRAWL_STATES = [*RUNNING_AND_WAITING_STATES, *NON_RUNNING_STATES]


# ============================================================================

### CRAWL CONFIGS ###


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
    scopeType: Optional[ScopeType] = None

    include: Union[str, List[str], None] = None
    exclude: Union[str, List[str], None] = None
    sitemap: Union[bool, HttpUrl, None] = None
    allowHash: Optional[bool] = None
    depth: Optional[int] = None
    extraHops: Optional[int] = None


# ============================================================================
class RawCrawlConfig(BaseModel):
    """Base Crawl Config"""

    seeds: Optional[List[Seed]] = []

    scopeType: Optional[ScopeType] = ScopeType.PREFIX

    include: Union[str, List[str], None] = None
    exclude: Union[str, List[str], None] = None

    depth: Optional[int] = -1
    limit: Optional[int] = 0
    extraHops: Optional[int] = 0

    lang: Optional[str] = None
    blockAds: Optional[bool] = False

    behaviorTimeout: Optional[int] = None
    pageLoadTimeout: Optional[int] = None
    pageExtraDelay: Optional[int] = 0
    postLoadDelay: Optional[int] = 0

    workers: Optional[int] = None

    headless: Optional[bool] = None

    generateWACZ: Optional[bool] = None
    combineWARC: Optional[bool] = None

    useSitemap: Optional[bool] = False
    failOnFailedSeed: Optional[bool] = False

    logging: Optional[str] = None
    behaviors: Optional[str] = "autoscroll,autoplay,autofetch,siteSpecific"

    userAgent: Optional[str] = None

    selectLinks: List[str] = ["a[href]->href"]


# ============================================================================
class CrawlConfigIn(BaseModel):
    """CrawlConfig input model, submitted via API"""

    schedule: Optional[str] = ""
    runNow: bool = False

    config: RawCrawlConfig

    name: str

    description: Optional[str] = ""

    jobType: Optional[JobType] = JobType.CUSTOM

    profileid: Union[UUID, EmptyStr, None] = None
    crawlerChannel: str = "default"
    proxyId: Optional[str] = None

    autoAddCollections: Optional[List[UUID]] = []
    tags: Optional[List[str]] = []

    crawlTimeout: int = 0
    maxCrawlSize: int = 0
    scale: Scale = 1

    crawlFilenameTemplate: Optional[str] = None


# ============================================================================
class ConfigRevision(BaseMongoModel):
    """Crawl Config Revision"""

    cid: UUID

    schedule: Optional[str] = ""

    config: RawCrawlConfig

    profileid: Optional[UUID] = None
    crawlerChannel: Optional[str] = None
    proxyId: Optional[str] = None

    crawlTimeout: Optional[int] = 0
    maxCrawlSize: Optional[int] = 0
    scale: Scale = 1

    modified: datetime
    modifiedBy: Optional[UUID] = None

    rev: int = 0


# ============================================================================
class CrawlConfigCore(BaseMongoModel):
    """Core data shared between crawls and crawlconfigs"""

    schedule: Optional[str] = ""

    jobType: Optional[JobType] = JobType.CUSTOM
    config: Optional[RawCrawlConfig] = None

    tags: Optional[List[str]] = []

    crawlTimeout: Optional[int] = 0
    maxCrawlSize: Optional[int] = 0
    scale: Scale = 1

    oid: UUID

    profileid: Optional[UUID] = None
    crawlerChannel: Optional[str] = None
    proxyId: Optional[str] = None


# ============================================================================
class CrawlConfigAdditional(BaseModel):
    """Additional fields shared by CrawlConfig and CrawlConfigOut."""

    name: Optional[str] = None
    description: Optional[str] = None

    created: datetime
    createdBy: Optional[UUID] = None

    modified: Optional[datetime] = None
    modifiedBy: Optional[UUID] = None

    autoAddCollections: Optional[List[UUID]] = []

    inactive: Optional[bool] = False

    rev: int = 0

    crawlAttemptCount: Optional[int] = 0
    crawlCount: Optional[int] = 0
    crawlSuccessfulCount: Optional[int] = 0

    totalSize: Optional[int] = 0

    lastCrawlId: Optional[str] = None
    lastCrawlStartTime: Optional[datetime] = None
    lastStartedBy: Optional[UUID] = None
    lastCrawlTime: Optional[datetime] = None
    lastCrawlState: Optional[str] = None
    lastCrawlSize: Optional[int] = None

    lastRun: Optional[datetime] = None

    isCrawlRunning: Optional[bool] = False

    crawlFilenameTemplate: Optional[str] = None


# ============================================================================
class CrawlConfig(CrawlConfigCore, CrawlConfigAdditional):
    """Schedulable config"""

    id: UUID

    config: RawCrawlConfig
    createdByName: Optional[str] = None
    modifiedByName: Optional[str] = None
    lastStartedByName: Optional[str] = None

    def get_raw_config(self):
        """serialize config for browsertrix-crawler"""
        return self.config.dict(exclude_unset=True, exclude_none=True)


# ============================================================================
class CrawlConfigOut(CrawlConfigCore, CrawlConfigAdditional):
    """Crawl Config Output"""

    id: UUID

    lastCrawlStopping: Optional[bool] = False
    profileName: Optional[str] = None
    firstSeed: Optional[str] = None
    seedCount: int = 0

    createdByName: Optional[str] = None
    modifiedByName: Optional[str] = None
    lastStartedByName: Optional[str] = None


# ============================================================================
class CrawlConfigProfileOut(BaseMongoModel):
    """Crawl Config basic info for profiles"""

    name: str
    firstSeed: str
    seedCount: int


# ============================================================================
class UpdateCrawlConfig(BaseModel):
    """Update crawl config name, crawl schedule, or tags"""

    # metadata: not revision tracked
    name: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    autoAddCollections: Optional[List[UUID]] = None
    runNow: bool = False

    # crawl data: revision tracked
    schedule: Optional[str] = None
    profileid: Union[UUID, EmptyStr, None] = None
    crawlerChannel: Optional[str] = None
    proxyId: Optional[str] = None
    crawlTimeout: Optional[int] = None
    maxCrawlSize: Optional[int] = None
    scale: Scale = 1
    crawlFilenameTemplate: Optional[str] = None
    config: Optional[RawCrawlConfig] = None


# ============================================================================
class CrawlConfigDefaults(BaseModel):
    """Crawl Config Org Defaults"""

    crawlTimeout: Optional[int] = None
    maxCrawlSize: Optional[int] = None

    pageLoadTimeout: Optional[int] = None
    postLoadDelay: Optional[int] = None
    behaviorTimeout: Optional[int] = None
    pageExtraDelay: Optional[int] = None

    blockAds: Optional[bool] = None

    profileid: Optional[UUID] = None
    crawlerChannel: Optional[str] = None
    proxyId: Optional[str] = None

    lang: Optional[str] = None

    userAgent: Optional[str] = None

    exclude: Optional[List[str]] = None


# ============================================================================
class CrawlConfigAddedResponse(BaseModel):
    """Response model for adding crawlconfigs"""

    added: bool
    id: str
    run_now_job: Optional[str] = None
    storageQuotaReached: bool
    execMinutesQuotaReached: bool


# ============================================================================
class CrawlConfigTags(BaseModel):
    """Response model for crawlconfig tags"""

    tags: List[str]


# ============================================================================
class CrawlConfigSearchValues(BaseModel):
    """Response model for adding crawlconfigs"""

    names: List[str]
    descriptions: List[str]
    firstSeeds: List[AnyHttpUrl]
    workflowIds: List[UUID]


# ============================================================================
class CrawlConfigUpdateResponse(BaseModel):
    """Response model for updating crawlconfigs"""

    updated: bool
    settings_changed: bool
    metadata_changed: bool

    storageQuotaReached: Optional[bool] = False
    execMinutesQuotaReached: Optional[bool] = False

    started: Optional[str] = None


# ============================================================================
class CrawlConfigDeletedResponse(BaseModel):
    """Response model for deleting crawlconfigs"""

    success: bool
    status: str


# ============================================================================

### CRAWLER VERSIONS ###


# ============================================================================
class CrawlerChannel(BaseModel):
    """Crawler version available to use in workflows"""

    id: str
    image: str


# ============================================================================
class CrawlerChannels(BaseModel):
    """List of CrawlerChannel instances for API"""

    channels: List[CrawlerChannel] = []


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

    default_proxy_id: Optional[str] = None
    servers: List[CrawlerProxy] = []


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
    custom: Optional[bool] = False

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
class BaseFile(BaseModel):
    """Base model for crawl and profile files"""

    filename: str
    hash: str
    size: int
    storage: StorageRef

    replicas: Optional[List[StorageRef]] = []


# ============================================================================
class CrawlFile(BaseFile):
    """file from a crawl"""

    presignedUrl: Optional[str] = None
    expireAt: Optional[datetime] = None


# ============================================================================
class CrawlFileOut(BaseModel):
    """output for file from a crawl (conformance to Data Resource Spec)"""

    name: str
    path: str
    hash: str
    size: int

    crawlId: Optional[str] = None
    numReplicas: int = 0
    expireAt: Optional[str] = None


# ============================================================================
class CrawlStats(BaseModel):
    """Crawl Stats for pages and size"""

    found: int = 0
    done: int = 0
    size: int = 0


# ============================================================================
class CoreCrawlable(BaseModel):
    # pylint: disable=too-few-public-methods
    """Core properties for crawlable run (crawl or qa run)"""

    id: str

    userid: UUID
    userName: Optional[str] = None

    started: datetime
    finished: Optional[datetime] = None

    state: str

    crawlExecSeconds: int = 0

    image: Optional[str] = None

    stats: Optional[CrawlStats] = CrawlStats()

    files: List[CrawlFile] = []

    fileSize: int = 0
    fileCount: int = 0

    errors: Optional[List[str]] = []


# ============================================================================
class BaseCrawl(CoreCrawlable, BaseMongoModel):
    """Base Crawl object (representing crawls, uploads and manual sessions)"""

    type: str

    oid: UUID
    cid: Optional[UUID] = None

    name: Optional[str] = ""

    description: Optional[str] = ""

    tags: Optional[List[str]] = []

    collectionIds: Optional[List[UUID]] = []

    reviewStatus: ReviewStatus = None

    pageCount: Optional[int] = 0
    uniquePageCount: Optional[int] = 0

    filePageCount: Optional[int] = 0
    errorPageCount: Optional[int] = 0


# ============================================================================
class CollIdName(BaseModel):
    """Collection id and name object"""

    id: UUID
    name: str


# ============================================================================
class CrawlOut(BaseMongoModel):
    """Crawl output model, shared across all crawl types"""

    # pylint: disable=duplicate-code

    type: str

    id: str

    userid: UUID
    userName: Optional[str] = None
    oid: UUID

    profileid: Optional[UUID] = None

    name: Optional[str] = None
    description: Optional[str] = None

    started: datetime
    finished: Optional[datetime] = None

    state: str

    stats: Optional[CrawlStats] = None

    fileSize: int = 0
    fileCount: int = 0

    tags: Optional[List[str]] = []

    errors: Optional[List[str]] = []

    collectionIds: Optional[List[UUID]] = []

    crawlExecSeconds: int = 0
    qaCrawlExecSeconds: int = 0

    # automated crawl fields
    config: Optional[RawCrawlConfig] = None
    cid: Optional[UUID] = None
    firstSeed: Optional[str] = None
    seedCount: Optional[int] = None
    profileName: Optional[str] = None
    stopping: Optional[bool] = False
    manual: bool = False
    cid_rev: Optional[int] = None
    scale: Scale = 1

    storageQuotaReached: Optional[bool] = False
    execMinutesQuotaReached: Optional[bool] = False

    crawlerChannel: str = "default"
    proxyId: Optional[str] = None
    image: Optional[str] = None

    reviewStatus: ReviewStatus = None

    qaRunCount: int = 0
    activeQAStats: Optional[CrawlStats] = None
    lastQAState: Optional[str] = None
    lastQAStarted: Optional[datetime] = None

    pageCount: Optional[int] = 0
    uniquePageCount: Optional[int] = 0
    filePageCount: Optional[int] = 0
    errorPageCount: Optional[int] = 0


# ============================================================================
class UpdateCrawl(BaseModel):
    """Update crawl"""

    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    collectionIds: Optional[List[UUID]] = []
    reviewStatus: ReviewStatus = None


# ============================================================================
class DeleteCrawlList(BaseModel):
    """delete crawl list POST body"""

    crawl_ids: List[str]


# ============================================================================
class DeleteQARunList(BaseModel):
    """delete qa run list POST body"""

    qa_run_ids: List[str]


# ============================================================================
class CrawlSearchValuesResponse(BaseModel):
    """Response model for crawl search values"""

    names: List[str]
    descriptions: List[str]
    firstSeeds: List[AnyHttpUrl]


# ============================================================================
class CrawlQueueResponse(BaseModel):
    """Response model for GET crawl queue"""

    total: int
    results: List[AnyHttpUrl]
    matched: List[AnyHttpUrl]


# ============================================================================
class MatchCrawlQueueResponse(BaseModel):
    """Response model for match crawl queue"""

    total: int
    matched: List[AnyHttpUrl]
    nextOffset: int


# ============================================================================

### AUTOMATED CRAWLS ###


# ============================================================================
class CrawlScale(BaseModel):
    """scale the crawl to N parallel containers"""

    scale: Scale = 1


# ============================================================================
class QARun(CoreCrawlable, BaseModel):
    """Subdocument to track QA runs for given crawl"""


# ============================================================================
class QARunWithResources(QARun):
    """QA crawl output model including resources"""

    resources: Optional[List[CrawlFileOut]] = []


# ============================================================================
class QARunOut(BaseModel):
    """QA Run Output"""

    id: str

    userName: Optional[str] = None

    started: datetime
    finished: Optional[datetime] = None

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

    screenshotMatch: List[QARunBucketStats]
    textMatch: List[QARunBucketStats]


# ============================================================================
class Crawl(BaseCrawl, CrawlConfigCore):
    """Store State of a Crawl (Finished or Running)"""

    type: Literal["crawl"] = "crawl"

    cid: UUID

    config: RawCrawlConfig

    cid_rev: int = 0

    # schedule: Optional[str]
    manual: bool = False

    stopping: Optional[bool] = False

    qaCrawlExecSeconds: int = 0

    qa: Optional[QARun] = None
    qaFinished: Optional[Dict[str, QARun]] = {}


# ============================================================================
class CrawlCompleteIn(BaseModel):
    """Completed Crawl Webhook POST message"""

    id: str

    user: str

    filename: str
    size: int
    hash: str

    completed: Optional[bool] = True


# ============================================================================
class CrawlScaleResponse(BaseModel):
    """Response model for modifying crawl scale"""

    scaled: int


# ============================================================================
class CrawlError(BaseModel):
    """Crawl error"""

    timestamp: str
    logLevel: str
    context: str
    message: str
    details: Any


# ============================================================================

### UPLOADED CRAWLS ###


# ============================================================================
class UploadedCrawl(BaseCrawl):
    """Store State of a Crawl Upload"""

    type: Literal["upload"] = "upload"
    image: None = None


# ============================================================================
class UpdateUpload(UpdateCrawl):
    """Update modal that also includes name"""


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
        name += "-" + randstr.decode("utf-8")
        return name + ext


# ============================================================================

### USER-UPLOADED IMAGES ###


# ============================================================================
class ImageFileOut(BaseModel):
    """output for user-upload imaged file (conformance to Data Resource Spec)"""

    name: str
    path: str
    hash: str
    size: int

    originalFilename: str
    mime: str
    userid: UUID
    userName: str
    created: datetime


# ============================================================================
class PublicImageFileOut(BaseModel):
    """public output for user-upload imaged file (conformance to Data Resource Spec)"""

    name: str
    path: str
    hash: str
    size: int

    mime: str


# ============================================================================
class ImageFile(BaseFile):
    """User-uploaded image file"""

    originalFilename: str
    mime: str
    userid: UUID
    userName: str
    created: datetime

    async def get_image_file_out(self, org, storage_ops) -> ImageFileOut:
        """Get ImageFileOut with new presigned url"""
        presigned_url = await storage_ops.get_presigned_url(
            org, self, PRESIGN_DURATION_SECONDS
        )

        return ImageFileOut(
            name=self.filename,
            path=presigned_url or "",
            hash=self.hash,
            size=self.size,
            originalFilename=self.originalFilename,
            mime=self.mime,
            userid=self.userid,
            userName=self.userName,
            created=self.created,
        )

    async def get_public_image_file_out(self, org, storage_ops) -> PublicImageFileOut:
        """Get PublicImageFileOut with new presigned url"""
        presigned_url = await storage_ops.get_presigned_url(
            org, self, PRESIGN_DURATION_SECONDS
        )

        return PublicImageFileOut(
            name=self.filename,
            path=presigned_url or "",
            hash=self.hash,
            size=self.size,
            mime=self.mime,
        )


# ============================================================================
class ImageFilePreparer(FilePreparer):
    """Wrapper for user image streaming uploads"""

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

    def get_image_file(
        self,
        storage: StorageRef,
    ) -> ImageFile:
        """get user-uploaded image file"""
        return ImageFile(
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

### PAGES ###


# ============================================================================
class PageReviewUpdate(BaseModel):
    """Update model for page manual review/approval"""

    approved: Optional[bool] = None


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

    delete_list: List[UUID] = []


# ============================================================================
class PageNote(BaseModel):
    """Model for page notes, tracking user and time"""

    id: UUID
    text: str
    created: datetime
    userid: UUID
    userName: str


# ============================================================================
class PageQACompare(BaseModel):
    """Model for updating pages from QA run"""

    screenshotMatch: Optional[float] = None
    textMatch: Optional[float] = None
    resourceCounts: Optional[Dict[str, int]] = None


# ============================================================================
class Page(BaseMongoModel):
    """Core page data, no QA"""

    id: UUID

    oid: UUID
    crawl_id: str

    # core page data
    url: AnyHttpUrl
    title: Optional[str] = None
    ts: Optional[datetime] = None
    loadState: Optional[int] = None
    status: Optional[int] = None
    mime: Optional[str] = None
    filename: Optional[str] = None
    depth: Optional[int] = None
    favIconUrl: Optional[AnyHttpUrl] = None
    isSeed: Optional[bool] = False

    # manual review
    userid: Optional[UUID] = None
    modified: Optional[datetime] = None
    approved: Optional[bool] = None
    notes: List[PageNote] = []

    isFile: Optional[bool] = False
    isError: Optional[bool] = False

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
    qa: Optional[Dict[str, PageQACompare]] = {}


# ============================================================================
class PageOut(Page):
    """Model for pages output, no QA"""

    status: int = 200


# ============================================================================
class PageOutWithSingleQA(Page):
    """Page out with single QA entry"""

    qa: Optional[PageQACompare] = None


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
    ts: Optional[datetime] = None
    status: int = 200


# ============================================================================
class PageUrlCount(BaseModel):
    """Model for counting pages by URL"""

    url: AnyHttpUrl
    count: int = 0
    snapshots: List[PageIdTimestamp] = []


# ============================================================================
class CrawlOutWithResources(CrawlOut):
    """Crawl output model including resources"""

    resources: Optional[List[CrawlFileOut]] = []
    collections: Optional[List[CollIdName]] = []

    initialPages: List[PageOut] = []
    totalPages: Optional[int] = None
    pagesQueryUrl: str = ""


# ============================================================================

### COLLECTIONS ###


# ============================================================================
class CollAccessType(str, Enum):
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
    hasPages: bool


# ============================================================================
class Collection(BaseMongoModel):
    """Org collection structure"""

    id: UUID
    name: str = Field(..., min_length=1)
    slug: str = Field(..., min_length=1)
    oid: UUID
    description: Optional[str] = None
    caption: Optional[str] = None

    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    crawlCount: Optional[int] = 0
    pageCount: Optional[int] = 0
    uniquePageCount: Optional[int] = 0
    totalSize: Optional[int] = 0

    dateEarliest: Optional[datetime] = None
    dateLatest: Optional[datetime] = None

    # Sorted by count, descending
    tags: Optional[List[str]] = []

    access: CollAccessType = CollAccessType.PRIVATE

    homeUrl: Optional[AnyHttpUrl] = None
    homeUrlTs: Optional[datetime] = None
    homeUrlPageId: Optional[UUID] = None

    thumbnail: Optional[ImageFile] = None
    thumbnailSource: Optional[CollectionThumbnailSource] = None
    defaultThumbnailName: Optional[str] = None

    allowPublicDownload: Optional[bool] = True

    previousSlugs: List[str] = []


# ============================================================================
class CollIn(BaseModel):
    """Collection Passed in By User"""

    name: str = Field(..., min_length=1)
    slug: Optional[str] = None
    description: Optional[str] = None
    caption: Optional[str] = None
    crawlIds: Optional[List[str]] = []

    access: CollAccessType = CollAccessType.PRIVATE

    defaultThumbnailName: Optional[str] = None
    allowPublicDownload: bool = True


# ============================================================================
class CollOut(BaseMongoModel):
    """Collection output model with annotations."""

    id: UUID
    name: str
    slug: str
    oid: UUID
    description: Optional[str] = None
    caption: Optional[str] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    crawlCount: Optional[int] = 0
    pageCount: Optional[int] = 0
    uniquePageCount: Optional[int] = 0
    totalSize: Optional[int] = 0

    dateEarliest: Optional[datetime] = None
    dateLatest: Optional[datetime] = None

    # Sorted by count, descending
    tags: Optional[List[str]] = []

    access: CollAccessType = CollAccessType.PRIVATE

    homeUrl: Optional[AnyHttpUrl] = None
    homeUrlTs: Optional[datetime] = None
    homeUrlPageId: Optional[UUID] = None

    resources: List[CrawlFileOut] = []
    thumbnail: Optional[ImageFileOut] = None
    thumbnailSource: Optional[CollectionThumbnailSource] = None
    defaultThumbnailName: Optional[str] = None

    allowPublicDownload: bool = True

    initialPages: List[PageOut] = []
    totalPages: Optional[int] = None
    preloadResources: List[PreloadResource] = []
    pagesQueryUrl: str = ""


# ============================================================================
class PublicCollOut(BaseMongoModel):
    """Collection output model with annotations."""

    id: UUID
    name: str
    slug: str
    oid: UUID
    description: Optional[str] = None
    caption: Optional[str] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    crawlCount: Optional[int] = 0
    pageCount: Optional[int] = 0
    uniquePageCount: Optional[int] = 0
    totalSize: Optional[int] = 0

    dateEarliest: Optional[datetime] = None
    dateLatest: Optional[datetime] = None

    access: CollAccessType = CollAccessType.PUBLIC

    homeUrl: Optional[AnyHttpUrl] = None
    homeUrlTs: Optional[datetime] = None

    resources: List[CrawlFileOut] = []
    thumbnail: Optional[PublicImageFileOut] = None
    defaultThumbnailName: Optional[str] = None

    allowPublicDownload: bool = True


# ============================================================================
class UpdateColl(BaseModel):
    """Update collection"""

    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    caption: Optional[str] = None
    access: Optional[CollAccessType] = None
    defaultThumbnailName: Optional[str] = None
    allowPublicDownload: Optional[bool] = None
    thumbnailSource: Optional[CollectionThumbnailSource] = None


# ============================================================================
class UpdateCollHomeUrl(BaseModel):
    """Update home url for collection"""

    pageId: Optional[UUID] = None


# ============================================================================
class AddRemoveCrawlList(BaseModel):
    """Collections to add or remove from collection"""

    crawlIds: List[str] = []


# ============================================================================
class CollectionSearchValuesResponse(BaseModel):
    """Response model for collections search values"""

    names: List[str]


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

    name: str
    slug: Optional[str] = None


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

    collections: List[PublicCollOut] = []


# ============================================================================
class OrgStorageRefs(BaseModel):
    """Input model for setting primary storage + optional replicas"""

    storage: StorageRef

    storageReplicas: List[StorageRef] = []


# ============================================================================
class S3StorageIn(BaseModel):
    """Custom S3 Storage input model"""

    type: Literal["s3"] = "s3"

    name: str

    access_key: str
    secret_key: str
    endpoint_url: str
    bucket: str
    access_endpoint_url: Optional[str] = None
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
    region: str = ""


# ============================================================================
# Subscriptions
# ============================================================================

PAUSED_PAYMENT_FAILED = "paused_payment_failed"
ACTIVE = "active"

REASON_PAUSED = "subscriptionPaused"
REASON_CANCELED = "subscriptionCanceled"


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

    storageQuota: Optional[int] = None
    maxExecMinutesPerMonth: Optional[int] = None

    maxConcurrentCrawls: Optional[int] = None
    maxPagesPerCrawl: Optional[int] = None

    extraExecMinutes: Optional[int] = None
    giftedExecMinutes: Optional[int] = None


# ============================================================================
class SubscriptionEventOut(BaseModel):
    """Fields to add to output models for subscription events"""

    oid: UUID
    timestamp: datetime


# ============================================================================
class SubscriptionCreate(BaseModel):
    """create new subscription"""

    subId: str
    status: str
    planId: str

    firstAdminInviteEmail: EmailStr
    quotas: Optional[OrgQuotas] = None


# ============================================================================
class SubscriptionCreateOut(SubscriptionCreate, SubscriptionEventOut):
    """Output model for subscription creation event"""

    type: Literal["create"] = "create"


# ============================================================================
class SubscriptionImport(BaseModel):
    """import subscription to existing org"""

    subId: str
    status: str
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
    status: str
    planId: str

    futureCancelDate: Optional[datetime] = None
    quotas: Optional[OrgQuotasIn] = None


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
class Subscription(BaseModel):
    """subscription data"""

    subId: str
    status: str
    planId: str

    futureCancelDate: Optional[datetime] = None
    readOnlyOnCancel: bool = False


# ============================================================================
class SubscriptionCanceledResponse(BaseModel):
    """Response model for subscription cancel"""

    deleted: bool
    canceled: bool


# ============================================================================
# ORGS
# ============================================================================
class OrgReadOnlyOnCancel(BaseModel):
    """Make org readOnly on subscription cancellation instead of deleting"""

    readOnlyOnCancel: bool


# ============================================================================
class OrgCreate(BaseModel):
    """Create a new org"""

    name: str
    slug: Optional[str] = None


# ============================================================================
class OrgQuotaUpdate(BaseModel):
    """Organization quota update (to track changes over time)"""

    modified: datetime
    update: OrgQuotas


# ============================================================================
class OrgReadOnlyUpdate(BaseModel):
    """Organization readonly update"""

    readOnly: bool
    readOnlyReason: Optional[str] = None


# ============================================================================
class OrgPublicProfileUpdate(BaseModel):
    """Organization enablePublicProfile update"""

    enablePublicProfile: Optional[bool] = None
    publicDescription: Optional[str] = None
    publicUrl: Optional[str] = None


# ============================================================================
class OrgWebhookUrls(BaseModel):
    """Organization webhook URLs"""

    crawlStarted: Optional[AnyHttpUrl] = None
    crawlFinished: Optional[AnyHttpUrl] = None
    crawlDeleted: Optional[AnyHttpUrl] = None
    qaAnalysisStarted: Optional[AnyHttpUrl] = None
    qaAnalysisFinished: Optional[AnyHttpUrl] = None
    crawlReviewed: Optional[AnyHttpUrl] = None
    uploadFinished: Optional[AnyHttpUrl] = None
    uploadDeleted: Optional[AnyHttpUrl] = None
    addedToCollection: Optional[AnyHttpUrl] = None
    removedFromCollection: Optional[AnyHttpUrl] = None
    collectionDeleted: Optional[AnyHttpUrl] = None


# ============================================================================
class OrgOut(BaseMongoModel):
    """Organization API output model"""

    id: UUID
    name: str
    slug: str
    users: Dict[str, Any] = {}

    created: Optional[datetime] = None

    default: bool = False
    bytesStored: int
    bytesStoredCrawls: int
    bytesStoredUploads: int
    bytesStoredProfiles: int
    origin: Optional[AnyHttpUrl] = None

    storageQuotaReached: Optional[bool] = False
    execMinutesQuotaReached: Optional[bool] = False

    # total usage and exec time
    usage: Optional[Dict[str, int]] = {}
    crawlExecSeconds: Dict[str, int] = {}

    # qa only usage + exec time
    qaUsage: Optional[Dict[str, int]] = {}
    qaCrawlExecSeconds: Dict[str, int] = {}

    # exec time limits
    monthlyExecSeconds: Dict[str, int] = {}
    extraExecSeconds: Dict[str, int] = {}
    giftedExecSeconds: Dict[str, int] = {}

    extraExecSecondsAvailable: int = 0
    giftedExecSecondsAvailable: int = 0

    quotas: OrgQuotas = OrgQuotas()
    quotaUpdates: Optional[List[OrgQuotaUpdate]] = []

    webhookUrls: Optional[OrgWebhookUrls] = OrgWebhookUrls()

    readOnly: Optional[bool] = False
    readOnlyReason: Optional[str] = None

    subscription: Optional[Subscription] = None

    allowSharedProxies: bool = False
    allowedProxies: list[str] = []
    crawlingDefaults: Optional[CrawlConfigDefaults] = None

    lastCrawlFinished: Optional[datetime] = None

    enablePublicProfile: bool = False
    publicDescription: str = ""
    publicUrl: str = ""


# ============================================================================
class Organization(BaseMongoModel):
    """Organization Base Model"""

    id: UUID
    name: str
    slug: str
    users: Dict[str, UserRole] = {}

    created: Optional[datetime] = None

    default: bool = False

    storage: StorageRef
    storageReplicas: List[StorageRef] = []
    customStorages: Dict[str, S3Storage] = {}

    bytesStored: int = 0
    bytesStoredCrawls: int = 0
    bytesStoredUploads: int = 0
    bytesStoredProfiles: int = 0

    # total usage + exec time
    usage: Dict[str, int] = {}
    crawlExecSeconds: Dict[str, int] = {}

    # qa only usage + exec time
    qaUsage: Dict[str, int] = {}
    qaCrawlExecSeconds: Dict[str, int] = {}

    # exec time limits
    monthlyExecSeconds: Dict[str, int] = {}
    extraExecSeconds: Dict[str, int] = {}
    giftedExecSeconds: Dict[str, int] = {}

    extraExecSecondsAvailable: int = 0
    giftedExecSecondsAvailable: int = 0

    quotas: OrgQuotas = OrgQuotas()
    quotaUpdates: Optional[List[OrgQuotaUpdate]] = []

    webhookUrls: Optional[OrgWebhookUrls] = OrgWebhookUrls()

    origin: Optional[AnyHttpUrl] = None

    readOnly: Optional[bool] = False
    readOnlyReason: Optional[str] = None

    subscription: Optional[Subscription] = None

    allowSharedProxies: bool = False
    allowedProxies: list[str] = []
    crawlingDefaults: Optional[CrawlConfigDefaults] = None

    lastCrawlFinished: Optional[datetime] = None

    enablePublicProfile: bool = False
    publicDescription: Optional[str] = None
    publicUrl: Optional[str] = None

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

                result["users"][id_] = {
                    "role": role,
                    "name": org_user.get("name", ""),
                    "email": org_user.get("email", ""),
                }

        return OrgOut.from_dict(result)


# ============================================================================
class OrgOutExport(Organization):
    """Org out for export"""

    # Additional field so export contains user names and emails
    userDetails: Optional[List[Dict[str, Union[str, int, UUID]]]] = None

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
    storageQuotaBytes: int
    archivedItemCount: int
    crawlCount: int
    uploadCount: int
    pageCount: int
    crawlPageCount: int
    uploadPageCount: int
    uniquePageCount: int
    crawlUniquePageCount: int
    uploadUniquePageCount: int
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
    org: Dict[str, Any]
    profiles: List[Dict[str, Any]]
    workflows: List[Dict[str, Any]]
    workflowRevisions: List[Dict[str, Any]]
    items: List[Dict[str, Any]]
    pages: List[Dict[str, Any]]
    collections: List[Dict[str, Any]]


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

    slugs: List[str]


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

    name: str
    description: Optional[str] = ""

    userid: UUID
    oid: UUID

    origins: List[str]
    resource: Optional[ProfileFile] = None

    created: Optional[datetime] = None
    createdBy: Optional[UUID] = None
    createdByName: Optional[str] = None
    modified: Optional[datetime] = None
    modifiedBy: Optional[UUID] = None
    modifiedByName: Optional[str] = None

    baseid: Optional[UUID] = None
    crawlerChannel: Optional[str] = None
    proxyId: Optional[str] = None


# ============================================================================
class ProfileWithCrawlConfigs(Profile):
    """Profile with list of crawlconfigs using this profile"""

    crawlconfigs: List[CrawlConfigProfileOut] = []


# ============================================================================
class UrlIn(BaseModel):
    """Request to set url"""

    url: HttpUrl


# ============================================================================
class ProfileLaunchBrowserIn(UrlIn):
    """Request to launch new browser for creating profile"""

    profileId: Optional[UUID] = None
    crawlerChannel: str = "default"
    proxyId: Optional[str] = None


# ============================================================================
class BrowserId(BaseModel):
    """Profile id on newly created profile"""

    browserid: str


# ============================================================================
class ProfileCreate(BaseModel):
    """Create new profile for browser id"""

    browserid: str
    name: str
    description: Optional[str] = ""
    crawlerChannel: str = "default"
    proxyId: Optional[str] = None


# ============================================================================
class ProfileUpdate(BaseModel):
    """Update existing profile with new browser profile or metadata only"""

    browserid: Optional[str] = ""
    name: str
    description: Optional[str] = ""


# ============================================================================
class ProfilePingResponse(BaseModel):
    """Response model for pinging profile"""

    success: bool
    origins: List[AnyHttpUrl]


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

### USERS ###


# ============================================================================
class UserCreate(BaseModel):
    """
    User Creation Model exposed to API
    """

    email: EmailStr
    password: str

    name: Optional[str] = ""

    inviteToken: Optional[UUID] = None


# ============================================================================
class UserUpdateEmailName(BaseModel):
    """
    Update email and/or name
    """

    email: Optional[EmailStr] = None
    name: Optional[str] = None


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
class WebhookEventType(str, Enum):
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
    itemIds: List[str]
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

    resources: List[CrawlFileOut]
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
    description: Optional[str] = None


# ============================================================================
class WebhookNotification(BaseMongoModel):
    """Base POST body model for webhook notifications"""

    event: WebhookEventType
    oid: UUID
    body: Union[
        CrawlStartedBody,
        CrawlFinishedBody,
        CrawlDeletedBody,
        QaAnalysisStartedBody,
        QaAnalysisFinishedBody,
        CrawlReviewedBody,
        UploadFinishedBody,
        UploadDeletedBody,
        CollectionItemAddedBody,
        CollectionItemRemovedBody,
        CollectionDeletedBody,
    ]
    success: bool = False
    attempts: int = 0
    created: datetime
    lastAttempted: Optional[datetime] = None


# ============================================================================

### BACKGROUND JOBS ###


# ============================================================================
class BgJobType(str, Enum):
    """Background Job Types"""

    CREATE_REPLICA = "create-replica"
    DELETE_REPLICA = "delete-replica"
    DELETE_ORG = "delete-org"
    RECALCULATE_ORG_STATS = "recalculate-org-stats"
    READD_ORG_PAGES = "readd-org-pages"


# ============================================================================
class BackgroundJob(BaseMongoModel):
    """Model for tracking background jobs"""

    id: str
    type: BgJobType
    oid: UUID
    success: Optional[bool] = None
    started: datetime
    finished: Optional[datetime] = None

    previousAttempts: Optional[List[Dict[str, Optional[datetime]]]] = None


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
    schedule: Optional[str] = None


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
    """Model for tracking jobs to readd an org's pages"""

    type: Literal[BgJobType.READD_ORG_PAGES] = BgJobType.READD_ORG_PAGES
    crawl_type: Optional[str] = None


# ============================================================================
# Union of all job types, for response model

AnyJob = RootModel[
    Union[
        CreateReplicaJob,
        DeleteReplicaJob,
        BackgroundJob,
        DeleteOrgJob,
        RecalculateOrgStatsJob,
        ReAddOrgPagesJob,
    ]
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

    id: Optional[str] = None


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

    items: List[AnyJob]


# ============================================================================
class PaginatedCrawlOutResponse(PaginatedResponse):
    """Response model for paginated crawls"""

    items: List[Union[CrawlOut, CrawlOutWithResources]]


# ============================================================================
class PaginatedCollOutResponse(PaginatedResponse):
    """Response model for paginated collections"""

    items: List[CollOut]


# ============================================================================
class PaginatedCrawlConfigOutResponse(PaginatedResponse):
    """Response model for paginated crawlconfigs"""

    items: List[CrawlConfigOut]


# ============================================================================
class PaginatedSeedResponse(PaginatedResponse):
    """Response model for paginated seeds"""

    items: List[Seed]


# ============================================================================
class PaginatedConfigRevisionResponse(PaginatedResponse):
    """Response model for paginated crawlconfig revisions"""

    items: List[ConfigRevision]


# ============================================================================
class PaginatedOrgOutResponse(PaginatedResponse):
    """Response model for paginated orgs"""

    items: List[OrgOut]


# ============================================================================
class PaginatedInvitePendingResponse(PaginatedResponse):
    """Response model for paginated orgs"""

    items: List[InviteOut]


# ============================================================================
class PaginatedPageOutResponse(PaginatedResponse):
    """Response model for paginated pages"""

    items: List[PageOut]


# ============================================================================
class PaginatedPageOutWithQAResponse(PaginatedResponse):
    """Response model for paginated pages with single QA info"""

    items: List[PageOutWithSingleQA]


# ============================================================================
class PaginatedProfileResponse(PaginatedResponse):
    """Response model for paginated profiles"""

    items: List[Profile]


# ============================================================================
class PaginatedSubscriptionEventResponse(PaginatedResponse):
    """Response model for paginated subscription events"""

    items: List[
        Union[
            SubscriptionCreateOut,
            SubscriptionUpdateOut,
            SubscriptionCancelOut,
            SubscriptionImportOut,
        ]
    ]


# ============================================================================
class PaginatedWebhookNotificationResponse(PaginatedResponse):
    """Response model for paginated webhook notifications"""

    items: List[WebhookNotification]


# ============================================================================
class PaginatedCrawlErrorResponse(PaginatedResponse):
    """Response model for crawl errors"""

    items: List[CrawlError]


# ============================================================================
class PaginatedUserEmailsResponse(PaginatedResponse):
    """Response model for user emails with org info"""

    items: List[UserEmailWithOrgInfo]


# ============================================================================
class PaginatedPageUrlCountResponse(PaginatedResponse):
    """Response model for page count by url"""

    items: List[PageUrlCount]
