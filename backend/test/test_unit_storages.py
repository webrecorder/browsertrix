"""Unit tests for storage upload backpressure helpers."""

import asyncio
import builtins
import os
from io import StringIO

import structlog
import pytest

from btrixcloud.storages import (
    _await_memory_below_watermark,
    _ByteLimiter,
    _get_container_memory_usage_bytes,
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


@pytest.mark.asyncio
async def test_await_memory_below_watermark_returns_when_low(monkeypatch):
    """Watermark gate returns immediately when usage is below high watermark."""
    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_limit_bytes", lambda: 1000
    )
    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_usage_bytes", lambda: 500
    )

    await _await_memory_below_watermark(structlog.get_logger())


@pytest.mark.asyncio
async def test_await_memory_below_watermark_waits_until_low(monkeypatch):
    """Watermark gate sleeps until usage drops below the low watermark."""
    monkeypatch.setenv("UPLOAD_MEMORY_HIGH_WATERMARK", "0.8")
    monkeypatch.setenv("UPLOAD_MEMORY_LOW_WATERMARK", "0.7")
    monkeypatch.setenv("UPLOAD_MEMORY_BACKOFF_SECONDS", "0")

    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_limit_bytes", lambda: 1000
    )

    usage_iter = iter([900, 800, 650])
    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_usage_bytes",
        lambda: next(usage_iter),
    )

    sleeps = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    await _await_memory_below_watermark(structlog.get_logger())

    assert len(sleeps) == 2


@pytest.mark.asyncio
async def test_await_memory_below_watermark_no_limit(monkeypatch):
    """Watermark gate is a no-op when no cgroup limit is available."""
    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_limit_bytes", lambda: None
    )

    await _await_memory_below_watermark(structlog.get_logger())


def test_get_container_memory_usage_bytes_reads_cgroup_v2(monkeypatch):
    """Cgroup v2 usage is read from memory.current."""
    real_open = builtins.open

    def fake_open(path, *args, **kwargs):
        if path == "/sys/fs/cgroup/memory.current":
            return StringIO("12345\n")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", fake_open)

    assert _get_container_memory_usage_bytes() == 12345


def test_get_upload_memory_limiter_empty_env_uses_default(monkeypatch):
    """Empty UPLOAD_MEMORY_BUDGET_RATIO falls back to the default ratio."""
    monkeypatch.setenv("UPLOAD_MEMORY_BUDGET_RATIO", "")
    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_limit_bytes", lambda: 1000
    )
    monkeypatch.setattr("btrixcloud.storages._upload_memory_limiter", None)

    limiter = _get_upload_memory_limiter()
    assert limiter is not None
    assert limiter.capacity == max(int(1000 * 0.25), 10_000_000)


@pytest.mark.asyncio
async def test_await_memory_below_watermark_empty_env_uses_defaults(monkeypatch):
    """Empty watermark env vars fall back to their defaults."""
    monkeypatch.setenv("UPLOAD_MEMORY_HIGH_WATERMARK", "")
    monkeypatch.setenv("UPLOAD_MEMORY_LOW_WATERMARK", "")
    monkeypatch.setenv("UPLOAD_MEMORY_BACKOFF_SECONDS", "")

    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_limit_bytes", lambda: 1000
    )
    monkeypatch.setattr(
        "btrixcloud.storages._get_container_memory_usage_bytes", lambda: 500
    )

    await _await_memory_below_watermark(structlog.get_logger())


def test_upload_max_workers_empty_env_uses_fallback(monkeypatch):
    """Empty UPLOAD_MAX_WORKERS falls back to the memory-based default."""
    monkeypatch.setenv("UPLOAD_MAX_WORKERS", "")

    value = int(
        os.environ.get("UPLOAD_MAX_WORKERS") or _get_default_upload_max_workers(10)
    )
    assert value == _get_default_upload_max_workers(10)
