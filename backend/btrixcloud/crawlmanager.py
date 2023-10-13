""" shared crawl manager implementation """

import os
import asyncio
import secrets
import json

from typing import Optional
from datetime import timedelta

from kubernetes_asyncio.client import V1ConfigMap

from .k8sapi import K8sAPI
from .utils import dt_now, to_k8s_date

from .models import StorageRef, CrawlConfig, UpdateCrawlConfig


# ============================================================================
class CrawlManager(K8sAPI):
    """abstract crawl manager"""

    def __init__(self):
        super().__init__()

        self.loop = asyncio.get_running_loop()

    # pylint: disable=too-many-arguments
    async def run_profile_browser(
        self,
        userid: str,
        oid: str,
        url: str,
        storage: StorageRef,
        baseprofile: str = "",
        profile_filename: str = "",
    ) -> str:
        """run browser for profile creation"""

        storage_name, storage_path = await self.get_valid_storage_refs(storage, oid)

        browserid = f"prf-{secrets.token_hex(5)}"

        params = {
            "id": browserid,
            "userid": str(userid),
            "oid": str(oid),
            "storage_name": storage_name,
            "storage_path": storage_path or "",
            "base_profile": baseprofile or "",
            "profile_filename": profile_filename or "",
            "idle_timeout": os.environ.get("IDLE_TIMEOUT", "60"),
            "url": url,
            "vnc_password": secrets.token_hex(16),
            "expire_time": to_k8s_date(dt_now() + timedelta(seconds=30)),
        }

        data = self.templates.env.get_template("profile_job.yaml").render(params)

        await self.create_from_yaml(data)

        return browserid

    async def add_crawl_config(
        self,
        crawlconfig: CrawlConfig,
        storage: StorageRef,
        run_now: bool,
        out_filename: str,
        profile_filename: str,
    ) -> Optional[str]:
        """add new crawl, store crawl config in configmap"""

        storage_name, storage_path = await self.get_valid_storage_refs(
            storage, str(crawlconfig.oid)
        )

        # Create Config Map
        await self._create_config_map(
            crawlconfig,
            USER_ID=str(crawlconfig.modifiedBy),
            ORG_ID=str(crawlconfig.oid),
            CRAWL_CONFIG_ID=str(crawlconfig.id),
            STORE_PATH=storage_path,
            STORE_FILENAME=out_filename,
            STORAGE_NAME=storage_name,
            PROFILE_FILENAME=profile_filename,
            INITIAL_SCALE=str(crawlconfig.scale),
            CRAWL_TIMEOUT=str(crawlconfig.crawlTimeout or 0),
            MAX_CRAWL_SIZE=str(crawlconfig.maxCrawlSize or 0)
            # REV=str(crawlconfig.rev),
        )

        crawl_id = None

        if run_now:
            crawl_id = await self.create_crawl_job(
                crawlconfig, str(crawlconfig.modifiedBy)
            )

        await self._update_scheduled_job(crawlconfig)

        return crawl_id

    async def create_crawl_job(self, crawlconfig: CrawlConfig, userid: str) -> str:
        """create new crawl job from config"""
        cid = str(crawlconfig.id)

        return await self.new_crawl_job(
            cid,
            userid,
            crawlconfig.oid,
            crawlconfig.scale,
            crawlconfig.crawlTimeout,
            crawlconfig.maxCrawlSize,
            manual=True,
        )

    async def update_crawl_config(
        self, crawlconfig: CrawlConfig, update: UpdateCrawlConfig, profile_filename=None
    ) -> bool:
        """Update the schedule or scale for existing crawl config"""

        has_sched_update = update.schedule is not None
        has_scale_update = update.scale is not None
        has_timeout_update = update.crawlTimeout is not None
        has_max_crawl_size_update = update.maxCrawlSize is not None
        has_config_update = update.config is not None

        if has_sched_update:
            # crawlconfig here has already been updated
            await self._update_scheduled_job(crawlconfig)

        if (
            has_scale_update
            or has_config_update
            or has_timeout_update
            or profile_filename
            or has_max_crawl_size_update
        ):
            await self._update_config_map(
                crawlconfig,
                update,
                profile_filename,
                has_config_update,
            )

        return True

    async def get_valid_storage_refs(
        self, storage: StorageRef, oid: str
    ) -> tuple[str, str]:
        """return storage name and path, also validate that
        storage secret exists"""
        if not storage.custom:
            storage_name = f"storage-{storage.name}"
            storage_path = str(oid)
        else:
            storage_name = self._get_custom_storage_name(storage.name, oid)
            storage_path = ""

        await self.has_storage(storage_name)

        return storage_name, storage_path

    async def has_storage(self, storage_name) -> bool:
        """Check if storage is valid by trying to get the storage secret
        Will throw if not valid, otherwise return True"""
        try:
            await self.core_api.read_namespaced_secret(
                storage_name,
                namespace=self.namespace,
            )
            return True

        # pylint: disable=broad-except
        except Exception:
            # pylint: disable=broad-exception-raised,raise-missing-from
            raise Exception(f"Storage {storage_name} not found")

    def _get_custom_storage_name(self, name: str, oid: str) -> str:
        return f"cs-{oid[:12]}-{name}"

    async def remove_org_storage(self, name: str, oid: str) -> bool:
        """Delete custom org storage secret"""
        org_storage_name = self._get_custom_storage_name(name, oid)
        try:
            await self.core_api.delete_namespaced_secret(
                org_storage_name,
                namespace=self.namespace,
            )
            return True
        # pylint: disable=bare-except
        except:
            return False

    async def add_org_storage(self, name, oid, storage) -> None:
        """Add custom org storage secret"""
        labels = {"btrix.org": oid}

        org_storage_name = self._get_custom_storage_name(name, oid)

        crawl_secret = self.client.V1Secret(
            metadata={
                "name": org_storage_name,
                "namespace": self.namespace,
                "labels": labels,
            },
            string_data={
                "STORE_ENDPOINT_URL": storage.endpoint_url,
                "STORE_ACCESS_KEY": storage.access_key,
                "STORE_SECRET_KEY": storage.secret_key,
            },
        )

        try:
            await self.core_api.create_namespaced_secret(
                namespace=self.namespace, body=crawl_secret
            )

        # pylint: disable=bare-except
        except:
            await self.core_api.patch_namespaced_secret(
                name=org_storage_name, namespace=self.namespace, body=crawl_secret
            )

    async def get_profile_browser_metadata(self, browserid: str) -> dict[str, str]:
        """get browser profile labels"""
        try:
            browser = await self.get_profile_browser(browserid)

        # pylint: disable=bare-except
        except:
            return {}

        return browser["metadata"]["labels"]

    async def get_configmap(self, cid: str) -> V1ConfigMap:
        """get configmap by id"""
        return await self.core_api.read_namespaced_config_map(
            name=f"crawl-config-{cid}", namespace=self.namespace
        )

    async def ping_profile_browser(self, browserid: str) -> None:
        """return ping profile browser"""
        expire_at = dt_now() + timedelta(seconds=30)
        await self._patch_job(
            browserid, {"expireTime": to_k8s_date(expire_at)}, "profilejobs"
        )

    async def rollover_restart_crawl(self, crawl_id: str) -> dict:
        """Rolling restart of crawl by updating restartTime field"""
        update = to_k8s_date(dt_now())
        return await self._patch_job(crawl_id, {"restartTime": update})

    async def scale_crawl(self, crawl_id: str, scale: int = 1) -> dict:
        """Set the crawl scale (job parallelism) on the specified job"""
        return await self._patch_job(crawl_id, {"scale": scale})

    async def shutdown_crawl(self, crawl_id: str, graceful=True) -> dict:
        """Request a crawl cancelation or stop by calling an API
        on the job pod/container, returning the result"""
        if graceful:
            patch = {"stopping": True}
            return await self._patch_job(crawl_id, patch)

        return await self.delete_crawl_job(crawl_id)

    async def delete_crawl_configs_for_org(self, org: str) -> None:
        """Delete all crawl configs for given org"""
        await self._delete_crawl_configs(f"btrix.org={org}")

    async def delete_crawl_config_by_id(self, cid: str) -> None:
        """Delete all crawl configs by id"""
        await self._delete_crawl_configs(f"btrix.crawlconfig={cid}")

    # ========================================================================
    # Internal Methods
    async def _create_config_map(self, crawlconfig: CrawlConfig, **data) -> None:
        """Create Config Map based on CrawlConfig"""
        data["crawl-config.json"] = json.dumps(crawlconfig.get_raw_config())

        labels = {
            "btrix.crawlconfig": str(crawlconfig.id),
            "btrix.org": str(crawlconfig.oid),
        }

        config_map = self.client.V1ConfigMap(
            metadata={
                "name": f"crawl-config-{crawlconfig.id}",
                "namespace": self.namespace,
                "labels": labels,
            },
            data=data,
        )

        await self.core_api.create_namespaced_config_map(
            namespace=self.namespace, body=config_map
        )

    async def _delete_crawl_configs(self, label) -> None:
        """Delete Crawl Cron Job and all dependent resources, including configmap and secrets"""

        await self.batch_api.delete_collection_namespaced_cron_job(
            namespace=self.namespace,
            label_selector=label,
        )

        await self.core_api.delete_collection_namespaced_config_map(
            namespace=self.namespace,
            label_selector=label,
        )

    async def _update_scheduled_job(self, crawlconfig: CrawlConfig) -> Optional[str]:
        """create or remove cron job based on crawlconfig schedule"""
        cid = str(crawlconfig.id)

        cron_job_id = f"sched-{cid[:12]}"
        cron_job = None
        try:
            cron_job = await self.batch_api.read_namespaced_cron_job(
                name=cron_job_id,
                namespace=self.namespace,
            )
        # pylint: disable=bare-except
        except:
            pass

        # if no schedule, delete cron_job if exists and we're done
        if not crawlconfig.schedule:
            if cron_job:
                await self.batch_api.delete_namespaced_cron_job(
                    name=cron_job.metadata.name, namespace=self.namespace
                )
            return None

        # if cron job exists, just patch schedule
        if cron_job:
            if crawlconfig.schedule != cron_job.spec.schedule:
                cron_job.spec.schedule = crawlconfig.schedule

                await self.batch_api.patch_namespaced_cron_job(
                    name=cron_job.metadata.name,
                    namespace=self.namespace,
                    body=cron_job,
                )
            return None

        params = {
            "id": cron_job_id,
            "cid": str(crawlconfig.id),
            "schedule": crawlconfig.schedule,
        }

        data = self.templates.env.get_template("crawl_cron_job.yaml").render(params)

        await self.create_from_yaml(data, self.namespace)

        return cron_job_id

    async def _update_config_map(
        self,
        crawlconfig: CrawlConfig,
        update: UpdateCrawlConfig,
        profile_filename: Optional[str] = None,
        update_config: bool = False,
    ) -> None:
        config_map = await self.get_configmap(str(crawlconfig.id))

        if update.scale is not None:
            config_map.data["INITIAL_SCALE"] = str(update.scale)

        if update.crawlTimeout is not None:
            config_map.data["CRAWL_TIMEOUT"] = str(update.crawlTimeout)

        if update.maxCrawlSize is not None:
            config_map.data["MAX_CRAWL_SIZE"] = str(update.maxCrawlSize)

        if update.crawlFilenameTemplate is not None:
            config_map.data["STORE_FILENAME"] = update.crawlFilenameTemplate

        if profile_filename is not None:
            config_map.data["PROFILE_FILENAME"] = profile_filename

        if update_config:
            config_map.data["crawl-config.json"] = json.dumps(
                crawlconfig.get_raw_config()
            )

        await self.core_api.patch_namespaced_config_map(
            name=config_map.metadata.name, namespace=self.namespace, body=config_map
        )
