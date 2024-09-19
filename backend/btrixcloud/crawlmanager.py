""" shared crawl manager implementation """

import os
import asyncio
import secrets

from typing import Optional, Dict
from datetime import timedelta

from fastapi import HTTPException

from .utils import dt_now, date_to_str
from .k8sapi import K8sAPI

from .models import StorageRef, CrawlConfig, BgJobType


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
        crawler_image: str,
        baseprofile: str = "",
        profile_filename: str = "",
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
        primary_storage: Optional[StorageRef] = None,
        primary_file_path: Optional[str] = None,
        primary_endpoint: Optional[str] = None,
        job_id_prefix: Optional[str] = None,
        existing_job_id: Optional[str] = None,
    ):
        """run job to replicate file from primary storage to replica storage"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            if not job_id_prefix:
                job_id_prefix = job_type

            # ensure name is <=63 characters
            job_id = f"{job_id_prefix[:52]}-{secrets.token_hex(5)}"

        params = {
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

        data = self.templates.env.get_template("replica_job.yaml").render(params)

        await self.create_from_yaml(data)

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
