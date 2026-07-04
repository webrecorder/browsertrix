"""Unit test configuration - auto-marks all tests as unit tests.

Sets default env vars so unit tests can run without CI environment.
Derives real values from git and version.txt when available, falls back
to safe defaults otherwise.
"""

import os
import subprocess
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]  # backend/test/unit -> root


def _git(cmd: list[str]) -> str | None:
    """Run a git command, return stripped stdout or None on failure."""
    try:
        return subprocess.run(
            ["git"] + cmd,
            cwd=_REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.strip()
    except Exception:
        return None


def _read_version_txt() -> str | None:
    """Read first line of version.txt, or None."""
    path = _REPO_ROOT / "version.txt"
    try:
        return path.read_text().strip().split("\n")[0]
    except Exception:
        return None


# Set defaults before any btrixcloud imports happen (version.py reads these)
os.environ.setdefault("GIT_COMMIT_HASH", _git(["rev-parse", "--short", "HEAD"]) or "test")
os.environ.setdefault("GIT_BRANCH_NAME", _git(["rev-parse", "--abbrev-ref", "HEAD"]) or "test")
os.environ.setdefault("VERSION", _read_version_txt() or "0.0.0-test")


def pytest_collection_modifyitems(config, items):
    """Auto-mark all tests in this directory as unit tests."""
    for item in items:
        item.add_marker(pytest.mark.unit)
