""" K8S API Access """

from kubernetes_asyncio import client, config
from kubernetes_asyncio.stream import WsApiClient
from kubernetes_asyncio.client.api_client import ApiClient

# pylint: disable=too-few-public-methods
class K8sAPI:
    """ K8S API accessors """

    def __init__(self):
        super().__init__()

        config.load_incluster_config()
        self.client = client

        self.api_client = ApiClient()

        self.core_api = client.CoreV1Api(self.api_client)
        self.core_api_ws = client.CoreV1Api(api_client=WsApiClient())
        self.batch_api = client.BatchV1Api(self.api_client)
        self.apps_api = client.AppsV1Api(self.api_client)
