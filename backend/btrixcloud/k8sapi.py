"""K8S API Access"""

import os
import traceback
from datetime import datetime
from typing import Optional, List, Any

import yaml

from kubernetes_asyncio import client, config
from kubernetes_asyncio.stream import WsApiClient
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.api import custom_objects_api
from kubernetes_asyncio.client.models import V1CronJob
from kubernetes_asyncio.utils import create_from_dict
from kubernetes_asyncio.client.exceptions import ApiException

from redis import asyncio as aioredis
from redis.asyncio.client import Redis

from fastapi import HTTPException
from fastapi.templating import Jinja2Templates

from .utils import get_templates_dir, dt_now, date_to_str


# ============================================================================
# pylint: disable=too-many-instance-attributes,too-many-public-methods
class K8sAPI:
    """K8S API accessors"""

    def __init__(self):
        super().__init__()
        self.namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        self.crawler_fqdn_suffix = (
            os.environ.get("CRAWLER_FQDN_SUFFIX")
            or f".{self.namespace}.svc.cluster.local"
        )
        self.custom_resources = {}

        self.templates = Jinja2Templates(
            directory=get_templates_dir(), autoescape=False
        )

        config.load_incluster_config()
        self.client = client

        self.api_client = ApiClient()

        self.core_api = client.CoreV1Api(self.api_client)
        self.core_api_ws = client.CoreV1Api(api_client=WsApiClient())
        self.batch_api = client.BatchV1Api(self.api_client)
        self.apps_api = client.AppsV1Api(self.api_client)

        # try separate api client to avoid content-type issues
        self.custom_api = custom_objects_api.CustomObjectsApi(self.api_client)

        # custom resource's client API
        self.add_custom_resource("CrawlJob", "crawljobs")
        self.add_custom_resource("ProfileJob", "profilejobs")
        self.add_custom_resource("CollIndex", "collindexes")

    def add_custom_resource(self, name, plural):
        """add custom resource"""
        self.custom_resources[name] = plural

    def get_custom_api(self, kind):
        """return custom API"""
        return self.custom_resources[kind] if kind in self.custom_resources else None

    def get_redis_url(self, obj_id):
        """get redis url for obj id"""
        redis_url = f"redis://redis-{obj_id}.redis{self.crawler_fqdn_suffix}/0"
        return redis_url

    async def get_redis_client(self, redis_url):
        """return redis client with correct params for one-time use"""
        return aioredis.from_url(
            redis_url,
            decode_responses=True,
            auto_close_connection_pool=True,
            socket_timeout=20,
        )

    async def get_redis_connected(self, obj_id: str) -> Optional[Redis]:
        """init redis, ensure connectivity"""
        redis_url = self.get_redis_url(obj_id)
        redis = None
        try:
            redis = await self.get_redis_client(redis_url)
            # test connection
            await redis.ping()
            return redis

        # pylint: disable=bare-except
        except:
            if redis:
                await redis.close()

            return None

    # pylint: disable=too-many-arguments, too-many-locals
    def new_crawl_job_yaml(
        self,
        cid: str,
        userid: str,
        oid: str,
        storage: str,
        crawler_channel: Optional[str] = "",
        scale: Optional[int] = 1,
        browser_windows: Optional[int] = 1,
        crawl_timeout: Optional[int] = 0,
        max_crawl_size: Optional[int] = 0,
        manual: bool = True,
        crawl_id: Optional[str] = None,
        warc_prefix: Optional[str] = "",
        storage_filename: str = "",
        profile_filename: str = "",
        profileid: str = "",
        qa_source: str = "",
        proxy_id: str = "",
        dedupe_coll_id: str = "",
        is_single_page: bool = False,
        seed_file_url: str = "",
    ):
        """load job template from yaml"""
        if not crawl_id:
            ts_now = dt_now().strftime("%Y%m%d%H%M%S")
            prefix = "manual" if manual else "sched"
            crawl_id = f"{prefix}-{ts_now}-{cid[:12]}"

        params = {
            "id": crawl_id,
            "cid": cid,
            "userid": userid,
            "oid": oid,
            "storage_name": storage,
            "crawler_channel": crawler_channel,
            "scale": scale,
            "browser_windows": browser_windows,
            "timeout": crawl_timeout,
            "max_crawl_size": max_crawl_size or 0,
            "manual": "1" if manual else "0",
            "warc_prefix": warc_prefix,
            "storage_filename": storage_filename,
            "profile_filename": profile_filename,
            "profileid": profileid,
            "qa_source": qa_source,
            "proxy_id": proxy_id,
            "dedupe_coll_id": dedupe_coll_id,
            "is_single_page": "1" if is_single_page else "0",
            "seed_file_url": seed_file_url,
        }

        data = self.templates.env.get_template("crawl_job.yaml").render(params)
        return crawl_id, data

    async def new_crawl_job(
        self,
        cid: str,
        userid: str,
        oid: str,
        storage: str,
        crawler_channel: Optional[str] = "",
        scale: Optional[int] = 1,
        browser_windows: Optional[int] = 1,
        crawl_timeout: Optional[int] = 0,
        max_crawl_size: Optional[int] = 0,
        manual: bool = True,
        crawl_id: Optional[str] = None,
        warc_prefix: Optional[str] = "",
        storage_filename: str = "",
        profile_filename: str = "",
        profileid: str = "",
        qa_source: str = "",
        proxy_id: str = "",
        dedupe_coll_id: str = "",
        is_single_page: bool = False,
        seed_file_url: str = "",
    ) -> str:
        """load and init crawl job via k8s api"""
        crawl_id, data = self.new_crawl_job_yaml(
            cid=cid,
            userid=userid,
            oid=oid,
            storage=storage,
            crawler_channel=crawler_channel,
            scale=scale,
            browser_windows=browser_windows,
            crawl_timeout=crawl_timeout,
            max_crawl_size=max_crawl_size,
            manual=manual,
            crawl_id=crawl_id,
            warc_prefix=warc_prefix or "",
            storage_filename=storage_filename,
            profile_filename=profile_filename,
            profileid=profileid,
            qa_source=qa_source,
            proxy_id=proxy_id,
            dedupe_coll_id=dedupe_coll_id,
            is_single_page=is_single_page,
            seed_file_url=seed_file_url,
        )

        # create job directly
        await self.create_from_yaml(data)

        return crawl_id or ""

    async def create_from_yaml(self, doc, namespace=None):
        """init k8s objects from yaml"""
        yml_document_all = yaml.safe_load_all(doc)
        k8s_objects = []
        for yml_document in yml_document_all:
            custom = self.custom_resources.get(yml_document["kind"])
            if custom is not None:
                created = await self.create_custom_from_dict(
                    custom, yml_document, namespace
                )
            else:
                created = await create_from_dict(
                    self.api_client,
                    yml_document,
                    verbose=False,
                    namespace=namespace or self.namespace,
                )
            k8s_objects.append(created)

        return k8s_objects

    async def create_custom_from_dict(self, custom, doc, namespace):
        """create custom from dict"""
        apiver = doc["apiVersion"].split("/")
        created = await self.custom_api.create_namespaced_custom_object(
            group=apiver[0],
            version=apiver[1],
            plural=custom,
            body=doc,
            namespace=namespace or self.namespace,
        )
        return created

    async def has_storage_secret(self, storage_secret) -> bool:
        """Check if storage is valid by trying to get the storage secret
        Will throw if not valid, otherwise return True"""
        try:
            await self.core_api.read_namespaced_secret(
                storage_secret,
                namespace=self.namespace,
            )
            return True

        # pylint: disable=broad-except
        except Exception:
            # pylint: disable=broad-exception-raised,raise-missing-from
            raise HTTPException(
                status_code=400, detail="invalid_config_missing_storage_secret"
            )

    async def delete_crawl_job(self, crawl_id):
        """delete custom crawljob object"""
        name = f"crawljob-{crawl_id}"

        return await self.delete_custom_object(name, "crawljobs")

    async def delete_profile_browser(self, browserid):
        """delete custom crawljob object"""
        name = f"profilejobs-{browserid}"

        res = await self.delete_custom_object(name, "profilejobs")

        return res.get("success") is True

    async def delete_custom_object(self, name: str, plural: str):
        """delete custom object with name and plural type"""
        try:
            await self.custom_api.delete_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural=plural,
                name=name,
                grace_period_seconds=0,
                # delete as background to allow operator to do proper cleanup
                propagation_policy="Background",
            )
            return {"success": True}

        except ApiException as api_exc:
            return {"error": str(api_exc.reason)}

    async def get_profile_browser(self, browserid):
        """get profile browser"""
        return await self.custom_api.get_namespaced_custom_object(
            group="btrix.cloud",
            version="v1",
            namespace=self.namespace,
            plural="profilejobs",
            name=f"profilejob-{browserid}",
        )

    async def _patch_job(self, obj_id, body, pluraltype="crawljobs") -> dict:
        """patch crawl/profile job"""
        name = f"{pluraltype[:-1]}-{obj_id}"

        return await self.patch_custom_object(name, body, pluraltype)

    async def patch_custom_object(self, name: str, body, pluraltype: str) -> dict:
        """patch custom object"""
        try:

            await self.custom_api.patch_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural=pluraltype,
                name=name,
                body={"spec": body},
                _content_type="application/merge-patch+json",
            )
            return {"success": True}
        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            return {"error": str(exc)}

    async def unsuspend_k8s_job(self, name) -> dict:
        """unsuspend k8s Job"""
        try:
            await self.batch_api.patch_namespaced_job(
                name=name, namespace=self.namespace, body={"spec": {"suspend": False}}
            )
            return {"success": True}
        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            return {"error": str(exc)}

    async def print_pod_logs(self, pod_names, lines=100):
        """print pod logs"""
        for pod in pod_names:
            print(f"============== LOGS FOR POD: {pod} ==============")
            try:
                resp = await self.core_api.read_namespaced_pod_log(
                    pod, self.namespace, tail_lines=lines
                )
                print(resp)
            # pylint: disable=bare-except
            except:
                print("Logs Not Found")

    async def is_pod_metrics_available(self) -> bool:
        """return true/false if metrics server api is available by
        attempting list operation. if operation succeeds, then
        metrics are available, otherwise not available
        """
        try:
            await self.custom_api.list_namespaced_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                namespace=self.namespace,
                plural="pods",
                limit=1,
            )
            return True
        # pylint: disable=broad-exception-caught
        except Exception as exc:
            print(exc)
            return False

    async def has_custom_jobs_with_label(self, plural, label) -> bool:
        """return true/false if any crawljobs or profilejobs
        match given label"""
        try:
            await self.custom_api.list_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural=plural,
                label_selector=label,
                limit=1,
            )
            return True
        # pylint: disable=broad-exception-caught
        except Exception:
            return False

    async def send_signal_to_pod(self, pod_name, signame) -> bool:
        """send signal to all pods"""
        command = ["bash", "-c", f"kill -s {signame} 1"]
        signaled = False

        try:
            print(f"Sending {signame} to {pod_name}", flush=True)

            res = await self.core_api_ws.connect_get_namespaced_pod_exec(
                name=pod_name,
                namespace=self.namespace,
                command=command,
                stdout=True,
            )
            if res:
                print("Result", res, flush=True)

            else:
                signaled = True

        # pylint: disable=broad-except
        except Exception as exc:
            print(f"Send Signal Error: {exc}", flush=True)

        return signaled

    async def delete_cron_job_by_name(self, name: str) -> None:
        """Delete cron job by name"""
        await self.batch_api.delete_namespaced_cron_job(
            name=name,
            namespace=self.namespace,
        )

    async def list_cron_jobs(self, label: str = "") -> List[V1CronJob]:
        """Return list of all cron jobs, optionally filtered by label"""
        resp = await self.batch_api.list_namespaced_cron_job(
            namespace=self.namespace,
            label_selector=label,
        )
        return resp.items

    async def list_crawl_jobs(self, label: str = "") -> List[dict[str, Any]]:
        """Return list of all crawl jobs, optionally filtered by label)"""
        resp = await self.custom_api.list_namespaced_custom_object(
            group="btrix.cloud",
            version="v1",
            namespace=self.namespace,
            plural="crawljobs",
            label_selector=label,
        )
        return resp.get("items", [])

    async def _delete_cron_jobs(self, label: str) -> None:
        """Delete namespaced cron jobs (e.g. crawl configs, bg jobs)"""
        await self.batch_api.delete_collection_namespaced_cron_job(
            namespace=self.namespace,
            label_selector=label,
        )

    async def _delete_custom_objects(
        self, label: str, plural: str = "crawljobs"
    ) -> None:
        """Delete custom objects (e.g. crawl jobs, profile browser jobs)"""
        await self.custom_api.delete_collection_namespaced_custom_object(
            group="btrix.cloud",
            version="v1",
            namespace=self.namespace,
            label_selector=label,
            plural=plural,
            grace_period_seconds=0,
            propagation_policy="Background",
        )

    async def create_coll_index_direct(
        self, coll_id: str, oid: str, modified: Optional[datetime] = None
    ):
        """create collection index if doesn't exist"""
        params = {
            "id": coll_id,
            "oid": oid,
            "collItemsUpdatedAt": date_to_str(modified or dt_now()),
        }
        data = self.templates.env.get_template("coll_index.yaml").render(params)

        try:
            await self.create_from_yaml(data)

        except ApiException as e:
            # 409 if object already exists, ignore silently
            if e.status != 409:
                raise e
