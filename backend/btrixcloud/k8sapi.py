""" K8S API Access """
import os
import traceback

from datetime import timedelta

import yaml

from kubernetes_asyncio import client, config
from kubernetes_asyncio.stream import WsApiClient
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.api import custom_objects_api
from kubernetes_asyncio.utils import create_from_dict
from kubernetes_asyncio.client.exceptions import ApiException

from redis import asyncio as aioredis

from fastapi.templating import Jinja2Templates
from .utils import get_templates_dir, dt_now, to_k8s_date


# ============================================================================
# pylint: disable=too-many-instance-attributes
class K8sAPI:
    """K8S API accessors"""

    def __init__(self):
        super().__init__()
        self.namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        self.custom_resources = {}

        self.templates = Jinja2Templates(directory=get_templates_dir())

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

    def add_custom_resource(self, name, plural):
        """add custom resource"""
        self.custom_resources[name] = plural

    def get_custom_api(self, kind):
        """return custom API"""
        return self.custom_resources[kind] if kind in self.custom_resources else None

    def get_redis_url(self, crawl_id):
        """get redis url for crawl id"""
        redis_id = f"redis-{crawl_id}"
        redis_url = (
            f"redis://{redis_id}-0.{redis_id}.{self.namespace}.svc.cluster.local/0"
        )
        return redis_url

    async def get_redis_client(self, redis_url):
        """return redis client with correct params for one-time use"""
        return aioredis.from_url(
            redis_url, decode_responses=True, auto_close_connection_pool=True
        )

    # pylint: disable=too-many-arguments
    async def new_crawl_job(
        self, cid, userid, oid, scale=1, crawl_timeout=0, manual=True
    ):
        """load job template from yaml"""
        if crawl_timeout:
            crawl_expire_time = to_k8s_date(dt_now() + timedelta(seconds=crawl_timeout))
        else:
            crawl_expire_time = ""

        ts_now = dt_now().strftime("%Y%m%d%H%M%S")
        prefix = "manual" if manual else "sched"
        crawl_id = f"{prefix}-{ts_now}-{cid[:12]}"

        params = {
            "id": crawl_id,
            "cid": cid,
            "oid": oid,
            "userid": userid,
            "scale": scale,
            "expire_time": crawl_expire_time,
            "manual": "1" if manual else "0",
        }

        data = self.templates.env.get_template("crawl_job.yaml").render(params)

        # create job directly
        await self.create_from_yaml(data)

        return crawl_id

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

    async def delete_crawl_job(self, crawl_id):
        """delete custom crawljob object"""
        try:
            await self.custom_api.delete_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural="crawljobs",
                name=f"crawljob-{crawl_id}",
                grace_period_seconds=0,
                propagation_policy="Foreground",
            )
            return {"success": True}

        except ApiException as api_exc:
            return {"error": str(api_exc.reason)}

    async def delete_profile_browser(self, browserid):
        """delete custom crawljob object"""
        try:
            await self.custom_api.delete_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural="profilejobs",
                name=f"profilejob-{browserid}",
                grace_period_seconds=0,
                propagation_policy="Foreground",
            )
            return True

        except ApiException:
            return False

    async def get_profile_browser(self, browserid):
        """get profile browser"""
        return await self.custom_api.get_namespaced_custom_object(
            group="btrix.cloud",
            version="v1",
            namespace=self.namespace,
            plural="profilejobs",
            name=f"profilejob-{browserid}",
        )

    async def _patch_job(self, crawl_id, body, pluraltype="crawljobs"):
        content_type = self.api_client.default_headers.get("Content-Type")

        try:
            self.api_client.set_default_header(
                "Content-Type", "application/merge-patch+json"
            )

            await self.custom_api.patch_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural=pluraltype,
                name=f"{pluraltype[:-1]}-{crawl_id}",
                body={"spec": body},
            )
            return {"success": True}
        # pylint: disable=broad-except
        except Exception as exc:
            traceback.print_exc()
            return {"error": str(exc)}

        finally:
            if content_type:
                self.api_client.set_default_header("Content-Type", content_type)
            else:
                del self.api_client.default_headers["Content-Type"]
