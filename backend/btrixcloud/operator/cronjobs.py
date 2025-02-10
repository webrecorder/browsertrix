"""Operator handler for crawl CronJobs"""

from uuid import UUID
from typing import Optional
import yaml

from btrixcloud.utils import date_to_str, dt_now
from .models import MCDecoratorSyncData, CJS, MCDecoratorSyncResponse
from .baseoperator import BaseOperator

from ..models import CrawlConfig


# pylint: disable=too-many-locals
# ============================================================================
class CronJobOperator(BaseOperator):
    """CronJob Operator"""

    def init_routes(self, app):
        """init routes for crawl CronJob decorator"""

        @app.post("/op/cronjob/sync")
        async def mc_sync_cronjob_crawls(
            data: MCDecoratorSyncData,
        ) -> MCDecoratorSyncResponse:
            return await self.sync_cronjob_crawl(data)

    def get_finished_response(
        self, metadata: dict[str, str], set_status=True, finished: Optional[str] = None
    ) -> MCDecoratorSyncResponse:
        """get final response to indicate cronjob created job is finished"""

        if not finished:
            finished = date_to_str(dt_now())

        status = None
        # set status on decorated job to indicate that its finished
        if set_status:
            status = {
                "succeeded": 1,
                "startTime": metadata.get("creationTimestamp"),
                "completionTime": finished,
            }

        return MCDecoratorSyncResponse(
            attachments=[],
            # set on job to match default behavior when job finishes
            annotations={"finished": finished},
            status=status,
        )

    # pylint: disable=too-many-arguments
    async def make_new_crawljob(
        self,
        cid: UUID,
        oid: Optional[UUID],
        userid: Optional[UUID],
        crawl_id: str,
        metadata: dict[str, str],
        state: Optional[str],
    ) -> MCDecoratorSyncResponse:
        """declare new CrawlJob from cid, based on db data"""
        # cronjob doesn't exist yet
        crawlconfig: CrawlConfig

        try:
            crawlconfig = await self.crawl_config_ops.get_crawl_config(cid, oid)
        # pylint: disable=bare-except
        except:
            print(
                f"error: no crawlconfig {cid}. skipping scheduled job. old cronjob left over?"
            )
            return self.get_finished_response(metadata)

        # get org
        oid = crawlconfig.oid
        org = await self.org_ops.get_org_by_id(oid)

        # db create
        user = None

        if not userid:
            userid = crawlconfig.modifiedBy

        if userid:
            user = await self.user_ops.get_by_id(userid)

        if not userid or not user:
            print(f"error: missing user for id {userid}")
            return self.get_finished_response(metadata)

        warc_prefix = self.crawl_config_ops.get_warc_prefix(org, crawlconfig)

        if org.readOnly:
            print(
                f'org "{org.slug}" set to read-only. skipping scheduled crawl for workflow {cid}'
            )
            return self.get_finished_response(metadata)

        if crawlconfig.proxyId and not self.crawl_config_ops.get_crawler_proxy(
            crawlconfig.proxyId
        ):
            print(
                f"proxy {crawlconfig.proxyId} missing, skipping scheduled crawl for "
                + f'workflow {cid} in "{org.slug}"'
            )
            return self.get_finished_response(metadata)

        # if no db state, add crawl in the db
        if not state:
            await self.crawl_config_ops.add_new_crawl(
                crawl_id,
                crawlconfig,
                user,
                org,
                manual=False,
            )
            print("Scheduled Crawl Created: " + crawl_id)

        profile_filename = await self.crawl_config_ops.get_profile_filename(
            crawlconfig.profileid, org
        )

        crawl_id, crawljob = self.k8s.new_crawl_job_yaml(
            cid=str(cid),
            userid=str(userid),
            oid=str(oid),
            storage=str(org.storage),
            crawler_channel=crawlconfig.crawlerChannel or "default",
            scale=crawlconfig.scale,
            crawl_timeout=crawlconfig.crawlTimeout,
            max_crawl_size=crawlconfig.maxCrawlSize,
            manual=False,
            crawl_id=crawl_id,
            warc_prefix=warc_prefix,
            storage_filename=self.crawl_config_ops.default_filename_template,
            profile_filename=profile_filename or "",
            proxy_id=crawlconfig.proxyId or "",
        )

        return MCDecoratorSyncResponse(attachments=list(yaml.safe_load_all(crawljob)))

    async def sync_cronjob_crawl(
        self, data: MCDecoratorSyncData
    ) -> MCDecoratorSyncResponse:
        """create crawljobs from a job object spawned by cronjob"""

        metadata = data.object["metadata"]
        labels = metadata.get("labels", {})
        cid: str = labels.get("btrix.crawlconfig", "")
        oid: str = labels.get("btrix.org", "")
        userid: str = labels.get("btrix.userid", "")

        if not cid:
            print("error: cronjob missing 'cid', invalid cronjob")
            return self.get_finished_response(metadata)

        name = metadata.get("name")
        crawl_id = name

        actual_state, finished = await self.crawl_ops.get_crawl_state(
            crawl_id, is_qa=False
        )
        if finished:
            finished_str = date_to_str(finished)
            set_status = False
            # mark job as completed
            if not data.object["status"].get("succeeded"):
                print("Cron Job Complete!", finished)
                set_status = True

            return self.get_finished_response(metadata, set_status, finished_str)

        crawljobs = data.attachments[CJS]

        crawljob_id = f"crawljob-{crawl_id}"

        if crawljob_id not in crawljobs:
            response = await self.make_new_crawljob(
                UUID(cid),
                UUID(oid) if oid else None,
                UUID(userid) if userid else None,
                crawl_id,
                metadata,
                actual_state,
            )
        else:
            # just return existing crawljob, filter metadata, remove status and annotations
            crawljob = crawljobs[crawljob_id]
            crawljob["metadata"] = {
                "name": crawljob["metadata"]["name"],
                "labels": crawljob["metadata"].get("labels"),
            }
            crawljob.pop("status", "")

            response = MCDecoratorSyncResponse(attachments=[crawljob])

        return response
