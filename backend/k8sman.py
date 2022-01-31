""" K8s support"""

import os
import datetime
import json
import asyncio
import base64

from kubernetes_asyncio import client, config, watch
from kubernetes_asyncio.stream import WsApiClient

from archives import S3Storage
from crawls import Crawl, CrawlOut, CrawlFile


# ============================================================================
CRAWLER_NAMESPACE = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"

# an 2/31 schedule that will never run as empty is not allowed
DEFAULT_NO_SCHEDULE = "* * 31 2 *"


# ============================================================================
class K8SManager:
    # pylint: disable=too-many-instance-attributes,too-many-locals,too-many-arguments
    """K8SManager, manager creation of k8s resources from crawl api requests"""

    def __init__(self, namespace=CRAWLER_NAMESPACE):
        config.load_incluster_config()

        self.crawl_ops = None

        self.core_api = client.CoreV1Api()
        self.core_api_ws = client.CoreV1Api(api_client=WsApiClient())
        self.batch_api = client.BatchV1Api()
        self.batch_beta_api = client.BatchV1beta1Api()

        self.namespace = namespace
        self._default_storages = {}

        self.crawler_image = os.environ["CRAWLER_IMAGE"]
        self.crawler_image_pull_policy = os.environ["CRAWLER_PULL_POLICY"]

        self.crawl_retries = int(os.environ.get("CRAWL_RETRIES", "3"))

        self.no_delete_jobs = os.environ.get("NO_DELETE_JOBS", "0") != "0"

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

    async def add_crawl_config(self, crawlconfig, storage, run_now):
        """add new crawl as cron job, store crawl config in configmap"""
        cid = str(crawlconfig.id)
        userid = str(crawlconfig.userid)
        aid = str(crawlconfig.aid)

        annotations = {
            "btrix.run.schedule": crawlconfig.schedule,
            "btrix.storage_name": storage.name,
            "btrix.colls": json.dumps(crawlconfig.colls),
        }

        # Configure Annotations + Labels
        if storage.type == "default":
            storage_name = storage.name
            storage_path = storage.path
            annotations["btrix.def_storage_path"] = storage_path
        else:
            storage_name = aid
            storage_path = ""

        labels = {
            "btrix.user": userid,
            "btrix.archive": aid,
            "btrix.crawlconfig": cid,
        }

        await self.check_storage(storage_name)

        # Create Config Map
        config_map = self._create_config_map(crawlconfig, labels)

        # Create Cron Job
        await self.core_api.create_namespaced_config_map(
            namespace=self.namespace, body=config_map
        )

        suspend, schedule = self._get_schedule_suspend_run_now(crawlconfig)

        job_template = self._get_job_template(
            cid,
            storage_name,
            storage_path,
            labels,
            annotations,
            crawlconfig.crawlTimeout,
            crawlconfig.parallel,
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
            new_job = await self._create_run_now_job(cron_job)
            return new_job.metadata.name

        return ""

    async def update_crawl_schedule(self, cid, schedule):
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

    async def run_crawl_config(self, cid, userid=None):
        """Run crawl job for cron job based on specified crawlconfig id (cid)
        optionally set different user"""
        cron_jobs = await self.batch_beta_api.list_namespaced_cron_job(
            namespace=self.namespace, label_selector=f"btrix.crawlconfig={cid}"
        )

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
            self._make_crawl_for_job(
                job, "running" if job.status.active else "stopping", False, CrawlOut
            )
            for job in jobs.items
        ]

    async def init_crawl_screencast(self, crawl_id, aid):
        """ Init service for this job/crawl_id to support screencasting """
        labels = {"btrix.archive": aid}

        service = client.V1Service(
            kind="Service",
            api_version="v1",
            metadata={
                "name": crawl_id,
                "labels": labels,
            },
            spec={
                "selector": {"job-name": crawl_id},
                "ports": [{"protocol": "TCP", "port": 9037, "name": "screencast"}],
            },
        )

        try:
            await self.core_api.create_namespaced_service(
                body=service, namespace=self.namespace
            )
        except client.exceptions.ApiException as api_exc:
            if api_exc.status != 409:
                raise api_exc

    async def process_crawl_complete(self, crawlcomplete):
        """Ensure the crawlcomplete data is valid (job exists and user matches)
        Fill in additional details about the crawl"""
        job = await self.batch_api.read_namespaced_job(
            name=crawlcomplete.id, namespace=self.namespace
        )

        if not job:  # or job.metadata.labels["btrix.user"] != crawlcomplete.user:
            return None, None

        manual = job.metadata.annotations.get("btrix.run.manual") == "1"
        if manual and not self.no_delete_jobs:
            self.loop.create_task(self._delete_job(job.metadata.name))

        crawl = self._make_crawl_for_job(
            job,
            "complete" if crawlcomplete.completed else "partial_complete",
            finish_now=True,
        )

        storage_path = job.metadata.annotations.get("btrix.def_storage_path")
        inx = None
        filename = None
        storage_name = None
        if storage_path:
            inx = crawlcomplete.filename.index(storage_path)
            filename = (
                crawlcomplete.filename[inx:] if inx > 0 else crawlcomplete.filename
            )
            storage_name = job.metadata.annotations.get("btrix.storage_name")

        def_storage_name = storage_name if inx else None

        crawl_file = CrawlFile(
            def_storage_name=def_storage_name,
            filename=filename or crawlcomplete.filename,
            size=crawlcomplete.size,
            hash=crawlcomplete.hash,
        )

        return crawl, crawl_file

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

            self._default_storages[name] = S3Storage(
                access_key=access_key,
                secret_key=secret_key,
                endpoint_url=endpoint_url,
                access_endpoint_url=access_endpoint_url,
            )

        return self._default_storages[name]

    def _secret_data(self, secret, name):
        """ decode secret data """
        return base64.standard_b64decode(secret.data[name]).decode()

    async def get_running_crawl(self, name, aid):
        """Get running crawl (job) with given name, or none
        if not found/not running"""
        try:
            job = await self.batch_api.read_namespaced_job(
                name=name, namespace=self.namespace
            )

            if not job or job.metadata.labels["btrix.archive"] != aid:
                return None

            return self._make_crawl_for_job(
                job, "running" if job.status.active else "stopping", False, CrawlOut
            )

        # pylint: disable=broad-except
        except Exception:
            pass

        return None

    async def stop_crawl(self, job_name, aid, graceful=True):
        """Attempt to stop crawl, either gracefully by issuing a SIGTERM which
        will attempt to finish current pages

        OR, abruptly by first issueing a SIGABRT, followed by SIGTERM, which
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

    async def scale_crawl(self, job_name, aid, parallelism=1):
        """ Set the crawl scale (job parallelism) on the specified job """

        try:
            job = await self.batch_api.read_namespaced_job(
                name=job_name, namespace=self.namespace
            )
        # pylint: disable=broad-except
        except Exception:
            return "Crawl not found"

        if not job or job.metadata.labels["btrix.archive"] != aid:
            return "Invalid Crawled"

        if parallelism < 1 or parallelism > 10:
            return "Invalid Scale: Must be between 1 and 10"

        job.spec.parallelism = parallelism

        await self.batch_api.patch_namespaced_job(
            name=job.metadata.name, namespace=self.namespace, body=job
        )

        return None

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

        # if update succeeds, than crawl has not completed, so likely a failure
        failure = await self.crawl_ops.store_crawl(crawl)

        # keep failed jobs around, for now
        if not failure and not self.no_delete_jobs:
            await self._delete_job(job_name)

    # ========================================================================
    # Internal Methods

    # pylint: disable=no-self-use
    def _make_crawl_for_job(self, job, state, finish_now=False, crawl_cls=Crawl):
        """ Make a crawl object from a job"""
        return crawl_cls(
            id=job.metadata.name,
            state=state,
            scale=job.spec.parallelism or 1,
            userid=job.metadata.labels["btrix.user"],
            aid=job.metadata.labels["btrix.archive"],
            cid=job.metadata.labels["btrix.crawlconfig"],
            # schedule=job.metadata.annotations.get("btrix.run.schedule", ""),
            manual=job.metadata.annotations.get("btrix.run.manual") == "1",
            started=job.status.start_time.replace(tzinfo=None),
            finished=datetime.datetime.utcnow().replace(microsecond=0, tzinfo=None)
            if finish_now
            else None,
            colls=json.loads(job.metadata.annotations.get("btrix.colls", [])),
        )

    async def _delete_job(self, name):
        await self.batch_api.delete_namespaced_job(
            name=name,
            namespace=self.namespace,
            grace_period_seconds=60,
            propagation_policy="Foreground",
        )

        try:
            await self.core_api.delete_namespaced_service(
                name=name,
                namespace=self.namespace,
                grace_period_seconds=60,
                propagation_policy="Foreground",
            )
        # pylint: disable=bare-except
        except:
            pass

    def _create_config_map(self, crawlconfig, labels):
        """ Create Config Map based on CrawlConfig + labels """
        config_map = client.V1ConfigMap(
            metadata={
                "name": f"crawl-config-{crawlconfig.id}",
                "namespace": self.namespace,
                "labels": labels,
            },
            data={"crawl-config.json": json.dumps(crawlconfig.get_raw_config())},
        )

        return config_map

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

    # pylint: disable=no-self-use
    def _get_schedule_suspend_run_now(self, crawlconfig):
        """ get schedule/suspend/run_now data based on crawlconfig """

        # Create Cron Job
        suspend = False
        schedule = crawlconfig.schedule

        if not schedule:
            schedule = DEFAULT_NO_SCHEDULE
            suspend = True

        return suspend, schedule

    async def _send_sig_to_pods(self, pods, aid):
        command = ["kill", "-s", "SIGABRT", "1"]
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

        await self.core_api.delete_collection_namespaced_config_map(
            namespace=self.namespace,
            label_selector=label,
            propagation_policy="Foreground",
        )

    async def _create_run_now_job(self, cron_job, userid=None):
        """Create new job from cron job to run instantly"""
        annotations = cron_job.spec.job_template.metadata.annotations
        annotations["btrix.run.manual"] = "1"
        annotations["btrix.run.schedule"] = ""

        # owner_ref = client.V1OwnerReference(
        #    kind="CronJob",
        #    name=cron_job.metadata.name,
        #    block_owner_deletion=True,
        #    controller=True,
        #    userid=cron_job.metadata.userid,
        #    api_version="batch/v1beta1",
        # )

        labels = cron_job.metadata.labels
        if userid:
            labels["btrix.user"] = userid

        ts_now = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        name = f"crawl-now-{ts_now}-{cron_job.metadata.labels['btrix.crawlconfig']}"

        object_meta = client.V1ObjectMeta(
            name=name,
            annotations=annotations,
            labels=labels,
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
        self,
        cid,
        storage_name,
        storage_path,
        labels,
        annotations,
        crawl_timeout,
        parallel,
    ):
        """Return crawl job template for crawl job, including labels, adding optiona crawl params"""

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
                "parallelism": parallel,
                "template": {
                    "metadata": {"labels": labels},
                    "spec": {
                        "containers": [
                            {
                                "name": "crawler",
                                "image": self.crawler_image,
                                "imagePullPolicy": self.crawler_image_pull_policy,
                                "command": [
                                    "crawl",
                                    "--config",
                                    "/tmp/crawl-config.json",
                                ],
                                "volumeMounts": [
                                    {
                                        "name": "crawl-config",
                                        "mountPath": "/tmp/crawl-config.json",
                                        "subPath": "crawl-config.json",
                                        "readOnly": True,
                                    }
                                ],
                                "envFrom": [
                                    {"configMapRef": {"name": "shared-crawler-config"}},
                                    {"secretRef": {"name": f"storage-{storage_name}"}},
                                ],
                                "env": [
                                    {
                                        "name": "CRAWL_ID",
                                        "valueFrom": {
                                            "fieldRef": {
                                                "fieldPath": "metadata.labels['job-name']"
                                            }
                                        },
                                    },
                                    {"name": "STORE_PATH", "value": storage_path},
                                    {
                                        "name": "STORE_FILENAME",
                                        "value": "@ts-@hostname.wacz",
                                    },
                                ],
                                "resources": resources,
                            }
                        ],
                        "volumes": [
                            {
                                "name": "crawl-config",
                                "configMap": {
                                    "name": f"crawl-config-{cid}",
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
