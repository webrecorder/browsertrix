"""crawl pages"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional, Tuple, List, Dict, Any, Union
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException
import pymongo

from .models import (
    Page,
    PageOut,
    PageReviewUpdate,
    PageQAUpdate,
    Organization,
    PaginatedResponse,
    User,
    PageNote,
    PageNoteIn,
    PageNoteEdit,
    PageNoteDelete,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import from_k8s_date

if TYPE_CHECKING:
    from .crawls import CrawlOps
    from .orgs import OrgOps
    from .storages import StorageOps
else:
    CrawlOps = StorageOps = OrgOps = object


# ============================================================================
# pylint: disable=too-many-instance-attributes, too-many-arguments
class PageOps:
    """crawl pages"""

    crawl_ops: CrawlOps
    org_ops: OrgOps
    storage_ops: StorageOps

    def __init__(self, mdb, crawl_ops, org_ops, storage_ops):
        self.pages = mdb["pages"]
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.storage_ops = storage_ops

    async def add_crawl_pages_to_db_from_wacz(self, crawl_id: str):
        """Add pages to database from WACZ files"""
        try:
            crawl = await self.crawl_ops.get_crawl(crawl_id, None)
            org = await self.org_ops.get_org_by_id(crawl.oid)
            wacz_files = await self.crawl_ops.get_wacz_files(crawl_id, org)
            stream = await self.storage_ops.sync_stream_pages_from_wacz(org, wacz_files)
            for page_dict in stream:
                if not page_dict.get("url"):
                    continue

                await self.add_page_to_db(page_dict, crawl_id, crawl.oid)
        # pylint: disable=broad-exception-caught, raise-missing-from
        except Exception as err:
            print(f"Error adding pages for crawl {crawl_id} to db: {err}", flush=True)

    async def add_page_to_db(self, page_dict: Dict[str, Any], crawl_id: str, oid: UUID):
        """Add page to database"""
        page_id = page_dict.get("id")
        if not page_id:
            print(f'Page {page_dict.get("url")} has no id - assigning UUID', flush=True)
            page_id = uuid4()

        try:
            page = Page(
                id=page_id,
                oid=oid,
                crawl_id=crawl_id,
                url=page_dict.get("url"),
                title=page_dict.get("title"),
                load_state=page_dict.get("loadState"),
                timestamp=(
                    from_k8s_date(page_dict.get("ts"))
                    if page_dict.get("ts")
                    else datetime.now()
                ),
            )
            await self.pages.insert_one(
                page.to_dict(
                    exclude_unset=True, exclude_none=True, exclude_defaults=True
                )
            )
        except pymongo.errors.DuplicateKeyError:
            return
        # pylint: disable=broad-except
        except Exception as err:
            print(
                f"Error adding page {page_id} from crawl {crawl_id} to db: {err}",
                flush=True,
            )

    async def delete_crawl_pages(self, crawl_id: str, oid: Optional[UUID] = None):
        """Delete crawl pages from db"""
        query: Dict[str, Union[str, UUID]] = {"crawl_id": crawl_id}
        if oid:
            query["oid"] = oid
        try:
            await self.pages.delete_many(query)
        # pylint: disable=broad-except
        except Exception as err:
            print(
                f"Error deleting pages from crawl {crawl_id}: {err}",
                flush=True,
            )

    async def get_page_raw(
        self,
        page_id: UUID,
        oid: UUID,
        crawl_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return page dict by id"""
        query: Dict[str, Union[str, UUID]] = {"_id": page_id, "oid": oid}
        if crawl_id:
            query["crawl_id"] = crawl_id

        page = await self.pages.find_one(query)
        if not page:
            raise HTTPException(status_code=404, detail="page_not_found")
        return page

    async def get_page(
        self,
        page_id: UUID,
        oid: UUID,
        crawl_id: Optional[str] = None,
    ) -> Page:
        """Return Page object by id"""
        page_raw = await self.get_page_raw(page_id, oid, crawl_id)
        return Page.from_dict(page_raw)

    async def update_page_qa(
        self,
        page_id: UUID,
        oid: UUID,
        qa_run_id: str,
        update: PageQAUpdate,
    ) -> Dict[str, bool]:
        """Update page heuristics and mime/type from QA run"""
        query = update.dict(exclude_unset=True)

        if len(query) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        keyed_fields = ("screenshotMatch", "textMatch", "resourceCounts")
        for field in keyed_fields:
            score = query.get(field)
            if score:
                query[f"{field}.{qa_run_id}"] = score
                query.pop(field, None)

        query["modified"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid},
            {"$set": query},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"updated": True}

    async def update_page_approval(
        self,
        page_id: UUID,
        oid: UUID,
        approved: Optional[bool] = None,
        crawl_id: Optional[str] = None,
        user: Optional[User] = None,
    ) -> Dict[str, bool]:
        """Update page manual review"""
        query: Dict[str, Union[Optional[bool], str, datetime, UUID]] = {
            "approved": approved
        }
        query["modified"] = datetime.utcnow().replace(microsecond=0, tzinfo=None)
        if user:
            query["userid"] = user.id

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {"$set": query},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"updated": True}

    async def add_page_note(
        self,
        page_id: UUID,
        oid: UUID,
        text: str,
        user: User,
        crawl_id: str,
    ) -> Dict[str, bool]:
        """Add note to page"""
        note = PageNote(id=uuid4(), text=text, userid=user.id, userName=user.name)

        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {
                "$push": {"notes": note.dict()},
                "$set": {"modified": modified},
            },
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"added": True}

    async def update_page_note(
        self,
        page_id: UUID,
        oid: UUID,
        note_in: PageNoteEdit,
        user: User,
        crawl_id: str,
    ) -> Dict[str, bool]:
        """Update specific page note"""
        page = await self.get_page_raw(page_id, oid)
        page_notes = page.get("notes", [])

        try:
            matching_index = [
                index
                for index, note in enumerate(page_notes)
                if note["id"] == note_in.id
            ][0]

        except IndexError:
            # pylint: disable=raise-missing-from
            raise HTTPException(status_code=404, detail="page_note_not_found")

        new_note = PageNote(
            id=note_in.id, text=note_in.text, userid=user.id, userName=user.name
        )
        page_notes[matching_index] = new_note.dict()

        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {"$set": {"notes": page_notes, "modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"updated": True}

    async def delete_page_notes(
        self,
        page_id: UUID,
        oid: UUID,
        delete: PageNoteDelete,
        crawl_id: str,
    ) -> Dict[str, bool]:
        """Delete specific page notes"""
        page = await self.get_page_raw(page_id, oid)
        page_notes = page.get("notes", [])

        remaining_notes = []
        for note in page_notes:
            if not note.get("id") in delete.delete_list:
                remaining_notes.append(note)

        modified = datetime.utcnow().replace(microsecond=0, tzinfo=None)

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {"$set": {"notes": remaining_notes, "modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"deleted": True}

    async def list_pages(
        self,
        org: Organization,
        crawl_id: str,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
    ) -> Tuple[List[Page], int]:
        """List all pages in crawl"""
        # pylint: disable=duplicate-code, too-many-locals
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        query: dict[str, object] = {
            "oid": org.id,
            "crawl_id": crawl_id,
        }

        aggregate = [{"$match": query}]

        if sort_by:
            # Sorting options to add:
            # - automated heuristics like screenshot_comparison (dict keyed by QA run id)
            # - Ensure notes sorting works okay with notes in list
            sort_fields = ("url", "title", "notes", "approved", "notes")
            if sort_by not in sort_fields:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")
            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        aggregate.extend(
            [
                {
                    "$facet": {
                        "items": [
                            {"$skip": skip},
                            {"$limit": page_size},
                        ],
                        "total": [{"$count": "count"}],
                    }
                },
            ]
        )

        # Get total
        cursor = self.pages.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        pages = [PageOut.from_dict(data) for data in items]

        return pages, total


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, invalid-name, fixme
def init_pages_api(app, mdb, crawl_ops, org_ops, storage_ops, user_dep):
    """init pages API"""
    # pylint: disable=invalid-name

    ops = PageOps(mdb, crawl_ops, org_ops, storage_ops)

    org_crawl_dep = org_ops.org_crawl_dep

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}",
        tags=["pages"],
        response_model=Page,
    )
    async def get_page(
        crawl_id: str,
        page_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        """GET single page"""
        return await ops.get_page(page_id, org.id, crawl_id)

    @app.patch(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}",
        tags=["pages"],
    )
    async def update_page_approval(
        crawl_id: str,
        page_id: UUID,
        update: PageReviewUpdate,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        """Update review for specific page"""
        return await ops.update_page_approval(
            page_id, org.id, update.approved, crawl_id, user
        )

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}/notes",
        tags=["pages"],
    )
    async def add_page_note(
        crawl_id: str,
        page_id: UUID,
        note: PageNoteIn,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        """Add note to page"""
        return await ops.add_page_note(page_id, org.id, note.text, user, crawl_id)

    @app.patch(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}/notes",
        tags=["pages"],
    )
    async def edit_page_note(
        crawl_id: str,
        page_id: UUID,
        note: PageNoteEdit,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        """Edit page note"""
        return await ops.update_page_note(page_id, org.id, note, user, crawl_id)

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}/notes/delete",
        tags=["pages"],
    )
    async def delete_page_notes(
        crawl_id: str,
        page_id: UUID,
        delete: PageNoteDelete,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Edit page note"""
        return await ops.delete_page_notes(page_id, org.id, delete, crawl_id)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/pages",
        tags=["pages"],
        response_model=PaginatedResponse,
    )
    async def get_pages_list(
        crawl_id: str,
        org: Organization = Depends(org_crawl_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of pages"""
        pages, total = await ops.list_pages(
            org,
            crawl_id=crawl_id,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(pages, total, page, pageSize)

    return ops
