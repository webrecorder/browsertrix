"""CrawlOperator"""

import traceback
import os
import math
from pprint import pprint
from typing import Optional, Any, Sequence, Literal
from datetime import datetime, timedelta
from uuid import UUID

import json

import humanize

from kubernetes.utils import parse_quantity
from redis import asyncio as exceptions

from fastapi import HTTPException

from btrixcloud.models import (
    TYPE_NON_RUNNING_STATES,
    TYPE_RUNNING_STATES,
    TYPE_ALL_CRAWL_STATES,
    TYPE_PAUSED_STATES,
    RUNNING_STATES,
    WAITING_STATES,
    RUNNING_AND_STARTING_ONLY,
    RUNNING_AND_WAITING_STATES,
    SUCCESSFUL_STATES,
    FAILED_STATES,
    PAUSED_STATES,
    CrawlStats,
    CrawlFile,
    CrawlCompleteIn,
    StorageRef,
    Organization,
)

from btrixcloud.utils import (
    str_to_date,
    date_to_str,
    dt_now,
    scale_from_browser_windows,
)

from .baseoperator import BaseOperator, Redis
from .models import (
    CrawlSpec,
    CrawlStatus,
    StopReason,
    MCBaseRequest,
    MCSyncData,
    PodInfo,
    POD,
    CMAP,
    PVC,
)


METRICS_API = "metrics.k8s.io/v1beta1"
METRICS = f"PodMetrics.{METRICS_API}"

DEFAULT_TTL = 30

REDIS_TTL = 60

# time in seconds before a crawl is deemed 'waiting' instead of 'starting'
STARTING_TIME_SECS = 150

# how often to update execution time seconds
EXEC_TIME_UPDATE_SECS = 60


# scale up if exceeded this threshold of mem usage (eg. 90%)
MEM_SCALE_UP_THRESHOLD = 0.90

# scale up by this much
MEM_SCALE_UP = 1.2

# soft OOM if exceeded this threshold of mem usage (eg. 100%)
MEM_SOFT_OOM_THRESHOLD = 1.0

# set memory limit to this much of request for extra padding
MEM_LIMIT_PADDING = 1.2


# pylint: disable=too-many-public-methods, too-many-locals, too-many-branches, too-many-statements
# pylint: disable=invalid-name, too-many-lines, too-many-return-statements
# pylint: disable=too-many-instance-attributes
# ============================================================================
class CrawlOperator(BaseOperator):
    """CrawlOperator Handler"""

    done_key: str
    pages_key: str
    errors_key: str
    behavior_logs_key: str

    fast_retry_secs: int
    log_failed_crawl_lines: int

    min_avail_storage_ratio: float

    paused_expires_delta: timedelta

    def __init__(self, *args):
        super().__init__(*args)

        self.done_key = "crawls-done"
        self.pages_key = "pages"
        self.errors_key = "e"
        self.behavior_logs_key = "b"

        self.fast_retry_secs = int(os.environ.get("FAST_RETRY_SECS") or 0)

        self.log_failed_crawl_lines = int(os.environ.get("LOG_FAILED_CRAWL_LINES") or 0)

        # ensure available storage is at least this much times used storage
        self.min_avail_storage_ratio = float(
            os.environ.get("CRAWLER_MIN_AVAIL_STORAGE_RATIO") or 0
        )

        # time in minutes before paused crawl is stopped - default is 7 days
        paused_crawl_limit_minutes = int(
            os.environ.get("PAUSED_CRAWL_LIMIT_MINUTES", "10080")
        )

        self.paused_expires_delta = timedelta(minutes=paused_crawl_limit_minutes)

    def init_routes(self, app):
        """init routes for this operator"""

        @app.post("/op/crawls/sync")
        async def mc_sync_crawls(data: MCSyncData):
            return await self.sync_crawls(data)

        # reuse sync path, but distinct endpoint for better logging
        @app.post("/op/crawls/finalize")
        async def mc_sync_finalize(data: MCSyncData):
            return await self.sync_crawls(data)

        @app.post("/op/crawls/customize")
        async def mc_related(data: MCBaseRequest):
            return self.get_related(data)

    async def sync_crawls(self, data: MCSyncData):
        """sync crawls"""

        status = CrawlStatus(**data.parent.get("status", {}))
        status.last_state = status.state

        spec: dict[str, str] = data.parent.get(
            "spec", {}
        )  # spec is the data from crawl_job.yaml
        crawl_id = spec["id"]
        cid = spec["cid"]
        oid = spec["oid"]

        redis_url = self.k8s.get_redis_url(crawl_id)

        params = {}
        params.update(self.k8s.shared_params)
        params["id"] = crawl_id
        params["cid"] = cid
        params["oid"] = oid
        params["userid"] = spec.get("userid", "")

        pods = data.children[POD]
        try:
            org = await self.org_ops.get_org_by_id(UUID(oid))
        except HTTPException as e:
            # org likely deleted, should delete this crawljob
            if e.detail == "invalid_org_id":
                return {
                    "status": status.dict(exclude_none=True),
                    "children": [],
                    "finalized": True,
                }
            raise

        crawl = CrawlSpec(
            id=crawl_id,
            cid=cid,
            oid=oid,
            org=org,
            storage=StorageRef(spec["storageName"]),
            crawler_channel=spec.get("crawlerChannel", "default"),
            proxy_id=spec.get("proxyId"),
            profileid=spec.get("profileId"),
            scale=spec.get("scale", 1),
            browser_windows=spec.get("browserWindows", 1),
            started=data.parent["metadata"]["creationTimestamp"],
            stopping=spec.get("stopping", False),
            paused_at=str_to_date(spec.get("pausedAt") or ""),
            timeout=spec.get("timeout") or 0,
            max_crawl_size=int(spec.get("maxCrawlSize") or 0),
            scheduled=spec.get("manual") != "1",
            qa_source_crawl_id=spec.get("qaSourceCrawlId"),
            is_single_page=spec.get("isSinglePage") == "1",
            seed_file_url=spec.get("seedFileUrl", ""),
        )

        # if finalizing, crawl is being deleted
        if data.finalizing:
            if not status.finished:
                # if can't cancel, already finished
                await self.cancel_crawl(crawl, status, data.children[POD])
                # instead of fetching the state (that was already set)
                # return exception to ignore this request, keep previous
                # finished state
                # raise HTTPException(status_code=400, detail="out_of_sync_status")

            return await self.finalize_response(
                crawl,
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
            self.run_task(self.k8s.delete_crawl_job(crawl.id))
            return await self.finalize_response(
                crawl,
                status,
                spec,
                data.children,
                params,
            )

        # shouldn't get here, crawl should already be finalizing when canceled
        # just in case, handle canceled-but-not-finalizing here
        if status.state == "canceled":
            await self.k8s.delete_crawl_job(crawl.id)
            return {"status": status.dict(exclude_none=True), "children": []}

        # first, check storage quota, and fail immediately if quota reached
        if status.state in (
            "starting",
            "skipped_storage_quota_reached",
            "skipped_time_quota_reached",
        ):
            # only check on very first run, before any pods/pvcs created
            # for now, allow if crawl has already started (pods/pvcs created)
            if not pods and not data.children[PVC]:
                if self.org_ops.storage_quota_reached(org):
                    await self.mark_finished(
                        crawl, status, "skipped_storage_quota_reached"
                    )
                    return self._empty_response(status)

                if self.org_ops.exec_mins_quota_reached(org):
                    await self.mark_finished(
                        crawl, status, "skipped_time_quota_reached"
                    )
                    return self._empty_response(status)

        if status.state in ("starting", "waiting_org_limit"):
            if not await self.can_start_new(crawl, status):
                return self._empty_response(status)

            await self.set_state(
                "starting", status, crawl, allowed_from=["waiting_org_limit"]
            )

        status.scale = len(pods)
        if status.scale:
            for pod_name, pod in pods.items():
                # don't count redis pod
                if pod_name.startswith("redis-"):
                    status.scale -= 1

                self.sync_resources(status, pod_name, pod, data.children)

            status = await self.sync_crawl_state(redis_url, crawl, status, pods, data)

            if self.k8s.enable_auto_resize:
                # auto sizing handled here
                await self.handle_auto_size(status.podStatus)

            if status.finished:
                return await self.finalize_response(
                    crawl,
                    status,
                    spec,
                    data.children,
                    params,
                )

            await self.increment_pod_exec_time(
                pods, crawl, status, EXEC_TIME_UPDATE_SECS
            )

        # stopping paused crawls
        if crawl.paused_at:
            stop_reason: Optional[StopReason] = None
            state: Optional[TYPE_NON_RUNNING_STATES] = None
            # Check if pause expiry limit is reached and if so, stop crawl
            if dt_now() >= (crawl.paused_at + self.paused_expires_delta):
                print(f"Paused crawl expiry reached, stopping crawl, id: {crawl.id}")
                stop_reason = "stopped_pause_expired"
                state = "stopped_pause_expired"

            # Check if paused crawl was stopped manually
            elif crawl.stopping:
                print(f"Paused crawl stopped by user, id: {crawl.id}")
                stop_reason = "stopped_by_user"
                state = "stopped_by_user"

            if stop_reason and state:
                status.stopping = True
                status.stopReason = stop_reason
                await self.mark_finished(crawl, status, state)

        children = self._load_redis(params, status, crawl, data.children)

        storage_path = crawl.storage.get_storage_extra_path(oid)
        storage_secret = crawl.storage.get_storage_secret_name(oid)

        if not crawl.is_qa:
            params["profile_filename"] = spec.get("profile_filename", "")
        else:
            storage_path += "qa/"

        params["storage_path"] = storage_path
        params["storage_secret"] = storage_secret

        status.crawlerImage = self.crawl_config_ops.get_channel_crawler_image(
            crawl.crawler_channel
        )

        params["crawler_image"] = status.crawlerImage
        pull_policy = self.crawl_config_ops.get_channel_crawler_image_pull_policy(
            crawl.crawler_channel
        )
        if pull_policy:
            params["crawler_image_pull_policy"] = pull_policy

        proxy = None
        if crawl.proxy_id and not crawl.is_qa:
            proxy = self.crawl_config_ops.get_crawler_proxy(crawl.proxy_id)
            if proxy:
                params["proxy_id"] = crawl.proxy_id
                params["proxy_url"] = proxy.url
                params["proxy_ssh_private_key"] = proxy.has_private_key
                params["proxy_ssh_host_public_key"] = proxy.has_host_public_key

        params["add_proxies"] = proxy or (
            not crawl.is_qa and data.related[CMAP].get("has-proxy-match-hosts")
        )

        params["storage_filename"] = spec["storage_filename"]
        params["restart_time"] = spec.get("restartTime")

        params["warc_prefix"] = spec.get("warcPrefix")

        params["redis_url"] = redis_url

        if spec.get("restartTime") != status.restartTime:
            # pylint: disable=invalid-name
            status.restartTime = spec.get("restartTime")
            status.resync_after = self.fast_retry_secs
            params["force_restart"] = True
        else:
            params["force_restart"] = False

        config_update_needed = (
            spec.get("lastConfigUpdate", "") != status.lastConfigUpdate
        )
        status.lastConfigUpdate = spec.get("lastConfigUpdate", "")

        children.extend(
            await self._load_crawl_configmap(
                crawl, data.children, params, config_update_needed
            )
        )

        if crawl.qa_source_crawl_id:
            params["qa_source_crawl_id"] = crawl.qa_source_crawl_id
            children.extend(await self._load_qa_configmap(params, data.children))
            num_browsers_per_pod = int(params["qa_browser_instances"])
            num_browser_windows = int(params.get("qa_num_browser_windows", 1))
        else:
            num_browsers_per_pod = int(params["crawler_browser_instances"])
            num_browser_windows = crawl.browser_windows

        # desired scale is the number of pods to create
        status.desiredScale = scale_from_browser_windows(
            num_browser_windows, num_browsers_per_pod
        )

        if status.pagesFound < status.desiredScale:
            status.desiredScale = max(1, status.pagesFound)

        is_paused = bool(crawl.paused_at) and status.state in PAUSED_STATES

        for i in range(0, status.desiredScale):
            if status.pagesFound < i * num_browsers_per_pod:
                break

            children.extend(
                self._load_crawler(
                    params,
                    i,
                    num_browser_windows,
                    status,
                    data.children,
                    is_paused,
                    crawl.profileid is not None,
                )
            )

        return {
            "status": status.dict(exclude_none=True),
            "children": children,
            "resyncAfterSeconds": status.resync_after,
        }

    def _load_redis(self, params, status: CrawlStatus, crawl: CrawlSpec, children):
        name = f"redis-{params['id']}"
        has_pod = name in children[POD]

        pod_info = status.podStatus[name]
        params["name"] = name
        params["cpu"] = pod_info.newCpu or params.get("redis_cpu")
        params["memory"] = pod_info.newMemory or params.get("redis_memory")
        params["no_pvc"] = crawl.is_single_page

        restart_reason = None
        if has_pod:
            restart_reason = pod_info.should_restart_pod()
            if restart_reason:
                print(f"Restarting {name}, reason: {restart_reason}")

        params["init_redis"] = status.initRedis and not restart_reason

        return self.load_from_yaml("redis.yaml", params)

    def _filter_autoclick_behavior(
        self, behaviors: Optional[str], crawler_image: str
    ) -> Optional[str]:
        """Remove autoclick behavior if crawler version doesn't support it"""
        min_autoclick_crawler_image = os.environ.get("MIN_AUTOCLICK_CRAWLER_IMAGE")

        if (
            min_autoclick_crawler_image
            and behaviors
            and "autoclick" in behaviors
            and crawler_image
            and crawler_image < min_autoclick_crawler_image
        ):
            print(
                "Crawler version < min_autoclick_crawler_image, removing autoclick behavior",
                flush=True,
            )
            behaviors_list = behaviors.split(",")
            filtered_behaviors = [
                behavior for behavior in behaviors_list if behavior != "autoclick"
            ]
            return ",".join(filtered_behaviors)

        return behaviors

    async def _load_crawl_configmap(
        self, crawl: CrawlSpec, children, params, config_update_needed: bool
    ):
        name = f"crawl-config-{crawl.id}"

        configmap = children[CMAP].get(name)
        if configmap and not config_update_needed:
            metadata = configmap["metadata"]
            configmap["metadata"] = {
                "name": metadata["name"],
                "namespace": metadata["namespace"],
                "labels": metadata["labels"],
            }
            return [configmap]

        params["name"] = name

        crawlconfig = await self.crawl_config_ops.get_crawl_config(crawl.cid, crawl.oid)

        self.crawl_config_ops.ensure_quota_page_limit(crawlconfig, crawl.org)

        raw_config = crawlconfig.get_raw_config()
        raw_config["behaviors"] = self._filter_autoclick_behavior(
            raw_config["behaviors"], params["crawler_image"]
        )

        if crawl.seed_file_url:
            raw_config["seedFile"] = crawl.seed_file_url
        raw_config.pop("seedFileId", None)

        params["config"] = json.dumps(raw_config)

        if config_update_needed:
            print(f"Updating config for {crawl.id}")

        return self.load_from_yaml("crawl_configmap.yaml", params)

    async def _load_qa_configmap(self, params, children):
        qa_source_crawl_id = params["qa_source_crawl_id"]
        name = f"qa-replay-{qa_source_crawl_id}"

        configmap = children[CMAP].get(name)
        if configmap and not self._qa_configmap_update_needed(name, configmap):
            metadata = configmap["metadata"]
            configmap["metadata"] = {
                "name": metadata["name"],
                "namespace": metadata["namespace"],
                "labels": metadata["labels"],
            }
            return [configmap]

        crawl_replay = await self.crawl_ops.get_internal_crawl_out(qa_source_crawl_id)

        params["name"] = name
        params["qa_source_replay_json"] = crawl_replay.json(include={"resources"})
        return self.load_from_yaml("qa_configmap.yaml", params)

    # pylint: disable=too-many-arguments
    def _load_crawler(
        self,
        params,
        i: int,
        total_browser_windows: int,
        status: CrawlStatus,
        children,
        is_paused: bool,
        has_profile: bool,
    ):
        name = f"crawl-{params['id']}-{i}"
        has_pod = name in children[POD]
        total_pods = status.desiredScale

        if params.get("qa_source_crawl_id"):
            cpu_field = "qa_cpu"
            mem_field = "qa_memory"
            worker_field = "qa_workers"
            pri_class = f"qa-crawl-pri-{i}"
        else:
            cpu_field = "crawler_cpu"
            mem_field = "crawler_memory"
            worker_field = "crawler_workers"
            pri_class = f"crawl-pri-{i}"

        browsers_per_pod = params.get(worker_field) or 1

        # if last pod, compute remaining browsers, or full amount if 0
        if i == total_pods - 1:
            workers = (total_browser_windows % browsers_per_pod) or browsers_per_pod
        else:
            workers = browsers_per_pod

        # scale resources if < full browsers_per_pod
        if workers < browsers_per_pod:
            memory, cpu = self.k8s.compute_for_num_browsers(workers)
        else:
            cpu = params.get(cpu_field)
            memory = params.get(mem_field)

        pod_info = status.podStatus[name]

        # compute if number of browsers for this pod has changed
        workers_changed = pod_info.lastWorkers != workers
        if workers_changed:
            print(f"Workers changed for {i}: {pod_info.lastWorkers} -> {workers}")

        pod_info.lastWorkers = workers

        params["name"] = name
        params["priorityClassName"] = pri_class
        params["cpu"] = pod_info.newCpu or cpu
        params["memory"] = pod_info.newMemory or memory
        params["workers"] = workers
        params["save_profile"] = has_profile and (i == 0)
        if self.k8s.enable_auto_resize:
            params["memory_limit"] = float(params["memory"]) * MEM_LIMIT_PADDING
        else:
            params["memory_limit"] = self.k8s.max_crawler_memory_size
        params["storage"] = pod_info.newStorage or params.get("crawler_storage")

        params["init_crawler"] = not is_paused
        if has_pod and not is_paused:
            restart_reason = pod_info.should_restart_pod(params.get("force_restart"))
            if not restart_reason and workers_changed:
                restart_reason = "pod_resized"

            if restart_reason:
                print(f"Restarting {name}, reason: {restart_reason}")
                params["init_crawler"] = False

        return self.load_from_yaml("crawler.yaml", params)

    def _qa_configmap_update_needed(self, name, configmap):
        try:
            now = dt_now()
            resources = json.loads(configmap["data"]["qa-config.json"])["resources"]
            for resource in resources:
                expire_at = str_to_date(resource["expireAt"])
                if expire_at and expire_at <= now:
                    print(f"Refreshing QA configmap for QA run: {name}")
                    return True

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)

        return False

    async def _resolve_scale_down(
        self,
        crawl: CrawlSpec,
        redis: Redis,
        status: CrawlStatus,
        pods: dict[str, dict],
    ) -> None:
        """Resolve scale down
        Limit desired scale to number of pages
        If desired_scale >= actual scale, just return
        If desired scale < actual scale, attempt to shut down each crawl instance
        via redis setting. If contiguous instances shutdown (successful exit), lower
        scale and clean up previous scale state.
        """
        desired_scale = status.desiredScale
        actual_scale = status.scale

        # if not scaling down, just return
        if desired_scale >= actual_scale:
            return

        crawl_id = crawl.id

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

    def sync_resources(self, status, name, pod, children):
        """set crawljob status from current resources"""
        resources = status.podStatus[name].allocated

        src = pod["spec"]["containers"][0]["resources"]["requests"]
        resources.memory = int(parse_quantity(src.get("memory")))
        resources.cpu = float(parse_quantity(src.get("cpu")))

        pvc = children[PVC].get(name)
        if pvc:
            try:
                src = pvc["status"]["capacity"]
                resources.storage = int(parse_quantity(src.get("storage")))
            # pylint: disable=bare-except
            except:
                pass

    async def set_state(
        self,
        state: TYPE_ALL_CRAWL_STATES,
        status: CrawlStatus,
        crawl: CrawlSpec,
        allowed_from: Sequence[TYPE_ALL_CRAWL_STATES],
        finished: Optional[datetime] = None,
        stats: Optional[CrawlStats] = None,
    ):
        """set status state and update db, if changed
        if allowed_from passed in, can only transition from allowed_from state,
        otherwise get current state from db and return
        the following state transitions are supported:

        from starting to org concurrent crawl limit and back:
         - starting -> waiting_org_limit -> starting

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
                crawl.db_crawl_id,
                crawl.is_qa,
                state=state,
                allowed_from=allowed_from,
                finished=finished,
                stats=stats,
            )
            if res and status.state != state:
                print(f"Setting state: {status.state} -> {state}, {crawl.id}")
                status.state = state
                return True

            # get actual crawl state
            actual_state, finished = await self.crawl_ops.get_crawl_state(
                crawl.db_crawl_id, crawl.is_qa
            )
            if actual_state:
                status.state = actual_state
            if finished:
                status.finished = date_to_str(finished)

            if actual_state != state:
                print(
                    f"State mismatch, actual state {actual_state}, requested {state}, {crawl.id}"
                )
                if not actual_state and state == "canceled":
                    return True

        if status.state != state:
            print(
                f"Not setting state: {status.state} -> {state}, not allowed, {crawl.id}"
            )
        return False

    def get_related(self, data: MCBaseRequest):
        """return objects related to crawl pods"""
        related_resources = [
            {
                "apiVersion": "v1",
                "resource": "configmaps",
                "labelSelector": {"matchLabels": {"role": "has-proxy-match-hosts"}},
            }
        ]

        if self.k8s.enable_auto_resize:
            spec = data.parent.get("spec", {})
            crawl_id = spec["id"]
            related_resources.append(
                {
                    "apiVersion": METRICS_API,
                    "resource": "pods",
                    "labelSelector": {"matchLabels": {"crawl": crawl_id}},
                }
            )

        return {"relatedResources": related_resources}

    async def can_start_new(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
    ):
        """return true if crawl can start, otherwise set crawl to 'queued' state
        until more crawls for org finish"""
        max_crawls = crawl.org.quotas.maxConcurrentCrawls or 0
        if not max_crawls:
            return True

        next_active_crawls = await self.crawl_ops.get_active_crawls(
            crawl.oid, max_crawls
        )

        # if total crawls < concurrent, always allow, no need to check further
        if len(next_active_crawls) < max_crawls:
            return True

        # allow crawl if within first list of active crawls
        if crawl.id in next_active_crawls:
            return True

        await self.set_state(
            "waiting_org_limit", status, crawl, allowed_from=["starting"]
        )
        return False

    async def cancel_crawl(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict,
    ) -> bool:
        """Mark crawl as canceled"""
        if not await self.mark_finished(crawl, status, "canceled"):
            return False

        await self.mark_for_cancelation(crawl.id)

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
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict,
        stats: CrawlStats,
        redis: Redis,
    ) -> bool:
        """Mark crawl as failed, log crawl state and print crawl logs, if possible"""
        prev_state = status.state

        failed_state: Literal["failed", "failed_not_logged_in"] = "failed"

        fail_reason = await redis.get(f"{crawl.id}:failReason")

        if fail_reason == "not_logged_in":
            failed_state = "failed_not_logged_in"

        if not await self.mark_finished(crawl, status, failed_state, stats=stats):
            return False

        if not self.log_failed_crawl_lines or prev_state in (
            "failed",
            "failed_not_logged_in",
        ):
            return True

        pod_names = list(pods.keys())

        for name in pod_names:
            print(f"============== POD STATUS: {name} ==============")
            pprint(pods[name]["status"])

        self.run_task(self.k8s.print_pod_logs(pod_names, self.log_failed_crawl_lines))

        return True

    def _empty_response(self, status):
        """done response for removing crawl"""
        return {
            "status": status.dict(exclude_none=True),
            "children": [],
        }

    async def finalize_response(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        spec: dict,
        children: dict,
        params: dict,
    ):
        """ensure crawl id ready for deletion"""

        redis_pod = f"redis-{crawl.id}"
        new_children = []

        finalized = False

        pods = children[POD]

        if redis_pod in pods:
            # if has other pods, keep redis pod until they are removed
            if len(pods) > 1:
                new_children = self._load_redis(params, status, crawl, children)
                await self.increment_pod_exec_time(pods, crawl, status)

        # keep pvs until pods are removed
        if new_children:
            new_children.extend(list(children[PVC].values()))

        if not children[POD] and not children[PVC]:
            # keep parent until ttl expired, if any
            if status.finished:
                ttl = spec.get("ttlSecondsAfterFinished", DEFAULT_TTL)
                finished = str_to_date(status.finished)
                if finished and (dt_now() - finished).total_seconds() > ttl >= 0:
                    print("CrawlJob expired, deleting: " + crawl.id)
                    finalized = True
            else:
                finalized = True

        if finalized and crawl.is_qa:
            self.run_task(self.crawl_ops.qa_run_finished(crawl.db_crawl_id))

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "finalized": finalized,
        }

    async def _get_redis(self, redis_url: str) -> Optional[Redis]:
        """init redis, ensure connectivity"""
        redis = None
        try:
            redis = await self.k8s.get_redis_client(redis_url)
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
        data: MCSyncData,
    ):
        """sync crawl state for running crawl"""
        # check if at least one crawler pod started running
        crawler_running, redis_running, pod_done_count = self.sync_pod_status(
            pods, status
        )
        redis = None

        metrics = data.related.get(METRICS, {})

        try:
            if redis_running:
                redis = await self._get_redis(redis_url)

            await self.add_used_stats(crawl.id, status.podStatus, redis, metrics)

            # skip if no newly exited pods
            if status.anyCrawlPodNewExit:
                await self.log_crashes(crawl.id, status.podStatus, redis)

            if not crawler_running or not redis:
                # if either crawler is not running or redis is inaccessible
                if not pod_done_count and self.should_mark_waiting(
                    status.state, crawl.started
                ):
                    # mark as waiting (if already running)
                    await self.set_state(
                        "waiting_capacity",
                        status,
                        crawl,
                        allowed_from=RUNNING_AND_STARTING_ONLY,
                    )

                if not crawler_running and redis:
                    # if crawler is not running for REDIS_TTL seconds, also stop redis
                    # but not right away in case crawler pod is just restarting.
                    # avoids keeping redis pods around while no crawler pods are up
                    # (eg. due to resource constraints)
                    last_active_time = str_to_date(status.lastActiveTime)
                    if last_active_time and (
                        (dt_now() - last_active_time).total_seconds() > REDIS_TTL
                    ):
                        print(
                            f"Pausing redis, no running crawler pods for >{REDIS_TTL} secs"
                        )
                        status.initRedis = False

                elif crawler_running and not redis:
                    # if crawler is running, but no redis, init redis
                    status.initRedis = True

                # if no crawler / no redis, resync after N seconds
                status.resync_after = self.fast_retry_secs
                return status

            # update lastActiveTime if crawler is running
            if crawler_running:
                status.lastActiveTime = date_to_str(dt_now())

            file_done = await redis.rpop(self.done_key)
            while file_done:
                msg = json.loads(file_done)
                # add completed file
                if msg.get("filename"):
                    await self.add_file_to_crawl(msg, crawl, redis)
                    await redis.incr("filesAdded")

                # get next file done
                file_done = await redis.rpop(self.done_key)

            page_crawled = await redis.rpop(f"{crawl.id}:{self.pages_key}")
            qa_run_id = crawl.id if crawl.is_qa else None

            while page_crawled:
                page_dict = json.loads(page_crawled)
                await self.page_ops.add_page_to_db(
                    page_dict, crawl.db_crawl_id, qa_run_id, crawl.oid
                )
                page_crawled = await redis.rpop(f"{crawl.id}:{self.pages_key}")

            crawl_error = await redis.rpop(f"{crawl.id}:{self.errors_key}")
            while crawl_error:
                await self.crawl_log_ops.add_log_line(
                    crawl.db_crawl_id,
                    crawl.oid,
                    log_line=crawl_error,
                    qa_run_id=qa_run_id,
                )
                crawl_error = await redis.rpop(f"{crawl.id}:{self.errors_key}")

            behavior_log = await redis.rpop(f"{crawl.id}:{self.behavior_logs_key}")
            while behavior_log:
                await self.crawl_log_ops.add_log_line(
                    crawl.db_crawl_id,
                    crawl.oid,
                    log_line=behavior_log,
                    qa_run_id=qa_run_id,
                )
                behavior_log = await redis.rpop(f"{crawl.id}:{self.behavior_logs_key}")

            # ensure filesAdded and filesAddedSize always set
            status.filesAdded = int(await redis.get("filesAdded") or 0)
            status.filesAddedSize = int(await redis.get("filesAddedSize") or 0)

            # update stats and get status
            return await self.update_crawl_state(
                redis, crawl, status, pods, pod_done_count
            )

        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            print(f"Crawl get failed: {exc}, will try again")
            return status

        finally:
            if redis:
                await redis.close()

    def sync_pod_status(
        self, pods: dict[str, dict], status: CrawlStatus
    ) -> tuple[bool, bool, int]:
        """check status of pods"""
        crawler_running = False
        redis_running = False
        pod_done_count = 0

        try:
            for name, pod in pods.items():
                running = False
                evicted = False

                pstatus = pod["status"]
                phase = pstatus["phase"]
                role = pod["metadata"]["labels"]["role"]

                if phase in ("Running", "Succeeded"):
                    running = True
                elif phase == "Failed" and pstatus.get("reason") == "Evicted":
                    evicted = True

                status.podStatus[name].evicted = evicted

                if "containerStatuses" in pstatus:
                    cstatus = pstatus["containerStatuses"][0]

                    self.handle_terminated_pod(
                        name, role, status, cstatus["state"].get("terminated")
                    )

                if role == "crawler":
                    crawler_running = crawler_running or running
                    if phase == "Succeeded":
                        pod_done_count += 1
                elif role == "redis":
                    redis_running = redis_running or running

        # pylint: disable=broad-except
        except Exception as exc:
            print(exc)

        return crawler_running, redis_running, pod_done_count

    def handle_terminated_pod(
        self, name, role, status: CrawlStatus, terminated: Optional[dict[str, Any]]
    ) -> None:
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
        crawl: CrawlSpec,
        status: CrawlStatus,
        min_duration=0,
    ) -> None:
        """inc exec time tracking"""
        now = dt_now()

        # don't count time crawl is not running
        if status.state in WAITING_STATES:
            # reset lastUpdatedTime if at least 2 consecutive updates of non-running state
            if status.last_state in WAITING_STATES:
                status.lastUpdatedTime = date_to_str(now)
            return

        update_start_time = await self.crawl_ops.get_crawl_exec_last_update_time(
            crawl.db_crawl_id, crawl.is_qa
        )

        if not update_start_time:
            print("Crawl first started, webhooks called", now, crawl.id)
            # call initial running webhook
            if not crawl.qa_source_crawl_id:
                self.run_task(
                    self.event_webhook_ops.create_crawl_started_notification(
                        crawl.id, crawl.oid, scheduled=crawl.scheduled
                    )
                )
            else:
                self.run_task(
                    self.event_webhook_ops.create_qa_analysis_started_notification(
                        crawl.id, crawl.oid, crawl.qa_source_crawl_id
                    )
                )

            await self.crawl_ops.inc_crawl_exec_time(
                crawl.db_crawl_id, crawl.is_qa, 0, now
            )
            status.lastUpdatedTime = date_to_str(now)
            return

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
                start_time = str_to_date(state.get("startedAt"))
                if update_start_time and start_time and update_start_time > start_time:
                    start_time = update_start_time

                end_time = now
            elif "terminated" in cstate:
                pod_state = "terminated"
                state = cstate["terminated"]
                start_time = str_to_date(state.get("startedAt"))
                end_time = str_to_date(state.get("finishedAt"))
                if update_start_time and start_time and update_start_time > start_time:
                    start_time = update_start_time

                # already counted
                if update_start_time and end_time and end_time < update_start_time:
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
            await self.org_ops.inc_org_time_stats(
                crawl.oid, exec_time, True, crawl.is_qa
            )
            status.crawlExecTime += exec_time
            status.elapsedCrawlTime += max_duration

        print(
            f"  Exec Time Total: {status.crawlExecTime}, Incremented By: {exec_time}",
            flush=True,
        )

        await self.crawl_ops.inc_crawl_exec_time(
            crawl.db_crawl_id, crawl.is_qa, exec_time, now
        )
        status.lastUpdatedTime = date_to_str(now)

    def should_mark_waiting(self, state: TYPE_ALL_CRAWL_STATES, started: str) -> bool:
        """Should the crawl be marked as waiting for capacity?"""
        if state in RUNNING_STATES:
            return True

        if state == "starting":
            started_dt = str_to_date(started)
            if started_dt:
                return (dt_now() - started_dt).total_seconds() > STARTING_TIME_SECS

        return False

    async def add_used_stats(
        self, crawl_id, pod_status: dict[str, PodInfo], redis, metrics
    ):
        """load current usage stats"""
        if redis:
            stats = await redis.info("persistence")
            storage = int(stats.get("aof_current_size", 0)) + int(
                stats.get("current_cow_size", 0)
            )
            pod_info = pod_status[f"redis-{crawl_id}"]
            pod_info.used.storage = storage

            # if no pod metrics, get memory estimate from redis itself
            if not self.k8s.enable_auto_resize:
                stats = await redis.info("memory")
                pod_info.used.memory = int(stats.get("used_memory_rss", 0))

                # stats = await redis.info("cpu")
                # pod_info.used.cpu = float(stats.get("used_cpu_sys", 0))

        for name, metric in metrics.items():
            usage = metric["containers"][0]["usage"]
            pod_info = pod_status[name]
            pod_info.used.memory = int(parse_quantity(usage["memory"]))
            pod_info.used.cpu = float(parse_quantity(usage["cpu"]))

    async def handle_auto_size(self, pod_status: dict[str, PodInfo]) -> None:
        """auto scale pods here, experimental"""
        for name, pod in pod_status.items():
            mem_usage = pod.get_percent_memory()
            new_memory = int(float(pod.allocated.memory) * MEM_SCALE_UP)
            send_sig = False

            # if pod is using >MEM_SCALE_UP_THRESHOLD of its memory, increase mem
            if mem_usage > MEM_SCALE_UP_THRESHOLD:
                if new_memory > self.k8s.max_crawler_memory_size:
                    print(
                        f"Mem {mem_usage}: Not resizing pod {name}: "
                        + f"mem {new_memory} > max allowed {self.k8s.max_crawler_memory_size}"
                    )
                    return

                pod.newMemory = new_memory
                print(
                    f"Mem {mem_usage}: Resizing pod {name} -> mem {pod.newMemory} - Scale Up"
                )

                # if crawler pod is using its OOM threshold, attempt a soft OOM
                # via a second SIGTERM
                if (
                    mem_usage >= MEM_SOFT_OOM_THRESHOLD
                    and name.startswith("crawl")
                    and pod.signalAtMem != pod.newMemory
                ):
                    send_sig = True

            # if any pod crashed due to OOM, increase mem
            elif pod.isNewExit and pod.reason == "oom":
                pod.newMemory = new_memory
                print(
                    f"Mem {mem_usage}: Resizing pod {name} -> mem {pod.newMemory} - OOM Detected"
                )
                send_sig = True

            # avoid resending SIGTERM multiple times after it already succeeded
            if send_sig and await self.k8s.send_signal_to_pod(name, "SIGTERM"):
                pod.signalAtMem = pod.newMemory

    async def log_crashes(self, crawl_id, pod_status: dict[str, PodInfo], redis):
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
            "timestamp": date_to_str(dt_now()),
            "logLevel": "error",
            "context": "k8s",
            "message": message,
            "details": details,
        }
        return json.dumps(err)

    async def add_file_to_crawl(self, cc_data, crawl: CrawlSpec, redis):
        """Handle finished CrawlFile to db"""

        filecomplete = CrawlCompleteIn(**cc_data)

        filename = self.storage_ops.get_org_relative_path(
            crawl.org, crawl.storage, filecomplete.filename
        )

        crawl_file = CrawlFile(
            filename=filename,
            size=filecomplete.size,
            hash=filecomplete.hash,
            storage=crawl.storage,
        )

        await redis.incr("filesAddedSize", filecomplete.size)

        await self.crawl_ops.add_crawl_file(
            crawl.db_crawl_id, crawl.is_qa, crawl_file, filecomplete.size
        )

        await self.org_ops.inc_org_bytes_stored(crawl.oid, filecomplete.size, "crawl")

        # no replicas for QA for now
        if crawl.is_qa:
            return True

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
    ) -> Optional[StopReason]:
        """check if crawl is stopping and set reason"""
        # if user requested stop, then enter stopping phase
        if crawl.stopping:
            return "stopped_by_user"

        # check timeout if timeout time exceeds elapsed time
        if crawl.timeout:
            elapsed = status.elapsedCrawlTime
            last_updated_time = str_to_date(status.lastUpdatedTime)
            if last_updated_time:
                elapsed += int((dt_now() - last_updated_time).total_seconds())

            if elapsed > crawl.timeout:
                return "time-limit"

        # crawl size limit
        if crawl.max_crawl_size and status.size > crawl.max_crawl_size:
            return "size-limit"

        # pause crawl if current running crawl sizes reach storage quota
        org = crawl.org

        # pause crawl if org is set read-only
        if org.readOnly:
            await self.pause_crawl(crawl, org)
            return "paused_org_readonly"

        # pause crawl if storage quota is reached
        if org.quotas.storageQuota:
            # Make sure to account for already-uploaded WACZs from active crawls
            # that are or previously were paused, which are already accounted for
            # in the org storage stats
            active_crawls_total_size = await self.crawl_ops.get_active_crawls_size(
                crawl.oid
            )
            print(f"Active crawls total size: {active_crawls_total_size}", flush=True)
            already_uploaded_size = (
                await self.crawl_ops.get_active_crawls_uploaded_wacz_size(crawl.oid)
            )
            print(
                f"Active crawls already uploaded size: {already_uploaded_size}",
                flush=True,
            )
            active_crawls_not_uploaded_size = (
                active_crawls_total_size - already_uploaded_size
            )
            print(
                f"Active crawls not yet uploaded size: {active_crawls_not_uploaded_size}",
                flush=True,
            )
            if self.org_ops.storage_quota_reached(org, active_crawls_not_uploaded_size):
                await self.pause_crawl(crawl, org)
                return "paused_storage_quota_reached"

        # pause crawl if execution time quota is reached
        if self.org_ops.exec_mins_quota_reached(org):
            await self.pause_crawl(crawl, org)
            return "paused_time_quota_reached"

        if crawl.paused_at and status.stopReason not in PAUSED_STATES:
            return "paused"

        return None

    async def pause_crawl(self, crawl: CrawlSpec, org: Organization):
        """Pause crawl and update crawl spec"""
        paused_at = dt_now()
        await self.crawl_ops.pause_crawl(crawl.id, org, pause=True, paused_at=paused_at)
        crawl.paused_at = paused_at

    async def get_redis_crawl_stats(
        self, redis: Redis, crawl_id: str
    ) -> tuple[CrawlStats, dict[str, Any]]:
        """get page stats"""
        try:
            # crawler >0.9.0, done key is a value
            pages_done = int(await redis.get(f"{crawl_id}:d") or 0)
        except exceptions.ResponseError:
            # crawler <=0.9.0, done key is a list
            pages_done = await redis.llen(f"{crawl_id}:d")

        pages_found = await redis.scard(f"{crawl_id}:s")
        # account for extra seeds and subtract from seen list
        extra_seeds = await redis.llen(f"{crawl_id}:extraSeeds")
        if extra_seeds:
            pages_found -= extra_seeds

        sizes = await redis.hgetall(f"{crawl_id}:size")
        archive_size = sum(int(x) for x in sizes.values())

        profile_update = await redis.get(f"{crawl_id}:profileUploaded")

        stats = CrawlStats(
            found=pages_found,
            done=pages_done,
            size=archive_size,
            profile_update=profile_update,
        )
        return stats, sizes

    async def update_crawl_state(
        self,
        redis: Redis,
        crawl: CrawlSpec,
        status: CrawlStatus,
        pods: dict[str, dict],
        pod_done_count: int,
    ) -> CrawlStatus:
        """update crawl state and check if crawl is now done"""
        results = await redis.hgetall(f"{crawl.id}:status")
        stats, sizes = await self.get_redis_crawl_stats(redis, crawl.id)

        # need to add size of previously completed WACZ files as well!
        stats.size += status.filesAddedSize

        # update status
        status.pagesDone = stats.done
        status.pagesFound = stats.found
        status.size = stats.size
        status.sizeHuman = humanize.naturalsize(status.size)

        await self.crawl_ops.update_running_crawl_stats(
            crawl.db_crawl_id, crawl.is_qa, stats
        )

        for key, value in sizes.items():
            increase_storage = False
            value = int(value)
            if value > 0 and status.podStatus:
                pod_info = status.podStatus[key]
                pod_info.used.storage = value

                if (
                    status.state == "running"
                    and self.min_avail_storage_ratio
                    and pod_info.allocated.storage
                    and pod_info.used.storage * self.min_avail_storage_ratio
                    > pod_info.allocated.storage
                ):
                    increase_storage = True

            # out of storage
            if pod_info.isNewExit and pod_info.exitCode == 3:
                pod_info.used.storage = pod_info.allocated.storage
                increase_storage = True

            if increase_storage:
                new_storage = math.ceil(
                    pod_info.used.storage * self.min_avail_storage_ratio / 1_000_000_000
                )
                pod_info.newStorage = f"{new_storage}Gi"
                print(
                    f"Attempting to adjust storage to {pod_info.newStorage} for {key}"
                )

        # check if no longer paused, clear paused stopping state
        if status.stopReason in PAUSED_STATES and not crawl.paused_at:
            status.stopReason = None
            status.stopping = False
            # should have already been removed, just in case
            await redis.delete(f"{crawl.id}:paused")

        if not status.stopping:
            status.stopReason = await self.is_crawl_stopping(crawl, status)
            status.stopping = status.stopReason is not None

            # mark crawl as stopping
            if status.stopping:
                if status.stopReason in PAUSED_STATES:
                    await redis.set(f"{crawl.id}:paused", "1")
                    print(f"Crawl pausing: {status.stopReason}, id: {crawl.id}")
                else:
                    await redis.set(f"{crawl.id}:stopping", "1")
                    print(
                        f"Crawl gracefully stopping: {status.stopReason}, id: {crawl.id}"
                    )

        # resolve scale down, if needed
        await self._resolve_scale_down(crawl, redis, status, pods)

        # check if done / failed
        status_count: dict[str, int] = {}

        for i in range(status.scale):
            res = results.get(f"crawl-{crawl.id}-{i}")
            if res:
                status_count[res] = status_count.get(res, 0) + 1

        num_done = status_count.get("done", 0)
        num_failed = status_count.get("failed", 0)
        # all expected pods are either done or failed
        all_completed = (num_done + num_failed) >= status.scale

        # check paused
        if not all_completed and crawl.paused_at and status.stopReason in PAUSED_STATES:
            num_paused = status_count.get("interrupted", 0)
            if (num_paused + num_failed) >= status.scale:
                # now fully paused!
                # remove pausing key and set state to appropriate paused state
                paused_state: TYPE_PAUSED_STATES
                if status.stopReason == "paused_storage_quota_reached":
                    paused_state = "paused_storage_quota_reached"
                elif status.stopReason == "paused_time_quota_reached":
                    paused_state = "paused_time_quota_reached"
                elif status.stopReason == "paused_org_readoly":
                    paused_state = "paused_org_readonly"
                else:
                    paused_state = "paused"

                await redis.delete(f"{crawl.id}:paused")
                await self.set_state(
                    paused_state,
                    status,
                    crawl,
                    allowed_from=RUNNING_AND_WAITING_STATES,
                )

                # TODO: This is reached several times, so make it idempotent
                if paused_state != "paused":
                    await self.crawl_ops.notify_org_admins_of_auto_paused_crawl(
                        paused_reason=paused_state,
                        cid=crawl.cid,
                        org=crawl.org,
                    )

                return status

        # if at least one is done according to redis, consider crawl successful
        # ensure pod successfully exited as well
        # pylint: disable=chained-comparison
        if all_completed and num_done >= 1 and pod_done_count >= num_done:
            # check if one-page crawls actually succeeded
            # if only one page found, and no files, assume failed
            if status.pagesFound == 1 and not status.filesAdded:
                await self.fail_crawl(crawl, status, pods, stats, redis)
                return status

            state: TYPE_NON_RUNNING_STATES
            if status.stopReason == "stopped_by_user":
                state = "stopped_by_user"
            elif status.stopReason == "stopped_storage_quota_reached":
                state = "stopped_storage_quota_reached"
            elif status.stopReason == "stopped_time_quota_reached":
                state = "stopped_time_quota_reached"
            elif status.stopReason == "stopped_org_readonly":
                state = "stopped_org_readonly"
            else:
                state = "complete"

            await self.mark_finished(crawl, status, state, stats)

        # check if all crawlers failed -- no crawl data was generated
        elif all_completed and num_done == 0 and num_failed > 0:
            # if stopping, and no pages finished, mark as canceled
            if status.stopping and not status.pagesDone:
                await self.mark_finished(crawl, status, "canceled", stats)
            else:
                await self.fail_crawl(crawl, status, pods, stats, redis)

        # check for other statuses, default to "running"
        else:
            new_status: TYPE_RUNNING_STATES = "running"

            if status_count.get("generate-wacz"):
                new_status = "generate-wacz"
            elif status_count.get("uploading-wacz"):
                new_status = "uploading-wacz"
            elif status_count.get("pending-wait"):
                new_status = "pending-wait"

            await self.set_state(
                new_status, status, crawl, allowed_from=RUNNING_AND_WAITING_STATES
            )

        return status

    # pylint: disable=too-many-arguments
    async def mark_finished(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        state: TYPE_NON_RUNNING_STATES,
        stats: Optional[CrawlStats] = None,
    ) -> bool:
        """mark crawl as finished, set finished timestamp and final state"""

        finished = dt_now()

        allowed_from = RUNNING_AND_WAITING_STATES

        # if set_state returns false, already set to same status, return
        if not await self.set_state(
            state,
            status,
            crawl,
            allowed_from=allowed_from,
            finished=finished,
            stats=stats,
        ):
            print("already finished, ignoring mark_finished")
            if not status.finished:
                status.finished = date_to_str(finished)

            return False

        status.finished = date_to_str(finished)

        if state in SUCCESSFUL_STATES:
            await self.inc_crawl_complete_stats(crawl, finished)

        # Regular Crawl Finished
        if not crawl.is_qa:
            self.run_task(self.do_crawl_finished_tasks(crawl, status, state, stats))

        # QA Run Finished
        else:
            self.run_task(self.do_qa_run_finished_tasks(crawl, state))

        return True

    # pylint: disable=too-many-arguments
    async def do_crawl_finished_tasks(
        self,
        crawl: CrawlSpec,
        status: CrawlStatus,
        state: TYPE_NON_RUNNING_STATES,
        stats: Optional[CrawlStats],
    ) -> None:
        """Run tasks after crawl completes in asyncio.task coroutine."""
        await self.crawl_config_ops.stats_recompute_last(
            crawl.cid, status.filesAddedSize, 1
        )

        if state in SUCCESSFUL_STATES and crawl.oid:
            await self.page_ops.set_archived_item_page_counts(crawl.id)
            await self.org_ops.set_last_crawl_finished(crawl.oid)
            await self.coll_ops.add_successful_crawl_to_collections(
                crawl.id, crawl.cid, crawl.oid
            )

            if stats and stats.profile_update and crawl.profileid:
                await self.crawl_config_ops.profiles.update_profile_from_crawl_upload(
                    crawl.oid,
                    UUID(crawl.profileid),
                    crawl.cid,
                    crawl.id,
                    stats.profile_update,
                )

        if state in FAILED_STATES:
            deleted_file_size = await self.crawl_ops.delete_failed_crawl_files(
                crawl.id, crawl.oid
            )
            # Ensure we decrement org storage for any files that were already stored
            # (e.g. when crawl was paused)
            await self.org_ops.inc_org_bytes_stored(
                crawl.oid, -deleted_file_size, "crawl"
            )
            await self.page_ops.delete_crawl_pages(crawl.id, crawl.oid)

        await self.event_webhook_ops.create_crawl_finished_notification(
            crawl.id, crawl.oid, state
        )

        # finally, delete job
        await self.k8s.delete_crawl_job(crawl.id)

    # pylint: disable=too-many-arguments
    async def do_qa_run_finished_tasks(
        self,
        crawl: CrawlSpec,
        state: TYPE_NON_RUNNING_STATES,
    ) -> None:
        """Run tasks after qa run completes in asyncio.task coroutine."""

        if state in FAILED_STATES:
            await self.page_ops.delete_qa_run_from_pages(crawl.db_crawl_id, crawl.id)

        # finally, delete job
        await self.k8s.delete_crawl_job(crawl.id)

    async def inc_crawl_complete_stats(self, crawl: CrawlSpec, finished: datetime):
        """Increment Crawl Stats"""

        started = str_to_date(crawl.started)
        if not started:
            print("Missing crawl start time, unable to increment crawl stats")
            return

        duration = int((finished - started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        await self.org_ops.inc_org_time_stats(crawl.oid, duration, False, crawl.is_qa)

    async def mark_for_cancelation(self, crawl_id):
        """mark crawl as canceled in redis"""
        try:
            redis_url = self.k8s.get_redis_url(crawl_id)
            redis = await self._get_redis(redis_url)
            if not redis:
                return False

            await redis.set(f"{crawl_id}:canceled", "1")
            return True
        finally:
            if redis:
                await redis.close()
