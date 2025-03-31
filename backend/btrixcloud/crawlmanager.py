"""shared crawl manager implementation"""

import os
import secrets

from typing import Optional, Dict, Tuple
from datetime import timedelta

from fastapi import HTTPException

from .utils import dt_now, date_to_str
from .k8sapi import K8sAPI

from .models import StorageRef, CrawlConfig, BgJobType


# ============================================================================
DEFAULT_PROXY_ID: str = os.environ.get("DEFAULT_PROXY_ID", "")

DEFAULT_NAMESPACE: str = os.environ.get("DEFAULT_NAMESPACE", "default")


# ============================================================================
# pylint: disable=too-many-public-methods
class CrawlManager(K8sAPI):
    """abstract crawl manager"""

    # pylint: disable=too-many-arguments
    async def run_profile_browser(
        self,
        userid: str,
        oid: str,
        url: str,
        storage: StorageRef,
        crawler_image: str,
        image_pull_policy: str,
        baseprofile: str = "",
        profile_filename: str = "",
        proxy_id: str = "",
    ) -> str:
        """run browser for profile creation"""

        storage_secret = storage.get_storage_secret_name(oid)

        await self.has_storage_secret(storage_secret)

        browserid = f"prf-{secrets.token_hex(5)}"

        params = {
            "id": browserid,
            "userid": str(userid),
            "oid": str(oid),
            "storage_name": str(storage),
            "base_profile": baseprofile or "",
            "profile_filename": profile_filename or "",
            "idle_timeout": os.environ.get("IDLE_TIMEOUT", "60"),
            "url": url,
            "vnc_password": secrets.token_hex(16),
            "expire_time": date_to_str(dt_now() + timedelta(seconds=30)),
            "crawler_image": crawler_image,
            "image_pull_policy": image_pull_policy,
            "proxy_id": proxy_id or DEFAULT_PROXY_ID,
        }

        data = self.templates.env.get_template("profile_job.yaml").render(params)

        await self.create_from_yaml(data)

        return browserid

    async def run_replica_job(
        self,
        oid: str,
        job_type: str,
        replica_storage: StorageRef,
        replica_file_path: str,
        replica_endpoint: str,
        delay_days: int = 0,
        primary_storage: Optional[StorageRef] = None,
        primary_file_path: Optional[str] = None,
        primary_endpoint: Optional[str] = None,
        existing_job_id: Optional[str] = None,
    ) -> Tuple[str, Optional[str]]:
        """run job to replicate file from primary storage to replica storage"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            # Keep name shorter than in past to avoid k8s issues with length
            job_id = f"{job_type}-{secrets.token_hex(5)}"

        params: Dict[str, object] = {
            "id": job_id,
            "oid": oid,
            "job_type": job_type,
            "replica_secret_name": replica_storage.get_storage_secret_name(oid),
            "replica_file_path": replica_file_path,
            "replica_endpoint": replica_endpoint,
            "primary_secret_name": (
                primary_storage.get_storage_secret_name(oid)
                if primary_storage
                else None
            ),
            "primary_file_path": primary_file_path if primary_file_path else None,
            "primary_endpoint": primary_endpoint if primary_endpoint else None,
            "BgJobType": BgJobType,
        }

        if job_type == BgJobType.DELETE_REPLICA.value and delay_days > 0:
            # If replica deletion delay is configured, schedule as cronjob
            return await self.create_replica_deletion_scheduled_job(
                job_id, params, delay_days
            )

        data = self.templates.env.get_template("replica_job.yaml").render(params)

        await self.create_from_yaml(data)

        return job_id, None

    async def run_delete_org_job(
        self,
        oid: str,
        existing_job_id: Optional[str] = None,
    ) -> str:
        """run job to delete org and all of its data"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"delete-org-{oid}-{secrets.token_hex(5)}"

        return await self._run_bg_job_with_ops_classes(
            job_id, job_type=BgJobType.DELETE_ORG.value, oid=oid
        )

    async def run_recalculate_org_stats_job(
        self,
        oid: str,
        existing_job_id: Optional[str] = None,
    ) -> str:
        """run job to recalculate storage stats for the org"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"org-stats-{oid}-{secrets.token_hex(5)}"

        return await self._run_bg_job_with_ops_classes(
            job_id, job_type=BgJobType.RECALCULATE_ORG_STATS.value, oid=oid
        )

    async def run_re_add_org_pages_job(
        self,
        oid: str,
        crawl_type: Optional[str] = None,
        crawl_id: Optional[str] = None,
        existing_job_id: Optional[str] = None,
    ) -> str:
        """run job to recalculate storage stats for the org"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"org-pages-{oid}-{secrets.token_hex(5)}"

        return await self._run_bg_job_with_ops_classes(
            job_id,
            job_type=BgJobType.READD_ORG_PAGES.value,
            oid=oid,
            crawl_type=crawl_type,
            crawl_id=crawl_id,
        )

    async def run_optimize_pages_job(
        self, existing_job_id: Optional[str] = None, scale=1
    ) -> str:
        """run job to optimize crawl pages"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"optimize-pages-{secrets.token_hex(5)}"

        return await self._run_bg_job_with_ops_classes(
            job_id, job_type=BgJobType.OPTIMIZE_PAGES.value, scale=scale
        )

    async def _run_bg_job_with_ops_classes(
        self,
        job_id: str,
        job_type: str,
        oid: Optional[str] = None,
        **kwargs,
    ) -> str:
        """run background job with access to ops classes"""

        params = {
            "id": job_id,
            "job_type": job_type,
            "backend_image": os.environ.get("BACKEND_IMAGE", ""),
            "pull_policy": os.environ.get("BACKEND_IMAGE_PULL_POLICY", ""),
            "larger_resources": True,
            **kwargs,
        }
        if oid:
            params["oid"] = oid

        data = self.templates.env.get_template("background_job.yaml").render(params)

        await self.create_from_yaml(data, namespace=DEFAULT_NAMESPACE)

        return job_id

    async def create_crawl_job(
        self,
        crawlconfig: CrawlConfig,
        storage: StorageRef,
        userid: str,
        warc_prefix: str,
        storage_filename: str,
        profile_filename: str,
    ) -> str:
        """create new crawl job from config"""
        cid = str(crawlconfig.id)
        storage_secret = storage.get_storage_secret_name(str(crawlconfig.oid))

        await self.has_storage_secret(storage_secret)

        return await self.new_crawl_job(
            cid,
            userid,
            str(crawlconfig.oid),
            str(storage),
            crawlconfig.crawlerChannel,
            crawlconfig.scale,
            crawlconfig.crawlTimeout,
            crawlconfig.maxCrawlSize,
            manual=True,
            warc_prefix=warc_prefix,
            storage_filename=storage_filename,
            profile_filename=profile_filename,
            proxy_id=crawlconfig.proxyId or DEFAULT_PROXY_ID,
        )

    async def reload_running_crawl_config(self, crawl_id: str):
        """force reload of configmap for crawl"""
        return await self._patch_job(
            crawl_id, {"lastConfigUpdate": date_to_str(dt_now())}
        )

    async def create_qa_crawl_job(
        self,
        crawlconfig: CrawlConfig,
        storage: StorageRef,
        userid: str,
        storage_filename: str,
        qa_source: str,
    ) -> str:
        """create new QA Run crawl job with qa source crawl id"""
        cid = str(crawlconfig.id)

        storage_secret = storage.get_storage_secret_name(str(crawlconfig.oid))

        await self.has_storage_secret(storage_secret)

        ts_now = dt_now().strftime("%Y%m%d%H%M%S")
        crawl_id = f"qa-{ts_now}-{cid[:12]}"

        return await self.new_crawl_job(
            cid,
            userid,
            str(crawlconfig.oid),
            str(storage),
            crawlconfig.crawlerChannel,
            1,
            0,
            0,
            warc_prefix="qa",
            storage_filename=storage_filename,
            crawl_id=crawl_id,
            qa_source=qa_source,
        )

    async def remove_org_storage(self, storage: StorageRef, oid: str) -> bool:
        """Delete custom org storage secret"""
        storage_secret = storage.get_storage_secret_name(oid)
        storage_label = f"btrix.storage={storage_secret}"

        if await self.has_custom_jobs_with_label("crawljobs", storage_label):
            raise HTTPException(status_code=400, detail="storage_in_use")

        if await self.has_custom_jobs_with_label("profilejobs", storage_label):
            raise HTTPException(status_code=400, detail="storage_in_use")

        try:
            await self.core_api.delete_namespaced_secret(
                storage_secret,
                namespace=self.namespace,
            )
            return True
        # pylint: disable=bare-except
        except:
            return False

    async def add_org_storage(
        self, storage: StorageRef, string_data: Dict[str, str], oid: str
    ) -> None:
        """Add custom org storage secret"""
        labels = {"btrix.org": oid}

        storage_secret = storage.get_storage_secret_name(oid)

        crawl_secret = self.client.V1Secret(
            metadata={
                "name": storage_secret,
                "namespace": self.namespace,
                "labels": labels,
            },
            string_data=string_data,
        )

        try:
            await self.core_api.create_namespaced_secret(
                namespace=self.namespace, body=crawl_secret
            )

        # pylint: disable=bare-except
        except:
            await self.core_api.patch_namespaced_secret(
                name=storage_secret, namespace=self.namespace, body=crawl_secret
            )

    async def get_profile_browser_metadata(self, browserid: str) -> dict[str, str]:
        """get browser profile labels"""
        try:
            browser = await self.get_profile_browser(browserid)

        # pylint: disable=bare-except
        except:
            return {}

        return browser["metadata"]["labels"]

    async def ping_profile_browser(self, browserid: str) -> None:
        """return ping profile browser"""
        expire_at = dt_now() + timedelta(seconds=30)
        await self._patch_job(
            browserid, {"expireTime": date_to_str(expire_at)}, "profilejobs"
        )

    async def rollover_restart_crawl(self, crawl_id: str) -> dict:
        """Rolling restart of crawl by updating restartTime field"""
        update = date_to_str(dt_now())
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
    async def _delete_crawl_configs(self, label) -> None:
        """Delete any crawl config specific resources (now only cron jobs)"""

        await self.batch_api.delete_collection_namespaced_cron_job(
            namespace=self.namespace,
            label_selector=label,
        )

    async def update_scheduled_job(
        self, crawlconfig: CrawlConfig, userid: Optional[str] = None
    ) -> Optional[str]:
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
            "oid": str(crawlconfig.oid),
            "schedule": crawlconfig.schedule,
            "userid": userid,
        }

        data = self.templates.env.get_template("crawl_cron_job.yaml").render(params)

        await self.create_from_yaml(data, self.namespace)

        return cron_job_id

    async def create_replica_deletion_scheduled_job(
        self,
        job_id: str,
        params: Dict[str, object],
        delay_days: int,
    ) -> Tuple[str, Optional[str]]:
        """create scheduled job to delay replica file in x days"""
        now = dt_now()
        run_at = now + timedelta(days=delay_days)
        schedule = f"{run_at.minute} {run_at.hour} {run_at.day} {run_at.month} *"

        params["schedule"] = schedule

        print(f"Replica deletion cron schedule: '{schedule}'", flush=True)

        data = self.templates.env.get_template("replica_deletion_cron_job.yaml").render(
            params
        )

        await self.create_from_yaml(data, self.namespace)

        return job_id, schedule

    async def delete_replica_deletion_scheduled_job(self, job_id: str):
        """delete scheduled job to delay replica file in x days"""
        cron_job = await self.batch_api.read_namespaced_cron_job(
            name=job_id,
            namespace=self.namespace,
        )
        if cron_job:
            await self.batch_api.delete_namespaced_cron_job(
                name=cron_job.metadata.name, namespace=self.namespace
            )
