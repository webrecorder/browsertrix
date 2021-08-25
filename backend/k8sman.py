""" K8s support"""

import os
import datetime
import json
import asyncio

from kubernetes_asyncio import client, config, watch
from kubernetes_asyncio.stream import WsApiClient

from crawls import Crawl


# ============================================================================
DEFAULT_NAMESPACE = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"

DEFAULT_NO_SCHEDULE = "* * 31 2 *"


# ============================================================================
class K8SManager:
    # pylint: disable=too-many-instance-attributes,too-many-locals,too-many-arguments
    """K8SManager, manager creation of k8s resources from crawl api requests"""

    def __init__(self, extra_crawl_params=None, namespace=DEFAULT_NAMESPACE):
        config.load_incluster_config()

        self.crawl_ops = None

        self.core_api = client.CoreV1Api()
        self.core_api_ws = client.CoreV1Api(api_client=WsApiClient())
        self.batch_api = client.BatchV1Api()
        self.batch_beta_api = client.BatchV1beta1Api()

        self.namespace = namespace
        self.extra_crawl_params = extra_crawl_params or []

        self.crawler_image = os.environ.get("CRAWLER_IMAGE")
        self.crawler_image_pull_policy = "IfNotPresent"

        self.crawl_retries = int(os.environ.get("CRAWL_RETRIES", "3"))

        self.loop = asyncio.get_running_loop()
        self.loop.create_task(self.run_event_loop())

    def set_crawl_ops(self, ops):
        """ Set crawl ops handler """
        self.crawl_ops = ops

    async def run_event_loop(self):
        """ Run the job watch loop, retry in case of failure"""
        while True:
            try:
                await self.watch_events()
            # pylint: disable=broad-except
            except Exception as exc:
                print(f"Retrying job loop: {exc}")
                await asyncio.sleep(10)

    async def watch_events(self):
        """ Get events for completed jobs"""
        async with watch.Watch().stream(
            self.core_api.list_namespaced_event,
            self.namespace,
            field_selector="involvedObject.kind=Job",
        ) as stream:
            async for event in stream:
                try:
                    obj = event["object"]
                    if obj.reason == "BackoffLimitExceeded":
                        self.loop.create_task(
                            self.handle_crawl_failed(obj.involved_object.name, "failed")
                        )

                    elif obj.reason == "DeadlineExceeded":
                        self.loop.create_task(
                            self.handle_crawl_failed(
                                obj.involved_object.name, "timed_out"
                            )
                        )

                # pylint: disable=broad-except
                except Exception as exc:
                    print(exc)

    async def add_crawl_config(
        self,
        crawlconfig,
        storage,
    ):
        """add new crawl as cron job, store crawl config in configmap"""
        cid = str(crawlconfig.id)
        userid = crawlconfig.user
        aid = crawlconfig.archive

        labels = {
            "btrix.user": userid,
            "btrix.archive": aid,
            "btrix.crawlconfig": cid,
        }

        # Create Config Map
        config_map = self._create_config_map(crawlconfig, labels)

        await self.core_api.create_namespaced_config_map(
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
                "WEBHOOK_URL": "http://browsertrix-cloud.default:8000/crawls/done",
            },
        )

        await self.core_api.create_namespaced_secret(
            namespace=self.namespace, body=crawl_secret
        )

        # Create Cron Job

        annotations = {"btrix.run.schedule": crawlconfig.schedule}

        suspend, schedule, run_now = self._get_schedule_suspend_run_now(crawlconfig)

        job_template = self._get_job_template(
            cid, labels, annotations, crawlconfig.crawlTimeout, self.extra_crawl_params
        )

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
                "name": f"crawl-scheduled-{cid}",
                "namespace": self.namespace,
                "labels": labels,
            },
            spec=spec,
        )

        cron_job = await self.batch_beta_api.create_namespaced_cron_job(
            namespace=self.namespace, body=cron_job
        )

        # Run Job Now
        if run_now:
            await self._create_run_now_job(cron_job)

        return cron_job

    async def update_crawl_config(self, cid, schedule):
        """ Update the schedule for existing crawl config """

        cron_jobs = await self.batch_beta_api.list_namespaced_cron_job(
            namespace=self.namespace, label_selector=f"btrix.crawlconfig={cid}"
        )

        if len(cron_jobs.items) != 1:
            return

        cron_job = cron_jobs.items[0]

        real_schedule = schedule or DEFAULT_NO_SCHEDULE

        if real_schedule != cron_job.spec.schedule:
            cron_job.spec.schedule = real_schedule
            cron_job.spec.suspend = not schedule

            cron_job.spec.job_template.metadata.annotations[
                "btrix.run.schedule"
            ] = schedule

            await self.batch_beta_api.patch_namespaced_cron_job(
                name=cron_job.metadata.name, namespace=self.namespace, body=cron_job
            )

    async def run_crawl_config(self, cid, manual=True, schedule=""):
        """ Run crawl job for cron job based on specified crawlconfig id (cid) """
        cron_jobs = await self.batch_beta_api.list_namespaced_cron_job(
            namespace=self.namespace, label_selector=f"btrix.crawlconfig={cid}"
        )

        if not manual or schedule:
            raise Exception("Manual trigger not supported")

        if len(cron_jobs.items) != 1:
            raise Exception("Crawl Config Not Found")

        res = await self._create_run_now_job(cron_jobs.items[0])
        return res.metadata.name

    async def list_running_crawls(self, cid=None, aid=None, userid=None):
        """ Return a list of running crawls """
        filters = []
        if cid:
            filters.append(f"btrix.crawlconfig={cid}")

        if aid:
            filters.append(f"btrix.archive={aid}")

        if userid:
            filters.append(f"btrix.user={userid}")

        jobs = await self.batch_api.list_namespaced_job(
            namespace=self.namespace,
            label_selector=",".join(filters),
            field_selector="status.successful=0",
        )

        return [
            self._make_crawl_for_job(job, "running")
            for job in jobs.items
            if job.status.active
        ]

    async def validate_crawl_complete(self, crawlcomplete):
        """Ensure the crawlcomplete data is valid (job exists and user matches)
        Fill in additional details about the crawl"""
        job = await self.batch_api.read_namespaced_job(
            name=crawlcomplete.id, namespace=self.namespace
        )

        if not job or job.metadata.labels["btrix.user"] != crawlcomplete.user:
            return None

        manual = job.metadata.annotations.get("btrix.run.manual") == "1"
        if not manual:
            await self._delete_job(job.metadata.name)

        return self._make_crawl_for_job(
            job,
            "complete" if crawlcomplete.completed else "partial_complete",
            finish_now=True,
            filename=crawlcomplete.filename,
            size=crawlcomplete.size,
            hashstr=crawlcomplete.hash,
        )

    async def stop_crawl(self, job_name, aid, graceful=True):
        """Attempt to stop crawl, either gracefully by issuing a SIGTERM which
        will attempt to finish current pages

        OR, abruptly by first issueing a SIGINT, followed by SIGTERM, which
        will terminate immediately"""

        job = await self.batch_api.read_namespaced_job(
            name=job_name, namespace=self.namespace
        )

        if not job or job.metadata.labels["btrix.archive"] != aid:
            return None

        result = None

        if not graceful:
            pods = await self.core_api.list_namespaced_pod(
                namespace=self.namespace,
                label_selector=f"job-name={job_name},btrix.archive={aid}",
            )

            await self._send_sig_to_pods(pods.items, aid)

            result = self._make_crawl_for_job(job, "canceled", True)
        else:
            result = True

        await self._delete_job(job_name)

        return result

    async def delete_crawl_configs_for_archive(self, archive):
        """Delete all crawl configs for given archive"""
        return await self._delete_crawl_configs(f"btrix.archive={archive}")

    async def delete_crawl_config_by_id(self, cid):
        """Delete all crawl configs by id"""
        return await self._delete_crawl_configs(f"btrix.crawlconfig={cid}")

    async def handle_crawl_failed(self, job_name, reason):
        """ Handle failed crawl job, add to db and then delete """
        try:
            job = await self.batch_api.read_namespaced_job(
                name=job_name, namespace=self.namespace
            )
        # pylint: disable=bare-except
        except:
            print("Job Failure Already Handled")
            return

        crawl = self._make_crawl_for_job(job, reason, True)

        await self.crawl_ops.store_crawl(crawl)

        await self._delete_job(job_name)

    # ========================================================================
    # Internal Methods

    # pylint: disable=no-self-use
    def _make_crawl_for_job(
        self, job, state, finish_now=False, filename=None, size=None, hashstr=None
    ):
        """ Make a crawl object from a job"""
        return Crawl(
            id=job.metadata.name,
            state=state,
            user=job.metadata.labels["btrix.user"],
            aid=job.metadata.labels["btrix.archive"],
            cid=job.metadata.labels["btrix.crawlconfig"],
            schedule=job.metadata.annotations.get("btrix.run.schedule", ""),
            manual=job.metadata.annotations.get("btrix.run.manual") == "1",
            started=job.status.start_time.replace(tzinfo=None),
            finished=datetime.datetime.utcnow().replace(microsecond=0, tzinfo=None)
            if finish_now
            else None,
            filename=filename,
            size=size,
            hash=hashstr,
        )

    async def _delete_job(self, name):
        await self.batch_api.delete_namespaced_job(
            name=name,
            namespace=self.namespace,
            grace_period_seconds=60,
            propagation_policy="Foreground",
        )

    def _create_config_map(self, crawlconfig, labels):
        """ Create Config Map based on CrawlConfig + labels """
        config_map = client.V1ConfigMap(
            metadata={
                "name": f"crawl-config-{crawlconfig.id}",
                "namespace": self.namespace,
                "labels": labels,
            },
            data={"crawl-config.json": json.dumps(crawlconfig.config.dict())},
        )

        return config_map

    # pylint: disable=no-self-use
    def _get_schedule_suspend_run_now(self, crawlconfig):
        """ get schedule/suspend/run_now data based on crawlconfig """

        # Create Cron Job
        suspend = False
        schedule = crawlconfig.schedule

        if not schedule:
            schedule = DEFAULT_NO_SCHEDULE
            suspend = True

        run_now = False
        if crawlconfig.runNow:
            run_now = True

        return suspend, schedule, run_now

    async def _send_sig_to_pods(self, pods, aid):
        command = ["kill", "-s", "SIGUSR1", "1"]
        interrupted = False

        try:
            for pod in pods:
                if pod.metadata.labels["btrix.archive"] != aid:
                    continue

                await self.core_api_ws.connect_get_namespaced_pod_exec(
                    pod.metadata.name,
                    namespace=self.namespace,
                    command=command,
                    stdout=True,
                )
                interrupted = True

        # pylint: disable=broad-except
        except Exception as exc:
            print(f"Exec Error: {exc}")

        return interrupted

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

    async def _create_run_now_job(self, cron_job):
        """Create new job from cron job to run instantly"""
        annotations = cron_job.spec.job_template.metadata.annotations
        annotations["btrix.run.manual"] = "1"

        # owner_ref = client.V1OwnerReference(
        #    kind="CronJob",
        #    name=cron_job.metadata.name,
        #    block_owner_deletion=True,
        #    controller=True,
        #    uid=cron_job.metadata.uid,
        #    api_version="batch/v1beta1",
        # )

        ts_now = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        name = f"crawl-now-{ts_now}-{cron_job.metadata.labels['btrix.crawlconfig']}"

        object_meta = client.V1ObjectMeta(
            name=name,
            annotations=annotations,
            labels=cron_job.metadata.labels,
            # owner_references=[owner_ref],
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

    def _get_job_template(
        self, uid, labels, annotations, crawl_timeout, extra_crawl_params
    ):
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

        job_template = {
            "metadata": {"annotations": annotations},
            "spec": {
                "backoffLimit": self.crawl_retries,
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
                                            "fieldRef": {
                                                "fieldPath": "metadata.labels['job-name']"
                                            }
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
                },
            },
        }

        if crawl_timeout > 0:
            job_template["spec"]["activeDeadlineSeconds"] = crawl_timeout

        return job_template
