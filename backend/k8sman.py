""" K8s support"""

import os

# import urllib.parse
import json

from kubernetes_asyncio import client, config

# from fastapi.templating import Jinja2Templates
from jinja2 import Environment, FileSystemLoader


# ============================================================================
DEFAULT_NAMESPACE = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"

DEFAULT_NO_SCHEDULE = "* * 31 2 *"


# ============================================================================
class K8SManager:
    # pylint: disable=too-many-instance-attributes,too-many-locals
    """K8SManager, manager creation of k8s resources from crawl api requests"""

    def __init__(self, namespace=DEFAULT_NAMESPACE):
        config.load_incluster_config()

        self.core_api = client.CoreV1Api()
        self.batch_api = client.BatchV1Api()
        self.batch_beta_api = client.BatchV1beta1Api()

        self.namespace = namespace

        loader = FileSystemLoader("templates")
        self.jinja_env = Environment(
            loader=loader, autoescape=False, lstrip_blocks=False, trim_blocks=False
        )

        self.crawler_image = os.environ.get("CRAWLER_IMAGE")
        self.crawler_image_pull_policy = "IfNotPresent"

    async def add_crawl_config(
        self,
        crawlconfig: dict,
        userid: str,
        storage: dict,
        extra_crawl_params: list = None,
    ):
        """add new crawl as cron job, store crawl config in configmap"""
        uid = str(crawlconfig["id"])

        labels = {"btrix.user": userid, "btrix.crawlconfig": uid}

        extra_crawl_params = extra_crawl_params or []

        # Create Config Map
        config_map = client.V1ConfigMap(
            metadata={
                "name": f"crawl-config-{uid}",
                "namespace": self.namespace,
                "labels": labels,
            },
            data={"crawl-config.json": json.dumps(crawlconfig)},
        )

        api_response = await self.core_api.create_namespaced_config_map(
            namespace=self.namespace, body=config_map
        )

        # Create Secret
        endpoint_with_coll_url = os.path.join(
            storage["endpoint_url"], crawlconfig["collection"] + "/"
        )

        crawl_secret = client.V1Secret(
            metadata={
                "name": f"crawl-secret-{uid}",
                "namespace": self.namespace,
                "labels": labels,
            },
            string_data={
                "STORE_USER": userid,
                "STORE_ENDPOINT_URL": endpoint_with_coll_url,
                "STORE_ACCESS_KEY": storage["access_key"],
                "STORE_SECRET_KEY": storage["secret_key"],
            },
        )

        api_response = await self.core_api.create_namespaced_secret(
            namespace=self.namespace, body=crawl_secret
        )

        # Create Cron Job
        run_now = False
        schedule = crawlconfig.get("schedule")
        suspend = False
        if not schedule or schedule == "now":
            if schedule == "now":
                run_now = True
            schedule = DEFAULT_NO_SCHEDULE
            suspend = True

        job_template = self.get_job_template(uid, labels, extra_crawl_params)

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
                "name": f"scheduled-crawl-{uid}",
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
            await self.create_run_now_job(api_response, labels)

        return api_response

    async def delete_crawl_configs(self, label):
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

    async def create_run_now_job(self, cron_job, labels):
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

    def get_job_template(self, uid, labels, extra_crawl_params):
        """Return crawl job template for crawl job, including labels, adding optiona crawl params"""

        command = ["crawl", "--config", "/tmp/crawl-config.json"]

        if extra_crawl_params:
            command += extra_crawl_params

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
