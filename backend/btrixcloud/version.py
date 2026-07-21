"""Build version info from environment, set at Docker build time."""

import os

__version__ = "1.24.0-beta.2"
__commit_hash__ = os.environ.get("GIT_COMMIT_HASH")
__branch__ = os.environ.get("GIT_BRANCH_NAME")
