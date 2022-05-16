""" K8s support"""

import os
import datetime
import json
import base64

import yaml
import aiohttp

from kubernetes_asyncio import client, config
from kubernetes_asyncio.stream import WsApiClient
from kubernetes_asyncio.client.api_client import ApiClient

from fastapi.templating import Jinja2Templates

from ..archives import S3Storage
from .utils import create_from_yaml, send_signal_to_pods, get_templates_dir


# ============================================================================
CRAWLER_NAMESPACE = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"


# pylint: disable=too-many-public-methods
# ============================================================================
class K8SManager:
    # pylint: disable=too-many-instance-attributes,too-many-locals,too-many-arguments
    """K8SManager, manager creation of k8s resources from crawl api requests"""

    def __init__(self, namespace=CRAWLER_NAMESPACE):
        config.load_incluster_config()

        self.api_client = ApiClient()

        self.core_api = client.CoreV1Api(self.api_client)
        self.core_api_ws = client.CoreV1Api(api_client=WsApiClient())
        self.batch_api = client.BatchV1Api(self.api_client)

        self.namespace = namespace
        self._default_storages = {}

        self.no_delete_jobs = os.environ.get("NO_DELETE_JOBS", "0") != "0"

        self.templates = Jinja2Templates(directory=get_templates_dir())

        self.job_image = os.environ.get("JOB_IMAGE")

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

        crawl_secret = client.V1Secret(
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

    async def add_crawl_config(
        self,
        crawlconfig,
        storage,
        run_now,
        out_filename,
        profile_filename,
    ):
        """add new crawl as cron job, store crawl config in configmap"""

        if storage.type == "default":
            storage_name = storage.name
            storage_path = storage.path
        else:
            storage_name = str(crawlconfig.aid)
            storage_path = ""

        await self.check_storage(storage_name)

        # Create Config Map
        await self._create_config_map(
            crawlconfig,
            STORE_PATH=storage_path,
            STORE_FILENAME=out_filename,
            STORE_NAME=storage_name,
            USER_ID=str(crawlconfig.userid),
            ARCHIVE_ID=str(crawlconfig.aid),
            CRAWL_CONFIG_ID=str(crawlconfig.id),
            INITIAL_SCALE=str(crawlconfig.scale),
            PROFILE_FILENAME=profile_filename,
        )

        crawl_id = None

        if run_now:
            crawl_id = await self._create_manual_job(crawlconfig)

        await self._update_scheduled_job(crawlconfig)

        return crawl_id

    async def update_crawl_schedule_or_scale(
        self, crawlconfig, scale=None, schedule=None
    ):
        """ Update the schedule or scale for existing crawl config """

        if schedule is not None:
            await self._update_scheduled_job(crawlconfig)

        if scale is not None:
            config_map = await self.core_api.read_namespaced_config_map(
                name=f"crawl-config-{crawlconfig.id}", namespace=self.namespace
            )

            config_map.data["INITIAL_SCALE"] = str(scale)

            await self.core_api.patch_namespaced_config_map(
                name=config_map.metadata.name, namespace=self.namespace, body=config_map
            )

        return True

    async def run_crawl_config(self, crawlconfig, userid=None):
        """Run crawl job for cron job based on specified crawlconfig
        optionally set different user"""

        return await self._create_manual_job(crawlconfig)

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

    async def stop_crawl(self, crawl_id, aid, graceful=True):
        """Attempt to stop crawl, either gracefully by issuing a SIGTERM which
        will attempt to finish current pages

        OR, abruptly by first issueing a SIGABRT, followed by SIGTERM, which
        will terminate immediately"""
        return await self._post_to_job_pods(
            crawl_id, aid, "/cancel" if not graceful else "/stop"
        )

    async def scale_crawl(self, crawl_id, aid, scale=1):
        """ Set the crawl scale (job parallelism) on the specified job """

        return await self._post_to_job_pods(crawl_id, aid, f"/scale/{scale}")

    async def delete_crawl_configs_for_archive(self, archive):
        """Delete all crawl configs for given archive"""
        return await self._delete_crawl_configs(f"btrix.archive={archive}")

    async def delete_crawl_config_by_id(self, cid):
        """Delete all crawl configs by id"""
        return await self._delete_crawl_configs(f"btrix.crawlconfig={cid}")

    async def run_profile_browser(
        self,
        userid,
        aid,
        url,
        storage=None,
        storage_name=None,
        baseprofile=None,
        profile_path=None,
    ):
        """run browser for profile creation """

        # if default storage, use name and path + profiles/
        if storage:
            storage_name = storage.name
            storage_path = storage.path + "profiles/"
        # otherwise, use storage name and existing path from secret
        else:
            storage_path = ""

        await self.check_storage(storage_name)

        params = {
            "userid": str(userid),
            "aid": str(aid),
            "job_image": self.job_image,
            "storage_name": storage_name,
            "storage_path": storage_path or "",
            "baseprofile": baseprofile or "",
            "profile_path": profile_path,
            "url": url,
        }

        data = self.templates.env.get_template("profile_job.yaml").render(params)

        created = await create_from_yaml(
            self.api_client, data, namespace=self.namespace
        )

        name = created[0][0].metadata.name
        # pylint: disable=no-else-return
        if name.startswith("job-"):
            return name[4:]
        else:
            return name

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

    # pylint: disable=no-self-use
    def _secret_data(self, secret, name):
        """ decode secret data """
        return base64.standard_b64decode(secret.data[name]).decode()

    async def _load_job_template(self, crawlconfig, name, manual):
        params = {
            "cid": str(crawlconfig.id),
            "userid": str(crawlconfig.userid),
            "aid": str(crawlconfig.aid),
            "job_image": self.job_image,
            "job_name": name,
            "manual": "1" if manual else "0",
        }

        return self.templates.env.get_template("job.yaml").render(params)

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

        config_map = client.V1ConfigMap(
            metadata={
                "name": f"crawl-config-{crawlconfig.id}",
                "namespace": self.namespace,
                # "labels": labels,
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

    async def _post_to_job_pods(self, crawl_id, aid, path, data=None):
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

    async def _create_manual_job(self, crawlconfig):
        cid = str(crawlconfig.id)
        ts_now = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        crawl_id = f"manual-{ts_now}-{cid[:12]}"

        data = await self._load_job_template(
            crawlconfig, "job-" + crawl_id, manual=True
        )

        # create job directly
        await create_from_yaml(self.api_client, data, namespace=self.namespace)

        return crawl_id

    async def _update_scheduled_job(self, crawlconfig):
        """ create or remove cron job based on crawlconfig schedule """
        cid = str(crawlconfig.id)

        cron_job_name = f"job-sched-{cid[:12]}"
        cron_job = None
        try:
            cron_job = await self.batch_api.read_namespaced_cron_job(
                name=cron_job_name,
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
        data = await self._load_job_template(crawlconfig, cron_job_name, manual=False)

        job_yaml = yaml.safe_load(data)

        job_template = self.api_client.deserialize(
            FakeKubeResponse(job_yaml), "V1JobTemplateSpec"
        )

        metadata = job_yaml["metadata"]

        spec = client.V1CronJobSpec(
            schedule=crawlconfig.schedule,
            suspend=False,
            concurrency_policy="Forbid",
            successful_jobs_history_limit=2,
            failed_jobs_history_limit=3,
            job_template=job_template,
        )

        cron_job = client.V1CronJob(metadata=metadata, spec=spec)

        await self.batch_api.create_namespaced_cron_job(
            namespace=self.namespace, body=cron_job
        )


# ============================================================================
# pylint: disable=too-few-public-methods
class FakeKubeResponse:
    """ wrap k8s response for decoding """

    def __init__(self, obj):
        self.data = json.dumps(obj)
