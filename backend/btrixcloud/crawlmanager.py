"""shared crawl manager implementation"""

import os
import secrets
from datetime import datetime, timedelta

import structlog
import yaml
from fastapi import HTTPException

from .auth import create_custom_jwt_token
from .k8sapi import ApiException, K8sAPI
from .models import (
    TYPE_INDEX_JOB_TYPES,
    BgJobType,
    CrawlConfig,
    ProfileBrowserMetadata,
    StorageRef,
)
from .utils import date_to_str, dt_now, scale_from_browser_windows

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# ============================================================================
DEFAULT_PROXY_ID: str = os.environ.get("DEFAULT_PROXY_ID", "")

DEFAULT_NAMESPACE: str = os.environ.get("DEFAULT_NAMESPACE", "default")

BACKEND_ORIGIN: str = os.environ.get("BACKEND_ORIGIN", "")


# ============================================================================
# pylint: disable=too-many-public-methods
class CrawlManager(K8sAPI):
    """abstract crawl manager"""

    # pylint: disable=too-many-arguments, too-many-locals
    async def run_profile_browser(
        self,
        userid: str,
        oid: str,
        url: str,
        storage: StorageRef,
        crawler_channel: str,
        crawler_image: str,
        image_pull_policy: str,
        baseprofile: str = "",
        profile_filename: str = "",
        profileid: str = "",
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
            "profileid": profileid,
            "idle_timeout": os.environ.get("IDLE_TIMEOUT", "60"),
            "url": url,
            "vnc_password": secrets.token_hex(16),
            "expire_time": date_to_str(dt_now() + timedelta(seconds=30)),
            "crawler_channel": crawler_channel,
            "crawler_image": crawler_image,
            "image_pull_policy": image_pull_policy,
            "proxy_id": proxy_id or DEFAULT_PROXY_ID,
        }

        data = self.templates.env.get_template("profile_job.yaml").render(params)

        await self.create_from_yaml(data)

        return browserid

    async def run_copy_bucket_job(
        self,
        primary_storage: StorageRef,
        replica_storage: StorageRef,
        primary_endpoint: str,
        primary_bucket_suffix: str,
        replica_endpoint: str,
        replica_bucket_suffix: str,
        existing_job_id: str | None = None,
    ) -> str:
        """run job to replicate primary storage bucket to replica location"""
        job_type = BgJobType.COPY_BUCKET.value

        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"{job_type}-{secrets.token_hex(5)}"

        params: dict[str, object] = {
            "id": job_id,
            "primary_secret_name": primary_storage.get_storage_secret_name(),
            "primary_file_path": primary_bucket_suffix,
            "primary_endpoint": primary_endpoint,
            "replica_secret_name": replica_storage.get_storage_secret_name(),
            "replica_file_path": replica_bucket_suffix,
            "replica_endpoint": replica_endpoint,
            "BgJobType": BgJobType,
        }

        data = self.templates.env.get_template("copy_bucket_job.yaml").render(params)

        await self.create_from_yaml(data)

        return job_id

    async def run_delete_org_files_job(
        self,
        storage_ref: StorageRef,
        storage_endpoint: str,
        org_files_prefix: str,
        oid: str,
        delay_days: int,
        existing_job_id: str | None = None,
    ) -> tuple[str, str | None]:
        """run job to delete files from org prefix in given storage"""
        job_type = BgJobType.DELETE_ORG_FILES

        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"{job_type}-{secrets.token_hex(5)}"

        params: dict[str, object] = {
            "id": job_id,
            "oid": oid,
            "job_type": job_type,
            "storage_secret_name": storage_ref.get_storage_secret_name(oid),
            "storage_endpoint": storage_endpoint,
            "org_files_prefix": org_files_prefix,
            "BgJobType": BgJobType,
        }

        if delay_days > 0:
            # If replica deletion delay is configured, schedule as cronjob
            return await self.create_scheduled_deletion_job(
                job_id, job_type, params, delay_days
            )

        data = self.templates.env.get_template("delete_org_files_job.yaml").render(
            params
        )

        await self.create_from_yaml(data)

        return job_id, None

    async def run_delete_replica_job(
        self,
        oid: str,
        replica_storage: StorageRef,
        replica_file_path: str,
        replica_endpoint: str,
        delay_days: int = 0,
        existing_job_id: str | None = None,
    ) -> tuple[str, str | None]:
        """run job to replicate file from primary storage to replica storage"""

        job_type = BgJobType.DELETE_REPLICA.value

        if existing_job_id:
            job_id = existing_job_id
        else:
            # Keep name shorter than in past to avoid k8s issues with length
            job_id = f"{job_type}-{secrets.token_hex(5)}"

        params: dict[str, object] = {
            "id": job_id,
            "oid": oid,
            "job_type": job_type,
            "replica_secret_name": replica_storage.get_storage_secret_name(oid),
            "replica_file_path": replica_file_path,
            "replica_endpoint": replica_endpoint,
            "BgJobType": BgJobType,
        }

        if delay_days > 0:
            # If replica deletion delay is configured, schedule as cronjob
            return await self.create_scheduled_deletion_job(
                job_id, job_type, params, delay_days
            )

        data = self.templates.env.get_template("delete_replica_job.yaml").render(params)

        await self.create_from_yaml(data)

        return job_id, None

    async def run_delete_org_job(
        self,
        oid: str,
        existing_job_id: str | None = None,
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
        existing_job_id: str | None = None,
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
        crawl_type: str | None = None,
        crawl_id: str | None = None,
        existing_job_id: str | None = None,
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
        self, existing_job_id: str | None = None, scale=1
    ) -> str:
        """run job to optimize crawl pages"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"optimize-pages-{secrets.token_hex(5)}"

        return await self._run_bg_job_with_ops_classes(
            job_id, job_type=BgJobType.OPTIMIZE_PAGES.value, scale=scale
        )

    async def run_update_coll_stats_job(
        self,
        oid: str,
        collection_id: str,
        existing_job_id: str | None = None,
    ) -> str:
        """run job to update collection stats"""

        if existing_job_id:
            job_id = existing_job_id
        else:
            # Ensures we only get one concurrent update job per collection
            job_id = f"update-coll-{collection_id}"

        return await self._run_bg_job_with_ops_classes(
            job_id,
            job_type=BgJobType.UPDATE_COLL_STATS.value,
            oid=oid,
            collection_id=collection_id,
        )

    async def run_postprocess_upload_job(
        self,
        oid: str,
        crawl_id: str,
        existing_job_id: str | None = None,
    ) -> str:
        """run job to post-process uploaded crawl"""
        if existing_job_id:
            job_id = existing_job_id
        else:
            job_id = f"postprocess-upload-{crawl_id}"

        return await self._run_bg_job_with_ops_classes(
            job_id,
            job_type=BgJobType.POSTPROCESS_UPLOAD.value,
            oid=oid,
            crawl_type="upload",
            crawl_id=crawl_id,
        )

    async def _run_bg_job_with_ops_classes(
        self,
        job_id: str,
        job_type: str,
        oid: str | None = None,
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

    async def run_index_import_job(
        self,
        coll_id: str,
        oid: str,
        image: str,
        image_pull_policy: str,
        job_type: TYPE_INDEX_JOB_TYPES,
        crawl_id: str | None = None,
    ):
        """create dedupe index import/purge/post-crawl job"""

        # create unique import job or fixed purge job, as can only have one purge job
        # at a time
        name = (
            f"{job_type}-index-{coll_id}-{secrets.token_hex(5)}"
            if job_type != "purge"
            else f"purge-index-{coll_id}"
        )

        if job_type in ("purge", "import"):
            auth_bearer = create_custom_jwt_token(
                coll_id, {"sub_type": "coll", "scope_type": "job", "scope": name}
            )
            import_source_url = (
                f"{BACKEND_ORIGIN}/api/orgs/{oid}/collections/{coll_id}"
                + f"/internal/replay.json?auth_bearer={auth_bearer}"
            )
        else:
            import_source_url = ""

        params = {
            "name": name,
            "id": coll_id,
            "oid": oid,
            "crawler_image": image,
            "crawler_image_pull_policy": image_pull_policy,
            "job_type": job_type,
            "redis_url": self.get_redis_url("coll-" + str(coll_id)),
            "crawl_id": crawl_id,
            "import_source_url": import_source_url,
        }

        data = self.templates.env.get_template("index-import-job.yaml").render(params)

        try:
            await self.create_from_yaml(data)

        # pylint: disable=duplicate-code
        except ApiException as e:
            # 409 if object already exists
            if e.status != 409:
                raise

            raise HTTPException(
                status_code=400, detail="purge_job_already_running"
            ) from e

        return name

    async def validate_k8s_obj_exists(self, obj_type: str, name: str) -> bool:
        """return true/false if specified k8s object exists"""
        if obj_type == "job":
            return await self.has_job(name)

        return False

    async def delete_dedupe_index_resources(self, oid: str, coll_id: str) -> None:
        """Delete dedupe index-related jobs and index itself"""
        await self._delete_jobs(f"role=index-import-job,oid={oid},coll={coll_id}")

        await self.delete_custom_object(f"collindex-{coll_id}", "collindexes")

    async def ensure_cleanup_seed_file_cron_job_exists(self):
        """ensure cron background job to clean up unused seed files weekly exists"""

        # Default schedule is midnight every Sunday
        default_schedule = "0 0 * * 0"
        job_schedule = os.environ.get("CLEANUP_JOB_CRON_SCHEDULE", default_schedule)

        await self._ensure_bg_cron_job_exists(
            "cleanup-seed-files-cron",
            BgJobType.CLEANUP_SEED_FILES.value,
            job_schedule,
            larger_resources=True,
        )

    async def ensure_retry_stuck_uploads_cron_job_exists(
        self, disable_job: bool = False
    ):
        """ensure cron background job to retry stuck uploads exists"""

        default_schedule = "0 * * * *"
        job_schedule = os.environ.get(
            "RETRY_STUCK_UPLOADS_CRON_SCHEDULE", default_schedule
        )

        job_id = "retry-stuck-uploads-cron"

        if not disable_job:
            return await self._ensure_bg_cron_job_exists(
                job_id,
                BgJobType.RETRY_STUCK_UPLOADS.value,
                job_schedule,
            )

        # If no replica locations are configured, make sure no replication cron
        # job exists, as one could have been previously configured.
        logger.info("bg_cron_job_deleting", job_id=job_id, disable_job=True)
        await self._delete_cron_job_if_exists(job_id)

    async def ensure_file_replication_cron_job_exists(
        self, replicas_configured: bool = False
    ):
        """ensure cron background job to replica default storages exists"""

        # Default schedule is every 2 hours
        default_schedule = "0 */2 * * *"
        job_schedule = os.environ.get("REPLICATION_JOB_CRON_SCHEDULE", default_schedule)

        job_id = "replicate-files-cron"

        if replicas_configured:
            return await self._ensure_bg_cron_job_exists(
                job_id,
                BgJobType.REPLICATE_FILES_CRON.value,
                job_schedule,
            )

        # If no replica locations are configured, make sure no replication cron
        # job exists, as one could have been previously configured.
        logger.info("bg_cron_job_deleting", job_id=job_id, replicas_configured=False)
        await self._delete_cron_job_if_exists(job_id)

    async def _ensure_bg_cron_job_exists(
        self,
        job_id: str,
        job_type: str,
        job_schedule: str,
        larger_resources: bool = False,
    ):
        """ensure cron background job with given schedule exists, creating or
        updating it if needed"""

        cron_logger = logger.bind(job_id=job_id, schedule=job_schedule)

        params = {
            "id": job_id,
            "job_type": job_type,
            "backend_image": os.environ.get("BACKEND_IMAGE", ""),
            "pull_policy": os.environ.get("BACKEND_IMAGE_PULL_POLICY", ""),
            "schedule": job_schedule,
            "larger_resources": larger_resources,
        }

        data = self.templates.env.get_template("background_cron_job.yaml").render(
            params
        )

        try:
            await self.batch_api.read_namespaced_cron_job(
                name=job_id,
                namespace=DEFAULT_NAMESPACE,
            )
        except ApiException as exc:
            if exc.status != 404:
                raise
        else:
            # Replace with the freshly rendered cron job so that schedule
            # and template changes are applied on backend restart
            cron_logger.info("bg_cron_job_updating")
            await self.batch_api.replace_namespaced_cron_job(
                name=job_id,
                namespace=DEFAULT_NAMESPACE,
                body=yaml.safe_load(data),
            )
            return

        cron_logger.info("bg_cron_job_creating")
        await self.create_from_yaml(data, namespace=DEFAULT_NAMESPACE)

    async def _delete_cron_job_if_exists(self, job_id: str):
        """Delete cron job by id if it exists"""
        try:
            await self.batch_api.delete_namespaced_cron_job(
                name=job_id,
                namespace=DEFAULT_NAMESPACE,
            )
        except ApiException as exc:
            if exc.status != 404:
                raise

    async def create_crawl_job(
        self,
        crawlconfig: CrawlConfig,
        storage: StorageRef,
        userid: str,
        warc_prefix: str,
        storage_filename: str,
        profile_filename: str,
        profileid: str,
        is_single_page: bool,
        seed_file_url: str,
    ) -> str:
        """create new crawl job from config"""
        cid = str(crawlconfig.id)
        storage_secret = storage.get_storage_secret_name(str(crawlconfig.oid))

        await self.has_storage_secret(storage_secret)

        scale = scale_from_browser_windows(crawlconfig.browserWindows)

        return await self.new_crawl_job(
            cid,
            userid,
            str(crawlconfig.oid),
            str(storage),
            crawlconfig.crawlerChannel,
            scale,
            crawlconfig.browserWindows,
            crawlconfig.crawlTimeout,
            crawlconfig.maxCrawlSize,
            manual=True,
            warc_prefix=warc_prefix,
            storage_filename=storage_filename,
            profile_filename=profile_filename,
            profileid=profileid,
            proxy_id=crawlconfig.proxyId or DEFAULT_PROXY_ID,
            dedupe_coll_id=(
                str(crawlconfig.dedupeCollId) if crawlconfig.dedupeCollId else ""
            ),
            is_single_page=is_single_page,
            seed_file_url=seed_file_url,
        )

    async def reload_running_crawl_config(self, crawl_id: str):
        """force reload of configmap for crawl"""
        return await self._patch_job(
            crawl_id, {"lastConfigUpdate": date_to_str(dt_now())}
        )

    async def update_running_crawl_config(
        self, crawl_id: str, crawlconfig: CrawlConfig
    ):
        """force update of config for running crawl"""
        time_now = date_to_str(dt_now())

        # pylint: disable=use-dict-literal
        patch = dict(
            crawlerChannel=crawlconfig.crawlerChannel,
            scale=scale_from_browser_windows(crawlconfig.browserWindows),
            browserWindows=crawlconfig.browserWindows,
            timeout=crawlconfig.crawlTimeout,
            maxCrawlSize=crawlconfig.maxCrawlSize,
            proxyId=crawlconfig.proxyId or DEFAULT_PROXY_ID,
            lastConfigUpdate=time_now,
            restartTime=time_now,
        )

        return await self._patch_job(crawl_id, patch)

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
        self, storage: StorageRef, string_data: dict[str, str], oid: str
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

    async def get_profile_browser_metadata(
        self, browserid: str
    ) -> ProfileBrowserMetadata:
        """get browser profile metadata from labels"""
        browser = await self.get_profile_browser(browserid)

        metadata = browser["metadata"]["labels"]

        metadata["committing"] = browser.get("spec", {}).get("committing")

        return ProfileBrowserMetadata(**metadata)

    async def keep_alive_profile_browser(self, browserid: str, committing="") -> None:
        """update profile browser to not expire"""
        expire_at = dt_now() + timedelta(seconds=30)

        update = {"expireTime": date_to_str(expire_at)}
        if committing:
            update["committing"] = committing

        await self._patch_job(browserid, update, "profilejobs")

    async def rollover_restart_crawl(self, crawl_id: str) -> dict:
        """Rolling restart of crawl by updating restartTime field"""
        update = date_to_str(dt_now())
        return await self._patch_job(crawl_id, {"restartTime": update})

    async def scale_crawl(
        self, crawl_id: str, scale: int = 1, browser_windows: int = 1
    ) -> dict:
        """Set the crawl scale (job parallelism) on the specified job"""
        return await self._patch_job(
            crawl_id, {"scale": scale, "browserWindows": browser_windows}
        )

    async def shutdown_crawl(self, crawl_id: str, graceful=True) -> dict:
        """Request a crawl cancelation or stop by calling an API
        on the job pod/container, returning the result"""
        if graceful:
            patch = {"stopping": True}
            return await self._patch_job(crawl_id, patch)

        return await self.delete_crawl_job(crawl_id)

    async def pause_resume_crawl(
        self, crawl_id: str, paused_at: datetime | None = None
    ) -> dict:
        """pause or resume a crawl"""
        return await self._patch_job(
            crawl_id, {"pausedAt": date_to_str(paused_at) if paused_at else ""}
        )

    async def get_running_background_job_count(self, labels: str) -> int:
        """return count of background jobs matching labels"""
        resp = await self.batch_api.list_namespaced_job(
            namespace=DEFAULT_NAMESPACE,
            label_selector=f"role=background-job,{labels}",
        )
        items = resp.items or []
        return len(items)

    async def delete_k8s_resources_for_org(self, oid_str: str) -> None:
        """Delete all k8s resources related to org's crawls and profiles

        Do not delete batch or cron jobs, as we don't want to interfere
        with any ongoing or scheduled file deletion jobs, and org-specific
        cron jobs will be cleaned up in the operator on completion.
        """
        await self.delete_crawl_config_cron_jobs_for_org(oid_str)
        await self.delete_crawl_jobs_for_org(oid_str)
        await self.delete_profile_jobs_for_org(oid_str)

    async def delete_crawl_config_by_id(self, cid: str) -> None:
        """Delete all crawl configs by id"""
        await self._delete_cron_jobs(f"btrix.crawlconfig={cid},role=cron-job")

    async def delete_crawl_config_cron_jobs_for_org(self, oid_str: str) -> None:
        """Delete all crawl configs for given org"""
        await self._delete_cron_jobs(f"btrix.org={oid_str},role=cron-job")

    # ========================================================================
    # Internal Methods
    async def delete_crawl_jobs_for_org(self, oid_str: str) -> None:
        """Delete all crawl jobs for given org"""
        await self._delete_custom_objects(f"btrix.org={oid_str}", plural="crawljobs")

    async def delete_profile_jobs_for_org(self, oid_str: str) -> None:
        """Delete all browser profile jobs for given org"""
        await self._delete_custom_objects(f"btrix.org={oid_str}", plural="profilejobs")

    async def update_scheduled_job(
        self, crawlconfig: CrawlConfig, userid: str | None = None
    ) -> str | None:
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

    async def create_scheduled_deletion_job(
        self,
        job_id: str,
        job_type: str,
        params: dict[str, object],
        delay_days: int,
    ) -> tuple[str, str | None]:
        """create scheduled job to delay replica file in x days"""
        now = dt_now()
        run_at = now + timedelta(days=delay_days)
        schedule = f"{run_at.minute} {run_at.hour} {run_at.day} {run_at.month} *"

        params["schedule"] = schedule

        if job_type == BgJobType.DELETE_REPLICA:
            template_name = "delete_replica_cron_job.yaml"
        elif job_type == BgJobType.DELETE_ORG_FILES:
            template_name = "delete_org_files_cron_job.yaml"
        else:
            raise HTTPException(status_code=400, detail="invalid_job_type")

        logger.debug(
            "replica_deletion_cron_schedule",
            job_id=job_id,
            job_type=job_type,
            delay_days=delay_days,
            schedule=schedule,
        )

        data = self.templates.env.get_template(template_name).render(params)

        await self.create_from_yaml(data, self.namespace)

        return job_id, schedule

    async def delete_scheduled_deletion_job(self, job_id: str):
        """delete scheduled job that temporarily existed to delay replica deletion"""
        cron_job = await self.batch_api.read_namespaced_cron_job(
            name=job_id,
            namespace=self.namespace,
        )
        if cron_job:
            await self.batch_api.delete_namespaced_cron_job(
                name=cron_job.metadata.name, namespace=self.namespace
            )
