""" Proxy Management """
import json

from fastapi import Depends

from .models import Proxy, Organization


# ============================================================================
# pylint: disable=broad-except,raise-missing-from
class ProxyOps:
    """Proxy Ops"""

    proxies: dict[str, Proxy] = {}

    def __init__(self):
        with open("/tmp/proxies/proxies.json", encoding="utf-8") as fh:
            proxy_list = json.loads(fh.read())

            self.proxies = {
                proxy_data.get("id"): Proxy(**proxy_data) for proxy_data in proxy_list
            }

    def has_proxy(self, name: str):
        """has named proxy"""
        return name in self.proxies


def init_proxies(org_ops):
    """init proxy ops"""
    ops = ProxyOps()

    router = org_ops.router
    org_crawler_dep = org_ops.org_crawler_dep

    @router.get("/proxies", tags=["proxies"])
    def get_proxies(_: Organization = Depends(org_crawler_dep)):
        return list(ops.proxies.values())
