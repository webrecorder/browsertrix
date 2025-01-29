"""Operator handler for ProfileJobs"""

from btrixcloud.utils import str_to_date, dt_now

from btrixcloud.models import StorageRef

from .models import MCSyncData
from .baseoperator import BaseOperator


# ============================================================================
class ProfileOperator(BaseOperator):
    """ProfileOperator"""

    def init_routes(self, app):
        """init routes for this operator"""

        @app.post("/op/profilebrowsers/sync")
        async def mc_sync_profile_browsers(data: MCSyncData):
            return await self.sync_profile_browsers(data)

    async def sync_profile_browsers(self, data: MCSyncData):
        """sync profile browsers"""
        spec = data.parent.get("spec", {})

        expire_time = str_to_date(spec.get("expireTime"))
        browserid = spec.get("id")

        if expire_time and dt_now() >= expire_time:
            self.run_task(self.k8s.delete_profile_browser(browserid))
            return {"status": {}, "children": []}

        params = {}
        params.update(self.k8s.shared_params)
        params["id"] = browserid
        params["userid"] = spec.get("userid", "")

        oid = spec.get("oid")
        storage = StorageRef(spec.get("storageName"))

        storage_path = storage.get_storage_extra_path(oid)
        storage_secret = storage.get_storage_secret_name(oid)

        params["storage_path"] = storage_path
        params["storage_secret"] = storage_secret
        params["profile_filename"] = spec.get("profileFilename", "")
        params["crawler_image"] = spec["crawlerImage"]

        proxy_id = spec.get("proxyId")
        if proxy_id:
            proxy = self.crawl_config_ops.get_crawler_proxy(proxy_id)
            if proxy:
                params["proxy_id"] = proxy_id
                params["proxy_url"] = proxy.url
                params["proxy_ssh_private_key"] = proxy.has_private_key
                params["proxy_ssh_host_public_key"] = proxy.has_host_public_key

        params["url"] = spec.get("startUrl", "about:blank")
        params["vnc_password"] = spec.get("vncPassword")

        children = self.load_from_yaml("profilebrowser.yaml", params)

        return {"status": {}, "children": children}
