import os
import json
import time
import yaml

from fastapi import FastAPI, Request, HTTPException
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from datetime import datetime

from .k8s.utils import get_templates_dir

templates = Jinja2Templates(directory=get_templates_dir())

# curl -v -X POST http://browsertrix-cloud-backend:8000/operator/sync
def init_operator_webhook(app):
    @app.post("/operator/sync")
    async def metacontroller_webhook(request: Request):
        # Handle the incoming webhook from Metacontroller
        try:
            payload = await request.json()
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")
        parent, children = payload["parent"], payload["children"]
        return sync(parent, children)

JOBS = {}
flag = False

def sync(parent, children):
    global JOBS
    now = datetime.now()
    current_time = now.strftime("%H:%M:%S")

    # Compute status based on observed state.
    jobs = children["Job.batch/v1"]

    ready = -1
    active = -1
    startTime = "N/A"
    jobname = "N/A"
    njobs = len(jobs)

    print(">>>> P >>>>>>", json.dumps(parent, indent=4), flush=True)
    print(">>>>> C >>>>>", json.dumps(children, indent=4), flush=True)

    for j in jobs:
        if "ready" in jobs[j]["status"]:
            ready = jobs[j]["status"]["ready"]
        if "active" in jobs[j]["status"]:
            active = jobs[j]["status"]["active"]
        if "startTime" in jobs[j]["status"]:
            startTime = jobs[j]["status"]["startTime"]

    jobname = parent["metadata"]["name"]
    if jobname not in JOBS:
        JOBS[jobname] = 0
        print(jobname, "is not available", active, ready, njobs)
    else:
        print(jobname, "is", JOBS[jobname], active, ready, njobs)

    msg = "N/A"
    if active == -1 and ready == -1 and njobs == 0:
        msg = "INIT"
    elif active == -1 and ready == -1 and njobs == 1:
        msg = "CREATING"
    elif active == 1 and ready == 0 and njobs == 1:
        if JOBS[jobname] == 0:
            msg = "STARTING"            
        else:
            msg = "FINISHING"
    elif active == 1 and ready == 1 and njobs == 1:
        msg = "RUNNING"
        JOBS[jobname] = 1
    elif active == -1 and ready == 0 and njobs == 1:
        msg = "FINISHED"
        del JOBS[jobname]
    
    desired_status = {
        "jobs": len(jobs),
        "startTime": startTime,
        "active": active,
        "ready": ready,
        "message": msg,
    }

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

    global flag
    if flag:
        # if active == -1 and ready == 0 and njobs == 1:
        #     if jobname not in JOBS:
        #         flag = False
        return {"status": [], "children": []}

    flag = True
    return {"status": desired_status, "children": desired_pods}
