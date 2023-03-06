""" btrixjob operator (working for metacontroller) """

import os
import json
import yaml

from fastapi import Request, HTTPException
from fastapi.templating import Jinja2Templates

from .k8s.utils import get_templates_dir

templates = Jinja2Templates(directory=get_templates_dir())

BTRIX_JOBS = {}


def init_operator_webhook(app):
    """regsiters webhook handlers for metacontroller"""
    @app.post("/operator/sync")
    async def metacontroller_webhook(request: Request):
        # Handle the incoming webhook from Metacontroller
        try:
            payload = await request.json()
        except json.JSONDecodeError as err_json:
            raise HTTPException(status_code=400, detail="Invalid JSON payload") from err_json
        parent, children = payload["parent"], payload["children"]
        return sync(parent, children)


# pylint: disable=too-many-locals,global-variable-not-assigned,too-many-branches
def sync(parent, children):
    """sync with metacontroller"""
    global BTRIX_JOBS

    # Compute status based on observed state.
    jobs = children["Job.batch/v1"]

    ready = -1
    active = -1
    start_time = "N/A"
    jobname = "N/A"
    njobs = len(jobs)
    msg = "N/A"

    for j in jobs:
        if "ready" in jobs[j]["status"]:
            ready = jobs[j]["status"]["ready"]
        if "active" in jobs[j]["status"]:
            active = jobs[j]["status"]["active"]
        if "startTime" in jobs[j]["status"]:
            start_time = jobs[j]["status"]["startTime"]

    is_first_time = False
    jobname = parent["metadata"]["name"]
    if jobname not in BTRIX_JOBS:
        BTRIX_JOBS[jobname] = 0
        if njobs == 0:
            is_first_time = True
        print("operator", jobname, "is not available", active, ready, njobs, flush=True)
    else:
        print(
            "operator",
            jobname,
            "is",
            BTRIX_JOBS[jobname],
            active,
            ready,
            njobs,
            flush=True,
        )

    if is_first_time and active == -1 and ready == -1 and njobs == 0:
        msg = "INIT"
    elif active == -1 and ready == -1 and njobs == 1:
        msg = "CREATING"
    elif active == 1 and ready == 0 and njobs == 1:
        if BTRIX_JOBS[jobname] == 0:
            msg = "STARTING"
        else:
            msg = "FINISHING"
    elif active == 1 and ready == 1 and njobs == 1:
        msg = "RUNNING"
        BTRIX_JOBS[jobname] = 1
    elif active == -1 and ready == 0 and njobs == 1:
        msg = "FINISHED"
    elif active == -1 and ready == -1 and njobs == 0:
        msg = "FINISHED"
        del BTRIX_JOBS[jobname]

    desired_status = {
        "jobs": len(jobs),
        "startTime": start_time,
        "active": active,
        "ready": ready,
        "message": msg,
    }

    print("operator", jobname, msg, desired_status, flush=True)

    # craw_job template
    spec = parent.get("spec", {})
    params = {
        "id": spec.get("id", ""),
        "cid": spec.get("configId", ""),
        "userid": spec.get("userId", ""),
        "oid": spec.get("orgId", ""),
        "job_image": spec.get("jobImage", ""),
        "job_pull_policy": spec.get("jobPullPolicy", ""),
        "manual": str(spec.get("manual", "1")),
        "crawler_node_type": spec.get("nodeType", ""),
        "tags": spec.get("tags", ""),
        # the following isn't in btrix_job.yaml
        "schedule": spec.get("schedule", ""),
        "mongo_db_url": spec.get("mongo_db_url", ""),
        "env": os.environ,
    }
    craw_job = templates.env.get_template("crawl_job.yaml").render(params)

    # Generate the desired child object(s).
    # convert craw_job in yaml to JSON
    desired_pods = list(yaml.safe_load_all(craw_job))

    if not is_first_time:
        return {"status": [], "children": []}

    return {"status": desired_status, "children": desired_pods}
