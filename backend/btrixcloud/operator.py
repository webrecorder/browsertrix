""" btrixjob operator (working for metacontroller) """

import asyncio
import traceback
import math
import os
from pprint import pprint
from typing import Optional, DefaultDict

from collections import defaultdict

from datetime import datetime
import json
import uuid
from fastapi import HTTPException

import yaml
import humanize

from pydantic import BaseModel, Field

from kubernetes.utils import parse_quantity

from .utils import (
    from_k8s_date,
    to_k8s_date,
    from_timestamp_str,
    dt_now,
    get_redis_crawl_stats,
)
from .k8sapi import K8sAPI

from .basecrawls import (
    NON_RUNNING_STATES,
    RUNNING_STATES,
    RUNNING_AND_STARTING_ONLY,
    RUNNING_AND_STARTING_STATES,
    SUCCESSFUL_STATES,
)
from .models import CrawlFile, CrawlCompleteIn

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
    cid: uuid.UUID
    oid: uuid.UUID
    scale: int = 1
    storage_path: str
    storage_name: str
    started: str
    stopping: bool = False
    scheduled: bool = False
    expire_time: Optional[datetime] = None
    max_crawl_size: Optional[int] = None


# ============================================================================
class PodResourcePercentage(BaseModel):
    """Resource usage percentage ratios"""

    memory: Optional[float] = 0
    cpu: Optional[float] = 0
    storage: Optional[float] = 0


# ============================================================================
class PodResources(BaseModel):
    """Pod Resources"""

    memory: Optional[int] = 0
    cpu: Optional[float] = 0
    storage: Optional[int] = 0

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

    crashTime: Optional[str] = None
    isNewCrash: Optional[bool] = Field(default=None, exclude=True)
    reason: Optional[str] = None

    allocated: PodResources = PodResources()
    used: PodResources = PodResources()

    newCpu: Optional[int] = None
    newMemory: Optional[int] = None

    # newAllocated: PodResources = PodResources()
    # force_restart: Optional[bool] = Field(default=False, exclude=True)

    def dict(self, *a, **kw):
        res = super().dict(*a, **kw)
        percent = {
            "memory": self.get_percent_memory(),
            "cpu": self.get_percent_cpu(),
            "storage": self.get_percent_storage(),
        }
        res["percent"] = percent
        return res

    def get_percent_memory(self):
        """compute percent memory used"""
        return (
            float(self.used.memory) / float(self.allocated.memory)
            if self.allocated.memory
            else 0
        )

    def get_percent_cpu(self):
        """compute percent cpu used"""
        return (
            float(self.used.cpu) / float(self.allocated.cpu)
            if self.allocated.cpu
            else 0
        )

    def get_percent_storage(self):
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
    initRedis: bool = False
    lastActiveTime: str = ""
    podStatus: Optional[DefaultDict[str, PodInfo]] = defaultdict(
        lambda: PodInfo()  # pylint: disable=unnecessary-lambda
    )
    restartTime: Optional[str]

    # don't include in status, use by metacontroller
    resync_after: Optional[int] = None


# ============================================================================
# pylint: disable=too-many-statements, too-many-public-methods, too-many-branches
# pylint: disable=too-many-instance-attributes, too-many-locals, too-many-lines, too-many-arguments
class BtrixOperator(K8sAPI):
    """BtrixOperator Handler"""

    def __init__(
        self, crawl_config_ops, crawl_ops, org_ops, coll_ops, event_webhook_ops
    ):
        super().__init__()

        self.crawl_config_ops = crawl_config_ops
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.coll_ops = coll_ops
        self.event_webhook_ops = event_webhook_ops

        self.config_file = "/config/config.yaml"

        self.done_key = "crawls-done"

        self.fast_retry_secs = int(os.environ.get("FAST_RETRY_SECS") or 0)

        self.log_failed_crawl_lines = int(os.environ.get("LOG_FAILED_CRAWL_LINES") or 0)

        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

        self._has_pod_metrics = False
        self.compute_crawler_resources()

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
            asyncio.create_task(self.delete_profile_browser(browserid))
            return {"status": {}, "children": []}

        params = {}
        params.update(self.shared_params)
        params["id"] = browserid
        params["userid"] = spec.get("userid", "")

        params["storage_name"] = spec.get("storageName", "")
        params["storage_path"] = spec.get("storagePath", "")
        params["profile_filename"] = spec.get("profileFilename", "")
        params["url"] = spec.get("startUrl", "about:blank")
        params["vnc_password"] = spec.get("vncPassword")

        children = self.load_from_yaml("profilebrowser.yaml", params)

        return {"status": {}, "children": children}

    # pylint: disable=too-many-return-statements
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
                if not await self.mark_finished(
                    crawl_id, uuid.UUID(cid), uuid.UUID(oid), status, "canceled"
                ):
                    # instead of fetching the state (that was already set)
                    # return exception to ignore this request, keep previous
                    # finished state
                    raise HTTPException(status_code=400, detail="out_of_sync_status")

            return self.finalize_response(crawl_id, status, spec, data.children, params)

        # just in case, finished but not deleted, can only get here if
        # do_crawl_finished_tasks() doesn't reach the end or taking too long
        if status.finished:
            print(
                f"warn crawl {crawl_id} finished but not deleted, post-finish taking too long?"
            )
            asyncio.create_task(self.delete_crawl_job(crawl_id))
            return self.finalize_response(crawl_id, status, spec, data.children, params)

        try:
            configmap = data.related[CMAP][f"crawl-config-{cid}"]["data"]
        # pylint: disable=bare-except, broad-except
        except:
            # fail crawl if config somehow missing, shouldn't generally happen
            await self.fail_crawl(crawl_id, uuid.UUID(cid), status, pods)

            return self._empty_response(status)

        crawl = CrawlSpec(
            id=crawl_id,
            cid=cid,
            oid=oid,
            storage_name=configmap["STORAGE_NAME"],
            storage_path=configmap["STORE_PATH"],
            scale=spec.get("scale", 1),
            started=data.parent["metadata"]["creationTimestamp"],
            stopping=spec.get("stopping", False),
            expire_time=from_k8s_date(spec.get("expireTime")),
            max_crawl_size=int(spec.get("maxCrawlSize") or 0),
            scheduled=spec.get("manual") != "1",
        )

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
                redis_url, crawl, status, pods, data.related.get(METRICS, {})
            )

            # auto sizing handled here
            self.handle_auto_size(crawl.id, status.podStatus)

            if status.finished:
                return self.finalize_response(
                    crawl_id, status, spec, data.children, params
                )
        else:
            status.scale = crawl.scale

        children = self._load_redis(params, status, data.children)

        params["storage_name"] = configmap["STORAGE_NAME"]
        params["store_path"] = configmap["STORE_PATH"]
        params["store_filename"] = configmap["STORE_FILENAME"]
        params["profile_filename"] = configmap["PROFILE_FILENAME"]
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
            "status": status.dict(exclude_none=True, exclude={"resync_after": True}),
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

    async def set_crawler_end_time_in_redis(self, crawl_id, name, restart_time, redis):
        """set end time in redis for crashed crawler pod if necessary"""
        if not redis:
            print("redis not available to set crawler end time", flush=True)
            return

        # Determine if crawler pod already set new start time after restart
        expected_list_difference = 0
        latest_start_time_list = await redis.lrange(f"{crawl_id}:start:{name}", -1, -1)
        latest_start_time = latest_start_time_list[0]
        if latest_start_time > restart_time:
            print(f"Crawler {name} set new start time since last restart", flush=True)
            expected_list_difference = 1

        try:
            start_times_length = await redis.llen(f"{crawl_id}:start:{name}")
            print(
                f"Crawler {name} start times length: {start_times_length}", flush=True
            )
            end_times_length = await redis.llen(f"{crawl_id}:end:{name}")
            print(f"Crawler {name} end times length: {end_times_length}", flush=True)

            if (start_times_length - end_times_length) > expected_list_difference:
                # pylint: disable=line-too-long
                print(
                    f"Setting end time for crashed crawler pod {name} to last restart time",
                    flush=True,
                )
                await redis.rpush(f"{crawl_id}:end:{name}", restart_time)

        # pylint: disable=broad-except
        except Exception as err:
            print(
                f"Setting end time in redis for crashed crawler {name} failed: {err}",
                flush=True,
            )

    # pylint: disable=too-many-arguments
    async def _resolve_scale(self, crawl_id, desired_scale, redis, status, pods):
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

            if pod["status"].get("phase") == "Succeeded" and new_scale == i + 1:
                new_scale = i
                print(f"Scaled down pod index {i}, scale to {new_scale}")

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

        from running to complete or partial_complete:
         - running -> complete
         - running -> partial_complete

        from starting or running to waiting for capacity (pods pending) and back:
         - starting -> waiting_capacity
         - running -> waiting_capacity
         - waiting_capacity -> running

        from any state to canceled or failed:
         - not complete or partial_complete -> canceled
         - not complete or partial_complete -> failed
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
                "labelSelector": {"matchLabels": {"oid": oid}},
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

    async def fail_crawl(self, crawl_id, cid, status, pods, stats=None):
        """Mark crawl as failed, log crawl state and print crawl logs, if possible"""
        prev_state = status.state

        if not await self.mark_finished(
            crawl_id, cid, None, status, "failed", stats=stats
        ):
            return False

        if not self.log_failed_crawl_lines or prev_state == "failed":
            return True

        pod_names = list(pods.keys())

        for name in pod_names:
            print(f"============== POD STATUS: {name} ==============")
            pprint(pods[name]["status"])

        asyncio.create_task(self.print_pod_logs(pod_names, self.log_failed_crawl_lines))

        return True

    def _empty_response(self, status):
        """done response for removing crawl"""
        return {
            "status": status.dict(exclude_none=True, exclude={"resync_after": True}),
            "children": [],
        }

    def finalize_response(self, crawl_id, status, spec, children, params):
        """ensure crawl id ready for deletion"""

        redis_pod = f"redis-{crawl_id}"
        new_children = []
        finalized = False

        if redis_pod in children[POD]:
            # if has other pods, keep redis pod until they are removed
            if len(children[POD]) > 1:
                new_children = self._load_redis(params, status, children)

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
            "status": status.dict(exclude_none=True, exclude={"resync_after": True}),
            "children": new_children,
            "finalized": finalized,
        }

    async def _get_redis(self, redis_url):
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

    async def sync_crawl_state(self, redis_url, crawl, status, pods, metrics):
        """sync crawl state for running crawl"""
        # check if at least one crawler pod started running
        crawler_running, redis_running = self.sync_pod_status(pods, status)
        redis = None

        try:
            if redis_running:
                redis = await self._get_redis(redis_url)

            await self.add_used_stats(crawl.id, status.podStatus, redis, metrics)

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
                    asyncio.create_task(
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
            return await self.update_crawl_state(redis, crawl, status, pods)

        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            print(f"Crawl get failed: {exc}, will try again")
            return status

        finally:
            if redis:
                await redis.close()

    def sync_pod_status(self, pods, status):
        """check status of pods"""
        # pylint: disable=invalid-name
        crawler_running = False
        redis_running = False
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

                    terminated = cstatus["state"].get("terminated")
                    exit_code = terminated and terminated.get("exitCode")
                    if terminated and exit_code:
                        crash_time = terminated.get("finishedAt")
                        pod_status = status.podStatus[name]
                        pod_status.isNewCrash = pod_status.crashTime != crash_time
                        print(
                            f"pod {name} isNewCrash: {pod_status.isNewCrash}",
                            flush=True,
                        )
                        pod_status.crashTime = crash_time

                        # detect reason
                        if terminated.get("reason") == "OOMKilled" or exit_code == 137:
                            pod_status.reason = "oom"
                        else:
                            pod_status.reason = "interrupt: " + str(exit_code)

                if role == "crawler":
                    crawler_running = crawler_running or running
                elif role == "redis":
                    redis_running = redis_running or running

        # pylint: disable=broad-except
        except Exception as exc:
            print(exc)

        return crawler_running, redis_running

    def should_mark_waiting(self, state, started):
        """Should the crawl be marked as waiting for capacity?"""
        if state in RUNNING_STATES:
            return True

        if state == "starting":
            started = from_k8s_date(started)
            return (datetime.utcnow() - started).total_seconds() > STARTING_TIME_SECS

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
            # if pod.isNewCrash and pod.reason == "oom":
            #    pod.newMemory = int(float(pod.allocated.memory) * 1.2)
            #    print(f"Resizing pod {name} -> mem {pod.newMemory} - OOM Detected")

            # if redis is using >0.90 of its memory, increase mem
            if name.startswith("redis") and pod.get_percent_memory() > 0.90:
                pod.newMemory = int(float(pod.allocated.memory) * 1.2)
                print(f"Resizing pod {name} -> mem {pod.newMemory} - Redis Capacity")

    async def log_crashes(self, crawl_id, pod_status, redis):
        """report/log any pod crashes here"""
        for name, pod in pod_status.items():
            if not pod.isNewCrash:
                continue

            print(f"pod {name} that crashed:", flush=True)
            print(pod, flush=True)

            if not redis:
                print("no redis avialable", flush=True)

            log = self.get_log_line(
                "Crawler Instance Crashed", {"reason": pod.reason, "pod": name}
            )
            if not redis:
                print(log)
            else:
                await redis.lpush(f"{crawl_id}:e", log)

            await self.set_crawler_end_time_in_redis(
                crawl_id, name, pod.crashTime, redis
            )

    def get_log_line(self, message, details):
        """get crawler error line for logging"""
        err = {
            "timestamp": datetime.utcnow().isoformat(),
            "logLevel": "error",
            "context": "k8s",
            "message": message,
            "details": details,
        }
        return json.dumps(err)

    async def add_file_to_crawl(self, cc_data, crawl, redis):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        inx = None
        filename = None
        if crawl.storage_path:
            inx = filecomplete.filename.index(crawl.storage_path)
            filename = filecomplete.filename[inx:] if inx > 0 else filecomplete.filename

        def_storage_name = crawl.storage_name if inx else None

        crawl_file = CrawlFile(
            def_storage_name=def_storage_name,
            filename=filename or filecomplete.filename,
            size=filecomplete.size,
            hash=filecomplete.hash,
        )

        await redis.incr("filesAddedSize", filecomplete.size)

        await self.crawl_ops.add_crawl_file(crawl.id, crawl_file, filecomplete.size)

        return True

    def is_crawl_stopping(self, crawl, size):
        """return true if crawl should begin graceful stopping phase"""

        # if user requested stop, then enter stopping phase
        if crawl.stopping:
            print("Graceful Stop: User requested stop")
            return True

        # check crawl expiry
        if crawl.expire_time and datetime.utcnow() > crawl.expire_time:
            print(f"Graceful Stop: Job duration expired at {crawl.expire_time}")
            return True

        if crawl.max_crawl_size and size > crawl.max_crawl_size:
            print(f"Graceful Stop: Maximum crawl size {crawl.max_crawl_size} hit")
            return True

        return False

    async def update_crawl_state(self, redis, crawl, status, pods):
        """update crawl state and check if crawl is now done"""
        results = await redis.hgetall(f"{crawl.id}:status")
        stats, sizes = await get_redis_crawl_stats(redis, crawl.id)

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
            if value > 0:
                pod_info = status.podStatus[key]
                pod_info.used.storage = value

        status.stopping = self.is_crawl_stopping(crawl, status.size)

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
        status_count = {}
        for i in range(crawl.scale):
            res = results.get(f"crawl-{crawl.id}-{i}")
            if res:
                status_count[res] = status_count.get(res, 0) + 1

        # check if all crawlers are done
        if status_count.get("done", 0) >= crawl.scale:
            # check if one-page crawls actually succeeded
            # if only one page found, and no files, assume failed
            if status.pagesFound == 1 and not status.filesAdded:
                await self.fail_crawl(crawl.id, crawl.cid, status, pods, stats)
                return status

            completed = status.pagesDone and status.pagesDone >= status.pagesFound

            state = "complete" if completed else "partial_complete"

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
                await self.fail_crawl(crawl.id, crawl.cid, status, pods, stats)

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
        self, crawl_id, cid, oid, status, state, crawl=None, stats=None
    ):
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

        asyncio.create_task(
            self.do_crawl_finished_tasks(
                crawl_id, cid, oid, status.filesAddedSize, state, crawl
            )
        )

        return True

    # pylint: disable=too-many-arguments
    async def do_crawl_finished_tasks(
        self, crawl_id, cid, oid, files_added_size, state, crawl
    ):
        """Run tasks after crawl completes in asyncio.task coroutine."""
        await self.compute_execution_time(crawl_id, oid, crawl)

        await self.crawl_config_ops.stats_recompute_last(cid, files_added_size, 1)

        if state in SUCCESSFUL_STATES and oid:
            await self.org_ops.inc_org_bytes_stored(oid, files_added_size, "crawl")
            await self.coll_ops.add_successful_crawl_to_collections(crawl_id, cid)

        await self.event_webhook_ops.create_crawl_finished_notification(crawl_id, state)

        # add crawl errors to db
        await self.add_crawl_errors_to_db(crawl_id)

        # finally, delete job
        await self.delete_crawl_job(crawl_id)

    async def compute_execution_time(self, crawl_id, oid, crawl=None):
        """Compute execution time for crawl from start and end times in redis"""
        redis = None

        print("Computing execution time", flush=True)

        try:
            redis_url = self.get_redis_url(crawl_id)
            redis = await self._get_redis(redis_url)
            if not redis:
                return

            scale = 2
            if crawl:
                scale = crawl.scale

            execution_secs = 0

            for i in range(scale):
                name = f"crawl-{crawl_id}-{i}"

                start_times = await redis.lrange(f"{crawl_id}:start:{name}", 0, -1)
                end_times = await redis.lrange(f"{crawl_id}:end:{name}", 0, -1)

                print(f"Crawler {name} start times:", flush=True)
                print(start_times, flush=True)

                print(f"Crawler {name} end times:", flush=True)
                print(end_times, flush=True)

                for time_idx, start_time_str in enumerate(start_times):
                    start_time = from_timestamp_str(start_time_str)
                    try:
                        end_time = from_timestamp_str(end_times[time_idx])
                    except IndexError:
                        # pylint: disable=line-too-long
                        print(
                            f"Start time {start_time_str} has no corresponding end time, using current time",
                            flush=True,
                        )
                        end_time = datetime.now()

                    duration = end_time - start_time
                    seconds = duration.total_seconds()
                    print(f"Seconds used in {name}: {seconds}", flush=True)

                    # Round up to nearest int
                    execution_secs += math.ceil(seconds)

            print(
                f"Adding {executation_secs} total execution seconds to db", flush=True
            )
            await self.crawl_ops.add_execution_seconds(crawl_id, oid, execution_secs)

        # pylint: disable=broad-exception-caught
        except Exception as err:
            # likely redis has already bexen deleted, so nothing to do
            print(f"Error computing execution time: {err}", flush=True)
        finally:
            if redis:
                await redis.close()

    async def inc_crawl_complete_stats(self, crawl, finished):
        """Increment Crawl Stats"""

        started = from_k8s_date(crawl.started)

        duration = int((finished - started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        await self.org_ops.inc_org_stats(crawl.oid, duration)

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

        crawl_id, crawljob = self.new_crawl_job_yaml(
            cid,
            userid=userid,
            oid=oid,
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
                uuid.UUID(cid), uuid.UUID(oid)
            )
            if not crawlconfig:
                print(
                    f"warn: no crawlconfig {cid}. skipping scheduled job. old cronjob left over?"
                )
                return {"attachments": []}

            # db create
            await self.crawl_config_ops.add_new_crawl(
                crawl_id, crawlconfig, uuid.UUID(userid), manual=False
            )
            print("Scheduled Crawl Created: " + crawl_id)

        return {
            "attachments": attachments,
        }


# ============================================================================
def init_operator_api(
    app, crawl_config_ops, crawl_ops, org_ops, coll_ops, event_webhook_ops
):
    """regsiters webhook handlers for metacontroller"""

    oper = BtrixOperator(
        crawl_config_ops, crawl_ops, org_ops, coll_ops, event_webhook_ops
    )

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

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}

    return oper
