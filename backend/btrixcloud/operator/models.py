"""Operator Models"""

from collections import defaultdict
from datetime import datetime
from uuid import UUID
from typing import Optional, DefaultDict, Literal, Annotated, Any
from pydantic import BaseModel, Field
from btrixcloud.models import StorageRef, TYPE_ALL_CRAWL_STATES, Organization


BTRIX_API = "btrix.cloud/v1"

CMAP = "ConfigMap.v1"
PVC = "PersistentVolumeClaim.v1"
POD = "Pod.v1"
CJS = f"CrawlJob.{BTRIX_API}"

StopReason = Literal[
    "stopped_by_user",
    "paused",
    "stopped_pause_expired",
    "time-limit",
    "size-limit",
    "stopped_storage_quota_reached",
    "stopped_time_quota_reached",
    "stopped_org_readonly",
]


# ============================================================================
class MCBaseRequest(BaseModel):
    """base metacontroller model, used for customize hook"""

    parent: dict
    controller: dict


# ============================================================================
class MCSyncData(MCBaseRequest):
    """sync / finalize metacontroller model"""

    children: dict
    related: dict
    finalizing: bool = False


# ============================================================================
class MCDecoratorSyncData(BaseModel):
    """sync for decoratorcontroller model"""

    object: dict
    controller: dict

    attachments: dict
    related: dict
    finalizing: bool = False


# ============================================================================
class MCDecoratorSyncResponse(BaseModel):
    """Response model for decoratorcontroller sync api"""

    attachments: list[dict[str, Any]]
    status: Optional[dict[str, Any]] = None
    annotations: Optional[dict[str, str]] = None


# ============================================================================
class CrawlSpec(BaseModel):
    """spec from k8s CrawlJob object"""

    id: str
    cid: UUID
    oid: UUID
    org: Organization
    scale: int = 1
    storage: StorageRef
    started: str
    crawler_channel: str
    stopping: bool = False
    paused_at: Optional[datetime] = None
    scheduled: bool = False
    timeout: int = 0
    max_crawl_size: int = 0
    qa_source_crawl_id: Optional[str] = ""
    proxy_id: Optional[str] = None

    @property
    def db_crawl_id(self) -> str:
        """return actual crawl_id for db, if qa run"""
        return self.qa_source_crawl_id or self.id

    @property
    def is_qa(self) -> bool:
        """return true if qa run"""
        return bool(self.qa_source_crawl_id)


# ============================================================================
class PodInfo(BaseModel):
    """Aggregate pod status info held in CrawlJob"""

    exitTime: Optional[str] = None
    exitCode: Optional[int] = None
    isNewExit: Optional[bool] = Field(default=None, exclude=True)
    reason: Optional[str] = None

    newStorage: Optional[str] = None

    evicted: Optional[bool] = False

    def should_restart_pod(self, forced: bool = False) -> Optional[str]:
        """return true if pod should be restarted"""
        if self.evicted:
            return "evicted"

        if forced:
            return "forced"

        return None


# ============================================================================
# pylint: disable=invalid-name
class CrawlStatus(BaseModel):
    """status from k8s CrawlJob object"""

    state: TYPE_ALL_CRAWL_STATES = "starting"
    pagesFound: int = 0
    pagesDone: int = 0
    size: int = 0
    # human readable size string
    sizeHuman: str = ""
    scale: int = 1
    filesAdded: int = 0
    filesAddedSize: int = 0
    finished: Optional[str] = None
    stopping: bool = False
    stopReason: Optional[StopReason] = None
    initRedis: bool = False
    crawlerImage: Optional[str] = None
    lastConfigUpdate: str = ""

    lastActiveTime: str = ""
    podStatus: DefaultDict[str, Annotated[PodInfo, Field(default_factory=PodInfo)]] = (
        defaultdict(lambda: PodInfo())  # pylint: disable=unnecessary-lambda
    )

    restartTime: Optional[str] = None
    canceled: bool = False

    # updated on pod exits and at regular interval
    # Crawl Execution Time -- time all crawler pods have been running
    # used to track resource usage and enforce execution minutes limit
    crawlExecTime: int = 0

    # Elapsed Exec Time -- time crawl has been running in at least one pod
    # used for crawl timeouts
    elapsedCrawlTime: int = 0

    # last exec time update
    lastUpdatedTime: str = ""

    # any pods exited
    anyCrawlPodNewExit: Optional[bool] = Field(default=False, exclude=True)

    # don't include in status, use by metacontroller
    resync_after: Optional[int] = Field(default=None, exclude=True)

    # last state
    last_state: TYPE_ALL_CRAWL_STATES = Field(default="starting", exclude=True)
