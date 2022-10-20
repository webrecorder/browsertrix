""" entry point for K8S browser job (eg. for profile creation) """

from .base_job import K8SJobMixin
from ..profile_job import ProfileJob


# =============================================================================
class K8SProfileJob(K8SJobMixin, ProfileJob):
    """Browser run job"""


if __name__ == "__main__":
    job = K8SProfileJob()
    job.loop.run_forever()
