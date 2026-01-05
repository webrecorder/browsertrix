"""Operator handler for CollIndexes"""

import re
import os
import datetime
import traceback

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

# expire CollIndex after idle for this many seconds with no additional jobs
IDLE_SECS = 10

EXPIRE_TIME = datetime.timedelta(seconds=IDLE_SECS)


# ============================================================================
class CollIndexStatus(BaseModel):
    """CollIndex Status"""

    state: TYPE_DEDUPE_INDEX_STATES = "initing"

    updated: str = ""

    lastStateChangeAt: str = ""

    indexLastSavedAt: str = ""

    finishedAt: str = ""

    redisBgSaveTs: int = 0


# ============================================================================
class CollIndexSpec(BaseModel):
    """CollIndex Spec"""

    id: UUID
    oid: UUID


# ============================================================================
class CollIndexOperator(BaseOperator):
    """CollIndex Operation"""

    shared_params = {}
    fast_retry: int

    def __init__(self, *args):
        super().__init__(*args)
        self.shared_params.update(self.k8s.shared_params)
        self.shared_params["redis_storage"] = self.shared_params["redis_dedupe_storage"]
        self.shared_params["memory"] = self.shared_params["redis_dedupe_memory"]
        self.shared_params["cpu"] = self.shared_params["redis_cpu"]
        self.shared_params["obj_type"] = "coll"

        self.is_kvrocks = True

        if self.is_kvrocks:
            self.shared_params["local_file_src"] = "backup"
            self.shared_params["local_file_dest"] = "db"
        else:
            self.shared_params["local_file_src"] = "dump.rdb"
            self.shared_params["local_file_dest"] = "dump.rdb"

        if self.is_kvrocks:
            self.shared_params["redis_image"] = "apache/kvrocks:latest"
            self.pod_yaml = "kvrocks.yaml"
        else:
            self.pod_yaml = "redis.yaml"

        self.fast_retry = int(os.environ.get("FAST_RETRY_SECS") or 0)

        self.rclone_save = "rclone-save"

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

        coll_id = str(spec.id)
        redis_name = "redis-coll-" + coll_id
        new_children = []

        redis_pod = data.children[POD].get(redis_name)

        # check if redis should be skipped, eg. no pod active or complete
        skip_redis = self.skip_redis(redis_pod)

        # allow deletion only if idle
        if data.finalizing:
            is_done = False
            if status.state in ("idle", "saving") and not redis_pod:
                # likely reentrant call still set to saving, just switch to idle
                if status.state == "saving":
                    status.state = "idle"
                is_done = True
            # never inited, just remove
            elif status.state == "initing" and skip_redis:
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
                if not skip_redis:
                    await self.do_redis_save(spec.id, status)

                # 2. once redis has shutdown, check if fully finished
                else:
                    await self.check_redis_saved(redis_name, redis_pod, spec, status)

            else:
                await self.update_state(skip_redis, data, spec.id, status)

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)
            traceback.print_exc()

            # load redis pvc and/or redis pod itself
        if status.state != "idle":
            new_children.extend(
                await self.load_redis(coll_id, redis_name, spec, status)
            )

        if status.state in ("idle", "saving", "ready"):
            resync_after = IDLE_SECS
        else:
            resync_after = None

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "finalized": False,
            "resyncAfterSeconds": resync_after,
        }

    def skip_redis(self, pod):
        """skip redis if no pod or redis container exited"""
        if not pod:
            return True

        if pod["status"].get("phase") != "Running":
            return True

        try:
            if (
                pod["status"]["containerStatuses"][0]["state"]["terminated"]["reason"]
                == "Completed"
            ):
                return True
        # pylint: disable=bare-except
        except:
            pass

        return False

    async def update_state(
        self, skip_redis: bool, data, coll_id: UUID, status: CollIndexStatus
    ):
        """update state"""
        desired_state = status.state
        if skip_redis:
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

        if desired_state != status.state:
            # update stats if redis is available
            if not skip_redis and desired_state == "ready":
                await self.update_stats_from_redis(status, coll_id)

            await self.set_state(desired_state, status, coll_id)

    def is_expired(self, status: CollIndexStatus):
        """return true if collindex is considered expired and should be deleted"""
        if status.state != "ready":
            return False

        dt_change = str_to_date(status.lastStateChangeAt)
        if dt_change and (dt_now() - dt_change) > EXPIRE_TIME:
            return True

        if status.state == "saving":
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

    async def do_delete(self, index_id: UUID):
        """delete the CollIndex object"""
        print(f"Deleting collindex {index_id}")
        await self.k8s.delete_custom_object(f"collindex-{index_id}", "collindexes")

    async def do_redis_save(self, coll_id: UUID, status: CollIndexStatus):
        """shutdown save redis"""
        try:
            if status.state != "saving":
                if not self.is_kvrocks:
                    return

            redis = await self.k8s.get_redis_connected("coll-" + str(coll_id))
            if not redis:
                return

            if status.state != "saving":
                await self.set_state("saving", status, coll_id)

                if self.is_kvrocks:
                    status.redisBgSaveTs = await self.get_bgsave_time(redis)
                    await redis.execute_command("bgsave")
                else:
                    self.run_task(self.do_redis_shutdown(redis, coll_id, status))

            if self.is_kvrocks:
                save_time = await self.get_bgsave_time(redis)
                if status.redisBgSaveTs < save_time:
                    status.redisBgSaveTs = save_time
                    await redis.shutdown()

        # pylint: disable=broad-exception-caught
        except Exception as e:
            await self.set_state("ready", status, coll_id)
            traceback.print_exc()

    async def get_bgsave_time(self, redis: Redis):
        """get kvrocks bgsave time"""
        info = await redis.execute_command("INFO persistence")

        m = re.search(r"last_bgsave_time:([\d]+)", info)
        if m:
            return int(m.group(1))

        return 0

    async def do_redis_shutdown(
        self, redis: Redis, coll_id: UUID, status: CollIndexStatus
    ):
        """save and shutdown redis, waiting for it to succeed"""
        try:
            await redis.shutdown(save=True)
        # pylint: disable=broad-exception-caught
        except Exception as e:
            print("Redis shutdown failed", e)
            await self.set_state("ready", status, coll_id)

    async def update_stats_from_redis(self, status: CollIndexStatus, coll_id: UUID):
        """update stats from redis, set other changes based on prev and new state"""
        # attempt to set the last updated from redis when import is finished
        try:
            redis = await self.k8s.get_redis_connected("coll-" + str(coll_id))
            if not redis:
                return

            # readd appendonly
            if status.state == "initing":
                await redis.config_set("appendonly", "yes")

            else:
                last_update_ts = await redis.get("last_update_ts")
                if last_update_ts:
                    status.updated = last_update_ts

            # update db stats from redis
            stats = await redis.hgetall("allcounts")
            num_unique_urls = await redis.hlen("alldupes")
            num_crawls = await redis.scard("allcrawls")
            await self.coll_ops.update_dedupe_index_stats(
                coll_id,
                DedupeIndexStats(
                    uniqueUrls=num_unique_urls,
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
        index_id: str,
        name: str,
        spec: CollIndexSpec,
        status: CollIndexStatus,
    ):
        """create redis pods from yaml template"""
        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = index_id
        params["init_redis"] = True

        params["load_dump"] = bool(status.indexLastSavedAt)
        params["save_dump"] = True

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

        return self.load_from_yaml(self.pod_yaml, params)

    def get_index_storage_filename(self, coll_id: UUID, org: Organization):
        """get index filename for storage"""
        storage_path = org.storage.get_storage_extra_path(str(org.id))
        return storage_path + f"dedupe-index/{coll_id}"

    async def check_redis_saved(
        self,
        redis_name: str,
        redis_pod,
        spec: CollIndexSpec,
        status: CollIndexStatus,
    ):
        """create sync job to save redis index data to s3 storage"""

        if redis_pod and redis_pod["status"].get("phase") == "Succeeded":
            finished_at = None
            finished_at_str = ""
            try:
                finished_at_str = redis_pod["status"]["initContainerStatuses"][0][
                    "state"
                ]["terminated"]["finishedAt"]
            # pylint: disable=bare-except
            except:
                pass

            # update state immediately to speed up cleanup
            print(f"Setting coll index state {status.state} -> idle {spec.id}")
            status.state = "idle"

            if finished_at_str:
                if status.finishedAt == finished_at_str:
                    return
                finished_at = str_to_date(finished_at_str)

            await self.update_saved_dedupe_index_state_in_db(
                spec.id, spec.oid, redis_name, finished_at or dt_now()
            )

            status.finishedAt = finished_at_str

    async def update_saved_dedupe_index_state_in_db(
        self, coll_id: UUID, oid: UUID, pod_name: str, finished_at: datetime.datetime
    ):
        """update state of index in db, including uploaded storage"""
        hash_ = ""
        size = -1
        logs = await self.k8s.get_pod_logs(
            pod_name, container=self.rclone_save, lines=100
        )
        m = re.search(r"md5 = ([^\s]+) OK", logs)
        if m:
            hash_ = "md5:" + m.group(1)
        m = re.search(r"size = ([\d]+) OK", logs)
        if m:
            size = int(m.group(1))

        print("UPLOAD LOGS")
        print("-----------")
        print(logs)

        org = await self.coll_ops.orgs.get_org_by_id(oid)
        filename = self.get_index_storage_filename(coll_id, org)

        index_file = DedupeIndexFile(
            filename=filename, hash=hash_, size=size, storage=org.storage
        )

        await self.coll_ops.update_dedupe_index_info(
            coll_id, "idle", index_file, finished_at
        )
