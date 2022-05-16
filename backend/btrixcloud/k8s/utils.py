""" k8s utils """

import os
import yaml

from kubernetes_asyncio.utils import create_from_dict


def get_templates_dir():
    """ return directory containing templates for loading """
    return os.path.join(os.path.dirname(__file__), "templates")


async def create_from_yaml(k8s_client, doc, namespace):
    """ init k8s objects from yaml """
    yml_document_all = yaml.safe_load_all(doc)
    k8s_objects = []
    for yml_document in yml_document_all:
        created = await create_from_dict(
            k8s_client, yml_document, verbose=False, namespace=namespace
        )
        k8s_objects.append(created)

    return k8s_objects


async def send_signal_to_pods(core_api_ws, namespace, pods, signame, func=None):
    """ send signal to all pods """
    command = ["kill", "-s", signame, "1"]
    interrupted = False

    try:
        for pod in pods:
            if func and not func(pod.metadata):
                continue

            await core_api_ws.connect_get_namespaced_pod_exec(
                pod.metadata.name,
                namespace=namespace,
                command=command,
                stdout=True,
            )
            interrupted = True

    # pylint: disable=broad-except
    except Exception as exc:
        print(f"Exec Error: {exc}", flush=True)

    return interrupted
