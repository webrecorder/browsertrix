"""
Unique Worker exposed as decorator by_one_worker
"""

from pathlib import Path
import os
from functools import cached_property


class UniqueWorker:
    """Class to run async tasks in single worker only."""

    def __init__(self, path):
        self.path = Path(path)
        self.pid = str(os.getpid())
        self.set_id()

    def set_id(self):
        """Create path to pid file and write to pid."""
        if not self.path.exists():
            self.path.parents[0].mkdir(parents=True, exist_ok=True)

        with open(self.path, "w", encoding="utf-8") as pid_file:
            pid_file.write(self.pid)

    @cached_property
    def is_assigned(self):
        """Check if worker has been assigned to unique worker."""
        with open(self.path, "r", encoding="utf-8") as pid_file:
            assigned_worker = pid_file.read()

        return assigned_worker == self.pid


def by_one_worker(worker_pid_path):
    """Decorator which runs function in unique worker."""
    unique_worker = UniqueWorker(worker_pid_path)

    def deco(pid_path):
        def wrapped(*args, **kwargs):
            if not unique_worker.is_assigned:
                return ""
            return pid_path(*args, **kwargs)

        return wrapped

    return deco
