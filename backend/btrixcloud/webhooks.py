"""Webhook management"""

import asyncio
from datetime import datetime
from typing import List, Union
import uuid

import aiohttp
import backoff
from fastapi import APIRouter, Depends, HTTPException
from pydantic import UUID4

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    WebhookEventType,
    WebhookNotification,
    CrawlStartedBody,
    CrawlFinishedBody,
    UploadFinishedBody,
    CollectionItemAddedBody,
    CollectionItemRemovedBody,
    PaginatedResponse,
    Organization,
)


# ============================================================================
class EventWebhookOps:
    """Event webhook notification management"""

    def __init__(self, mdb, org_ops):
        self.webhooks = mdb["webhooks"]
        self.colls = mdb["collections"]
        self.crawls = mdb["crawls"]

        self.org_ops = org_ops
        self.crawl_ops = None

        self.origin = None

        self.router = APIRouter(
            prefix="/webhooks",
            tags=["webhooks"],
            responses={404: {"description": "Not found"}},
        )

    def set_crawl_ops(self, ops):
        """set crawl ops"""
        self.crawl_ops = ops

    async def list_notifications(
        self,
        org: Organization,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        """List all webhook notifications"""
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query = {"oid": org.id}

        total = await self.webhooks.count_documents(query)

        cursor = self.webhooks.find(query, skip=skip, limit=page_size)
        results = await cursor.to_list(length=page_size)
        notifications = [WebhookNotification.from_dict(res) for res in results]

        return notifications, total

    async def get_notification(self, org: Organization, notificationid: uuid.UUID):
        """Get webhook notification by id and org"""
        query = {"_id": notificationid, "oid": org.id}

        res = await self.webhooks.find_one(query)
        if not res:
            raise HTTPException(status_code=404, detail="notification_not_found")

        return WebhookNotification.from_dict(res)

    @backoff.on_exception(backoff.expo, aiohttp.ClientError, max_tries=5, max_time=60)
    async def send_notification(
        self, org: Organization, notification: WebhookNotification
    ):
        """Send notification"""
        if not org.webhookUrls:
            print(
                "Webhook URLs not configured - skipping sending notification",
                flush=True,
            )
            return

        webhook_url = getattr(org.webhookUrls, notification.event)
        if not webhook_url:
            print(
                f"Webhook URL for event {notification.event} not configured, skipping",
                flush=True,
            )
            return

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    "POST",
                    webhook_url,
                    json=notification.body.dict(),
                    raise_for_status=True,
                ):
                    await self.webhooks.find_one_and_update(
                        {"_id": notification.id},
                        {
                            "$set": {
                                "success": True,
                                "lastAttempted": datetime.utcnow(),
                            },
                            "$inc": {"attempts": 1},
                        },
                    )

        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(f"Webhook notification failed: {err}", flush=True)
            await self.webhooks.find_one_and_update(
                {"_id": notification.id},
                {"$set": {"lastAttempted": datetime.utcnow()}, "$inc": {"attempts": 1}},
            )

    async def _create_item_finished_notification(
        self,
        crawl_id: str,
        org: Organization,
        event: str,
        body: Union[CrawlFinishedBody, UploadFinishedBody],
    ):
        """Create webhook notification for finished crawl/upload."""
        crawl = await self.crawl_ops.get_crawl(crawl_id, org)
        if not crawl:
            print(f"Crawl {crawl_id} not found, skipping event webhook", flush=True)
            return

        download_urls = []
        for resource in crawl.resources:
            download_url = f"{org.origin}{resource.path}"
            download_urls.append(download_url)

        body.downloadUrls = download_urls

        notification = WebhookNotification(
            id=uuid.uuid4(),
            event=event,
            oid=org.id,
            body=body,
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

        if crawl.collections:
            for coll_id in crawl.collectionIds:
                await self.create_added_to_collection_notification(
                    crawl_ids=[crawl_id], coll_id=coll_id, org=org
                )

    async def create_crawl_finished_notification(self, crawl_id: str, state: str):
        """Create webhook notification for finished crawl."""
        crawl_res = await self.crawls.find_one({"_id": crawl_id})
        org = await self.org_ops.get_org_by_id(crawl_res["oid"])

        if not org.webhookUrls or not org.webhookUrls.crawlFinished:
            return

        await self._create_item_finished_notification(
            crawl_id,
            org,
            event=WebhookEventType.CRAWL_FINISHED,
            body=CrawlFinishedBody(
                itemId=crawl_id,
                orgId=str(org.id),
                state=state,
            ),
        )

    async def create_upload_finished_notification(
        self,
        crawl_id: str,
    ):
        """Create webhook notification for finished upload."""
        crawl_res = await self.crawls.find_one({"_id": crawl_id})
        org = await self.org_ops.get_org_by_id(crawl_res["oid"])

        if not org.webhookUrls or not org.webhookUrls.uploadFinished:
            return

        await self._create_item_finished_notification(
            crawl_id,
            org,
            event=WebhookEventType.UPLOAD_FINISHED,
            body=UploadFinishedBody(
                itemId=crawl_id,
                orgId=str(org.id),
            ),
        )

    async def create_crawl_started_notification(
        self, crawl_id: str, oid: uuid.UUID, scheduled: bool = False
    ):
        """Create webhook notification for started crawl."""
        org = await self.org_ops.get_org_by_id(oid)

        if not org.webhookUrls or not org.webhookUrls.crawlStarted:
            return

        notification = WebhookNotification(
            id=uuid.uuid4(),
            event=WebhookEventType.CRAWL_STARTED,
            oid=oid,
            body=CrawlStartedBody(
                itemId=crawl_id,
                orgId=str(oid),
                scheduled=scheduled,
            ),
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

    async def _create_collection_items_modified_notification(
        self,
        coll_id: uuid.UUID,
        org: Organization,
        event: str,
        body: Union[CollectionItemAddedBody, CollectionItemRemovedBody],
    ):
        """Create webhook notification for item added/removed to collection."""
        coll_download_url = f"/api/orgs/{org.id}/collections/{coll_id}/download"
        if org.origin:
            coll_download_url = (
                f"{org.origin}/api/orgs/{org.id}/collections/{coll_id}/download"
            )

        body.downloadUrls = [coll_download_url]

        notification = WebhookNotification(
            id=uuid.uuid4(),
            event=event,
            oid=org.id,
            body=body,
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

    async def create_added_to_collection_notification(
        self,
        crawl_ids: List[str],
        coll_id: uuid.UUID,
        org: Organization,
    ):
        """Create webhook notification for item added to collection"""
        if not org.webhookUrls or not org.webhookUrls.addedToCollection:
            return

        await self._create_collection_items_modified_notification(
            coll_id,
            org,
            event=WebhookEventType.ADDED_TO_COLLECTION,
            body=CollectionItemAddedBody(
                itemIds=crawl_ids,
                collectionId=str(coll_id),
                orgId=str(org.id),
            ),
        )

    async def create_removed_from_collection_notification(
        self,
        crawl_ids: List[str],
        coll_id: uuid.UUID,
        org: Organization,
    ):
        """Create webhook notification for item removed from collection"""
        if not org.webhookUrls or not org.webhookUrls.removedFromCollection:
            return

        await self._create_collection_items_modified_notification(
            coll_id,
            org,
            event=WebhookEventType.REMOVED_FROM_COLLECTION,
            body=CollectionItemRemovedBody(
                itemIds=crawl_ids,
                collectionId=str(coll_id),
                orgId=str(org.id),
            ),
        )


# pylint: disable=too-many-arguments, too-many-locals, invalid-name, fixme
def init_event_webhooks_api(mdb, org_ops):
    """init event webhooks system"""

    ops = EventWebhookOps(mdb, org_ops)

    router = ops.router

    org_owner_dep = org_ops.org_owner_dep

    @router.get("", response_model=PaginatedResponse)
    async def list_notifications(
        org: Organization = Depends(org_owner_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        notifications, total = await ops.list_notifications(
            org, page_size=pageSize, page=page
        )
        return paginated_format(notifications, total, page, pageSize)

    @router.get("/{notificationid}", response_model=WebhookNotification)
    async def get_notification(
        notificationid: UUID4,
        org: Organization = Depends(org_owner_dep),
    ):
        return await ops.get_notification(org, notificationid)

    @router.get("/{notificationid}/retry")
    async def retry_notification(
        notificationid: UUID4,
        org: Organization = Depends(org_owner_dep),
    ):
        notification = await ops.get_notification(org, notificationid)
        asyncio.create_task(ops.send_notification(org, notification))
        return {"success": True}

    # TODO: Add webhooks to OpenAPI documentation when we've updated FastAPI
    # (requires FastAPI >= 0.99.0)

    # @app.webhooks.post("archived-item-created")
    # def archived_item_created(
    #    body: ArchivedItemCreatedBody,
    #    org: Organization = Depends(org_owner_dep)
    # ):
    #     """
    #     When a new archived item is created, we will send a POST request with
    #     the id for the item and download links for the item.
    #     """

    # @app.webhooks.post("added-to-collection")
    # def added_to_collection(
    #    body: CollectionItemAddedRemovedBody,
    #    org: Organization = Depends(org_owner_dep)
    # ):
    #     """
    #     When archived items are added to a collection, we will send a POST
    #     request with the ids of the archived item(s) and collection and a
    #     download link for the collection.
    #     """

    # @app.webhooks.post("removed-from-collection")
    # def removed_from_collection(
    #    body: CollectionItemAddedRemovedBody,
    #    org: Organization = Depends(org_owner_dep)
    # ):
    #     """
    #     When an archived items are removed from a collection, we will send a POST
    #     request with the ids of the archived item(s) and collection and a
    #     download link for the collection.
    #     """

    org_ops.router.include_router(router)

    return ops
