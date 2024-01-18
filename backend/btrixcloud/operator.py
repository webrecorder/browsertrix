""" btrixjob operator (working for metacontroller) """

import asyncio
import traceback
import os
from pprint import pprint
from typing import Optional, DefaultDict, TYPE_CHECKING

from collections import defaultdict

import json
from uuid import UUID
from fastapi import HTTPException

import yaml
import humanize

from pydantic import BaseModel, Field

from kubernetes.utils import parse_quantity
from redis import asyncio as exceptions

from .utils import (
    from_k8s_date,
    to_k8s_date,
    dt_now,
)
from .k8sapi import K8sAPI

from .models import (
    NON_RUNNING_STATES,
    RUNNING_STATES,
    RUNNING_AND_STARTING_ONLY,
    RUNNING_AND_STARTING_STATES,
    SUCCESSFUL_STATES,
    CrawlFile,
    CrawlCompleteIn,
    StorageRef,
)

if TYPE_CHECKING:
    from .crawlconfigs import CrawlConfigOps
    from .crawls import CrawlOps
    from .orgs import OrgOps
    from .colls import CollectionOps
    from .storages import StorageOps
    from .webhooks import EventWebhookOps
    from .users import UserManager
    from .background_jobs import BackgroundJobOps
    from redis.asyncio.client import Redis
else:
    CrawlConfigOps = CrawlOps = OrgOps = CollectionOps = Redis = object
    StorageOps = EventWebhookOps = UserManager = BackgroundJobOps = object

CMAP = "ConfigMap.v1"
PVC = "PersistentVolumeClaim.v1"
POD = "Pod.v1"

BTRIX_API = "btrix.cloud/v1"
CJS = f"CrawlJob.{BTRIX_API}"

METRICS_API = "metrics.k8s.io/v1beta1"
METRICS = f"PodMetrics.{METRICS_API}"

DEFAULT_TTL = 30

REDIS_TTL = 60

# time in seconds before a crawl is deemed 'waiting' instead of 'starting'
STARTING_TIME_SECS = 60

# how often to update execution time seconds
EXEC_TIME_UPDATE_SECS = 60


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
class CrawlSpec(BaseModel):
    """spec from k8s CrawlJob object"""

    id: str
    cid: UUID
    oid: UUID
    scale: int = 1
    storage: StorageRef
    started: str
    crawler_channel: str
    stopping: bool = False
    scheduled: bool = False
    timeout: int = 0
    max_crawl_size: int = 0


# ============================================================================
class PodResourcePercentage(BaseModel):
    """Resource usage percentage ratios"""

    memory: float = 0
    cpu: float = 0
    storage: float = 0


# ============================================================================
class PodResources(BaseModel):
    """Pod Resources"""

    memory: int = 0
    cpu: float = 0
    storage: int = 0

    def __init__(self, *a, **kw):
        if "memory" in kw:
            kw["memory"] = int(parse_quantity(kw["memory"]))
        if "cpu" in kw:
            kw["cpu"] = float(parse_quantity(kw["cpu"]))
        if "storage" in kw:
            kw["storage"] = int(parse_quantity(kw["storage"]))
        super().__init__(*a, **kw)


# ============================================================================
class PodInfo(BaseModel):
    """Aggregate pod status info held in CrawlJob"""

    exitTime: Optional[str] = None
    exitCode: Optional[int] = None
    isNewExit: Optional[bool] = Field(default=None, exclude=True)
    reason: Optional[str] = None

    allocated: PodResources = PodResources()
    used: PodResources = PodResources()

    newCpu: Optional[int] = None
    newMemory: Optional[int] = None

    def dict(self, *a, **kw):
        res = super().dict(*a, **kw)
        percent = {
            "memory": self.get_percent_memory(),
            "cpu": self.get_percent_cpu(),
            "storage": self.get_percent_storage(),
        }
        res["percent"] = percent
        return res

    def get_percent_memory(self) -> float:
        """compute percent memory used"""
        return (
            float(self.used.memory) / float(self.allocated.memory)
            if self.allocated.memory
            else 0
        )

    def get_percent_cpu(self) -> float:
        """compute percent cpu used"""
        return (
            float(self.used.cpu) / float(self.allocated.cpu)
            if self.allocated.cpu
            else 0
        )

    def get_percent_storage(self) -> float:
        """compute percent storage used"""
        return (
            float(self.used.storage) / float(self.allocated.storage)
            if self.allocated.storage
            else 0
        )

    def should_restart_pod(self):
        """return true if pod should be restarted"""
        if self.newMemory and self.newMemory != self.allocated.memory:
            return True

        if self.newCpu and self.newCpu != self.allocated.cpu:
            return True

        return False


# ============================================================================
class CrawlStatus(BaseModel):
    """status from k8s CrawlJob object"""

    state: str = "starting"
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
    stopReason: Optional[str] = None
    initRedis: bool = False
    crawlerImage: Optional[str] = None
    lastActiveTime: str = ""
    podStatus: Optional[DefaultDict[str, PodInfo]] = defaultdict(
        lambda: PodInfo()  # pylint: disable=unnecessary-lambda
    )
    # placeholder for pydantic 2.0 -- will require this version
    # podStatus: Optional[
    #    DefaultDict[str, Annotated[PodInfo, Field(default_factory=PodInfo)]]
    # ]
    restartTime: Optional[str]
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


# ============================================================================
# pylint: disable=too-many-statements, too-many-public-methods, too-many-branches, too-many-nested-blocks
# pylint: disable=too-many-instance-attributes, too-many-locals, too-many-lines, too-many-arguments
class BtrixOperator(K8sAPI):
    """BtrixOperator Handler"""

    crawl_config_ops: CrawlConfigOps
    crawl_ops: CrawlOps
    orgs_ops: OrgOps
    coll_ops: CollectionOps
    storage_ops: StorageOps
    event_webhook_ops: EventWebhookOps
    background_job_ops: BackgroundJobOps
    user_ops: UserManager

    def __init__(
        self,
        crawl_config_ops,
        crawl_ops,
        org_ops,
        coll_ops,
        storage_ops,
        event_webhook_ops,
        background_job_ops,
    ):
        super().__init__()

        self.crawl_config_ops = crawl_config_ops
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.coll_ops = coll_ops
        self.storage_ops = storage_ops
        self.background_job_ops = background_job_ops
        self.event_webhook_ops = event_webhook_ops

        self.user_ops = crawl_config_ops.user_manager

        self.config_file = "/config/config.yaml"

        self.done_key = "crawls-done"

        self.fast_retry_secs = int(os.environ.get("FAST_RETRY_SECS") or 0)

        self.log_failed_crawl_lines = int(os.environ.get("LOG_FAILED_CRAWL_LINES") or 0)

        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

        self._has_pod_metrics = False
        self.compute_crawler_resources()

        # to avoid background tasks being garbage collected
        # see: https://stackoverflow.com/a/74059981
        self.bg_tasks = set()

    def compute_crawler_resources(self):
        """compute memory / cpu resources for crawlers"""
        # pylint: disable=invalid-name
        p = self.shared_params
        num = max(int(p["crawler_browser_instances"]) - 1, 0)
        if not p.get("crawler_cpu"):
            base = parse_quantity(p["crawler_cpu_base"])
            extra = parse_quantity(p["crawler_extra_cpu_per_browser"])

            # cpu is a floating value of cpu cores
            p["crawler_cpu"] = float(base + num * extra)

            print(f"cpu = {base} + {num} * {extra} = {p['crawler_cpu']}")
        else:
            print(f"cpu = {p['crawler_cpu']}")

        if not p.get("crawler_memory"):
            base = parse_quantity(p["crawler_memory_base"])
            extra = parse_quantity(p["crawler_extra_memory_per_browser"])

            # memory is always an int
            p["crawler_memory"] = int(base + num * extra)

            print(f"memory = {base} + {num} * {extra} = {p['crawler_memory']}")
        else:
            print(f"memory = {p['crawler_memory']}")

    async def async_init(self):
        """perform any async init here"""
        self._has_pod_metrics = await self.is_pod_metrics_available()
        print("Pod Metrics Available:", self._has_pod_metrics)

    async def sync_profile_browsers(self, data: MCSyncData):
        """sync profile browsers"""
        spec = data.parent.get("spec", {})

        expire_time = from_k8s_date(spec.get("expireTime"))
        browserid = spec.get("id")

        if dt_now() >= expire_time:
            self.run_task(self.delete_profile_browser(browserid))
            return {"status": {}, "children": []}

        params = {}
        params.update(self.shared_params)
        params["id"] = browserid
        params["userid"] = spec.get("userid", "")

        oid = spec.get("oid")
        storage = StorageRef(spec.get("storageName"))

        storage_path = storage.get_storage_extra_path(oid)
        storage_secret = storage.get_storage_secret_name(oid)

        params["storage_path"] = storage_path
        params["storage_secret"] = storage_secret
        params["profile_filename"] = spec.get("profileFilename", "")
        params["crawler_image"] = spec["crawlerImage"]

        params["url"] = spec.get("startUrl", "about:blank")
        params["vnc_password"] = spec.get("vncPassword")

        children = self.load_from_yaml("profilebrowser.yaml", params)

        return {"status": {}, "children": children}

    # pylint: disable=too-many-return-statements, invalid-name
    async def sync_crawls(self, data: MCSyncData):
        """sync crawls"""

        status = CrawlStatus(**data.parent.get("status", {}))

        spec = data.parent.get("spec", {})
        crawl_id = spec["id"]
        cid = spec["cid"]
        oid = spec["oid"]

        redis_url = self.get_redis_url(crawl_id)

        params = {}
        params.update(self.shared_params)
        params["id"] = crawl_id
        params["cid"] = cid
        params["userid"] = spec.get("userid", "")

        pods = data.children[POD]

        # if finalizing, crawl is being deleted
        if data.finalizing:
            if not status.finished:
                # if can't cancel, already finished
                if not await self.cancel_crawl(
                    crawl_id, UUID(cid), UUID(oid), status, data.children[POD]
                ):
                    # instead of fetching the state (that was already set)
                    # return exception to ignore this request, keep previous
                    # finished state
                    raise HTTPException(status_code=400, detail="out_of_sync_status")

            return await self.finalize_response(
                crawl_id,
                UUID(oid),
                status,
                spec,
                data.children,
                params,
            )

        # just in case, finished but not deleted, can only get here if
        # do_crawl_finished_tasks() doesn't reach the end or taking too long
        if status.finished:
            print(
                f"warn crawl {crawl_id} finished but not deleted, post-finish taking too long?"
            )
            self.run_task(self.delete_crawl_job(crawl_id))
            return await self.finalize_response(
                crawl_id,
                UUID(oid),
                status,
                spec,
                data.children,
                params,
            )

        try:
            configmap = data.related[CMAP][f"crawl-config-{cid}"]["data"]
        # pylint: disable=bare-except, broad-except
        except:
            # fail crawl if config somehow missing, shouldn't generally happen
            await self.fail_crawl(crawl_id, UUID(cid), UUID(oid), status, pods)

            return self._empty_response(status)

        crawl = CrawlSpec(
            id=crawl_id,
            cid=cid,
            oid=oid,
            storage=StorageRef(spec["storageName"]),
            crawler_channel=spec.get("crawlerChannel"),
            scale=spec.get("scale", 1),
            started=data.parent["metadata"]["creationTimestamp"],
            stopping=spec.get("stopping", False),
            timeout=spec.get("timeout") or 0,
            max_crawl_size=int(spec.get("maxCrawlSize") or 0),
            scheduled=spec.get("manual") != "1",
        )

        # shouldn't get here, crawl should already be finalizing when canceled
        # just in case, handle canceled-but-not-finalizing here
        if status.state == "canceled":
            await self.delete_crawl_job(crawl.id)
            return {"status": status.dict(exclude_none=True), "children": []}

        # first, check storage quota, and fail immediately if quota reached
        if status.state in ("starting", "skipped_quota_reached"):
            # only check on very first run, before any pods/pvcs created
            # for now, allow if crawl has already started (pods/pvcs created)
            if (
                not pods
                and not data.children[PVC]
                and await self.org_ops.storage_quota_reached(crawl.oid)
            ):
                await self.mark_finished(
                    crawl.id, crawl.cid, crawl.oid, status, "skipped_quota_reached"
                )
                return self._empty_response(status)

        if status.state in ("starting", "waiting_org_limit"):
            if not await self.can_start_new(crawl, data, status):
                return self._empty_response(status)

            await self.set_state(
                "starting", status, crawl.id, allowed_from=["waiting_org_limit"]
            )

        if len(pods):
            for pod_name, pod in pods.items():
                self.sync_resources(status, pod_name, pod, data.children)

            status = await self.sync_crawl_state(
                redis_url,
                crawl,
                status,
                pods,
                data.related.get(METRICS, {}),
            )

            # auto sizing handled here
            self.handle_auto_size(crawl.id, status.podStatus)

            if status.finished:
                return await self.finalize_response(
                    crawl_id,
                    UUID(oid),
                    status,
                    spec,
                    data.children,
                    params,
                )

            await self.increment_pod_exec_time(
                pods, status, crawl.id, crawl.oid, EXEC_TIME_UPDATE_SECS
            )

        else:
            status.scale = crawl.scale
            status.lastUpdatedTime = to_k8s_date(dt_now())

        children = self._load_redis(params, status, data.children)

        storage_path = crawl.storage.get_storage_extra_path(oid)
        storage_secret = crawl.storage.get_storage_secret_name(oid)

        params["storage_path"] = storage_path
        params["storage_secret"] = storage_secret
        params["profile_filename"] = configmap["PROFILE_FILENAME"]

        # only resolve if not already set
        # not automatically updating image for existing crawls
        if not status.crawlerImage:
            status.crawlerImage = self.crawl_config_ops.get_channel_crawler_image(
                crawl.crawler_channel
            )

        params["crawler_image"] = status.crawlerImage

        params["storage_filename"] = configmap["STORE_FILENAME"]
        params["restart_time"] = spec.get("restartTime")

        params["redis_url"] = redis_url

        if spec.get("restartTime") != status.restartTime:
            # pylint: disable=invalid-name
            status.restartTime = spec.get("restartTime")
            status.resync_after = self.fast_retry_secs
            params["force_restart"] = True
        else:
            params["force_restart"] = False

        for i in range(0, status.scale):
            children.extend(self._load_crawler(params, i, status, data.children))

        return {
            "status": status.dict(exclude_none=True),
            "children": children,
            "resyncAfterSeconds": status.resync_after,
        }

    def _load_redis(self, params, status, children):
        name = f"redis-{params['id']}"
        has_pod = name in children[POD]

        pod_info = status.podStatus[name]
        params["name"] = name
        params["cpu"] = pod_info.newCpu or params.get("redis_cpu")
        params["memory"] = pod_info.newMemory or params.get("redis_memory")
        restart = pod_info.should_restart_pod() and has_pod
        if restart:
            print(f"Restart {name}")

        params["init_redis"] = status.initRedis and not restart

        return self.load_from_yaml("redis.yaml", params)

    def _load_crawler(self, params, i, status, children):
        name = f"crawl-{params['id']}-{i}"
        has_pod = name in children[POD]

        pod_info = status.podStatus[name]
        params["name"] = name
        params["cpu"] = pod_info.newCpu or params.get("crawler_cpu")
        params["memory"] = pod_info.newMemory or params.get("crawler_memory")
        params["do_restart"] = (
            pod_info.should_restart_pod() or params.get("force_restart")
        ) and has_pod
        if params.get("do_restart"):
            print(f"Restart {name}")

        params["priorityClassName"] = f"crawl-instance-{i}"

        return self.load_from_yaml("crawler.yaml", params)

    # pylint: disable=too-many-arguments
    async def _resolve_scale(
        self,
        crawl_id: str,
        desired_scale: int,
        redis: Redis,
        status: CrawlStatus,
        pods: dict[str, dict],
    ):
        """Resolve scale
        If desired_scale >= actual scale, just set (also limit by number of pages
        found).
        If desired scale < actual scale, attempt to shut down each crawl instance
        via redis setting. If contiguous instances shutdown (successful exit), lower
        scale and clean up previous scale state.
        """

        # actual scale (minus redis pod)
        actual_scale = len(pods)
        if pods.get(f"redis-{crawl_id}"):
            actual_scale -= 1

        # ensure at least enough pages for the scale
        if status.pagesFound and status.pagesFound < desired_scale:
            desired_scale = status.pagesFound

        # if desired_scale same or scaled up, return desired_scale
        if desired_scale >= actual_scale:
            return desired_scale

        new_scale = actual_scale
        for i in range(actual_scale - 1, desired_scale - 1, -1):
            name = f"crawl-{crawl_id}-{i}"
            pod = pods.get(name)
            if pod:
                print(f"Attempting scaling down of pod {i}")
                await redis.hset(f"{crawl_id}:stopone", name, "1")

            # check if this pod can be scaled down
            if new_scale == i + 1:
                # if status key doesn't exist, this pod never actually ran, so just scale down
                if not await redis.hexists(f"{crawl_id}:status", name):
                    new_scale = i
                    print(f"Scaled down pod index {i + 1} -> {i}, no previous pod")

                elif pod and pod["status"].get("phase") == "Succeeded":
                    new_scale = i
                    print(f"Scaled down pod index {i + 1} -> {i}, pod completed")

        if new_scale < actual_scale:
            for i in range(new_scale, actual_scale):
                name = f"crawl-{crawl_id}-{i}"
                await redis.hdel(f"{crawl_id}:stopone", name)
                await redis.hdel(f"{crawl_id}:status", name)

        return new_scale

    def sync_resources(self, status, name, pod, children):
        """set crawljob status from current resources"""
        resources = status.podStatus[name].allocated

        src = pod["spec"]["containers"][0]["resources"]["requests"]
        resources.memory = int(parse_quantity(src.get("memory")))
        resources.cpu = float(parse_quantity(src.get("cpu")))

        pvc = children[PVC].get(name)
        if pvc:
            src = pvc["spec"]["resources"]["requests"]
            resources.storage = int(parse_quantity(src.get("storage")))

    async def set_state(self, state, status, crawl_id, allowed_from, **kwargs):
        """set status state and update db, if changed
        if allowed_from passed in, can only transition from allowed_from state,
        otherwise get current state from db and return
        the following state transitions are supported:

        from starting to org concurrent crawl limit and back:
         - starting -> waiting_org_capacity -> starting

        from starting to running:
         - starting -> running

        from running to complete or complete[:stopReason]:
         - running -> complete[:stopReason]
         - running -> complete

        from starting or running to waiting for capacity (pods pending) and back:
         - starting -> waiting_capacity
         - running -> waiting_capacity
         - waiting_capacity -> running

        from any state to canceled or failed:
         - not complete[:stopReason] -> canceled
         - not complete[:stopReason] -> failed
        """
        if not allowed_from or status.state in allowed_from:
            res = await self.crawl_ops.update_crawl_state_if_allowed(
                crawl_id, state=state, allowed_from=allowed_from, **kwargs
            )
            if res:
                print(f"Setting state: {status.state} -> {state}, {crawl_id}")
                status.state = state
                return True

            # get actual crawl state
            actual_state, finished = await self.crawl_ops.get_crawl_state(crawl_id)
            if actual_state:
                status.state = actual_state
            if finished:
                status.finished = to_k8s_date(finished)

            if actual_state != state:
                print(f"state mismatch, actual state {actual_state}, requested {state}")
                if not actual_state and state == "canceled":
                    return True

        if status.state != state:
            print(
                f"Not setting state: {status.state} -> {state}, {crawl_id} not allowed"
            )
        return False

    def load_from_yaml(self, filename, params):
        """load and parse k8s template from yaml file"""
        return list(
            yaml.safe_load_all(self.templates.env.get_template(filename).render(params))
        )

    def get_related(self, data: MCBaseRequest):
        """return objects related to crawl pods"""
        spec = data.parent.get("spec", {})
        cid = spec["cid"]
        crawl_id = spec["id"]
        oid = spec.get("oid")
        related_resources = [
            {
                "apiVersion": "v1",
                "resource": "configmaps",
                "labelSelector": {"matchLabels": {"btrix.crawlconfig": cid}},
            },
            {
                "apiVersion": BTRIX_API,
                "resource": "crawljobs",
                "labelSelector": {"matchLabels": {"btrix.org": oid}},
            },
        ]

        if self._has_pod_metrics:
            related_resources.append(
                {
                    "apiVersion": METRICS_API,
                    "resource": "pods",
                    "labelSelector": {"matchLabels": {"crawl": crawl_id}},
                }
            )

        return {"relatedResources": related_resources}

    async def can_start_new(self, crawl: CrawlSpec, data: MCSyncData, status):
        """return true if crawl can start, otherwise set crawl to 'queued' state
        until more crawls for org finish"""
        max_crawls = await self.org_ops.get_max_concurrent_crawls(crawl.oid)
        if not max_crawls:
            return True

        if len(data.related[CJS]) <= max_crawls:
            return True

        name = data.parent.get("metadata", {}).get("name")

        # def metadata_key(val):
        #    return val.get("metadata").get("creationTimestamp")

        # all_crawljobs = sorted(data.related[CJS].values(), key=metadata_key)
        # print(list(data.related[CJS].keys()))

        i = 0
        for crawl_sorted in data.related[CJS].values():
            if crawl_sorted.get("status", {}).get("state") in NON_RUNNING_STATES:
                continue

            # print(i, crawl_sorted.get("metadata").get("name"))
            if crawl_sorted.get("metadata").get("name") == name:
                # print("found: ", name, "index", i)
                if i < max_crawls:
                    return True

                break
            i += 1

        await self.set_state(
            "waiting_org_limit", status, crawl.id, allowed_from=["starting"]
        )
        return False

    async def cancel_crawl(
        self,
        crawl_id: str,
        cid: UUID,
        oid: UUID,
        status: CrawlStatus,
        pods: dict,
    ) -> bool:
        """Mark crawl as canceled"""
        if not await self.mark_finished(crawl_id, cid, oid, status, "canceled"):
            return False

        await self.mark_for_cancelation(crawl_id)

        if not status.canceled:
            for name, pod in pods.items():
                pstatus = pod["status"]
                role = pod["metadata"]["labels"]["role"]

                if role != "crawler":
                    continue

                if "containerStatuses" not in pstatus:
                    continue

                cstatus = pstatus["containerStatuses"][0]

                self.handle_terminated_pod(
                    name, role, status, cstatus["state"].get("terminated")
                )

            status.canceled = True

        return status.canceled

    async def fail_crawl(
        self,
        crawl_id: str,
        cid: UUID,
        oid: UUID,
        status: CrawlStatus,
        pods: dict,
        stats=None,
    ) -> bool:
        """Mark crawl as failed, log crawl state and print crawl logs, if possible"""
        prev_state = status.state

        if not await self.mark_finished(
            crawl_id, cid, oid, status, "failed", stats=stats
        ):
            return False

        if not self.log_failed_crawl_lines or prev_state == "failed":
            return True

        pod_names = list(pods.keys())

        for name in pod_names:
            print(f"============== POD STATUS: {name} ==============")
            pprint(pods[name]["status"])

        self.run_task(self.print_pod_logs(pod_names, self.log_failed_crawl_lines))

        return True

    def _empty_response(self, status):
        """done response for removing crawl"""
        return {
            "status": status.dict(exclude_none=True),
            "children": [],
        }

    async def finalize_response(
        self,
        crawl_id: str,
        oid: UUID,
        status: CrawlStatus,
        spec: dict,
        children: dict,
        params: dict,
    ):
        """ensure crawl id ready for deletion"""

        redis_pod = f"redis-{crawl_id}"
        new_children = []

        finalized = False

        pods = children[POD]

        if redis_pod in pods:
            # if has other pods, keep redis pod until they are removed
            if len(pods) > 1:
                new_children = self._load_redis(params, status, children)
                await self.increment_pod_exec_time(pods, status, crawl_id, oid)

        # keep pvs until pods are removed
        if new_children:
            new_children.extend(list(children[PVC].values()))

        if not children[POD] and not children[PVC]:
            # keep parent until ttl expired, if any
            if status.finished:
                ttl = spec.get("ttlSecondsAfterFinished", DEFAULT_TTL)
                finished = from_k8s_date(status.finished)
                if (dt_now() - finished).total_seconds() > ttl > 0:
                    print("CrawlJob expired, deleting: " + crawl_id)
                    finalized = True
            else:
                finalized = True

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "finalized": finalized,
        }

    async def _get_redis(self, redis_url: str) -> Optional[Redis]:
        """init redis, ensure connectivity"""
        redis = None
        try:
            redis = await self.get_redis_client(redis_url)
            # test connection
            await redis.ping()
            return redis

        # pylint: disable=bare-except
        except:
            if redis:
                await redis.close()

            return None

    async def sync_crawl_state(
        self,
        redis_url: str,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict[str, dict],
        metrics: Optional[dict],
    ):
        """sync crawl state for running crawl"""
        # check if at least one crawler pod started running
        crawler_running, redis_running, done = self.sync_pod_status(pods, status)
        redis = None

        try:
            if redis_running:
                redis = await self._get_redis(redis_url)

            await self.add_used_stats(crawl.id, status.podStatus, redis, metrics)

            # skip if no newly exited pods
            if status.anyCrawlPodNewExit:
                await self.log_crashes(crawl.id, status.podStatus, redis)

            if not crawler_running:
                if self.should_mark_waiting(status.state, crawl.started):
                    await self.set_state(
                        "waiting_capacity",
                        status,
                        crawl.id,
                        allowed_from=RUNNING_AND_STARTING_ONLY,
                    )

                # for now, don't reset redis once inited
                if status.lastActiveTime and (
                    (dt_now() - from_k8s_date(status.lastActiveTime)).total_seconds()
                    > REDIS_TTL
                ):
                    print(
                        f"Pausing redis, no running crawler pods for >{REDIS_TTL} secs"
                    )
                    status.initRedis = False

                # if still running, resync after N seconds
                status.resync_after = self.fast_retry_secs
                return status

            status.initRedis = True
            status.lastActiveTime = to_k8s_date(dt_now())

            if not redis:
                # if still running, resync after N seconds
                status.resync_after = self.fast_retry_secs
                return status

            # set state to running (if not already)
            if status.state not in RUNNING_STATES:
                # if true (state is set), also run webhook
                if await self.set_state(
                    "running",
                    status,
                    crawl.id,
                    allowed_from=["starting", "waiting_capacity"],
                ):
                    self.run_task(
                        self.event_webhook_ops.create_crawl_started_notification(
                            crawl.id, crawl.oid, scheduled=crawl.scheduled
                        )
                    )

            file_done = await redis.lpop(self.done_key)

            while file_done:
                msg = json.loads(file_done)
                # add completed file
                if msg.get("filename"):
                    await self.add_file_to_crawl(msg, crawl, redis)
                    await redis.incr("filesAdded")

                # get next file done
                file_done = await redis.lpop(self.done_key)

            # ensure filesAdded and filesAddedSize always set
            status.filesAdded = int(await redis.get("filesAdded") or 0)
            status.filesAddedSize = int(await redis.get("filesAddedSize") or 0)

            # update stats and get status
            return await self.update_crawl_state(redis, crawl, status, pods, done)

        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            print(f"Crawl get failed: {exc}, will try again")
            return status

        finally:
            if redis:
                await redis.close()

    def sync_pod_status(self, pods: dict[str, dict], status: CrawlStatus):
        """check status of pods"""
        crawler_running = False
        redis_running = False
        done = True

        try:
            for name, pod in pods.items():
                running = False

                pstatus = pod["status"]
                phase = pstatus["phase"]
                role = pod["metadata"]["labels"]["role"]

                if phase in ("Running", "Succeeded"):
                    running = True

                if "containerStatuses" in pstatus:
                    cstatus = pstatus["containerStatuses"][0]

                    # consider 'ContainerCreating' as running
                    waiting = cstatus["state"].get("waiting")
                    if (
                        phase == "Pending"
                        and waiting
                        and waiting.get("reason") == "ContainerCreating"
                    ):
                        running = True

                    self.handle_terminated_pod(
                        name, role, status, cstatus["state"].get("terminated")
                    )

                if role == "crawler":
                    crawler_running = crawler_running or running
                    done = done and phase == "Succeeded"
                elif role == "redis":
                    redis_running = redis_running or running

        # pylint: disable=broad-except
        except Exception as exc:
            done = False
            print(exc)

        return crawler_running, redis_running, done

    def handle_terminated_pod(self, name, role, status, terminated):
        """handle terminated pod state"""
        if not terminated:
            return

        exit_time = terminated.get("finishedAt")
        if not exit_time:
            print("warn: terminated pod missing finishedAt", flush=True)
            return

        pod_status = status.podStatus[name]

        pod_status.isNewExit = pod_status.exitTime != exit_time
        if pod_status.isNewExit and role == "crawler":
            pod_status.exitTime = exit_time
            status.anyCrawlPodNewExit = True

        # detect reason
        exit_code = terminated.get("exitCode")

        if exit_code == 0:
            pod_status.reason = "done"
        elif terminated.get("reason") == "OOMKilled" or exit_code == 137:
            pod_status.reason = "oom"
        else:
            pod_status.reason = "interrupt: " + str(exit_code)

        pod_status.exitCode = exit_code

    async def increment_pod_exec_time(
        self,
        pods: dict[str, dict],
        status: CrawlStatus,
        crawl_id: str,
        oid: UUID,
        min_duration=0,
    ) -> None:
        """inc exec time tracking"""
        now = dt_now()

        if not status.lastUpdatedTime:
            status.lastUpdatedTime = to_k8s_date(now)
            return

        update_start_time = from_k8s_date(status.lastUpdatedTime)

        reason = None
        update_duration = (now - update_start_time).total_seconds()

        if status.anyCrawlPodNewExit:
            reason = "new pod exit"

        elif status.canceled:
            reason = "crawl canceled"

        elif now.month != update_start_time.month:
            reason = "month change"

        elif update_duration >= min_duration:
            reason = "duration reached" if min_duration else "finalizing"

        if not reason:
            return

        exec_time = 0
        max_duration = 0
        print(
            f"Exec Time Update: {reason}: {now} - {update_start_time} = {update_duration}"
        )

        for name, pod in pods.items():
            pstatus = pod["status"]
            role = pod["metadata"]["labels"]["role"]

            if role != "crawler":
                continue

            if "containerStatuses" not in pstatus:
                continue

            cstate = pstatus["containerStatuses"][0]["state"]

            end_time = None
            start_time = None
            pod_state = ""

            if "running" in cstate:
                pod_state = "running"
                state = cstate["running"]
                start_time = from_k8s_date(state.get("startedAt"))
                if update_start_time and update_start_time > start_time:
                    start_time = update_start_time

                end_time = now
            elif "terminated" in cstate:
                pod_state = "terminated"
                state = cstate["terminated"]
                start_time = from_k8s_date(state.get("startedAt"))
                end_time = from_k8s_date(state.get("finishedAt"))
                if update_start_time and update_start_time > start_time:
                    start_time = update_start_time

                # already counted
                if update_start_time and end_time < update_start_time:
                    print(
                        f"  - {name}: {pod_state}: skipping already counted, "
                        + f"{end_time} < {start_time}"
                    )
                    continue

            if end_time and start_time:
                duration = int((end_time - start_time).total_seconds())
                print(
                    f"  - {name}: {pod_state}: {end_time} - {start_time} = {duration}"
                )
                exec_time += duration
                max_duration = max(duration, max_duration)

        if exec_time:
            await self.crawl_ops.inc_crawl_exec_time(crawl_id, exec_time)
            await self.org_ops.inc_org_time_stats(oid, exec_time, True)
            status.crawlExecTime += exec_time
            status.elapsedCrawlTime += max_duration

        print(
            f"  Exec Time Total: {status.crawlExecTime}, Incremented By: {exec_time}",
            flush=True,
        )

        status.lastUpdatedTime = to_k8s_date(now)

    def should_mark_waiting(self, state, started):
        """Should the crawl be marked as waiting for capacity?"""
        if state in RUNNING_STATES:
            return True

        if state == "starting":
            started = from_k8s_date(started)
            return (dt_now() - started).total_seconds() > STARTING_TIME_SECS

        return False

    async def add_used_stats(self, crawl_id, pod_status, redis, metrics):
        """load current usage stats"""
        if redis:
            stats = await redis.info("persistence")
            storage = int(stats.get("aof_current_size", 0)) + int(
                stats.get("current_cow_size", 0)
            )
            pod_info = pod_status[f"redis-{crawl_id}"]
            pod_info.used.storage = storage

            # if no pod metrics, get memory estimate from redis itself
            if not self._has_pod_metrics:
                stats = await redis.info("memory")
                pod_info.used.memory = int(stats.get("used_memory_rss", 0))

                # stats = await redis.info("cpu")
                # pod_info.used.cpu = float(stats.get("used_cpu_sys", 0))

        for name, metric in metrics.items():
            usage = metric["containers"][0]["usage"]
            pod_info = pod_status[name]
            pod_info.used.memory = int(parse_quantity(usage["memory"]))
            pod_info.used.cpu = float(parse_quantity(usage["cpu"]))

    def handle_auto_size(self, _, pod_status):
        """auto scale pods here, experimental"""
        for name, pod in pod_status.items():
            # if pod crashed due to OOM, increase mem
            # if pod.isNewExit and pod.reason == "oom":
            #    pod.newMemory = int(float(pod.allocated.memory) * 1.2)
            #    print(f"Resizing pod {name} -> mem {pod.newMemory} - OOM Detected")

            # if redis is using >0.90 of its memory, increase mem
            if name.startswith("redis") and pod.get_percent_memory() > 0.90:
                pod.newMemory = int(float(pod.allocated.memory) * 1.2)
                print(f"Resizing pod {name} -> mem {pod.newMemory} - Redis Capacity")

    async def log_crashes(self, crawl_id, pod_status, redis):
        """report/log any pod crashes here"""
        for name, pod in pod_status.items():
            # log only unexpected exits as crashes
            # - 0 is success / intended shutdown
            # - 11 is default interrupt / intended restart
            # - 13 is force interrupt / intended restart
            if not pod.isNewExit or pod.exitCode in (0, 11, 13):
                continue

            log = self.get_log_line(
                "Crawler Instance Crashed", {"reason": pod.reason, "pod": name}
            )
            if not redis:
                print(log)
            else:
                await redis.lpush(f"{crawl_id}:e", log)

    def get_log_line(self, message, details):
        """get crawler error line for logging"""
        err = {
            "timestamp": dt_now().isoformat(),
            "logLevel": "error",
            "context": "k8s",
            "message": message,
            "details": details,
        }
        return json.dumps(err)

    async def add_file_to_crawl(self, cc_data, crawl, redis):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        org = await self.org_ops.get_org_by_id(crawl.oid)

        filename = self.storage_ops.get_org_relative_path(
            org, crawl.storage, filecomplete.filename
        )

        crawl_file = CrawlFile(
            filename=filename,
            size=filecomplete.size,
            hash=filecomplete.hash,
            crc32=filecomplete.crc32,
            storage=crawl.storage,
        )

        await redis.incr("filesAddedSize", filecomplete.size)

        await self.crawl_ops.add_crawl_file(crawl.id, crawl_file, filecomplete.size)

        try:
            await self.background_job_ops.create_replica_jobs(
                crawl.oid, crawl_file, crawl.id, "crawl"
            )
        # pylint: disable=broad-except
        except Exception as exc:
            print("Replicate Exception", exc, flush=True)

        return True

    async def is_crawl_stopping(
        self, crawl: CrawlSpec, status: CrawlStatus
    ) -> Optional[str]:
        """check if crawl is stopping and set reason"""
        # if user requested stop, then enter stopping phase
        if crawl.stopping:
            print("Graceful Stop: User requested stop")
            return "stopped_by_user"

        # check timeout if timeout time exceeds elapsed time
        if crawl.timeout:
            elapsed = (
                status.elapsedCrawlTime
                + (dt_now() - from_k8s_date(status.lastUpdatedTime)).total_seconds()
            )
            if elapsed > crawl.timeout:
                print(
                    f"Graceful Stop: Crawl running time exceeded {crawl.timeout} second timeout"
                )
                return "time-limit"

        # crawl size limit
        if crawl.max_crawl_size and status.size > crawl.max_crawl_size:
            print(f"Graceful Stop: Maximum crawl size {crawl.max_crawl_size} hit")
            return "size-limit"

        # check exec time quotas and stop if reached limit
        if await self.org_ops.exec_mins_quota_reached(crawl.oid):
            return "stopped_quota_reached"

        return None

    async def get_redis_crawl_stats(self, redis: Redis, crawl_id: str):
        """get page stats"""
        try:
            # crawler >0.9.0, done key is a value
            pages_done = int(await redis.get(f"{crawl_id}:d") or 0)
        except exceptions.ResponseError:
            # crawler <=0.9.0, done key is a list
            pages_done = await redis.llen(f"{crawl_id}:d")

        pages_found = await redis.scard(f"{crawl_id}:s")
        sizes = await redis.hgetall(f"{crawl_id}:size")
        archive_size = sum(int(x) for x in sizes.values())

        stats = {"found": pages_found, "done": pages_done, "size": archive_size}
        return stats, sizes

    async def update_crawl_state(
        self,
        redis: Redis,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict[str, dict],
        done: bool,
    ) -> CrawlStatus:
        """update crawl state and check if crawl is now done"""
        results = await redis.hgetall(f"{crawl.id}:status")
        stats, sizes = await self.get_redis_crawl_stats(redis, crawl.id)

        # need to add size of previously completed WACZ files as well!
        stats["size"] += status.filesAddedSize

        # update status
        status.pagesDone = stats["done"]
        status.pagesFound = stats["found"]
        status.size = stats["size"]
        status.sizeHuman = humanize.naturalsize(status.size)

        await self.crawl_ops.update_running_crawl_stats(crawl.id, stats)

        for key, value in sizes.items():
            value = int(value)
            if value > 0 and status.podStatus:
                pod_info = status.podStatus[key]
                pod_info.used.storage = value

        if not status.stopReason:
            status.stopReason = await self.is_crawl_stopping(crawl, status)
            status.stopping = status.stopReason is not None

        # mark crawl as stopping
        if status.stopping:
            await redis.set(f"{crawl.id}:stopping", "1")
            # backwards compatibility with older crawler
            await redis.set("crawl-stop", "1")

        # resolve scale
        if crawl.scale != status.scale:
            status.scale = await self._resolve_scale(
                crawl.id, crawl.scale, redis, status, pods
            )

        # check if done / failed
        status_count: dict[str, int] = {}
        for i in range(crawl.scale):
            res = results.get(f"crawl-{crawl.id}-{i}")
            if res:
                status_count[res] = status_count.get(res, 0) + 1

        # check if all crawlers are done
        if done and status_count.get("done", 0) >= crawl.scale:
            # check if one-page crawls actually succeeded
            # if only one page found, and no files, assume failed
            if status.pagesFound == 1 and not status.filesAdded:
                await self.fail_crawl(
                    crawl.id, crawl.cid, crawl.oid, status, pods, stats
                )
                return status

            if status.stopReason in ("stopped_by_user", "stopped_quota_reached"):
                state = status.stopReason
            else:
                state = "complete"

            await self.mark_finished(
                crawl.id, crawl.cid, crawl.oid, status, state, crawl, stats
            )

        # check if all crawlers failed
        elif status_count.get("failed", 0) >= crawl.scale:
            # if stopping, and no pages finished, mark as canceled
            if status.stopping and not status.pagesDone:
                await self.mark_finished(
                    crawl.id, crawl.cid, crawl.oid, status, "canceled", crawl, stats
                )
            else:
                await self.fail_crawl(
                    crawl.id, crawl.cid, crawl.oid, status, pods, stats
                )

        # check for other statuses
        else:
            new_status = None
            if status_count.get("running"):
                if status.state in ("generate-wacz", "uploading-wacz", "pending-wacz"):
                    new_status = "running"

            elif status_count.get("generate-wacz"):
                new_status = "generate-wacz"
            elif status_count.get("uploading-wacz"):
                new_status = "uploading-wacz"
            elif status_count.get("pending-wait"):
                new_status = "pending-wait"
            if new_status:
                await self.set_state(
                    new_status, status, crawl.id, allowed_from=RUNNING_STATES
                )

        return status

    # pylint: disable=too-many-arguments
    async def mark_finished(
        self,
        crawl_id: str,
        cid: UUID,
        oid: UUID,
        status: CrawlStatus,
        state: str,
        crawl=None,
        stats=None,
    ) -> bool:
        """mark crawl as finished, set finished timestamp and final state"""

        finished = dt_now()

        kwargs = {"finished": finished}
        if stats:
            kwargs["stats"] = stats

        if state in SUCCESSFUL_STATES:
            allowed_from = RUNNING_STATES
        else:
            allowed_from = RUNNING_AND_STARTING_STATES

        # if set_state returns false, already set to same status, return
        if not await self.set_state(
            state, status, crawl_id, allowed_from=allowed_from, **kwargs
        ):
            print("already finished, ignoring mark_finished")
            if not status.finished:
                status.finished = to_k8s_date(finished)

            return False

        status.finished = to_k8s_date(finished)

        if crawl and state in SUCCESSFUL_STATES:
            await self.inc_crawl_complete_stats(crawl, finished)

        self.run_task(
            self.do_crawl_finished_tasks(
                crawl_id, cid, oid, status.filesAddedSize, state
            )
        )

        return True

    # pylint: disable=too-many-arguments
    async def do_crawl_finished_tasks(
        self,
        crawl_id: str,
        cid: UUID,
        oid: UUID,
        files_added_size: int,
        state: str,
    ) -> None:
        """Run tasks after crawl completes in asyncio.task coroutine."""
        await self.crawl_config_ops.stats_recompute_last(cid, files_added_size, 1)

        if state in SUCCESSFUL_STATES and oid:
            await self.org_ops.inc_org_bytes_stored(oid, files_added_size, "crawl")
            await self.coll_ops.add_successful_crawl_to_collections(crawl_id, cid)

        await self.event_webhook_ops.create_crawl_finished_notification(
            crawl_id, oid, state
        )

        # add crawl errors to db
        await self.add_crawl_errors_to_db(crawl_id)

        # finally, delete job
        await self.delete_crawl_job(crawl_id)

    async def inc_crawl_complete_stats(self, crawl, finished):
        """Increment Crawl Stats"""

        started = from_k8s_date(crawl.started)

        duration = int((finished - started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        await self.org_ops.inc_org_time_stats(crawl.oid, duration)

    async def mark_for_cancelation(self, crawl_id):
        """mark crawl as canceled in redis"""
        try:
            redis_url = self.get_redis_url(crawl_id)
            redis = await self._get_redis(redis_url)
            if not redis:
                return False

            await redis.set(f"{crawl_id}:canceled", "1")
            return True
        finally:
            if redis:
                await redis.close()

    async def add_crawl_errors_to_db(self, crawl_id, inc=100):
        """Pull crawl errors from redis and write to mongo db"""
        index = 0
        redis = None
        try:
            redis_url = self.get_redis_url(crawl_id)
            redis = await self._get_redis(redis_url)
            if not redis:
                return

            # ensure this only runs once
            if not await redis.setnx("errors-exported", "1"):
                return

            while True:
                skip = index * inc
                upper_bound = skip + inc - 1
                errors = await redis.lrange(f"{crawl_id}:e", skip, upper_bound)
                if not errors:
                    break

                await self.crawl_ops.add_crawl_errors(crawl_id, errors)

                if len(errors) < inc:
                    # If we have fewer than inc errors, we can assume this is the
                    # last page of data to add.
                    break
                index += 1
        # pylint: disable=bare-except
        except:
            # likely redis has already been deleted, so nothing to do
            pass
        finally:
            if redis:
                await redis.close()

    def get_cronjob_crawl_related(self, data: MCBaseRequest):
        """return configmap related to crawl"""
        labels = data.parent.get("metadata", {}).get("labels", {})
        cid = labels.get("btrix.crawlconfig")
        return {
            "relatedResources": [
                {
                    "apiVersion": "v1",
                    "resource": "configmaps",
                    "labelSelector": {"matchLabels": {"btrix.crawlconfig": cid}},
                }
            ]
        }

    async def sync_cronjob_crawl(self, data: MCDecoratorSyncData):
        """create crawljobs from a job object spawned by cronjob"""

        metadata = data.object["metadata"]
        labels = metadata.get("labels", {})
        cid = labels.get("btrix.crawlconfig")

        name = metadata.get("name")
        crawl_id = name

        actual_state, finished = await self.crawl_ops.get_crawl_state(crawl_id)
        if finished:
            status = None
            # mark job as completed
            if not data.object["status"].get("succeeded"):
                print("Cron Job Complete!", finished)
                status = {
                    "succeeded": 1,
                    "startTime": metadata.get("creationTimestamp"),
                    "completionTime": to_k8s_date(finished),
                }

            return {
                "attachments": [],
                "annotations": {"finished": finished},
                "status": status,
            }

        configmap = data.related[CMAP][f"crawl-config-{cid}"]["data"]

        oid = configmap.get("ORG_ID")
        userid = configmap.get("USER_ID")

        crawljobs = data.attachments[CJS]

        org = await self.org_ops.get_org_by_id(UUID(oid))

        crawl_id, crawljob = self.new_crawl_job_yaml(
            cid,
            userid=userid,
            oid=oid,
            storage=org.storage,
            crawler_channel=configmap.get("CRAWLER_CHANNEL", "default"),
            scale=int(configmap.get("INITIAL_SCALE", 1)),
            crawl_timeout=int(configmap.get("CRAWL_TIMEOUT", 0)),
            max_crawl_size=int(configmap.get("MAX_CRAWL_SIZE", "0")),
            manual=False,
            crawl_id=crawl_id,
        )

        attachments = list(yaml.safe_load_all(crawljob))

        if crawl_id in crawljobs:
            attachments[0]["status"] = crawljobs[CJS][crawl_id]["status"]

        if not actual_state:
            # pylint: disable=duplicate-code
            crawlconfig = await self.crawl_config_ops.get_crawl_config(
                UUID(cid), UUID(oid)
            )
            if not crawlconfig:
                print(
                    f"error: no crawlconfig {cid}. skipping scheduled job. old cronjob left over?"
                )
                return {"attachments": []}

            # db create
            user = await self.user_ops.get_by_id(UUID(userid))
            if not user:
                print(f"error: missing user for id {userid}")
                return {"attachments": []}

            await self.crawl_config_ops.add_new_crawl(
                crawl_id, crawlconfig, user, manual=False
            )
            print("Scheduled Crawl Created: " + crawl_id)

        return {
            "attachments": attachments,
        }

    async def finalize_background_job(self, data: MCDecoratorSyncData) -> dict:
        """handle finished background job"""

        metadata = data.object["metadata"]
        labels: dict[str, str] = metadata.get("labels", {})
        oid: str = labels.get("btrix.org") or ""
        job_type: str = labels.get("job_type") or ""
        job_id: str = metadata.get("name")

        status = data.object["status"]
        success = status.get("succeeded") == 1
        completion_time = status.get("completionTime")

        finalized = True

        finished = from_k8s_date(completion_time) if completion_time else dt_now()

        try:
            await self.background_job_ops.job_finished(
                job_id, job_type, UUID(oid), success=success, finished=finished
            )
            # print(
            #    f"{job_type} background job completed: success: {success}, {job_id}",
            #    flush=True,
            # )

        # pylint: disable=broad-except
        except Exception:
            print("Update Background Job Error", flush=True)
            traceback.print_exc()

        return {"attachments": [], "finalized": finalized}

    def run_task(self, func):
        """add bg tasks to set to avoid premature garbage collection"""
        task = asyncio.create_task(func)
        self.bg_tasks.add(task)
        task.add_done_callback(self.bg_tasks.discard)


# ============================================================================
def init_operator_api(app, *args):
    """regsiters webhook handlers for metacontroller"""

    oper = BtrixOperator(*args)

    @app.post("/op/crawls/sync")
    async def mc_sync_crawls(data: MCSyncData):
        return await oper.sync_crawls(data)

    # reuse sync path, but distinct endpoint for better logging
    @app.post("/op/crawls/finalize")
    async def mc_sync_finalize(data: MCSyncData):
        return await oper.sync_crawls(data)

    @app.post("/op/crawls/customize")
    async def mc_related(data: MCBaseRequest):
        return oper.get_related(data)

    @app.post("/op/profilebrowsers/sync")
    async def mc_sync_profile_browsers(data: MCSyncData):
        return await oper.sync_profile_browsers(data)

    @app.post("/op/cronjob/sync")
    async def mc_sync_cronjob_crawls(data: MCDecoratorSyncData):
        return await oper.sync_cronjob_crawl(data)

    @app.post("/op/cronjob/customize")
    async def mc_cronjob_related(data: MCBaseRequest):
        return oper.get_cronjob_crawl_related(data)

    # nop, but needed for metacontroller
    @app.post("/op/backgroundjob/sync")
    async def mc_sync_background_jobs():
        return {"attachments": []}

    @app.post("/op/backgroundjob/finalize")
    async def mc_finalize_background_jobs(data: MCDecoratorSyncData):
        return await oper.finalize_background_job(data)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}

    return oper
