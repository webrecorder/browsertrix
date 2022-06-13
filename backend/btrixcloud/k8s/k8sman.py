""" K8s support"""

import os
import json
import base64

import yaml
import aiohttp

from ..archives import S3Storage
from ..crawlmanager import BaseCrawlManager

from .k8sapi import K8sAPI

from .utils import create_from_yaml, send_signal_to_pods, get_templates_dir


# ============================================================================
class K8SManager(BaseCrawlManager, K8sAPI):
    # pylint: disable=too-many-instance-attributes,too-many-locals,too-many-arguments
    """K8SManager, manager creation of k8s resources from crawl api requests"""
    client = None

    def __init__(self):
        super().__init__(get_templates_dir())

        self.namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        self._default_storages = {}

    # pylint: disable=unused-argument
    async def check_storage(self, storage_name, is_default=False):
        """Check if storage is valid by trying to get the storage secret
        Will throw if not valid, otherwise return True"""
        await self._get_storage_secret(storage_name)
        return True

    async def update_archive_storage(self, aid, userid, storage):
        """Update storage by either creating a per-archive secret, if using custom storage
        or deleting per-archive secret, if using default storage"""
        archive_storage_name = f"storage-{aid}"
        if storage.type == "default":
            try:
                await self.core_api.delete_namespaced_secret(
                    archive_storage_name,
                    namespace=self.namespace,
                    propagation_policy="Foreground",
                )
            # pylint: disable=bare-except
            except:
                pass

            return

        labels = {"btrix.archive": aid, "btrix.user": userid}

        crawl_secret = self.client.V1Secret(
            metadata={
                "name": archive_storage_name,
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
                name=archive_storage_name, namespace=self.namespace, body=crawl_secret
            )

    async def get_default_storage_access_endpoint(self, name):
        """ Get access_endpoint for default storage """
        return (await self.get_default_storage(name)).access_endpoint_url

    async def get_default_storage(self, name):
        """ get default storage """
        if name not in self._default_storages:
            storage_secret = await self._get_storage_secret(name)

            access_endpoint_url = self._secret_data(
                storage_secret, "STORE_ACCESS_ENDPOINT_URL"
            )
            endpoint_url = self._secret_data(storage_secret, "STORE_ENDPOINT_URL")
            access_key = self._secret_data(storage_secret, "STORE_ACCESS_KEY")
            secret_key = self._secret_data(storage_secret, "STORE_SECRET_KEY")
            region = self._secret_data(storage_secret, "STORE_REGION") or ""

            self._default_storages[name] = S3Storage(
                access_key=access_key,
                secret_key=secret_key,
                endpoint_url=endpoint_url,
                access_endpoint_url=access_endpoint_url,
                region=region,
            )

        return self._default_storages[name]

    async def ping_profile_browser(self, browserid):
        """ return ping profile browser """
        pods = await self.core_api.list_namespaced_pod(
            namespace=self.namespace,
            label_selector=f"job-name=job-{browserid},btrix.profile=1",
        )
        if len(pods.items) == 0:
            return False

        await send_signal_to_pods(
            self.core_api_ws, self.namespace, pods.items, "SIGUSR1"
        )
        return True

    async def get_profile_browser_metadata(self, browserid):
        """ get browser profile labels """
        try:
            job = await self.batch_api.read_namespaced_job(
                name=f"job-{browserid}", namespace=self.namespace
            )
            if not job.metadata.labels.get("btrix.profile"):
                return {}

        # pylint: disable=bare-except
        except:
            return {}

        return job.metadata.labels

    async def delete_profile_browser(self, browserid):
        """ delete browser job, if it is a profile browser job """
        return await self._handle_completed_job(f"job-{browserid}")

    # ========================================================================
    # Internal Methods

    async def _create_from_yaml(self, _, yaml_data):
        """ create from yaml """
        await create_from_yaml(self.api_client, yaml_data, namespace=self.namespace)

    def _secret_data(self, secret, name):
        """ decode secret data """
        return base64.standard_b64decode(secret.data[name]).decode()

    async def _handle_completed_job(self, job_name):
        """ Handle completed job: delete """
        # until ttl controller is ready
        if self.no_delete_jobs:
            return

        try:
            await self._delete_job(job_name)
        # pylint: disable=bare-except
        except:
            pass

    async def _delete_job(self, name):
        await self.batch_api.delete_namespaced_job(
            name=name,
            namespace=self.namespace,
            grace_period_seconds=60,
            propagation_policy="Foreground",
        )

    async def _create_config_map(self, crawlconfig, **kwargs):
        """ Create Config Map based on CrawlConfig """
        data = kwargs
        data["crawl-config.json"] = json.dumps(crawlconfig.get_raw_config())
        data["INITIAL_SCALE"] = str(crawlconfig.scale)

        labels = {
            "btrix.crawlconfig": str(crawlconfig.id),
            "btrix.archive": str(crawlconfig.aid),
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
        """ Check if storage_name is valid by checking existing secret """
        try:
            return await self.core_api.read_namespaced_secret(
                f"storage-{storage_name}",
                namespace=self.namespace,
            )
        except Exception:
            # pylint: disable=broad-except,raise-missing-from
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

    async def _post_to_job(self, crawl_id, aid, path, data=None):
        job_name = f"job-{crawl_id}"

        pods = await self.core_api.list_namespaced_pod(
            namespace=self.namespace,
            label_selector=f"job-name={job_name},btrix.archive={aid}",
        )

        for pod in pods.items:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    "POST", f"http://{pod.status.pod_ip}:8000{path}", json=data
                ) as resp:
                    await resp.json()

    async def _update_scheduled_job(self, crawlconfig):
        """ create or remove cron job based on crawlconfig schedule """
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

    async def _update_config_initial_scale(self, crawlconfig, scale):
        config_map = await self.core_api.read_namespaced_config_map(
            name=f"crawl-config-{crawlconfig.id}", namespace=self.namespace
        )

        config_map.data["INITIAL_SCALE"] = str(scale)

        await self.core_api.patch_namespaced_config_map(
            name=config_map.metadata.name, namespace=self.namespace, body=config_map
        )


# ============================================================================
# pylint: disable=too-few-public-methods
class FakeKubeResponse:
    """ wrap k8s response for decoding """

    def __init__(self, obj):
        self.data = json.dumps(obj)
