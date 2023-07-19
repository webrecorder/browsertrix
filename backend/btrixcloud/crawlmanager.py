""" shared crawl manager implementation """

import os
import asyncio
import secrets
import json
import base64

from datetime import timedelta

from .k8sapi import K8sAPI
from .models import S3Storage
from .utils import dt_now, to_k8s_date


# ============================================================================
class CrawlManager(K8sAPI):
    """abstract crawl manager"""

    def __init__(self):
        super().__init__()
        self.job_image = os.environ["JOB_IMAGE"]
        self.job_image_pull_policy = os.environ.get("JOB_PULL_POLICY", "Always")

        self.cron_namespace = os.environ.get("CRON_NAMESPACE", "default")

        self._default_storages = {}

        self.loop = asyncio.get_running_loop()

    # pylint: disable=too-many-arguments
    async def run_profile_browser(
        self,
        userid,
        oid,
        url,
        storage=None,
        storage_name=None,
        baseprofile=None,
        profile_path=None,
    ):
        """run browser for profile creation"""

        # if default storage, use name and path + profiles/
        if storage:
            storage_name = storage.name
            storage_path = storage.path + "profiles/"
        # otherwise, use storage name and existing path from secret
        else:
            storage_path = ""

        await self.check_storage(storage_name)

        browserid = f"prf-{secrets.token_hex(5)}"

        params = {
            "id": browserid,
            "userid": str(userid),
            "oid": str(oid),
            "storage_name": storage_name,
            "storage_path": storage_path or "",
            "base_profile": baseprofile or "",
            "profile_filename": profile_path,
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
        crawlconfig,
        storage,
        run_now,
        out_filename,
        profile_filename,
    ):
        """add new crawl, store crawl config in configmap"""

        if storage.type == "default":
            storage_name = storage.name
            storage_path = storage.path
        else:
            storage_name = str(crawlconfig.oid)
            storage_path = ""

        await self.check_storage(storage_name)

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
            CRAWL_TIMEOUT=str(crawlconfig.crawlTimeout or 0)
            # REV=str(crawlconfig.rev),
        )

        crawl_id = None

        if run_now:
            crawl_id = await self.create_crawl_job(
                crawlconfig, str(crawlconfig.modifiedBy)
            )

        await self._update_scheduled_job(crawlconfig, crawlconfig.schedule)

        return crawl_id

    async def create_crawl_job(self, crawlconfig, userid: str):
        """create new crawl job from config"""
        cid = str(crawlconfig.id)

        return await self.new_crawl_job(
            cid,
            userid,
            crawlconfig.oid,
            crawlconfig.scale,
            crawlconfig.crawlTimeout,
            manual=True,
        )

    async def update_crawl_config(self, crawlconfig, update, profile_filename=None):
        """Update the schedule or scale for existing crawl config"""

        has_sched_update = update.schedule is not None
        has_scale_update = update.scale is not None
        has_timeout_update = update.crawlTimeout is not None
        has_config_update = update.config is not None

        if has_sched_update:
            await self._update_scheduled_job(crawlconfig, update.schedule)

        if (
            has_scale_update
            or has_config_update
            or has_timeout_update
            or profile_filename
        ):
            await self._update_config_map(
                crawlconfig,
                update,
                profile_filename,
                has_config_update,
            )

        return True

    # pylint: disable=unused-argument
    async def check_storage(self, storage_name, is_default=False):
        """Check if storage is valid by trying to get the storage secret
        Will throw if not valid, otherwise return True"""
        await self._get_storage_secret(storage_name)
        return True

    async def update_org_storage(self, oid, userid, storage):
        """Update storage by either creating a per-org secret, if using custom storage
        or deleting per-org secret, if using default storage"""
        org_storage_name = f"storage-{oid}"
        if storage.type == "default":
            try:
                await self.core_api.delete_namespaced_secret(
                    org_storage_name,
                    namespace=self.namespace,
                    propagation_policy="Foreground",
                )
            # pylint: disable=bare-except
            except:
                pass

            return

        labels = {"btrix.org": oid, "btrix.user": userid}

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

    async def get_default_storage_access_endpoint(self, name):
        """Get access_endpoint for default storage"""
        return (await self.get_default_storage(name)).access_endpoint_url

    async def get_default_storage(self, name):
        """get default storage"""
        if name not in self._default_storages:
            storage_secret = await self._get_storage_secret(name)

            access_endpoint_url = self._secret_data(
                storage_secret, "STORE_ACCESS_ENDPOINT_URL"
            )
            endpoint_url = self._secret_data(storage_secret, "STORE_ENDPOINT_URL")
            access_key = self._secret_data(storage_secret, "STORE_ACCESS_KEY")
            secret_key = self._secret_data(storage_secret, "STORE_SECRET_KEY")
            region = self._secret_data(storage_secret, "STORE_REGION") or ""
            use_access_for_presign = (
                self._secret_data(storage_secret, "STORE_USE_ACCESS_FOR_PRESIGN") == "1"
            )

            self._default_storages[name] = S3Storage(
                access_key=access_key,
                secret_key=secret_key,
                endpoint_url=endpoint_url,
                access_endpoint_url=access_endpoint_url,
                region=region,
                use_access_for_presign=use_access_for_presign,
            )

        return self._default_storages[name]

    async def get_profile_browser_metadata(self, browserid):
        """get browser profile labels"""
        try:
            browser = await self.get_profile_browser(browserid)

        # pylint: disable=bare-except
        except:
            return {}

        return browser["metadata"]["labels"]

    async def get_configmap(self, cid):
        """get configmap by id"""
        return await self.core_api.read_namespaced_config_map(
            name=f"crawl-config-{cid}", namespace=self.namespace
        )

    async def ping_profile_browser(self, browserid):
        """return ping profile browser"""
        expire_at = dt_now() + timedelta(seconds=30)
        await self._patch_job(
            browserid, {"expireTime": to_k8s_date(expire_at)}, "profilejobs"
        )

    async def rollover_restart_crawl(self, crawl_id, oid):
        """Rolling restart of crawl by updating forceRestart field"""
        update = to_k8s_date(dt_now())
        return await self._patch_job(crawl_id, {"forceRestart": update})

    async def scale_crawl(self, crawl_id, oid, scale=1):
        """Set the crawl scale (job parallelism) on the specified job"""
        return await self._patch_job(crawl_id, {"scale": scale})

    async def shutdown_crawl(self, crawl_id, oid, graceful=True):
        """Request a crawl cancelation or stop by calling an API
        on the job pod/container, returning the result"""
        if graceful:
            patch = {"stopping": True}
            return await self._patch_job(crawl_id, patch)

        return await self.delete_crawl_job(crawl_id)

    async def delete_crawl_configs_for_org(self, org):
        """Delete all crawl configs for given org"""
        return await self._delete_crawl_configs(f"btrix.org={org}")

    async def delete_crawl_config_by_id(self, cid):
        """Delete all crawl configs by id"""
        return await self._delete_crawl_configs(f"btrix.crawlconfig={cid}")

    # ========================================================================
    # Internal Methods
    def _secret_data(self, secret, name):
        """decode secret data"""
        return base64.standard_b64decode(secret.data[name]).decode()

    async def _create_config_map(self, crawlconfig, **data):
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

        return await self.core_api.create_namespaced_config_map(
            namespace=self.namespace, body=config_map
        )

    async def _get_storage_secret(self, storage_name):
        """Check if storage_name is valid by checking existing secret"""
        try:
            return await self.core_api.read_namespaced_secret(
                f"storage-{storage_name}",
                namespace=self.namespace,
            )
        # pylint: disable=broad-except
        except Exception:
            # pylint: disable=broad-exception-raised,raise-missing-from
            raise Exception(f"Storage {storage_name} not found")

        return None

    async def _delete_crawl_configs(self, label):
        """Delete Crawl Cron Job and all dependent resources, including configmap and secrets"""

        await self.batch_api.delete_collection_namespaced_cron_job(
            namespace=self.cron_namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

        await self.core_api.delete_collection_namespaced_config_map(
            namespace=self.namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

    async def _update_scheduled_job(self, crawlconfig, schedule):
        """create or remove cron job based on crawlconfig schedule"""
        cid = str(crawlconfig.id)

        cron_job_id = f"sched-{cid[:12]}"
        cron_job = None
        try:
            cron_job = await self.batch_api.read_namespaced_cron_job(
                name=cron_job_id,
                namespace=self.cron_namespace,
            )
        # pylint: disable=bare-except
        except:
            pass

        # if no schedule, delete cron_job if exists and we're done
        if not crawlconfig.schedule:
            if cron_job:
                await self.batch_api.delete_namespaced_cron_job(
                    name=cron_job.metadata.name, namespace=self.cron_namespace
                )
            return

        # if cron job exists, just patch schedule
        if cron_job:
            if crawlconfig.schedule != cron_job.spec.schedule:
                cron_job.spec.schedule = crawlconfig.schedule

                await self.batch_api.patch_namespaced_cron_job(
                    name=cron_job.metadata.name,
                    namespace=self.cron_namespace,
                    body=cron_job,
                )
            return

        params = {
            "id": cron_job_id,
            "cid": str(crawlconfig.id),
            "image": self.job_image,
            "image_pull_policy": self.job_image_pull_policy,
            "schedule": schedule,
        }

        data = self.templates.env.get_template("crawl_cron_job.yaml").render(params)

        await self.create_from_yaml(data, self.cron_namespace)

        return cron_job_id

    async def _update_config_map(
        self,
        crawlconfig,
        update,
        profile_filename=None,
        update_config=False,
    ):
        config_map = await self.get_configmap(crawlconfig.id)

        if update.scale is not None:
            config_map.data["INITIAL_SCALE"] = str(update.scale)

        if update.crawlTimeout is not None:
            config_map.data["CRAWL_TIMEOUT"] = str(update.crawlTimeout)

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
