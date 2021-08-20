""" K8s support"""

import os

import json

from kubernetes_asyncio import client, config


# ============================================================================
DEFAULT_NAMESPACE = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"

DEFAULT_NO_SCHEDULE = "* * 31 2 *"


# ============================================================================
class K8SManager:
    # pylint: disable=too-many-instance-attributes,too-many-locals,too-many-arguments
    """K8SManager, manager creation of k8s resources from crawl api requests"""

    def __init__(self, namespace=DEFAULT_NAMESPACE):
        config.load_incluster_config()

        self.core_api = client.CoreV1Api()
        self.batch_api = client.BatchV1Api()
        self.batch_beta_api = client.BatchV1beta1Api()

        self.namespace = namespace

        self.crawler_image = os.environ.get("CRAWLER_IMAGE")
        self.crawler_image_pull_policy = "IfNotPresent"

    async def validate_crawl_data(self, data):
        pod = await self.core_api.read_namespaced_pod(data.crawl, self.namespace)

        if not pod or pod.metadata.labels["btrix.user"] != data.user:
            return None

        result = {}
        data.crawl = pod.metadata.labels["job-name"]
        result["created"] = pod.metadata.creation_timestamp
        result["archive"] = pod.metadata.labels["btrix.archive"]
        result["crawlconfig"] = pod.metadata.labels["btrix.crawlconfig"]
        return result

    async def add_crawl_config(
        self,
        userid: str,
        aid: str,
        storage,
        crawlconfig,
        extra_crawl_params: list = None,
    ):
        """add new crawl as cron job, store crawl config in configmap"""
        cid = str(crawlconfig.id)

        labels = {
            "btrix.user": userid,
            "btrix.archive": aid,
            "btrix.crawlconfig": cid,
        }

        extra_crawl_params = extra_crawl_params or []

        # Create Config Map
        config_map = client.V1ConfigMap(
            metadata={
                "name": f"crawl-config-{cid}",
                "namespace": self.namespace,
                "labels": labels,
            },
            data={"crawl-config.json": json.dumps(crawlconfig.config.dict())},
        )

        api_response = await self.core_api.create_namespaced_config_map(
            namespace=self.namespace, body=config_map
        )

        # Create Secret
        endpoint_with_coll_url = os.path.join(
            storage.endpoint_url, "collections", crawlconfig.config.collection + "/"
        )

        crawl_secret = client.V1Secret(
            metadata={
                "name": f"crawl-secret-{cid}",
                "namespace": self.namespace,
                "labels": labels,
            },
            string_data={
                "STORE_USER": userid,
                "STORE_ARCHIVE": aid,
                "STORE_ENDPOINT_URL": endpoint_with_coll_url,
                "STORE_ACCESS_KEY": storage.access_key,
                "STORE_SECRET_KEY": storage.secret_key,
                "WEBHOOK_URL": "http://browsertrix-cloud.default:8000/crawldone",
            },
        )

        api_response = await self.core_api.create_namespaced_secret(
            namespace=self.namespace, body=crawl_secret
        )

        # Create Cron Job
        suspend = False
        schedule = crawlconfig.schedule

        if not schedule:
            schedule = DEFAULT_NO_SCHEDULE
            suspend = True

        run_now = False
        if crawlconfig.runNow:
            run_now = True

        job_template = self._get_job_template(cid, labels, extra_crawl_params)

        spec = client.V1beta1CronJobSpec(
            schedule=schedule,
            suspend=suspend,
            concurrency_policy="Forbid",
            successful_jobs_history_limit=2,
            failed_jobs_history_limit=3,
            job_template=job_template,
        )

        cron_job = client.V1beta1CronJob(
            metadata={
                "name": f"scheduled-crawl-{cid}",
                "namespace": self.namespace,
                "labels": labels,
            },
            spec=spec,
        )

        api_response = await self.batch_beta_api.create_namespaced_cron_job(
            namespace=self.namespace, body=cron_job
        )

        # Run Job Now
        if run_now:
            await self._create_run_now_job(api_response, labels)

        return api_response

    async def delete_crawl_configs_for_archive(self, archive):
        """Delete all crawl configs for given archive"""
        return await self._delete_crawl_configs(f"btrix.archive={archive}")

    async def delete_crawl_config_by_id(self, cid):
        """Delete all crawl configs by id"""
        return await self._delete_crawl_configs(f"btrix.crawlconfig={cid}")

    async def _delete_crawl_configs(self, label):
        """Delete Crawl Cron Job and all dependent resources, including configmap and secrets"""

        await self.batch_beta_api.delete_collection_namespaced_cron_job(
            namespace=self.namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

        await self.core_api.delete_collection_namespaced_secret(
            namespace=self.namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

        await self.core_api.delete_collection_namespaced_config_map(
            namespace=self.namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

    async def _create_run_now_job(self, cron_job, labels):
        """Create new job from cron job to run instantly"""
        annotations = {}
        annotations["cronjob.kubernetes.io/instantiate"] = "manual"

        owner_ref = client.V1OwnerReference(
            kind="CronJob",
            name=cron_job.metadata.name,
            block_owner_deletion=True,
            controller=True,
            uid=cron_job.metadata.uid,
            api_version="batch/v1beta1",
        )

        object_meta = client.V1ObjectMeta(
            name=cron_job.metadata.name + "-run-now",
            annotations=annotations,
            labels=labels,
            owner_references=[owner_ref],
        )

        job = client.V1Job(
            kind="Job",
            api_version="batch/v1",
            metadata=object_meta,
            spec=cron_job.spec.job_template.spec,
        )

        return await self.batch_api.create_namespaced_job(
            body=job, namespace=self.namespace
        )

    def _get_job_template(self, uid, labels, extra_crawl_params):
        """Return crawl job template for crawl job, including labels, adding optiona crawl params"""

        command = ["crawl", "--config", "/tmp/crawl-config.json"]

        if extra_crawl_params:
            command += extra_crawl_params

        requests_memory = "256M"
        limit_memory = "1G"

        requests_cpu = "120m"
        limit_cpu = "1000m"

        resources = {
            "limits": {
                "cpu": limit_cpu,
                "memory": limit_memory,
            },
            "requests": {
                "cpu": requests_cpu,
                "memory": requests_memory,
            },
        }

        return {
            "spec": {
                "template": {
                    "metadata": {"labels": labels},
                    "spec": {
                        "containers": [
                            {
                                "name": "crawler",
                                "image": self.crawler_image,
                                "imagePullPolicy": "Never",
                                "command": command,
                                "volumeMounts": [
                                    {
                                        "name": "crawl-config",
                                        "mountPath": "/tmp/crawl-config.json",
                                        "subPath": "crawl-config.json",
                                        "readOnly": True,
                                    }
                                ],
                                "envFrom": [
                                    {"secretRef": {"name": f"crawl-secret-{uid}"}}
                                ],
                                "env": [
                                    {
                                        "name": "CRAWL_ID",
                                        "valueFrom": {
                                            "fieldRef": {"fieldPath": "metadata.name"}
                                        },
                                    }
                                ],
                                "resources": resources,
                            }
                        ],
                        "volumes": [
                            {
                                "name": "crawl-config",
                                "configMap": {
                                    "name": f"crawl-config-{uid}",
                                    "items": [
                                        {
                                            "key": "crawl-config.json",
                                            "path": "crawl-config.json",
                                        }
                                    ],
                                },
                            }
                        ],
                        "restartPolicy": "OnFailure",
                    },
                }
            }
        }
