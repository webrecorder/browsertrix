""" K8s support"""

import json
import base64
import secrets

from datetime import timedelta
import yaml

# import aiohttp

from ..crawlmanager import BaseCrawlManager
from ..orgs import S3Storage

from .k8sapi import K8sAPI

from .utils import get_templates_dir, dt_now, to_k8s_date


# pylint: disable=duplicate-code


# ============================================================================
class K8SManager(BaseCrawlManager, K8sAPI):
    # pylint: disable=too-many-instance-attributes,too-many-locals,too-many-arguments
    """K8SManager, manager creation of k8s resources from crawl api requests"""
    client = None

    def __init__(self):
        super().__init__(get_templates_dir())

        self._default_storages = {}

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

    async def ping_profile_browser(self, browserid):
        """return ping profile browser"""
        expire_at = dt_now() + timedelta(seconds=30)
        await self._patch_job(
            browserid, {"expireTime": to_k8s_date(expire_at)}, "profilejobs"
        )

    async def get_profile_browser_metadata(self, browserid):
        """get browser profile labels"""
        try:
            browser = await self.get_profile_browser(browserid)

        # pylint: disable=bare-except
        except:
            return {}

        return browser["metadata"]["labels"]

    # ========================================================================
    # Internal Methods
    async def _create_from_yaml(self, yaml_data):
        """passthrough"""
        return await self.create_from_yaml(yaml_data)

    def _secret_data(self, secret, name):
        """decode secret data"""
        return base64.standard_b64decode(secret.data[name]).decode()

    async def _delete_job(self, name):
        """delete job"""
        try:
            await self.batch_api.delete_namespaced_job(
                name=name,
                namespace=self.namespace,
                grace_period_seconds=60,
                propagation_policy="Foreground",
            )
            return True
        # pylint: disable=bare-except
        except:
            return False

    async def _create_config_map(self, crawlconfig, **kwargs):
        """Create Config Map based on CrawlConfig"""
        data = kwargs
        data["crawl-config.json"] = json.dumps(crawlconfig.get_raw_config())
        data["INITIAL_SCALE"] = str(crawlconfig.scale)

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

    # pylint: disable=unused-argument
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
            namespace=self.namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

        await self.core_api.delete_collection_namespaced_config_map(
            namespace=self.namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

    async def shutdown_crawl(self, crawl_id, oid, graceful=True):
        """Request a crawl cancelation or stop by calling an API
        on the job pod/container, returning the result"""
        if graceful:
            patch = {"stopping": True}
            return await self._patch_job(crawl_id, patch)

        await self.delete_crawl_job(crawl_id)

        return {"success": True}

    async def scale_crawl(self, crawl_id, oid, scale=1):
        """Set the crawl scale (job parallelism) on the specified job"""
        return await self._patch_job(crawl_id, {"scale": scale})

    async def rollover_restart_crawl(self, crawl_id, oid):
        """Rolling restart of crawl by updating forceRestart field"""
        update = to_k8s_date(dt_now())
        return await self._patch_job(crawl_id, {"forceRestart": update})

    async def _update_scheduled_job(self, crawlconfig):
        """create or remove cron job based on crawlconfig schedule"""
        cid = str(crawlconfig.id)

        cron_job_id = f"sched-{cid[:12]}"
        cron_job = None
        try:
            cron_job = await self.batch_api.read_namespaced_cron_job(
                name=f"job-{cron_job_id}",
                namespace=self.namespace,
            )
        # pylint: disable=bare-except
        except:
            pass

        if cron_job:
            if crawlconfig.schedule and crawlconfig.schedule != cron_job.spec.schedule:
                cron_job.spec.schedule = crawlconfig.schedule

                await self.batch_api.patch_namespaced_cron_job(
                    name=cron_job.metadata.name, namespace=self.namespace, body=cron_job
                )

            if not crawlconfig.schedule:
                await self.batch_api.delete_namespaced_cron_job(
                    name=cron_job.metadata.name, namespace=self.namespace
                )

            return

        if not crawlconfig.schedule:
            return

        # create new cronjob
        data = await self._load_job_template(crawlconfig, cron_job_id, manual=False)

        job_yaml = yaml.safe_load(data)

        job_template = self.api_client.deserialize(
            FakeKubeResponse(job_yaml), "V1JobTemplateSpec"
        )

        metadata = job_yaml["metadata"]

        spec = self.client.V1CronJobSpec(
            schedule=crawlconfig.schedule,
            suspend=False,
            concurrency_policy="Forbid",
            successful_jobs_history_limit=2,
            failed_jobs_history_limit=3,
            job_template=job_template,
        )

        cron_job = self.client.V1CronJob(metadata=metadata, spec=spec)

        await self.batch_api.create_namespaced_cron_job(
            namespace=self.namespace, body=cron_job
        )

    async def _update_config_map(
        self, crawlconfig, scale=None, profile_filename=None, update_config=False
    ):
        config_map = await self.core_api.read_namespaced_config_map(
            name=f"crawl-config-{crawlconfig.id}", namespace=self.namespace
        )

        if scale is not None:
            config_map.data["INITIAL_SCALE"] = str(scale)

        if profile_filename is not None:
            config_map.data["PROFILE_FILENAME"] = profile_filename

        if update_config:
            config_map.data["crawl-config.json"] = json.dumps(
                crawlconfig.get_raw_config()
            )

        #"Content-Type": "application/strategic-merge-patch+json"

        await self.core_api.patch_namespaced_config_map(
            name=config_map.metadata.name, namespace=self.namespace, body=config_map
        )


# ============================================================================
# pylint: disable=too-few-public-methods
class FakeKubeResponse:
    """wrap k8s response for decoding"""

    def __init__(self, obj):
        self.data = json.dumps(obj)
