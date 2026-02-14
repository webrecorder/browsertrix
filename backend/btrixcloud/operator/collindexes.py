"""Operator handler for CollIndexes"""

import re
import datetime
import traceback

from typing import Literal
from urllib.parse import urlsplit

from uuid import UUID
from pydantic import BaseModel
from redis.asyncio.client import Redis

from btrixcloud.utils import str_to_date, date_to_str, dt_now
from btrixcloud.models import (
    TYPE_DEDUPE_INDEX_STATES,
    DedupeIndexStats,
    DedupeIndexFile,
    Organization,
)

from .models import MCSyncData, MCBaseRequest, POD, JOB, CJS, BTRIX_API
from .baseoperator import BaseOperator


# ============================================================================
class IndexPodState(BaseModel):
    """redis pod status"""

    notFound: bool = False
    running: bool = False
    finished: bool = False
    loaded: bool = False
    savedAt: str = ""


# ============================================================================
class CollIndexStatus(BaseModel):
    """CollIndex Status"""

    state: TYPE_DEDUPE_INDEX_STATES = "initing"

    updated: str = ""

    lastStateChangeAt: str = ""

    indexLastSavedAt: str = ""

    finishedAt: str = ""

    # redis pod states
    index: IndexPodState = IndexPodState()


# ============================================================================
class CollIndexSpec(BaseModel):
    """CollIndex Spec"""

    id: UUID
    oid: UUID


# ============================================================================
class CollIndexOperator(BaseOperator):
    """CollIndex Operation"""

    backend_type: Literal["redis", "kvrocks"]
    shared_params = {}

    def __init__(self, *args):
        super().__init__(*args)
        self.shared_params.update(self.k8s.shared_params)
        self.shared_params["redis_storage"] = self.shared_params["dedupe_storage"]
        self.shared_params["memory"] = self.shared_params["dedupe_memory"]
        self.shared_params["cpu"] = self.shared_params["dedupe_cpu"]

        self.shared_params["redis_image"] = self.shared_params["dedupe_image"]
        self.shared_params["redis_image_pull_policy"] = self.shared_params[
            "dedupe_image_pull_policy"
        ]

        self.shared_params["obj_type"] = "coll"

        self.shared_params["use_kvrocks"] = self.shared_params["dedupe_use_kvrocks"]

        if self.shared_params["use_kvrocks"]:
            self.backend_type = "kvrocks"
            self.shared_params["local_file_src"] = "backup"
            self.shared_params["local_file_dest"] = "db"
        else:
            self.backend_type = "redis"
            self.shared_params["local_file_src"] = "dump.rdb"
            self.shared_params["local_file_dest"] = "dump.rdb"

        self.shared_params["save_dump"] = True

        # expire CollIndex after idle for this many seconds with no additional jobs
        self.idle_secs = self.shared_params["dedupe_idle_secs"]
        self.idle_expire_time = datetime.timedelta(seconds=self.idle_secs)

        self.rclone_save = "save"

    def init_routes(self, app):
        """init routes for this operator"""

        @app.post("/op/collindexes/sync")
        async def mc_sync_index(data: MCSyncData):
            return await self.sync_index(data)

        @app.post("/op/collindexes/finalize")
        async def mc_finalize_index(data: MCSyncData):
            return await self.sync_index(data)

        @app.post("/op/collindexes/customize")
        async def mc_related(data: MCBaseRequest):
            return self.get_related(data)

    # pylint: disable=too-many-locals, too-many-branches
    async def sync_index(self, data: MCSyncData):
        """sync CollIndex object with existing state"""
        spec = CollIndexSpec(**data.parent.get("spec", {}))
        status = CollIndexStatus(**data.parent.get("status", {}))

        coll_id = spec.id
        redis_name = f"redis-coll-{coll_id}"
        new_children = []

        redis_pod = data.children[POD].get(redis_name)

        # check if redis should be skipped, eg. no pod active or complete
        self.sync_redis_pod_status(redis_pod, status)

        # allow deletion only if idle
        if data.finalizing:
            is_done = False
            if status.state == "saved" and status.index.savedAt:
                await self.set_state("idle", status, coll_id)
                is_done = True
            elif status.state == "idle" and status.index.notFound:
                is_done = True
            # never inited, just remove
            elif status.state == "initing" and status.index.notFound:
                is_done = True
            else:
                try:
                    await self.coll_ops.get_collection_raw(spec.id, spec.oid)
                # pylint: disable=bare-except
                except:
                    # collection not found, delete index
                    is_done = True

            if is_done:
                print(f"CollIndex removed: {spec.id}")
                return {"status": status.dict(), "children": [], "finalized": True}

        try:
            # determine if index was previously saved before initing redis
            if not redis_pod:
                if not status.indexLastSavedAt:
                    res = await self.coll_ops.get_dedupe_index_saved(spec.id)
                    if res:
                        status.indexLastSavedAt = date_to_str(res)

            if self.is_expired(status) or data.finalizing:
                # do actual deletion here
                if not data.finalizing:
                    self.run_task(self.do_delete(spec.id))

                # Saving process
                # 1. run bgsave while redis is active
                if status.index.running:
                    await self.do_ve(spec.id, status)

                elif status.index.finished and not status.index.savedAt:
                    await self.k8s.send_signal_to_pod(redis_name, "SIGUSR1", "save")

                # 2. once redis has shutdown, check if fully finished
                elif status.index.savedAt and status.index.savedAt != status.finishedAt:
                    await self.mark_index_saved(redis_name, spec, status)

            else:
                await self.update_state(data, spec.id, status)

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)
            traceback.print_exc()

            # load redis pvc and/or redis pod itself
        if status.state != "idle":
            new_children.extend(
                await self.load_redis(coll_id, redis_name, spec, status)
            )

        if status.state != "crawling":
            resync_after = self.idle_secs
        else:
            resync_after = None

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "finalized": False,
            "resyncAfterSeconds": resync_after,
        }

    def sync_redis_pod_status(self, pod, status: CollIndexStatus):
        """skip redis if no pod or redis container exited"""
        if not pod:
            status.index = IndexPodState(notFound=True)
            return

        index = status.index
        index.running = pod["status"].get("phase") == "Running"

        terminated = None
        try:
            terminated = pod["status"]["containerStatuses"][0]["state"].get(
                "terminated"
            )
            if terminated:
                index.running = False
                if terminated.get("reason") == "Completed":
                    index.finished = True
        # pylint: disable=bare-except
        except:
            pass

        # redis pod likely running
        if "initContainerStatuses" not in pod["status"]:
            index.loaded = True

        else:
            try:
                index.loaded = (
                    pod["status"]["initContainerStatuses"][0]["state"]["terminated"][
                        "reason"
                    ]
                    == "Completed"
                )
            # pylint: disable=bare-except
            except:
                pass

        if pod["status"].get("phase") == "Succeeded":
            try:
                index.savedAt = pod["status"]["containerStatuses"][1]["state"][
                    "terminated"
                ]["finishedAt"]
            # pylint: disable=bare-except
            except:
                pass

    async def update_state(self, data, coll_id: UUID, status: CollIndexStatus):
        """update state"""
        desired_state = status.state
        if not status.index.loaded:
            desired_state = "initing"

        # first, handle any import or purge jobs
        elif bool(data.related.get(JOB)):
            desired_state = "importing"
            for job_name in data.related.get(JOB, {}):
                if job_name.startswith("purge-"):
                    desired_state = "purging"
                    break

        # then, active crawls
        elif bool(data.related.get(CJS)):
            desired_state = "crawling"

        else:
            desired_state = "ready"

        # update stats if redis is available
        if status.index.running:
            await self.update_stats_from_redis(status, coll_id)

        if desired_state != status.state:
            await self.set_state(desired_state, status, coll_id)

    def is_expired(self, status: CollIndexStatus):
        """return true if collindex is considered expired and should be deleted"""
        if status.state != "ready":
            return False

        if self.is_last_active_exceeds(status, self.idle_expire_time):
            return True

        if status.state in ("saving", "saved"):
            return True

        return False

    def is_last_active_exceeds(
        self, status: CollIndexStatus, min_dura: datetime.timedelta
    ):
        """return true if last active time exceeds duration"""
        dt_change = str_to_date(status.lastStateChangeAt)
        if dt_change and (dt_now() - dt_change) > min_dura:
            return True

        return False

    async def set_state(
        self, state: TYPE_DEDUPE_INDEX_STATES, status: CollIndexStatus, coll_id: UUID
    ):
        """set state after updating db"""
        print(f"Setting coll index state {status.state} -> {state} {coll_id}")
        status.state = state
        status.lastStateChangeAt = date_to_str(dt_now())

        # self.run_task(self.coll_ops.update_dedupe_index_info(coll_id, state))
        await self.coll_ops.update_dedupe_index_info(coll_id, state)

    async def do_delete(self, coll_id: UUID):
        """delete the CollIndex object"""
        print(f"Deleting collindex {coll_id}")
        await self.k8s.delete_custom_object(f"collindex-{coll_id}", "collindexes")

    async def do_ve(self, coll_id: UUID, status: CollIndexStatus):
        """shutdown save redis"""
        try:
            redis = await self.k8s.get_redis_connected(f"coll-{coll_id}")
            if not redis:
                return

            if status.state not in ("saving", "saved"):
                await redis.bgsave(False)

                await self.set_state("saving", status, coll_id)

            if await self.is_bgsave_done(redis):
                await redis.shutdown()

        # pylint: disable=broad-exception-caught
        except Exception:
            await self.set_state("ready", status, coll_id)
            traceback.print_exc()

    async def is_bgsave_done(self, redis: Redis) -> bool:
        """return true if bgsave has successfully finished"""
        info = await redis.execute_command("INFO persistence")

        return "bgsave_in_progress:0" in info and "last_bgsave_status:ok" in info

    async def update_stats_from_redis(self, status: CollIndexStatus, coll_id: UUID):
        """update stats from redis, set other changes based on prev and new state"""
        # attempt to set the last updated from redis when import is finished
        try:
            redis = await self.k8s.get_redis_connected("coll-" + str(coll_id))
            if not redis:
                return

            # readd appendonly if using redis
            if status.state == "initing" and self.backend_type == "redis":
                await redis.config_set("appendonly", "yes")

            elif status.state == "ready":
                last_update_ts = await redis.get("last_update_ts")
                if last_update_ts:
                    status.updated = last_update_ts

            # update db stats from redis
            stats = await redis.hgetall("allcounts")
            num_unique_hashes = await redis.hlen("alldupes")
            num_crawls = await redis.scard("allcrawls")
            await self.coll_ops.update_dedupe_index_stats(
                coll_id,
                DedupeIndexStats(
                    uniqueHashes=num_unique_hashes,
                    totalCrawls=num_crawls,
                    **stats,
                ),
            )

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)
            traceback.print_exc()

    def get_related(self, data: MCBaseRequest):
        """return crawljobs that use this dedupe index"""
        spec = data.parent.get("spec", {})
        coll_id = spec.get("id")

        related_resources = [
            {
                "apiVersion": BTRIX_API,
                "resource": "crawljobs",
                "labelSelector": {"matchLabels": {"dedupe_coll_id": coll_id}},
            },
            {
                "apiVersion": "batch/v1",
                "resource": "jobs",
                "labelSelector": {
                    "matchLabels": {"coll": coll_id, "role": "index-import-job"}
                },
            },
        ]
        return {"relatedResources": related_resources}

    async def load_redis(
        self,
        coll_id: UUID,
        name: str,
        spec: CollIndexSpec,
        status: CollIndexStatus,
    ):
        """create redis pods from yaml template"""
        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = str(coll_id)
        params["init_redis"] = True

        params["load_dump"] = bool(status.indexLastSavedAt)

        org = await self.coll_ops.orgs.get_org_by_id(spec.oid)
        oid = str(spec.oid)

        storage_secret = org.storage.get_storage_secret_name(oid)

        storage = self.coll_ops.storage_ops.get_org_primary_storage(org)

        parts = urlsplit(storage.endpoint_url)
        endpoint_url = parts.scheme + "://" + parts.netloc

        params["storage_secret_name"] = storage_secret
        params["storage_endpoint"] = endpoint_url
        params["pvc_name"] = name

        params["remote_file_path"] = parts.path[1:] + self.get_index_storage_filename(
            spec.id, org
        )

        return self.load_from_yaml("redis.yaml", params)

    def get_index_storage_filename(self, coll_id: UUID, org: Organization):
        """get index filename for storage"""
        storage_path = org.storage.get_storage_extra_path(str(org.id))
        return storage_path + f"dedupe-index/{coll_id}"

    async def mark_index_saved(
        self,
        redis_name: str,
        spec: CollIndexSpec,
        status: CollIndexStatus,
    ):
        """create sync job to save redis index data to s3 storage"""

        # update state immediately to speed up cleanup
        print(f"Setting coll index state {status.state} -> saved {spec.id}")
        status.state = "saved"

        finished_at = str_to_date(status.index.savedAt)

        await self.update_saved_dedupe_index_state_in_db(
            spec.id, spec.oid, redis_name, finished_at or dt_now()
        )

        status.finishedAt = status.index.savedAt

    async def update_saved_dedupe_index_state_in_db(
        self, coll_id: UUID, oid: UUID, pod_name: str, finished_at: datetime.datetime
    ):
        """update state of index in db, including uploaded storage"""
        hash_ = ""
        size = -1
        logs = await self.k8s.get_pod_logs(
            pod_name, container=self.rclone_save, lines=100
        )
        m = re.search(r"STATS: \(size,hash\): ([\d]+),([\w]+)", logs)
        if m:
            size = int(m.group(1))
            hash_ = m.group(2)

        print("UPLOAD LOGS")
        print("-----------")
        print(logs, size, hash_)

        org = await self.coll_ops.orgs.get_org_by_id(oid)
        filename = self.get_index_storage_filename(coll_id, org)

        index_file = DedupeIndexFile(
            type=self.backend_type,
            filename=filename,
            hash=hash_,
            size=size,
            storage=org.storage,
        )

        await self.coll_ops.update_dedupe_index_info(
            coll_id, "idle", index_file, finished_at
        )
