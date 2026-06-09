"""Unit tests for crawlconfigs security behaviors"""

import asyncio
import os
import shutil
import tempfile
import uuid
from unittest.mock import AsyncMock, MagicMock, mock_open, patch

import pytest
from fastapi import HTTPException

from btrixcloud.crawlconfigs import CrawlConfigOps
from btrixcloud.models import CrawlerChannel


@pytest.fixture
def crawl_config_ops(monkeypatch):
    """Minimal CrawlConfigOps with all dependencies mocked."""
    monkeypatch.setenv("DEFAULT_CRAWL_FILENAME_TEMPLATE", "")
    monkeypatch.setenv("CRAWLER_CHANNELS_JSON", "")
    with patch(
        "builtins.open",
        mock_open(read_data='[{"id": "default", "image": ""}]'),
    ):
        return CrawlConfigOps(
            dbclient=MagicMock(),
            mdb=MagicMock(),
            user_manager=MagicMock(),
            org_ops=MagicMock(),
            crawl_manager=MagicMock(),
            profiles=MagicMock(),
            file_ops=MagicMock(),
            storage_ops=MagicMock(),
        )


@pytest.mark.asyncio
async def test_git_repo_url_passed_as_single_arg(crawl_config_ops):
    """Verify malicious URLs are passed as a single argv element to git."""
    mock_proc = AsyncMock()
    mock_proc.wait.return_value = 128  # git exit code: "not a repository"

    malicious_url = "https://evil.com/repo;whoami && cat /etc/passwd"

    with patch("asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec:
        with patch("asyncio.create_subprocess_shell") as mock_shell:
            with pytest.raises(HTTPException):
                await crawl_config_ops._validate_behavior_git_repo(malicious_url)

            # Verify we never fell back to shell execution
            mock_shell.assert_not_called()

    # Ensure that git received the full string as one argv element,
    # not split into separate arguments by a shell
    assert mock_exec.call_args.args == (
        "/usr/bin/git",
        "ls-remote",
        malicious_url,
        "HEAD",
    )

    # Also verify no extra kwargs/options were injected
    assert "env" in mock_exec.call_args.kwargs
    assert mock_exec.call_args.kwargs["env"] == {"GIT_TERMINAL_PROMPT": "0"}


@pytest.mark.asyncio
async def test_git_branch_passed_as_single_arg(crawl_config_ops):
    """Verify malicious branch names are passed as a single argv element."""
    mock_proc = AsyncMock()
    mock_proc.wait.return_value = 0

    # We need two calls: first for HEAD, second for branch
    mock_exec = AsyncMock(
        side_effect=[
            mock_proc,  # HEAD check returns 0
            mock_proc,  # branch check returns 0
        ]
    )

    malicious_branch = "main;whoami"

    with patch("asyncio.create_subprocess_exec", mock_exec):
        with patch("asyncio.create_subprocess_shell") as mock_shell:
            await crawl_config_ops._validate_behavior_git_repo(
                "https://github.com/webrecorder/custom-behaviors",
                branch=malicious_branch,
            )

            mock_shell.assert_not_called()

    # Second call is the branch check
    second_call = mock_exec.call_args_list[1]
    assert second_call.args == (
        "/usr/bin/git",
        "ls-remote",
        "--exit-code",
        "--heads",
        "https://github.com/webrecorder/custom-behaviors",
        "refs/heads/main;whoami",  # prefixed, but still a single element
    )


@pytest.mark.asyncio
async def test_shell_injection_no_filesystem_side_effects(crawl_config_ops):
    """
    Verify shell metacharacters in URLs don't execute commands.

    If the URL were passed to create_subprocess_shell, the shell would
    interpret ';' as a command separator and execute `touch <marker>`.
    With create_subprocess_exec, git receives the entire string as one
    URL argument and fails to connect, so no file is created.
    """
    if not shutil.which("git"):
        pytest.skip("git not available")

    marker = os.path.join(
        tempfile.gettempdir(), f"browsertrix_shell_test_{uuid.uuid4().hex}"
    )
    # The shell splits on whitespace, so `touch <marker> HEAD` creates
    # two files: one at <marker> and one at ./HEAD in the current directory
    head_file = os.path.join(os.getcwd(), "HEAD")

    for path in (marker, head_file):
        if os.path.exists(path):
            os.remove(path)

    malicious_url = f"http://localhost:12345/repo; touch {marker}"

    raised = False
    try:
        with patch("btrixcloud.crawlconfigs.drop_privileges"):
            try:
                await crawl_config_ops._validate_behavior_git_repo(malicious_url)
            except HTTPException:
                raised = True

        assert not os.path.exists(marker), (
            f"Shell injection detected! File {marker} was created. "
            f"This suggests the URL was interpreted by a shell."
        )
        assert not os.path.exists(head_file), (
            f"Shell injection detected! File {head_file} was created. "
            f"This suggests the URL was interpreted by a shell."
        )

        assert raised, "Expected HTTPException to be raised when git fails"
    finally:
        for path in (marker, head_file):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except PermissionError:
                    pass


@pytest.mark.asyncio
async def test_shell_injection_positive_control():
    """
    Demonstrate that the same payload *would* execute commands via a shell.

    This positive-control test shows the malicious payload used in
    test_shell_injection_no_filesystem_side_effects is actually capable
    of command execution when passed to a shell interpreter.
    """
    marker = os.path.join(
        tempfile.gettempdir(), f"browsertrix_shell_positive_{uuid.uuid4().hex}"
    )
    # The shell splits on whitespace, so `touch <marker> HEAD` creates
    # two files: one at <marker> and one at ./HEAD in the current directory
    head_file = os.path.join(os.getcwd(), "HEAD")

    for path in (marker, head_file):
        if os.path.exists(path):
            os.remove(path)

    malicious_url = f"http://localhost:12345/repo; touch {marker}"

    try:
        # Simulate the old vulnerable code path
        proc = await asyncio.create_subprocess_shell(
            f"git ls-remote {malicious_url} HEAD"
        )
        await asyncio.wait_for(proc.wait(), timeout=5)

        # The shell executes `touch <marker>` as a separate command.
        # Because the shell splits on whitespace, `touch` receives two
        # arguments: <marker> and `HEAD`, creating both files.
        assert os.path.exists(marker), (
            "Positive control failed: expected shell to create marker file"
        )
        assert os.path.exists(head_file), (
            "Positive control failed: expected shell to create ./HEAD file"
        )
    finally:
        for path in (marker, head_file):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except PermissionError:
                    pass
