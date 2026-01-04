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

    redisBgSavedAt: str = ""

    indexFilename: str = ""
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
        self.dedupe_importer_channel = (
            self.shared_params.get("dedupe_importer_channel") or "default"
        )

        self.fast_retry = int(os.environ.get("FAST_RETRY_SECS") or 0)

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
        skip_redis = False

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
            if redis_name in data.children[POD]:
                redis = await self.k8s.get_redis_connected("coll-" + index_id)

            # determine if index was previously saved before initing redis
            if not redis:
                if not status.indexLastSavedAt:
                    res = await self.coll_ops.get_dedupe_index_saved(spec.id)
                    if res:
                        status.indexLastSavedAt = date_to_str(res)

            else:
                await self.handle_redis_update(redis, status, spec.id)

            if self.is_expired(status) or data.finalizing:
                # do actual deletion here
                if not data.finalizing:
                    self.do_delete(spec.id)

                # Saving process
                # 1. run bgsave while redis is active
                if redis:
                    if status.state in (
                        "ready",
                        "saving",
                    ) and await self.handle_redis_save(spec.id, redis, status):
                        skip_redis = True

                # 2. once redis has shutdown, do the upload
                else:
                    skip_redis = True
                    if status.state == "saving":
                        await self.save_index_data(
                            new_children, redis_name, spec, status, data
                        )

            else:
                await self.update_state(bool(redis), data, spec.id, status)

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)
            traceback.print_exc()

            # load redis pvc and/or redis pod itself
        if status.state != "idle":
            new_children.extend(
                await self.load_redis(index_id, redis_name, spec, status, skip_redis)
            )

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "finalized": False,
        }

    async def update_state(
        self, has_redis: bool, data, coll_id: UUID, status: CollIndexStatus
    ):
        """update state"""
        desired_state = status.state
        if not has_redis:
            desired_state = "initing"

        # has active crawls
        elif status.state == "ready":
            if bool(data.related.get(CJS)):
                desired_state = "crawling"
            elif bool(data.related.get(JOB)):
                desired_state = "importing"
                for job_name in data.related.get(JOB, {}):
                    if job_name.startswith("purge-"):
                        desired_state = "purging"
                        break

        elif status.state in ("importing", "purging", "initing"):
            desired_state = "ready"

        if desired_state != status.state:
            await self.set_state(desired_state, status, coll_id)

        if desired_state != "ready":
            status.lastActiveAt = date_to_str(dt_now())

    def is_expired(self, status: CollIndexStatus):
        """return true if collindex is considered expired and should be deleted"""
        dt_active = str_to_date(status.lastActiveAt)
        if dt_active and (dt_now() - dt_active) > EXPIRE_MIN:
            return True

        return False

    async def set_state(
        self, state: TYPE_DEDUPE_INDEX_STATES, status: CollIndexStatus, coll_id: UUID
    ):
        """set state after updating db"""
        await self.coll_ops.update_dedupe_index_info(coll_id, state)
        status.state = state

    def do_delete(self, index_id: UUID):
        """delete the CollIndex object"""
        name = f"collindex-{index_id}"
        self.run_task(self.k8s.delete_custom_object(name, "collindexes"))

    async def handle_redis_save(
        self, coll_id: UUID, redis: Redis, status: CollIndexStatus
    ):
        """bgsave redis before shutting down, return true if finished saving"""
        # if have redis but don't need
        if status.state == "ready":
            try:
                await redis.bgsave()
            # pylint: disable=bare-except
            except:
                pass

            await self.set_state("saving", status, coll_id)

        last_saved = await redis.lastsave()
        if last_saved and (
            not status.redisBgSavedAt or last_saved > str_to_date(status.redisBgSavedAt)
        ):
            status.redisBgSavedAt = date_to_str(last_saved)
            return True

        return False

    async def handle_redis_update(
        self, redis: Redis, status: CollIndexStatus, coll_id: UUID
    ):
        """update stats from ready, return ready if import jobs finished"""
        # attempt to set the last updated from redis when import is finished
        try:
            # some kind of index update running
            if status.state != "ready":
                # update last update ts
                last_update_ts = await redis.get("last_update_ts")
                if last_update_ts:
                    status.updated = last_update_ts

                # readd appendonly
                if status.state == "initing":
                    await redis.config_set("appendonly", "yes")

            # update db stats from redis
            stats = await redis.hgetall("allcounts")
            num_unique_urls = await redis.hlen("alldupes")
            num_crawls = await redis.scard("allcrawls")
            await self.coll_ops.update_dedupe_index_stats(
                coll_id,
                DedupeIndexStats(
                    uniqueUrls=num_unique_urls,
                    totalCrawls=num_crawls,
                    state=status.state,
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
                "apiVersion": "v1",
                "resource": "pods",
                "labelSelector": {
                    "matchLabels": {"coll": coll_id, "role": "save-dedupe-index"}
                },
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

    # pylint: disable=too-many-arguments
    async def load_redis(
        self,
        index_id: str,
        name: str,
        spec: CollIndexSpec,
        status: CollIndexStatus,
        skip_redis: bool,
    ):
        """create redis pods from yaml template"""
        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = index_id
        params["init_redis"] = not skip_redis

        params["init_data"] = bool(status.indexLastSavedAt)
        await self._fill_sync_params(spec, name, params)

        return self.load_from_yaml("redis.yaml", params)

    # pylint: disable=too-many-arguments
    async def save_index_data(
        self,
        new_children,
        redis_name: str,
        spec: CollIndexSpec,
        status: CollIndexStatus,
        data: MCSyncData,
    ):
        """create sync job to save redis index data to s3 storage"""

        now = None
        job = data.children[JOB].get("save-index-" + str(spec.id))
        if job:
            job_status = job.get("status", {})

            if job_status.get("succeeded") == 1:
                now = dt_now()
                status.indexLastSavedAt = date_to_str(now)
            elif job_status.get("failed") == 3:
                await self.set_state("idle", status, spec.id)
                return

        if (
            status.indexLastSavedAt
            and status.redisBgSavedAt
            and status.indexLastSavedAt >= status.redisBgSavedAt
        ):

            # save in db if just updated
            status.state = "idle"
            if now:
                self.run_task(
                    self.update_saved_dedupe_index_state_in_db(
                        spec.id,
                        spec.oid,
                        now,
                        status.indexFilename,
                        status.state,
                        job,
                        data.related.get(POD),
                    )
                )

            return

        params: dict[str, bool | str] = {}

        await self._fill_sync_params(spec, redis_name, params)

        new_children.extend(self.load_from_yaml("save-dedupe-index-job.yaml", params))

    async def _fill_sync_params(
        self,
        spec: CollIndexSpec,
        redis_name: str,
        params: dict[str, bool | str],
    ):
        org = await self.coll_ops.orgs.get_org_by_id(spec.oid)
        oid = str(spec.oid)

        storage_secret = org.storage.get_storage_secret_name(oid)

        storage = self.coll_ops.storage_ops.get_org_primary_storage(org)

        parts = urlsplit(storage.endpoint_url)
        endpoint_url = parts.scheme + "://" + parts.netloc

        params["storage_secret_name"] = storage_secret
        params["storage_endpoint"] = endpoint_url
        params["pvc_name"] = redis_name
        params["id"] = str(spec.id)

        params["remote_file_path"] = parts.path[1:] + self.get_index_storage_filename(
            spec.id, org
        )
        params["local_file"] = "dump.rdb"

    def get_index_storage_filename(self, coll_id: UUID, org: Organization):
        """get index filename for storage"""
        storage_path = org.storage.get_storage_extra_path(str(org.id))
        filename = storage_path + f"dedupe-index/{coll_id}.rdb"

        return filename

    async def update_saved_dedupe_index_state_in_db(
        self,
        coll_id: UUID,
        oid: UUID,
        now: datetime.datetime,
        filename: str,
        state: TYPE_DEDUPE_INDEX_STATES,
        job,
        pods,
    ):
        """update state of index in db, including uploaded storage"""
        job_name = job["metadata"]["name"]
        pod_name = None
        for name, pod in pods.items():
            if pod["metadata"]["labels"].get("job-name") == job_name:
                pod_name = name
                break

        hash_ = ""
        size = -1
        if pod_name:
            logs = await self.k8s.get_pod_logs(pod_name, 10)
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

        await self.coll_ops.update_dedupe_index_info(coll_id, state, index_file, now)
