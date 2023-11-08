""" Proxy Management """
import json
import os

from fastapi import Depends

from .models import Proxy, Organization
from .orgs import OrgOps


# ============================================================================
# pylint: disable=broad-except,raise-missing-from,too-few-public-methods
class ProxyOps:
    """Proxy Ops"""

    proxies: dict[str, Proxy] = {}

    def __init__(self):
        with open(os.environ["PROXIES_JSON"], encoding="utf-8") as fh:
            proxy_list = json.loads(fh.read())

            self.proxies = {
                proxy_data.get("id"): Proxy(**proxy_data) for proxy_data in proxy_list
            }

    def has_proxy(self, name: str):
        """has named proxy"""
        return name in self.proxies


# ============================================================================
def init_proxies_api(org_ops: OrgOps):
    """init proxy ops"""
    ops = ProxyOps()

    router = org_ops.router
    if not router:
        return ops

    org_crawl_dep = org_ops.org_crawl_dep

    @router.get("/proxies", tags=["proxies"])
    def get_proxies():
        return list(ops.proxies.values())

    return ops
