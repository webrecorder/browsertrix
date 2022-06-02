""" base k8s job driver """

import os
import asyncio
import sys

import yaml

from fastapi.templating import Jinja2Templates

from .utils import create_from_yaml, get_templates_dir
from .k8sapi import K8sAPI


# =============================================================================
# pylint: disable=too-many-instance-attributes,bare-except,broad-except
class K8SJobMixin(K8sAPI):
    """ Crawl Job State """

    def __init__(self):
        self.namespace = os.environ.get("CRAWL_NAMESPACE") or "crawlers"
        self.config_file = "/config/config.yaml"

        self.job_id = os.environ.get("JOB_ID")
        self.orig_job_id = self.job_id
        if self.job_id.startswith("job-"):
            self.job_id = self.job_id[4:]

        self.templates = Jinja2Templates(directory=get_templates_dir())
        super().__init__()

    async def init_job_objects(self, template, extra_params=None):
        """ init k8s objects from specified template with given extra_params """
        with open(self.config_file) as fh_config:
            params = yaml.safe_load(fh_config)

        params["id"] = self.job_id

        if extra_params:
            params.update(extra_params)

        data = self.templates.env.get_template(template).render(params)

        await create_from_yaml(self.api_client, data, namespace=self.namespace)

    async def delete_job_objects(self, selector):
        """ delete crawl stateful sets, services and pvcs """
        kwargs = {
            "namespace": self.namespace,
            "label_selector": selector,
        }

        statefulsets = await self.apps_api.list_namespaced_stateful_set(**kwargs)

        for statefulset in statefulsets.items:
            print(f"Deleting service {statefulset.spec.service_name}")
            await self.core_api.delete_namespaced_service(
                name=statefulset.spec.service_name,
                namespace=self.namespace,
                propagation_policy="Foreground",
            )
            print(f"Deleting statefulset {statefulset.metadata.name}")
            await self.apps_api.delete_namespaced_stateful_set(
                name=statefulset.metadata.name,
                namespace=self.namespace,
                propagation_policy="Foreground",
            )

        # until delete policy is supported
        try:
            await self.core_api.delete_collection_namespaced_persistent_volume_claim(
                **kwargs
            )
        except Exception as exc:
            print("PVC Delete failed", exc, flush=True)

        # delete our own job!
        await self.batch_api.delete_namespaced_job(
            name=self.orig_job_id,
            namespace=self.namespace,
            grace_period_seconds=30,
            propagation_policy="Foreground",
        )

        asyncio.create_task(self.exit_soon(5))

    async def exit_soon(self, timeout):
        """ exit soon """
        print("k8s objects deleted, job complete, exiting", flush=True)
        await asyncio.sleep(timeout)
        sys.exit(0)
