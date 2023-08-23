"""Webhook management"""

import asyncio
from datetime import datetime
from typing import List
import uuid

import aiohttp
import backoff
from fastapi import APIRouter, Depends, HTTPException
from pydantic import UUID4

from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .models import (
    WebhookEventType,
    WebhookNotification,
    ArchivedItemCreatedBody,
    CollectionItemAddedRemovedBody,
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

        # Get configured URL for this notification type
        if notification.event == WebhookEventType.ARCHIVED_ITEM_CREATED:
            if not org.webhookUrls.itemCreatedUrl:
                print(
                    "Webhook Item Created URL not configured, skipping",
                    flush=True,
                )
                return
            url = org.webhookUrls.itemCreatedUrl

        elif notification.event == WebhookEventType.ADDED_TO_COLLECTION:
            if not org.webhookUrls.addedToCollectionUrl:
                print(
                    "Webhook Item Added to Collection URL not configured, skipping",
                    flush=True,
                )
                return
            url = org.webhookUrls.addedToCollectionUrl

        elif notification.event == WebhookEventType.REMOVED_FROM_COLLECTION:
            if not org.webhookUrls.removedFromCollectionUrl:
                print(
                    "Webhook Item Removed from Collection URL not configured, skipping",
                    flush=True,
                )
                return
            url = org.webhookUrls.removedFromCollectionUrl

        # Add event name and oid to body and remove type, which is useful
        # internally but duplicates the event name in the POST body
        body = notification.body.dict()
        body["event"] = notification.event
        body["orgId"] = str(notification.oid)
        body.pop("type", None)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    "POST",
                    url,
                    json=body,
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

    async def create_item_created_notification(self, crawl_id: str):
        """Create webhook notification for item creation"""
        crawl_res = await self.crawls.find_one({"_id": crawl_id})

        org = await self.org_ops.get_org_by_id(crawl_res["oid"])

        if not org.webhookUrls or not org.webhookUrls.itemCreatedUrl:
            return

        # Get full crawl with resources
        crawl = await self.crawl_ops.get_crawl(crawl_id, org)
        if not crawl:
            print(f"Crawl {crawl_id} not found, skipping event webhook", flush=True)
            return

        download_urls = []
        for resource in crawl.resources:
            download_url = f"{org.origin}{resource.path}"
            download_urls.append(download_url)

        notification = WebhookNotification(
            id=uuid.uuid4(),
            event=WebhookEventType.ARCHIVED_ITEM_CREATED,
            oid=org.id,
            body=ArchivedItemCreatedBody(itemId=crawl.id, downloadUrls=download_urls),
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)

        if crawl.collections:
            for coll_id in crawl.collections:
                await self.create_added_removed_collection_notification(
                    crawl_ids=[crawl_id], coll_id=coll_id, org=org
                )

    async def create_added_removed_collection_notification(
        self,
        crawl_ids: List[str],
        coll_id: uuid.UUID,
        org: Organization,
        added: bool = True,
    ):
        """Create webhook notification for item added or removed from collection"""
        if not org.webhookUrls:
            return

        if added:
            type_ = "added"
            if not org.webhookUrls.addedToCollectionUrl:
                return
        else:
            type_ = "removed"
            if not org.webhookUrls.removedFromCollectionUrl:
                return

        event_type = WebhookEventType.ADDED_TO_COLLECTION
        if not added:
            event_type = WebhookEventType.REMOVED_FROM_COLLECTION

        coll_download_url = f"/api/orgs/{org.id}/collections/{coll_id}/download"
        if org.origin:
            coll_download_url = (
                f"{org.origin}/api/orgs/{org.id}/collections/{coll_id}/download"
            )

        notification = WebhookNotification(
            id=uuid.uuid4(),
            event=event_type,
            oid=org.id,
            body=CollectionItemAddedRemovedBody(
                itemIds=crawl_ids,
                collectionId=str(coll_id),
                type=type_,
                downloadUrls=[coll_download_url],
            ),
            created=datetime.utcnow(),
        )

        await self.webhooks.insert_one(notification.to_dict())

        await self.send_notification(org, notification)


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
    #     When an archived item is added to a collection, we will send a POST
    #     request with the ids of the archived item and collection and a
    #     download link for the collection.
    #     """

    org_ops.router.include_router(router)

    return ops
