"""Operator handler for CollIndexes"""

import re
import os
from urllib.parse import urlsplit

from uuid import UUID
from pydantic import BaseModel
from redis.asyncio.client import Redis

from btrixcloud.utils import str_to_date, date_to_str, dt_now
from btrixcloud.models import TYPE_DEDUPE_INDEX_STATES, DedupeIndexStats

from .models import MCSyncData, MCBaseRequest, POD, JOB, CMAP, CJS, BTRIX_API
from .baseoperator import BaseOperator


# ============================================================================
class CollIndexStatus(BaseModel):
    """CollIndex Status"""

    state: TYPE_DEDUPE_INDEX_STATES = "initing"

    updated: str = ""

    lastSavedRedis: str = ""
    syncUpTime: str = ""


# ============================================================================
class CollIndexSpec(BaseModel):
    """CollIndex Spec"""

    id: UUID
    oid: UUID

    collItemsUpdatedAt: str = ""
    purgeRequestedAt: str = ""


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

        if data.finalizing:
            # allow deletion
            return {"status": status.dict(), "children": [], "finalized": True}

        index_id = str(spec.id)
        redis_name = "redis-coll-" + index_id
        new_children = []

        try:
            # get redis if exists
            redis = None
            if redis_name in data.children[POD]:
                redis = await self.k8s.get_redis_connected("coll-" + index_id)

            # check if import/purge needed
            import_ts, is_purge = self.get_import_or_purge_ts(spec, status)
            if import_ts:
                import_job_name = (
                    f"import-{index_id}-{import_ts}"
                    if not is_purge
                    else f"purge-{index_id}-{import_ts}"
                )
                new_children.extend(
                    await self.load_import_job(index_id, import_job_name, is_purge)
                )
                new_children.extend(
                    await self.load_import_configmap(
                        index_id, import_job_name, spec.oid, data.children
                    )
                )
                status.state = "importing" if not is_purge else "purging"

            is_active = status.state in ("importing", "purging") or bool(
                data.related.get(CJS)
            )

            if redis:
                if not is_active:
                    is_active = await self.handle_redis_save(redis, status)
                else:
                    await self.handle_redis_update(redis, status, spec.id, data)

            elif not is_active and status.state == "saving":
                if await self.upload_redis_data(
                    new_children, redis_name, spec, status, data
                ):
                    status.state = "idle"

            else:
                status.state = "initing" if is_active else "idle"

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)

            # load redis pvc and/or redis pod itself
        if status.state != "idle":
            new_children.extend(
                await self.load_redis(index_id, redis_name, spec, is_active)
            )

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
        }

    async def handle_redis_save(self, redis: Redis, status: CollIndexStatus):
        """bgsave redis before shutting down, return true if finished saving"""
        # if have redis but don't need
        if status.state == "ready":
            try:
                await redis.bgsave()
            # pylint: disable=bare-except
            except:
                pass

            status.state = "saving"

        last_saved = await redis.lastsave()
        if last_saved and (
            not status.lastSavedRedis or last_saved > str_to_date(status.lastSavedRedis)
        ):
            status.lastSavedRedis = date_to_str(last_saved)
            return False

        return True

    async def handle_redis_update(
        self, redis: Redis, status: CollIndexStatus, coll_id: UUID, data: MCSyncData
    ):
        """update stats from ready, return ready if import jobs finished"""
        # attempt to set the last updated from redis when import is finished
        try:
            # index is now ready if no more child pods
            if status.state != "ready":
                last_update_ts = await redis.get("last_update_ts")
                if last_update_ts:
                    status.updated = last_update_ts

                if status.state == "initing":
                    await redis.config_set("appendonly", "yes")

                # index is now ready!
                if not data.children[JOB]:
                    status.state = "ready"
                    # resync_after = self.fast_retry

            # update db stats from redis
            stats = await redis.hgetall("allcounts")
            num_unique_urls = await redis.hlen("alldupes")
            await self.coll_ops.update_dedupe_index_stats(
                coll_id,
                DedupeIndexStats(
                    uniqueUrls=num_unique_urls, state=status.state, **stats
                ),
            )

        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)

        stats = await redis.hgetall("allcounts")
        num_unique_urls = await redis.hlen("alldupes")
        await self.coll_ops.update_dedupe_index_stats(
            coll_id,
            DedupeIndexStats(uniqueUrls=num_unique_urls, state=status.state, **stats),
        )

    def get_related(self, data: MCBaseRequest):
        """return crawljobs that use this dedupe index"""
        spec = data.parent.get("spec", {})
        coll_id = spec.get("id")

        related_resources = [
            {
                "apiVersion": BTRIX_API,
                "resource": "crawljobs",
                "labelSelector": {"matchLabels": {"dedupe_coll_id": coll_id}},
            }
        ]
        return {"relatedResources": related_resources}

    def get_import_or_purge_ts(self, spec: CollIndexSpec, status: CollIndexStatus):
        """return true if a reimport or purge is needed based on last import date
        or purge request data"""

        purge_request_date = str_to_date(spec.purgeRequestedAt)
        coll_update_date = str_to_date(spec.collItemsUpdatedAt)
        last_import_date = str_to_date(status.updated)

        # do a import with purge
        if purge_request_date:
            if not last_import_date or purge_request_date >= last_import_date:
                return re.sub(r"[^0-9]", "", spec.purgeRequestedAt), True

        if coll_update_date:
            # do update from 'coll_update_date' timestamp
            if not last_import_date or coll_update_date >= last_import_date:
                return re.sub(r"[^0-9]", "", spec.collItemsUpdatedAt), False

        return None, None

    async def load_redis(
        self,
        index_id: str,
        name: str,
        spec: CollIndexSpec,
        is_active: bool,
    ):
        """create redis pods from yaml template"""
        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = index_id
        params["init_redis"] = is_active

        params["init_data"] = True
        await self._fill_sync_params(spec, name, False, params)

        return self.load_from_yaml("redis.yaml", params)

    async def load_import_job(self, index_id: str, name: str, is_purging: bool):
        """create indexer pods from yaml template"""
        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = index_id
        params["crawler_image"] = self.crawl_config_ops.get_channel_crawler_image(
            self.dedupe_importer_channel
        )
        pull_policy = self.crawl_config_ops.get_channel_crawler_image_pull_policy(
            self.dedupe_importer_channel
        )
        if pull_policy:
            params["crawler_image_pull_policy"] = pull_policy

        params["is_purging"] = is_purging

        params["redis_url"] = self.k8s.get_redis_url("coll-" + index_id)

        return self.load_from_yaml("index-import-job.yaml", params)

    async def load_import_configmap(
        self, index_id: str, name: str, oid: UUID, children
    ):
        """create configmap for import job, lookup resources only on first init"""
        configmap = children[CMAP].get(name)
        # pylint: disable=duplicate-code
        if configmap and not self.is_configmap_update_needed("config.json", configmap):
            metadata = configmap["metadata"]
            configmap["metadata"] = {
                "name": metadata["name"],
                "namespace": metadata["namespace"],
                "labels": metadata["labels"],
            }
            return [configmap]

        replay_list = await self.coll_ops.get_internal_replay_list(UUID(index_id), oid)

        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = index_id
        params["config"] = replay_list.json()

        return self.load_from_yaml("index-import-configmap.yaml", params)

    # pylint: disable=too-many-arguments
    async def upload_redis_data(
        self,
        new_children,
        redis_name: str,
        spec: CollIndexSpec,
        status: CollIndexStatus,
        data: MCSyncData,
    ):
        """create sync job"""

        job = data.children[JOB].get("sync-up-" + str(spec.id))
        if job and job.get("status", {}).get("succeeded") == 1:
            status.syncUpTime = date_to_str(dt_now())

        if (
            status.syncUpTime
            and status.lastSavedRedis
            and status.syncUpTime >= status.lastSavedRedis
        ):
            return True

        params: dict[str, bool | str] = {}

        await self._fill_sync_params(spec, redis_name, True, params)

        new_children.extend(self.load_from_yaml("sync-local-remote-job.yaml", params))

        return False

    async def _fill_sync_params(
        self,
        spec: CollIndexSpec,
        redis_name: str,
        is_upload: bool,
        params: dict[str, bool | str],
    ):
        org = await self.coll_ops.orgs.get_org_by_id(spec.oid)
        oid = str(spec.oid)

        storage_secret = org.storage.get_storage_secret_name(oid)
        storage_path = org.storage.get_storage_extra_path(oid)

        storage = self.coll_ops.storage_ops.get_org_primary_storage(org)

        parts = urlsplit(storage.endpoint_url)
        endpoint_url = parts.scheme + "://" + parts.netloc

        params["storage_secret_name"] = storage_secret
        params["storage_endpoint"] = endpoint_url
        params["pvc_name"] = redis_name
        params["id"] = str(spec.id)
        params["is_upload"] = is_upload

        params["remote_file_path"] = (
            parts.path[1:] + storage_path + f"dedupe-index/{spec.id}.rdb"
        )
        params["local_file"] = "dump.rdb"
