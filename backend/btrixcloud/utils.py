""" k8s utils """

from typing import Optional
import os
import asyncio
import json
import sys
import signal
import atexit

from datetime import datetime

from redis import asyncio as exceptions
from slugify import slugify


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


async def get_redis_crawl_stats(redis, crawl_id):
    """get page stats"""
    try:
        # crawler >0.9.0, done key is a value
        pages_done = int(await redis.get(f"{crawl_id}:d") or 0)
    except exceptions.ResponseError:
        # crawler <=0.9.0, done key is a list
        pages_done = await redis.llen(f"{crawl_id}:d")

    pages_found = await redis.scard(f"{crawl_id}:s")
    archive_size = await redis.hvals(f"{crawl_id}:size")
    archive_size = sum(int(x) for x in archive_size)

    stats = {"found": pages_found, "done": pages_done, "size": archive_size}
    return stats


def run_once_lock(name):
    """run once lock via temp directory
    - if dir doesn't exist, return true
    - if exists, return false"""
    lock_dir = "/tmp/." + name
    try:
        os.mkdir(lock_dir)
    # pylint: disable=bare-except
    except:
        return False

    # just in case, delete dir on exit
    def del_dir():
        print("release lock: " + lock_dir, flush=True)
        os.rmdir(lock_dir)

    atexit.register(del_dir)
    return True


def register_exit_handler():
    """register exit handler to exit on SIGTERM"""
    loop = asyncio.get_running_loop()

    def exit_handler():
        """sigterm handler"""
        print("SIGTERM received, exiting")
        sys.exit(1)

    loop.add_signal_handler(signal.SIGTERM, exit_handler)


def parse_jsonl_error_messages(errors):
    """parse json-l error strings from redis/db into json"""
    parsed_errors = []
    for error_line in errors:
        if not error_line:
            continue
        try:
            result = json.loads(error_line)
            parsed_errors.append(result)
        except json.JSONDecodeError as err:
            print(
                f"Error decoding json-l error line: {error_line}. Error: {err}",
                flush=True,
            )
    return parsed_errors


def is_bool(stri: Optional[str]) -> bool:
    """Check if the string parameter is stringly true"""
    if stri:
        return stri.lower() in ("true", "1", "yes")
    return False


def slug_from_name(name: str) -> str:
    """Generate slug from name"""
    return slugify(name.replace("'", ""))
