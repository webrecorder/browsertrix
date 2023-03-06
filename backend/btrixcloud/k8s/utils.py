""" k8s utils """

import os
import yaml

from kubernetes_asyncio.utils import create_from_dict
from kubernetes_asyncio.client.api import custom_objects_api
from kubernetes_asyncio import config


def get_templates_dir():
    """return directory containing templates for loading"""
    return os.path.join(os.path.dirname(__file__), "templates")


async def create_from_yaml(k8s_client, doc, namespace):
    """init k8s objects from yaml"""
    yml_document_all = yaml.safe_load_all(doc)
    k8s_objects = []
    for yml_document in yml_document_all:
        custom = k8s_client.get_custom_api(yml_document["kind"])
        if custom is not None:
            created = await create_custom_from_dict(custom, yml_document, namespace)
        else:
            created = await create_from_dict(
                k8s_client, yml_document, verbose=False, namespace=namespace
            )
        k8s_objects.append(created)

    return k8s_objects


async def create_custom_from_dict(custom, doc, namespace):
    apiver = doc["apiVersion"].split("/")
    created = await custom["api"].create_namespaced_custom_object(
        group=apiver[0],
        version=apiver[1],
        plural=custom["plural"],
        body=doc,
        namespace=namespace,
    )
    return created


async def send_signal_to_pods(core_api_ws, namespace, pods, signame, func=None):
    """send signal to all pods"""
    command = ["bash", "-c", f"kill -s {signame} 1"]
    signaled = False

    try:
        for pod in pods:
            if func and not func(pod.metadata):
                continue

            print(f"Sending {signame} to {pod.metadata.name}", flush=True)

            res = await core_api_ws.connect_get_namespaced_pod_exec(
                pod.metadata.name,
                namespace=namespace,
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
