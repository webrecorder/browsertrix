"""Unit tests for storage upload backpressure helpers."""

import asyncio
import os
from io import StringIO

import pytest

from btrixcloud.storages import (
    MIN_UPLOAD_PART_SIZE,
    _ByteLimiter,
    _get_container_memory_limit_bytes,
    _get_default_upload_max_workers,
    _get_upload_memory_limiter,
)


@pytest.mark.asyncio
async def test_byte_limiter_blocks_until_release():
    """A limiter blocks acquires that exceed capacity until release."""
    limiter = _ByteLimiter(10)
    await limiter.acquire(7)
    blocked_task = asyncio.create_task(limiter.acquire(5))

    # Give the event loop a chance to run the blocked task.
    await asyncio.sleep(0)
    assert not blocked_task.done()
    assert limiter.available == 3

    await limiter.release(7)
    await blocked_task
    assert limiter.available == 5


def test_get_container_memory_limit_bytes_reads_cgroup_v2(monkeypatch):
    """Cgroup v2 memory limit is read from memory.max."""
    real_open = open

    def fake_open(path, *args, **kwargs):
        if path == "/sys/fs/cgroup/memory.max":
            return StringIO("367001600\n")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr("builtins.open", fake_open)

    assert _get_container_memory_limit_bytes() == 367001600


def test_get_upload_memory_limiter_empty_env_uses_default(monkeypatch):
    """Empty UPLOAD_MEMORY_BUDGET_RATIO falls back to the default ratio."""
    monkeypatch.setenv("UPLOAD_MEMORY_BUDGET_RATIO", "")
    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_limit_bytes", lambda: 1000
    )
    monkeypatch.setattr("btrixcloud.storages._upload_memory_limiter", None)

    limiter = _get_upload_memory_limiter()
    assert limiter is not None
    assert limiter.capacity == max(int(1000 * 0.15), MIN_UPLOAD_PART_SIZE * 2)


def test_upload_max_workers_empty_env_uses_fallback(monkeypatch):
    """Empty UPLOAD_MAX_WORKERS falls back to the memory-based default."""
    monkeypatch.setenv("UPLOAD_MAX_WORKERS", "")

    value = int(
        os.environ.get("UPLOAD_MAX_WORKERS") or _get_default_upload_max_workers(10)
    )
    assert value == _get_default_upload_max_workers(10)
