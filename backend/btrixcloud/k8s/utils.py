""" k8s utils """

import os
from datetime import datetime


def get_templates_dir():
    """return directory containing templates for loading"""
    return os.path.join(os.path.dirname(__file__), "templates")


def from_k8s_date(string):
    """convert k8s date string to datetime"""
    return datetime.fromisoformat(string[:-1]) if string else None


def to_k8s_date(dt_val):
    """convert datetime to string for k8s"""
    return dt_val.isoformat("T") + "Z"


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


def dt_now():
    """get current ts"""
    return datetime.utcnow().replace(microsecond=0, tzinfo=None)


def ts_now():
    """get current ts"""
    return str(dt_now())
