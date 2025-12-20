"""Operator handler for CollIndexes"""

import re
import os

from uuid import UUID
from pydantic import BaseModel

from btrixcloud.utils import str_to_date
from btrixcloud.models import TYPE_DEDUPE_INDEX_STATES, DedupeIndexStats

from .models import MCSyncData, POD, JOB, CMAP
from .baseoperator import BaseOperator


# ============================================================================
class CollIndexStatus(BaseModel):
    """CollIndex Status"""

    state: TYPE_DEDUPE_INDEX_STATES = "initing"

    updated: str = ""


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
        self.shared_params["init_redis"] = True
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

    # pylint: disable=too-many-locals
    async def sync_index(self, data: MCSyncData):
        """sync CollIndex object with existing state"""
        spec = CollIndexSpec(**data.parent.get("spec", {}))
        status = CollIndexStatus(**data.parent.get("status", {}))
        resync_after = None

        if data.finalizing:
            # allow deletion
            return {"status": status.dict(), "children": [], "finalized": True}

        index_id = str(spec.id)
        redis_name = "redis-coll-" + index_id
        new_children = self.load_redis(index_id, redis_name)

        redis = None
        if redis_name in data.children[POD]:
            redis = await self.k8s.get_redis_connected("coll-" + index_id)
        else:
            status.state = "initing"

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

        if redis:
            # attempt to set the last updated from redis when import is finished
            try:
                # index is now ready if no more child pods
                if status.state != "ready":
                    last_update_ts = await redis.get("last_update_ts")
                    if last_update_ts:
                        status.updated = last_update_ts

                    # index is now ready!
                    if not data.children[JOB]:
                        status.state = "ready"
                        resync_after = self.fast_retry

                # update db stats from redis
                stats = await redis.hgetall("allcounts")
                num_unique_urls = await redis.hlen("alldupes")
                await self.coll_ops.update_dedupe_index_stats(
                    spec.id,
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
                spec.id,
                DedupeIndexStats(
                    uniqueUrls=num_unique_urls, state=status.state, **stats
                ),
            )

        return {
            "status": status.dict(exclude_none=True),
            "children": new_children,
            "resyncAfterSeconds": resync_after,
        }

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

    def load_redis(self, index_id: str, name: str):
        """create redis pods from yaml template"""
        params = {}
        params.update(self.shared_params)
        params["name"] = name
        params["id"] = index_id

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
