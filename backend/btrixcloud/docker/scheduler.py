""" Standalone scheduler app for Docker deployment"""

# import json

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.mongodb import MongoDBJobStore
from pymongo import MongoClient
from pytz import utc

from ..db import DATABASE_URL

# pylint: disable=invalid-name
global_trigger_q = None


def trigger_crawl(**kwargs):
    """ send crawl trigger message """
    print("crawl triggered", kwargs, flush=True)
    global_trigger_q.put(kwargs)


def run_scheduler(event_q, trigger_q):
    """ init scheduler + start tcp server """

    # pylint: disable=global-statement
    global global_trigger_q
    global_trigger_q = trigger_q

    print("Initializing Scheduler...", flush=True)

    scheduler = BackgroundScheduler(timezone=utc)

    mongoclient = MongoClient(DATABASE_URL)

    scheduler.add_jobstore(MongoDBJobStore(client=mongoclient))

    scheduler.start()

    print("Scheduler Ready", flush=True)

    while True:
        msg = event_q.get()

        try:
            if msg.get("schedule"):
                print(f"Setting Schedule: {msg['cid']} {msg['schedule']}", flush=True)
                scheduler.add_job(
                    func=trigger_crawl,
                    trigger=CronTrigger.from_crontab(msg["schedule"]),
                    id=msg["cid"],
                    kwargs={"cid": msg["cid"], "schedule": msg["schedule"]},
                    replace_existing=True,
                )

            else:
                print(f"Removing Schedule: {msg['cid']}", flush=True)
                scheduler.remove_job(job_id=msg["cid"])

        # pylint: disable=broad-except
        except Exception as exc:
            print(exc)
