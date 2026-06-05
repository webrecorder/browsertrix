"""Build version info from environment, set at Docker build time."""

import os

__version__ = "1.23.0-beta.0"
__commit_hash__ = os.environ["GIT_COMMIT_HASH"]
__branch__ = os.environ["GIT_BRANCH_NAME"]
