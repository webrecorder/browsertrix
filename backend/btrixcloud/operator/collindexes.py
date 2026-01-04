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


EXPIRE_MIN = datetime.timedelta(seconds=30)


# ============================================================================
class CollIndexStatus(BaseModel):
    """CollIndex Status"""

    state: TYPE_DEDUPE_INDEX_STATES = "initing"

    updated: str = ""

    lastActiveAt: str = ""

    indexLastSavedAt: str = ""


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

        self.shared_params["local_file"] = "dump.rdb"

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

        index_id = str(spec.id)
        redis_name = "redis-coll-" + index_id
        new_children = []

        # allow deletion only if idle
        if data.finalizing:
            is_done = False
            if status.state == "idle" and not data.children[POD]:
                is_done = True
            else:
                try:
                    await self.coll_ops.get_collection_raw(spec.id, spec.oid)
                # pylint: disable=bare-except
                except:
                    # collection not found, delete index
                    is_done = True

            if is_done:
                return {"status": status.dict(), "children": [], "finalized": True}

        try:
            # get redis if exists
            redis = None
            if not self.skip_redis(data.children[POD].get(redis_name)):
                redis = await self.k8s.get_redis_connected("coll-" + index_id)

            # determine if index was previously saved before initing redis
            if not redis:
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
                if redis:
                    self.run_task(self.do_redis_save(spec.id, redis, status))

                # 2. once redis has shutdown, check if fully finished
                else:
                    self.check_redis_saved(redis_name, spec, status, data)

            else:
                await self.update_state(redis, data, spec.id, status)

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)
            traceback.print_exc()

            # load redis pvc and/or redis pod itself
        if status.state != "idle":
            new_children.extend(
                await self.load_redis(index_id, redis_name, spec, status)
            )

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "finalized": False,
        }

    def skip_redis(self, pod):
        """skip redis if no pod or redis container exited"""
        if not pod:
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
        self, redis: Redis | None, data, coll_id: UUID, status: CollIndexStatus
    ):
        """update state"""
        desired_state = status.state
        if not redis:
            desired_state = "initing"

        # has active crawls
        elif bool(data.related.get(CJS)):
            desired_state = "crawling"
        elif bool(data.related.get(JOB)):
            desired_state = "importing"
            for job_name in data.related.get(JOB, {}):
                if job_name.startswith("purge-"):
                    desired_state = "purging"
                    break

        else:
            desired_state = "ready"

        if desired_state != status.state:
            # other updates when switching to ready
            if redis and desired_state == "ready":
                await self.update_stats_from_redis(redis, status, coll_id)

            self.set_state(desired_state, status, coll_id)

        if desired_state != "ready":
            status.lastActiveAt = date_to_str(dt_now())

    def is_expired(self, status: CollIndexStatus):
        """return true if collindex is considered expired and should be deleted"""
        dt_active = str_to_date(status.lastActiveAt)
        if dt_active and (dt_now() - dt_active) > EXPIRE_MIN:
            return True

        return False

    def set_state(
        self, state: TYPE_DEDUPE_INDEX_STATES, status: CollIndexStatus, coll_id: UUID
    ):
        """set state after updating db"""
        print(f"Setting coll index state {status.state} -> {state}")
        status.state = state
        self.run_task(self.coll_ops.update_dedupe_index_info(coll_id, state))

    async def do_delete(self, index_id: UUID):
        """delete the CollIndex object"""
        await self.k8s.delete_custom_object(f"collindex-{index_id}", "collindexes")

    async def do_redis_save(self, coll_id: UUID, redis: Redis, status: CollIndexStatus):
        """shutdown save redis"""
        self.set_state("saving", status, coll_id)
        try:
            await redis.shutdown(save=True)
        # pylint: disable=broad-exception-caught
        except Exception as e:
            print("Redis shutdown failed", e)
            self.set_state("ready", status, coll_id)

    async def update_stats_from_redis(
        self, redis: Redis, status: CollIndexStatus, coll_id: UUID
    ):
        """update stats from redis, set other changes based on prev and new state"""
        # attempt to set the last updated from redis when import is finished
        try:
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
                    state="ready",
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

        return self.load_from_yaml("redis.yaml", params)

    def get_index_storage_filename(self, coll_id: UUID, org: Organization):
        """get index filename for storage"""
        storage_path = org.storage.get_storage_extra_path(str(org.id))
        filename = storage_path + f"dedupe-index/{coll_id}.rdb"

        return filename

    def check_redis_saved(
        self,
        redis_name: str,
        spec: CollIndexSpec,
        status: CollIndexStatus,
        data: MCSyncData,
    ):
        """create sync job to save redis index data to s3 storage"""

        redis_pod = data.children[POD].get(redis_name)
        if redis_pod and redis_pod["status"].get("phase") == "Succeeded":
            finished_at = None
            try:
                finished_at = str_to_date(
                    redis_pod["status"]["initContainerStatuses"][1]["state"][
                        "terminated"
                    ]["finishedAt"]
                )
            # pylint: disable=bare-except
            except:
                pass

            # update state immediately to speed up cleanup
            print(f"Setting coll index state {status.state} -> idle")
            status.state = "idle"
            self.run_task(
                self.update_saved_dedupe_index_state_in_db(
                    spec.id, spec.oid, redis_name, finished_at or dt_now()
                )
            )

    async def update_saved_dedupe_index_state_in_db(
        self, coll_id: UUID, oid: UUID, pod_name: str, finished_at: datetime.datetime
    ):
        """update state of index in db, including uploaded storage"""
        hash_ = ""
        size = -1
        if pod_name:
            logs = await self.k8s.get_pod_logs(
                pod_name, container=self.rclone_save, lines=10
            )
            m = re.search(r"md5 = ([^\s]+) OK", logs)
            if m:
                hash_ = "md5:" + m.group(1)
            m = re.search(r"size = ([\d]+) OK", logs)
            if m:
                size = int(m.group(1))

        org = await self.coll_ops.orgs.get_org_by_id(oid)
        filename = self.get_index_storage_filename(coll_id, org)

        index_file = DedupeIndexFile(
            filename=filename, hash=hash_, size=size, storage=org.storage
        )

        await self.coll_ops.update_dedupe_index_info(
            coll_id, "idle", index_file, finished_at
        )
