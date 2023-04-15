""" K8S API Access """
import os
import traceback

import yaml

from kubernetes_asyncio import client, config
from kubernetes_asyncio.stream import WsApiClient
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.api import custom_objects_api
from kubernetes_asyncio.utils import create_from_dict


# pylint: disable=too-few-public-methods,too-many-instance-attributes
class K8sAPI:
    """K8S API accessors"""

    def __init__(self):
        super().__init__()
        self.namespace = os.environ.get("CRAWLER_NAMESPACE") or "crawlers"
        self.custom_resources = {}

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

    async def create_from_yaml(self, doc):
        """init k8s objects from yaml"""
        yml_document_all = yaml.safe_load_all(doc)
        k8s_objects = []
        for yml_document in yml_document_all:
            custom = self.custom_resources.get(yml_document["kind"])
            if custom is not None:
                created = await self.create_custom_from_dict(custom, yml_document)
            else:
                created = await create_from_dict(
                    self.api_client,
                    yml_document,
                    verbose=False,
                    namespace=self.namespace,
                )
            k8s_objects.append(created)

        return k8s_objects

    async def create_custom_from_dict(self, custom, doc):
        """create custom from dict"""
        apiver = doc["apiVersion"].split("/")
        created = await self.custom_api.create_namespaced_custom_object(
            group=apiver[0],
            version=apiver[1],
            plural=custom,
            body=doc,
            namespace=self.namespace,
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
                name=f"job-{crawl_id}",
                grace_period_seconds=0,
                propagation_policy="Foreground",
            )
            return True

        # pylint: disable=broad-except
        except Exception as exc:
            print("CrawlJob delete failed", exc)
            return False

    async def delete_profile_browser(self, browserid):
        """delete custom crawljob object"""
        try:
            await self.custom_api.delete_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural="profilejobs",
                name=f"job-{browserid}",
                grace_period_seconds=0,
                propagation_policy="Foreground",
            )
            return True

        # pylint: disable=broad-except
        except Exception as exc:
            print("ProfileJob delete failed", exc)
            return False

    async def get_profile_browser(self, browserid):
        """get profile browser"""
        return await self.custom_api.get_namespaced_custom_object(
            group="btrix.cloud",
            version="v1",
            namespace=self.namespace,
            plural="profilejobs",
            name=f"job-{browserid}",
        )

    async def _patch_job(self, crawl_id, body, pluraltype="crawljobs"):
        content_type = (
            self.api_client.default_headers.get("Content-Type")
        )

        try:
            self.api_client.set_default_header(
                "Content-Type", "application/merge-patch+json"
            )

            await self.custom_api.patch_namespaced_custom_object(
                group="btrix.cloud",
                version="v1",
                namespace=self.namespace,
                plural=pluraltype,
                name=f"job-{crawl_id}",
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
