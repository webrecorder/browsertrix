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


def dt_now():
    """get current ts"""
    return datetime.utcnow().replace(microsecond=0, tzinfo=None)


def ts_now():
    """get current ts"""
    return str(dt_now())


async def get_page_stats(redis, crawl_id):
    """get page stats"""
    pages_done = await redis.llen(f"{crawl_id}:d")
    pages_found = await redis.scard(f"{crawl_id}:s")
    stats = {"found": pages_found, "done": pages_done}
    return stats
