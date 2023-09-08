""" btrixjob operator (working for metacontroller) """

import asyncio
import traceback
import os
from typing import Optional

from datetime import datetime
import json
import uuid
from fastapi import HTTPException

import yaml
import humanize

from pydantic import BaseModel

from kubernetes.utils import parse_quantity

from .utils import (
    from_k8s_date,
    to_k8s_date,
    dt_now,
    get_redis_crawl_stats,
)
from .k8sapi import K8sAPI

from .orgs import inc_org_stats, get_max_concurrent_crawls
from .basecrawls import (
    NON_RUNNING_STATES,
    RUNNING_STATES,
    RUNNING_AND_STARTING_ONLY,
    RUNNING_AND_STARTING_STATES,
    SUCCESSFUL_STATES,
)
from .colls import add_successful_crawl_to_collections
from .crawlconfigs import stats_recompute_last
from .crawls import (
    add_crawl_file,
    update_crawl_state_if_allowed,
    get_crawl_state,
    add_crawl_errors,
)
from .models import CrawlFile, CrawlCompleteIn
from .orgs import add_crawl_files_to_org_bytes_stored


CMAP = "ConfigMap.v1"
PVC = "PersistentVolumeClaim.v1"
POD = "Pod.v1"
CJS = "CrawlJob.btrix.cloud/v1"
# METRICS = "PodMetrics.metrics.k8s.io/v1beta1"

DEFAULT_TTL = 30

REDIS_TTL = 60

# time in seconds before a crawl is deemed 'waiting' instead of 'starting'
STARTING_TIME_SECS = 60


# ============================================================================
class DeleteCrawlException(Exception):
    """throw to force deletion of crawl objects"""


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
    resources: Optional[dict] = {}
    restartTime: Optional[str]

    # don't include in status, use by metacontroller
    resync_after: Optional[int] = None


# ============================================================================
# pylint: disable=too-many-statements, too-many-public-methods, too-many-branches
# pylint: disable=too-many-instance-attributes,too-many-locals
class BtrixOperator(K8sAPI):
    """BtrixOperator Handler"""

    def __init__(self, mdb, event_webhook_ops):
        super().__init__()

        self.event_webhook_ops = event_webhook_ops

        self.config_file = "/config/config.yaml"

        self.collections = mdb["collections"]
        self.crawls = mdb["crawls"]
        self.crawl_configs = mdb["crawl_configs"]
        self.orgs = mdb["organizations"]

        self.done_key = "crawls-done"

        self.fast_retry_secs = int(os.environ.get("FAST_RETRY_SECS") or 0)

        self.log_failed_crawl_lines = int(os.environ.get("LOG_FAILED_CRAWL_LINES") or 0)

        with open(self.config_file, encoding="utf-8") as fh_config:
            self.shared_params = yaml.safe_load(fh_config)

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

        # if finalizing, crawl is being deleted
        if data.finalizing:
            if not status.finished:
                # if can't cancel, already finished
                if not await self.cancel_crawl(
                    redis_url, crawl_id, cid, status, "canceled"
                ):
                    # instead of fetching the state (that was already set)
                    # return exception to ignore this request, keep previous
                    # finished state
                    raise HTTPException(status_code=400, detail="out of sync status")

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
            await self.cancel_crawl(redis_url, crawl_id, cid, status, "failed")

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
            max_crawl_size=int(configmap.get("MAX_CRAWL_SIZE", "0")),
            scheduled=spec.get("manual") != "1",
        )

        if status.state in ("starting", "waiting_org_limit"):
            if not await self.can_start_new(crawl, data, status):
                return self._empty_response(status)

            await self.set_state(
                "starting", status, crawl.id, allowed_from=["waiting_org_limit"]
            )

        pods = data.children[POD]
        if len(pods):
            status = await self.sync_crawl_state(redis_url, crawl, status, pods)
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
        self.sync_resources(status.resources, "redis", name, children)
        params["name"] = name
        params["init_redis"] = status.initRedis
        return self.load_from_yaml("redis.yaml", params)

    def _load_crawler(self, params, i, status, children):
        name = f"crawl-{params['id']}-{i}"
        self.sync_resources(status.resources, str(i), name, children)
        params["name"] = name
        params["priorityClassName"] = f"crawl-instance-{i}"
        return self.load_from_yaml("crawler.yaml", params)

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

    def sync_resources(self, resources, id_, name, children):
        """set crawljob status from current resources"""
        if id_ not in resources:
            resources[id_] = {}

        pod = children[POD].get(name)
        if pod:
            src = pod["spec"]["containers"][0]["resources"]["requests"]
            resources[id_]["memory"] = src.get("memory")
            resources[id_]["cpu"] = src.get("cpu")

        pvc = children[PVC].get(name)
        if pvc:
            src = pvc["spec"]["resources"]["requests"]
            resources[id_]["storage"] = src.get("storage")

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
            res = await update_crawl_state_if_allowed(
                self.crawls, crawl_id, state=state, allowed_from=allowed_from, **kwargs
            )
            if res:
                print(f"Setting state: {status.state} -> {state}, {crawl_id}")
                status.state = state
                return True

            # get actual crawl state
            actual_state, finished = await get_crawl_state(self.crawls, crawl_id)
            if actual_state:
                status.state = actual_state
            if finished:
                status.finished = to_k8s_date(finished)

            if actual_state != state:
                print(f"state mismatch, actual state {actual_state}, requested {state}")

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
        """return configmap related to crawl"""
        spec = data.parent.get("spec", {})
        cid = spec["cid"]
        # crawl_id = spec["id"]
        oid = spec.get("oid")
        return {
            "relatedResources": [
                {
                    "apiVersion": "v1",
                    "resource": "configmaps",
                    "labelSelector": {"matchLabels": {"btrix.crawlconfig": cid}},
                },
                {
                    "apiVersion": "btrix.cloud/v1",
                    "resource": "crawljobs",
                    "labelSelector": {"matchLabels": {"oid": oid}},
                },
                # enable for podmetrics
                #    {
                #        "apiVersion": "metrics.k8s.io/v1beta1",
                #        "resource": "pods",
                #        "labelSelector": {"matchLabels": {"crawl": crawl_id}},
                #    },
            ]
        }

    async def can_start_new(self, crawl: CrawlSpec, data: MCSyncData, status):
        """return true if crawl can start, otherwise set crawl to 'queued' state
        until more crawls for org finish"""
        max_crawls = await get_max_concurrent_crawls(self.orgs, crawl.oid)
        if not max_crawls:
            return True

        if len(data.related[CJS]) <= max_crawls:
            return True

        name = data.parent.get("metadata").get("name")

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

    # pylint: disable=too-many-arguments
    async def cancel_crawl(self, redis_url, crawl_id, cid, status, state):
        """immediately cancel crawl with specified state
        return true if db mark_finished update succeeds"""
        redis = None
        try:
            redis = await self._get_redis(redis_url)
            return await self.mark_finished(crawl_id, uuid.UUID(cid), status, state)
        # pylint: disable=bare-except
        except:
            return False

        finally:
            if redis:
                await redis.close()

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
                    print("Job expired, deleting: " + crawl_id)
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

    async def sync_crawl_state(self, redis_url, crawl, status, pods):
        """sync crawl state for running crawl"""
        # check if at least one crawler pod started running
        if not self.check_if_crawler_running(pods):
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
                print(f"Pausing redis, no running crawler pods for >{REDIS_TTL} secs")
                status.initRedis = False

            # if still running, resync after N seconds
            status.resync_after = self.fast_retry_secs
            return status

        status.initRedis = True
        status.lastActiveTime = to_k8s_date(dt_now())

        redis = await self._get_redis(redis_url)
        if not redis:
            # if still running, resync after N seconds
            status.resync_after = self.fast_retry_secs
            return status

        try:
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
            await redis.close()

    def check_if_crawler_running(self, pods):
        """check if at least one crawler pod has started"""
        try:
            for pod in pods.values():
                if pod["metadata"]["labels"]["role"] != "crawler":
                    continue

                status = pod["status"]
                if status["phase"] in ("Running", "Succeeded"):
                    return True

                # consider 'ContainerCreating' as running
                if status["phase"] == "Pending":
                    if (
                        "containerStatuses" in status
                        and status["containerStatuses"][0]["state"]["waiting"]["reason"]
                        == "ContainerCreating"
                    ):
                        return True

                # print("non-running pod status", pod["status"], flush=True)

        # pylint: disable=bare-except
        except:
            # assume no valid pod found
            pass

        return False

    def should_mark_waiting(self, state, started):
        """Should the crawl be marked as waiting for capacity?"""
        if state in RUNNING_STATES:
            return True

        if state == "starting":
            started = from_k8s_date(started)
            return (datetime.utcnow() - started).total_seconds() > STARTING_TIME_SECS

        return False

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

        await add_crawl_file(self.crawls, crawl.id, crawl_file, filecomplete.size)

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
        stats = await get_redis_crawl_stats(redis, crawl.id)

        # update status
        status.pagesDone = stats["done"]
        status.pagesFound = stats["found"]
        status.size = stats["size"]
        status.sizeHuman = humanize.naturalsize(status.size)

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
                await self.mark_finished(crawl.id, crawl.cid, status, state="failed")
                return status

            completed = status.pagesDone and status.pagesDone >= status.pagesFound

            state = "complete" if completed else "partial_complete"

            await self.mark_finished(crawl.id, crawl.cid, status, state, crawl, stats)

        # check if all crawlers failed
        elif status_count.get("failed", 0) >= crawl.scale:
            prev_state = None

            # if stopping, and no pages finished, mark as canceled
            if status.stopping and not status.pagesDone:
                state = "canceled"
            else:
                state = "failed"
                prev_state = status.state

            await self.mark_finished(crawl.id, crawl.cid, status, state=state)

            if (
                self.log_failed_crawl_lines
                and state == "failed"
                and prev_state != "failed"
            ):
                pod_names = list(pods.keys())
                print("crawl failed: ", pod_names, stats)
                asyncio.create_task(
                    self.print_pod_logs(
                        pod_names, "crawler", self.log_failed_crawl_lines
                    )
                )

        # check for other statuses
        else:
            new_status = None
            if status_count.get("uploading-wacz"):
                new_status = "uploading-wacz"
            elif status_count.get("generate-wacz"):
                new_status = "generate-wacz"
            elif status_count.get("pending-wait"):
                new_status = "pending-wait"
            if new_status:
                await self.set_state(
                    new_status, status, crawl.id, allowed_from=RUNNING_STATES
                )

        return status

    # pylint: disable=too-many-arguments
    async def mark_finished(self, crawl_id, cid, status, state, crawl=None, stats=None):
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
            self.do_crawl_finished_tasks(crawl_id, cid, status.filesAddedSize, state)
        )

        return True

    # pylint: disable=too-many-arguments
    async def do_crawl_finished_tasks(self, crawl_id, cid, files_added_size, state):
        """Run tasks after crawl completes in asyncio.task coroutine."""
        await stats_recompute_last(
            self.crawl_configs, self.crawls, cid, files_added_size, 1
        )

        await add_crawl_files_to_org_bytes_stored(
            self.crawls, self.orgs, crawl_id, files_added_size
        )

        if state in SUCCESSFUL_STATES:
            await add_successful_crawl_to_collections(
                self.crawls, self.crawl_configs, self.collections, crawl_id, cid
            )

        await self.event_webhook_ops.create_crawl_finished_notification(crawl_id, state)

        # add crawl errors to db
        await self.add_crawl_errors_to_db(crawl_id)

        # finally, delete job
        await self.delete_crawl_job(crawl_id)

    async def inc_crawl_complete_stats(self, crawl, finished):
        """Increment Crawl Stats"""

        started = from_k8s_date(crawl.started)

        duration = int((finished - started).total_seconds())

        print(f"Duration: {duration}", flush=True)

        await inc_org_stats(self.orgs, crawl.oid, duration)

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

                await add_crawl_errors(self.crawls, crawl_id, errors)

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


# ============================================================================
def init_operator_api(app, mdb, event_webhook_ops):
    """regsiters webhook handlers for metacontroller"""

    oper = BtrixOperator(mdb, event_webhook_ops)

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

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}
