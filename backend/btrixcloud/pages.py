"""crawl pages"""

# pylint: disable=too-many-lines

import asyncio
import traceback
import urllib.parse
from datetime import datetime
from typing import TYPE_CHECKING, Optional, Tuple, List, Dict, Any, Union
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException, Request, Response
import pymongo

from .models import (
    Page,
    PageOut,
    PageOutWithSingleQA,
    PageReviewUpdate,
    PageQACompare,
    PageIdTimestamp,
    PageUrlCount,
    PageUrlCountResponse,
    Organization,
    PaginatedPageOutResponse,
    PageOutItemsResponse,
    PaginatedPageOutWithQAResponse,
    User,
    PageNote,
    PageNoteIn,
    PageNoteEdit,
    PageNoteDelete,
    QARunBucketStats,
    StartedResponse,
    UpdatedResponse,
    DeletedResponse,
    PageNoteAddedResponse,
    PageNoteUpdatedResponse,
    EmptyResponse,
)
from .pagination import DEFAULT_PAGE_SIZE, paginated_format
from .utils import str_to_date, str_list_to_bools, dt_now

if TYPE_CHECKING:
    from .background_jobs import BackgroundJobOps
    from .colls import CollectionOps
    from .crawls import CrawlOps
    from .orgs import OrgOps
    from .storages import StorageOps
else:
    CrawlOps = StorageOps = OrgOps = BackgroundJobOps = CollectionOps = object


# ============================================================================
# pylint: disable=too-many-instance-attributes, too-many-arguments,too-many-public-methods
class PageOps:
    """crawl pages"""

    crawl_ops: CrawlOps
    org_ops: OrgOps
    storage_ops: StorageOps
    background_job_ops: BackgroundJobOps
    coll_ops: CollectionOps

    def __init__(
        self, mdb, crawl_ops, org_ops, storage_ops, background_job_ops, coll_ops
    ):
        self.pages = mdb["pages"]
        self.crawls = mdb["crawls"]
        self.mdb = mdb
        self.crawl_ops = crawl_ops
        self.org_ops = org_ops
        self.storage_ops = storage_ops
        self.background_job_ops = background_job_ops
        self.coll_ops = coll_ops

    async def init_index(self):
        """init index for pages db collection"""
        await self.pages.create_index([("crawl_id", pymongo.HASHED)])
        await self.pages.create_index(
            [
                ("crawl_id", pymongo.HASHED),
                ("isSeed", pymongo.DESCENDING),
                ("ts", pymongo.ASCENDING),
            ]
        )
        await self.pages.create_index(
            [
                ("crawl_id", pymongo.HASHED),
                ("url", pymongo.ASCENDING),
            ]
        )
        await self.pages.create_index([("title", "text")])

    async def set_ops(self, background_job_ops: BackgroundJobOps):
        """Set ops classes as needed"""
        self.background_job_ops = background_job_ops

    async def add_crawl_pages_to_db_from_wacz(
        self, crawl_id: str, batch_size=100, num_retries=5
    ):
        """Add pages to database from WACZ files"""
        pages_buffer: List[Page] = []
        crawl = await self.crawl_ops.get_crawl_out(crawl_id)
        try:
            stream = await self.storage_ops.sync_stream_wacz_pages(
                crawl.resources or [], num_retries
            )
            new_uuid = crawl.type == "upload"
            seed_count = 0
            non_seed_count = 0
            for page_dict in stream:
                if not page_dict.get("url"):
                    continue

                page_dict["isSeed"] = page_dict.get("isSeed") or page_dict.get("seed")

                if page_dict.get("isSeed"):
                    seed_count += 1
                else:
                    non_seed_count += 1

                if len(pages_buffer) > batch_size:
                    try:
                        await self._add_pages_to_db(
                            crawl_id, pages_buffer, ordered=False
                        )
                    # pylint: disable=broad-exception-caught
                    except Exception as e:
                        print("Error inserting, probably dupe", e)
                    pages_buffer = []

                pages_buffer.append(
                    self._get_page_from_dict(page_dict, crawl_id, crawl.oid, new_uuid)
                )

            # Add any remaining pages in buffer to db
            if pages_buffer:
                try:
                    await self._add_pages_to_db(crawl_id, pages_buffer, ordered=False)
                # pylint: disable=broad-exception-caught
                except Exception as e:
                    print("Error inserting, probably dupe", e)

            await self.set_archived_item_page_counts(crawl_id)

            print(
                f"Added pages for crawl {crawl_id}: "
                + f"{seed_count} Seed, {non_seed_count} Non-Seed",
                flush=True,
            )

        # pylint: disable=broad-exception-caught, raise-missing-from
        except Exception as err:
            traceback.print_exc()
            print(f"Error adding pages for crawl {crawl_id} to db: {err}", flush=True)

    def _get_page_from_dict(
        self, page_dict: Dict[str, Any], crawl_id: str, oid: UUID, new_uuid: bool
    ) -> Page:
        """Return Page object from dict"""
        page_id = page_dict.get("id", "") if not new_uuid else None

        try:
            UUID(page_id)
        except (TypeError, ValueError):
            page_id = uuid4()

        status = page_dict.get("status")
        if not status and page_dict.get("loadState"):
            status = 200

        ts = page_dict.get("ts")
        p = Page(
            id=page_id,
            oid=oid,
            crawl_id=crawl_id,
            url=page_dict.get("url"),
            title=page_dict.get("title"),
            loadState=page_dict.get("loadState"),
            status=status,
            mime=page_dict.get("mime", "text/html"),
            filename=page_dict.get("filename"),
            depth=page_dict.get("depth"),
            isSeed=page_dict.get("seed", False),
            favIconUrl=page_dict.get("favIconUrl"),
            ts=(str_to_date(ts) if ts else dt_now()),
        )
        p.compute_page_type()
        return p

    async def _add_pages_to_db(self, crawl_id: str, pages: List[Page], ordered=True):
        """Add batch of pages to db in one insert"""
        result = await self.pages.insert_many(
            [
                page.to_dict(
                    exclude_unset=True, exclude_none=True, exclude_defaults=True
                )
                for page in pages
            ],
            ordered=ordered,
        )
        if not result.inserted_ids:
            # pylint: disable=broad-exception-raised
            raise Exception("No pages inserted")

        await self.update_crawl_file_and_error_counts(crawl_id, pages)

    async def add_page_to_db(
        self,
        page_dict: Dict[str, Any],
        crawl_id: str,
        qa_run_id: Optional[str],
        oid: UUID,
    ):
        """Add page to database"""
        page = self._get_page_from_dict(page_dict, crawl_id, oid, new_uuid=False)

        page_to_insert = page.to_dict(exclude_unset=True, exclude_none=True)

        try:
            await self.pages.insert_one(page_to_insert)
        except pymongo.errors.DuplicateKeyError:
            pass

        # pylint: disable=broad-except
        except Exception as err:
            print(
                f"Error adding page {page.id} from crawl {crawl_id} to db: {err}",
                flush=True,
            )
            return

        if not qa_run_id and page:
            await self.update_crawl_file_and_error_counts(crawl_id, [page])

        # qa data
        if qa_run_id and page:
            compare_dict = page_dict.get("comparison")
            if compare_dict is None:
                print("QA Run, but compare data missing!")
                return

            compare = PageQACompare(**compare_dict)

            await self.add_qa_run_for_page(page.id, oid, qa_run_id, compare)

    async def update_crawl_file_and_error_counts(
        self, crawl_id: str, pages: List[Page]
    ):
        """Update crawl filePageCount and errorPageCount for pages."""
        file_count = 0
        error_count = 0

        for page in pages:
            if page.isFile:
                file_count += 1

            if page.isError:
                error_count += 1

        if file_count == 0 and error_count == 0:
            return

        inc_query = {}

        if file_count > 0:
            inc_query["filePageCount"] = file_count

        if error_count > 0:
            inc_query["errorPageCount"] = error_count

        await self.crawls.find_one_and_update(
            {"_id": crawl_id},
            {"$inc": inc_query},
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

    async def get_page_out(
        self,
        page_id: UUID,
        oid: UUID,
        crawl_id: Optional[str] = None,
        qa_run_id: Optional[str] = None,
    ) -> Union[PageOut, PageOutWithSingleQA]:
        """Return PageOut or PageOutWithSingleQA for page"""
        page_raw = await self.get_page_raw(page_id, oid, crawl_id)
        if qa_run_id:
            qa = page_raw.get("qa")
            if qa and qa.get(qa_run_id):
                page_raw["qa"] = qa.get(qa_run_id)
            else:
                print(
                    f"Error: Page {page_id} does not have data from QA run {qa_run_id}",
                    flush=True,
                )
                page_raw["qa"] = None
            return PageOutWithSingleQA.from_dict(page_raw)
        return PageOut.from_dict(page_raw)

    async def add_qa_run_for_page(
        self, page_id: UUID, oid: UUID, qa_run_id: str, compare: PageQACompare
    ) -> bool:
        """Update page heuristics and mime/type from QA run"""

        # modified = dt_now()

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid},
            {"$set": {f"qa.{qa_run_id}": compare.dict()}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return True

    async def delete_qa_run_from_pages(self, crawl_id: str, qa_run_id: str):
        """delete pages"""
        result = await self.pages.update_many(
            {"crawl_id": crawl_id}, {"$unset": {f"qa.{qa_run_id}": ""}}
        )
        return result

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
        query["modified"] = dt_now()
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
    ) -> Dict[str, Union[bool, PageNote]]:
        """Add note to page"""
        note = PageNote(
            id=uuid4(), text=text, userid=user.id, userName=user.name, created=dt_now()
        )

        modified = dt_now()

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

        return {"added": True, "data": note}

    async def update_page_note(
        self,
        page_id: UUID,
        oid: UUID,
        note_in: PageNoteEdit,
        user: User,
        crawl_id: str,
    ) -> Dict[str, Union[bool, PageNote]]:
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
            id=note_in.id,
            text=note_in.text,
            userid=user.id,
            userName=user.name,
            created=dt_now(),
        )
        page_notes[matching_index] = new_note.dict()

        modified = dt_now()

        result = await self.pages.find_one_and_update(
            {"_id": page_id, "oid": oid, "crawl_id": crawl_id},
            {"$set": {"notes": page_notes, "modified": modified}},
            return_document=pymongo.ReturnDocument.AFTER,
        )

        if not result:
            raise HTTPException(status_code=404, detail="page_not_found")

        return {"updated": True, "data": new_note}

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
            if note.get("id") not in delete.delete_list:
                remaining_notes.append(note)

        modified = dt_now()

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
        coll_id: Optional[UUID] = None,
        crawl_ids: Optional[List[str]] = None,
        public_or_unlisted_only=False,
        org: Optional[Organization] = None,
        search: Optional[str] = None,
        url: Optional[str] = None,
        url_prefix: Optional[str] = None,
        ts: Optional[datetime] = None,
        is_seed: Optional[bool] = None,
        depth: Optional[int] = None,
        qa_run_id: Optional[str] = None,
        qa_filter_by: Optional[str] = None,
        qa_gte: Optional[float] = None,
        qa_gt: Optional[float] = None,
        qa_lte: Optional[float] = None,
        qa_lt: Optional[float] = None,
        reviewed: Optional[bool] = None,
        approved: Optional[List[Union[bool, None]]] = None,
        has_notes: Optional[bool] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: Optional[int] = -1,
        include_total=False,
    ) -> Tuple[Union[List[PageOut], List[PageOutWithSingleQA]], int]:
        """List all pages in crawl"""
        # pylint: disable=duplicate-code, too-many-locals, too-many-branches, too-many-statements
        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        # Crawl or Collection Selection
        if coll_id:
            if crawl_ids:
                # both coll_id and crawll_ids, error
                raise HTTPException(
                    status_code=400,
                    detail="only one of crawl_ids or coll_id can be provided",
                )

            crawl_ids = await self.coll_ops.get_collection_crawl_ids(
                coll_id, public_or_unlisted_only
            )
        elif not crawl_ids:
            # neither coll_id nor crawl_id, error
            raise HTTPException(
                status_code=400, detail="either crawl_ids or coll_id must be provided"
            )

        query: dict[str, object] = {
            "crawl_id": {"$in": crawl_ids},
        }
        # if org:
        #    query["oid"] = org.id

        # Text Search
        is_text_search = False
        if search:
            search = urllib.parse.unquote(search)
            if search.startswith("http:") or search.startswith("https:"):
                query["url"] = {"$gte": search}
            else:
                query["$text"] = {"$search": search}
                is_text_search = True

        # Seed Settings
        if url:
            query["url"] = urllib.parse.unquote(url)
        elif url_prefix:
            query["url"] = {"$gte": urllib.parse.unquote(url_prefix)}

        if ts:
            query["ts"] = ts

        if is_seed in (True, False):
            query["isSeed"] = is_seed

        if isinstance(depth, int):
            query["depth"] = depth

        # QA Settings
        if reviewed:
            query["$or"] = [
                {"approved": {"$ne": None}},
                {"notes.0": {"$exists": True}},
            ]

        if reviewed is False:
            query["$and"] = [
                {"approved": {"$eq": None}},
                {"notes.0": {"$exists": False}},
            ]

        if approved:
            query["approved"] = {"$in": approved}

        if has_notes is not None:
            query["notes.0"] = {"$exists": has_notes}

        if qa_run_id:
            query[f"qa.{qa_run_id}"] = {"$exists": True}

            range_filter = {}

            if qa_gte:
                range_filter["$gte"] = qa_gte
            if qa_lte:
                range_filter["$lte"] = qa_lte
            if qa_gt:
                range_filter["$gt"] = qa_gt
            if qa_lt:
                range_filter["$lt"] = qa_lt

            if qa_filter_by:
                if not range_filter:
                    raise HTTPException(status_code=400, detail="range_missing")

                query[f"qa.{qa_run_id}.{qa_filter_by}"] = range_filter

        aggregate: List[Dict[str, Union[int, object]]] = [{"$match": query}]

        # Extra QA Set
        if qa_run_id:
            aggregate.extend([{"$set": {"qa": f"$qa.{qa_run_id}"}}])
            # aggregate.extend([{"$project": {"qa": f"$qa.{qa_run_id}"}}])

        # Sorting
        if sort_by:
            # Sorting options to add:
            # - automated heuristics like screenshot_comparison (dict keyed by QA run id)
            # - Ensure notes sorting works okay with notes in list
            sort_fields = (
                "url",
                "title",
                "notes",
                "approved",
                "ts",
                "status",
                "mime",
                "filename",
                "depth",
                "isSeed",
            )
            qa_sort_fields = ("screenshotMatch", "textMatch")
            if sort_by not in sort_fields and sort_by not in qa_sort_fields:
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            if sort_by in qa_sort_fields:
                if not qa_run_id:
                    raise HTTPException(
                        status_code=400, detail="qa_run_id_missing_for_qa_sort"
                    )

                sort_by = f"qa.{qa_run_id}.{sort_by}"

            aggregate.extend([{"$sort": {sort_by: sort_direction}}])

        # default sort with search
        elif search or url_prefix:
            if is_text_search:
                aggregate.extend(
                    [
                        {"$sort": {"score": {"$meta": "textScore"}}},
                    ]
                )
            else:
                aggregate.extend([{"$sort": {"url": 1}}])
        else:
            # default sort: seeds first, then by timestamp
            aggregate.extend([{"$sort": {"isSeed": -1, "ts": 1}}])

        facet_query: dict[str, object] = {
            "items": [
                {"$skip": skip},
                {"$limit": page_size},
            ],
        }

        if include_total:
            facet_query["total"] = [{"$count": "count"}]

        aggregate.extend([{"$facet": facet_query}])

        print(aggregate)

        cursor = self.pages.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError, KeyError):
            total = 0

        if qa_run_id:
            return [PageOutWithSingleQA.from_dict(data) for data in items], total

        return [PageOut.from_dict(data) for data in items], total

    async def list_page_url_counts(
        self,
        coll_id: UUID,
        url_prefix: Optional[str] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> List[PageUrlCount]:
        """List all page URLs in collection sorted desc by snapshot count
        unless prefix is specified"""
        crawl_ids = await self.coll_ops.get_collection_crawl_ids(coll_id)

        pages, _ = await self.list_pages(
            crawl_ids=crawl_ids,
            url_prefix=url_prefix,
            page_size=page_size * len(crawl_ids),
        )

        url_counts: dict[str, PageUrlCount] = {}

        for page in pages:
            url = page.url
            count = url_counts.get(url)
            if not count:
                # if already at max pages, this would add a new page, so we're done
                if len(url_counts) >= page_size:
                    break
                count = PageUrlCount(url=url, snapshots=[], count=0)
                url_counts[url] = count
            count.snapshots.append(
                PageIdTimestamp(
                    pageId=page.id,
                    ts=page.ts,
                    status=page.status or 200,
                )
            )
            count.count += 1

        return list(url_counts.values())

    async def re_add_crawl_pages(self, crawl_id: str, oid: Optional[UUID] = None):
        """Delete existing pages for crawl and re-add from WACZs."""

        try:
            is_upload = await self.crawl_ops.is_upload(crawl_id)
            print(f"Processing {'upload' if is_upload else 'crawl'} {crawl_id}")
            if not is_upload:
                ts_now = dt_now().strftime("%Y%m%d%H%M%S")
                qa_temp_db_name = f"pages-qa-temp-{crawl_id}-{ts_now}"
                cursor = self.pages.aggregate(
                    [
                        {
                            "$match": {
                                "crawl_id": crawl_id,
                                "$or": [
                                    {"qa": {"$nin": [None, {}]}},
                                    {"modified": {"$ne": None}},
                                    {"userid": {"$ne": None}},
                                    {"approved": {"$ne": None}},
                                    {"notes": {"$ne": None}},
                                ],
                            }
                        },
                        {
                            "$project": {
                                "_id": 1,
                                "qa": 1,
                                "modified": 1,
                                "userid": 1,
                                "approved": 1,
                                "notes": 1,
                            }
                        },
                        {"$out": qa_temp_db_name},
                    ]
                )
                print(f"Stored QA data in temp db {qa_temp_db_name}")
                assert await cursor.to_list() == []

            await self.delete_crawl_pages(crawl_id, oid)
            print(f"Deleted pages for crawl {crawl_id}", flush=True)
            await self.add_crawl_pages_to_db_from_wacz(crawl_id)

            if not is_upload:
                qa_temp_db = self.mdb[qa_temp_db_name]
                cursor = qa_temp_db.aggregate(
                    [
                        {
                            "$merge": {
                                "into": "pages",
                                "on": ["_id"],
                                "whenNotMatched": "fail",
                            }
                        }
                    ]
                )
                print(f"Merged QA data from temp db {qa_temp_db_name}")

                assert await cursor.to_list() == []
                await qa_temp_db.drop()
                print(f"Dropped temp db {qa_temp_db_name}")
        # pylint: disable=broad-exception-caught
        except Exception as e:
            print(e)

    async def re_add_all_crawl_pages(
        self, org: Organization, crawl_type: Optional[str] = None
    ):
        """Re-add pages for all crawls and uploads in org"""
        match_query: Dict[str, Union[object, UUID]] = {
            "oid": org.id,
            "finished": {"$ne": None},
        }
        if crawl_type in ("crawl", "upload"):
            match_query["type"] = crawl_type

        count = 1
        total = await self.crawls.count_documents(match_query)
        async for crawl in self.crawls.find(match_query, projection={"_id": 1}):
            print(f"Processing crawl {count} of {total}")
            await self.re_add_crawl_pages(crawl.get("_id"), org.id)
            count += 1

    async def get_qa_run_aggregate_counts(
        self,
        crawl_id: str,
        qa_run_id: str,
        thresholds: Dict[str, List[float]],
        key: str = "screenshotMatch",
    ):
        """Get counts for pages in QA run in buckets by score key based on thresholds"""
        boundaries = thresholds.get(key, [])
        if not boundaries:
            raise HTTPException(status_code=400, detail="missing_thresholds")

        boundaries = sorted(boundaries)

        # Make sure boundaries start with 0
        if boundaries[0] != 0:
            boundaries.insert(0, 0.0)

        # Make sure we have upper boundary just over 1 to be inclusive of scores of 1
        if boundaries[-1] <= 1:
            boundaries.append(1.1)

        aggregate = [
            {
                "$match": {
                    "crawl_id": crawl_id,
                    "isFile": {"$ne": True},
                    "isError": {"$ne": True},
                }
            },
            {
                "$bucket": {
                    "groupBy": f"$qa.{qa_run_id}.{key}",
                    "default": "No data",
                    "boundaries": boundaries,
                    "output": {
                        "count": {"$sum": 1},
                    },
                }
            },
        ]
        cursor = self.pages.aggregate(aggregate)
        results = await cursor.to_list(length=len(boundaries))

        return_data = []

        for result in results:
            return_data.append(
                QARunBucketStats(
                    lowerBoundary=str(result.get("_id")), count=result.get("count", 0)
                )
            )

        # Add missing boundaries to result and re-sort
        for boundary in boundaries:
            if boundary < 1.0:
                matching_return_data = [
                    bucket
                    for bucket in return_data
                    if bucket.lowerBoundary == str(boundary)
                ]
                if not matching_return_data:
                    return_data.append(
                        QARunBucketStats(lowerBoundary=str(boundary), count=0)
                    )

        return sorted(return_data, key=lambda bucket: bucket.lowerBoundary)

    def get_crawl_type_from_pages_route(self, request: Request):
        """Get crawl type to filter on from request route"""
        crawl_type = None

        try:
            route_path = request.scope["route"].path
            type_path = route_path.split("/")[4]

            if type_path == "uploads":
                crawl_type = "upload"
            if type_path == "crawls":
                crawl_type = "crawl"
        except (IndexError, AttributeError):
            pass

        return crawl_type

    async def get_unique_page_count(self, crawl_ids: List[str]) -> int:
        """Get count of unique page URLs across list of archived items"""
        cursor = self.pages.aggregate(
            [
                {"$match": {"crawl_id": {"$in": crawl_ids}}},
                {"$group": {"_id": "$url"}},
                {"$count": "urls"},
            ]
        )
        res = await cursor.to_list(1)
        return res[0].get("urls") if res else 0

    async def set_archived_item_page_counts(self, crawl_id: str):
        """Store archived item page and unique page counts in crawl document"""
        page_count = await self.pages.count_documents({"crawl_id": crawl_id})
        unique_page_count = await self.get_unique_page_count([crawl_id])

        await self.crawls.find_one_and_update(
            {"_id": crawl_id},
            {"$set": {"uniquePageCount": unique_page_count, "pageCount": page_count}},
        )

    async def optimize_crawl_pages(self, version: int = 2):
        """Iterate through crawls, optimizing pages"""

        async def process_finished_crawls():
            while True:
                # Pull new finished crawl and set isMigrating
                match_query = {
                    "version": {"$ne": version},
                    "isMigrating": {"$ne": True},
                    "finished": {"$ne": None},
                }

                next_crawl = await self.crawls.find_one_and_update(
                    match_query,
                    {"$set": {"isMigrating": True}},
                    sort=[("finished", -1)],
                )
                if next_crawl is None:
                    print("No more finished crawls to migrate")
                    break

                crawl_id = next_crawl.get("_id")
                print("Processing crawl: " + crawl_id)

                # Re-add crawl pages if at least one page doesn't have filename set
                has_page_no_filename = await self.pages.find_one(
                    {"crawl_id": crawl_id, "filename": None}
                )
                if has_page_no_filename:
                    print("Re-importing pages to migrate to v2")
                    await self.re_add_crawl_pages(crawl_id)
                else:
                    print("Pages already have filename, set to v2")

                # Update crawl version and unset isMigrating
                await self.crawls.find_one_and_update(
                    {"_id": crawl_id},
                    {"$set": {"version": version, "isMigrating": False}},
                )

        await process_finished_crawls()

        # Wait for running crawls from before migration to finish, and then process
        # again when they're done to make sure everything's been handled
        while True:
            match_query = {
                "version": {"$ne": version},
                "finished": None,
            }
            running_crawl = await self.crawls.find_one(match_query)

            if not running_crawl:
                print("No running crawls remain")
                break

            print("Running crawls remain, waiting for them to finish")
            await asyncio.sleep(30)

        await process_finished_crawls()

        # Wait until all pods are fully done before returning. For k8s job
        # parallelism to work as expected, pods must only return exit code 0
        # once the work in all pods is fully complete.
        while True:
            in_progress = await self.crawls.find_one({"isMigrating": True})
            if in_progress is None:
                break
            print("Unmigrated crawls remain, finishing job")
            await asyncio.sleep(5)


# ============================================================================
# pylint: disable=too-many-arguments, too-many-locals, invalid-name, fixme
def init_pages_api(
    app, mdb, crawl_ops, org_ops, storage_ops, background_job_ops, coll_ops, user_dep
) -> PageOps:
    """init pages API"""
    # pylint: disable=invalid-name

    ops = PageOps(mdb, crawl_ops, org_ops, storage_ops, background_job_ops, coll_ops)

    org_viewer_dep = org_ops.org_viewer_dep
    org_crawl_dep = org_ops.org_crawl_dep
    org_public = org_ops.org_public

    @app.post(
        "/orgs/{oid}/crawls/all/pages/reAdd",
        tags=["pages", "crawls"],
        response_model=StartedResponse,
    )
    @app.post(
        "/orgs/{oid}/uploads/all/pages/reAdd",
        tags=["pages", "uploads"],
        response_model=StartedResponse,
    )
    @app.post(
        "/orgs/{oid}/all-crawls/all/pages/reAdd",
        tags=["pages", "all-crawls"],
        response_model=StartedResponse,
    )
    async def re_add_all_crawl_pages(
        request: Request,
        org: Organization = Depends(org_crawl_dep),
        user: User = Depends(user_dep),
    ):
        """Re-add pages for all crawls in org (superuser only, may delete page QA data!)"""
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        crawl_type = ops.get_crawl_type_from_pages_route(request)
        job_id = await ops.background_job_ops.create_re_add_org_pages_job(
            org.id, crawl_type=crawl_type
        )
        return {"started": job_id or ""}

    @app.post(
        "/orgs/{oid}/crawls/{crawl_id}/pages/reAdd",
        tags=["pages", "crawls"],
        response_model=StartedResponse,
    )
    @app.post(
        "/orgs/{oid}/uploads/{crawl_id}/pages/reAdd",
        tags=["pages", "uploads"],
        response_model=StartedResponse,
    )
    @app.post(
        "/orgs/{oid}/all-crawls/{crawl_id}/pages/reAdd",
        tags=["pages", "all-crawls"],
        response_model=StartedResponse,
    )
    async def re_add_crawl_pages(
        crawl_id: str,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Re-add pages for crawl (may delete page QA data!)"""
        job_id = await ops.background_job_ops.create_re_add_org_pages_job(
            org.id, crawl_id=crawl_id
        )
        return {"started": job_id or ""}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}",
        tags=["pages", "crawls"],
        response_model=PageOut,
    )
    @app.get(
        "/orgs/{oid}/uploads/{crawl_id}/pages/{page_id}",
        tags=["pages", "uploads"],
        response_model=PageOut,
    )
    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}/pages/{page_id}",
        tags=["pages", "all-crawls"],
        response_model=PageOut,
    )
    async def get_page(
        crawl_id: str,
        page_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        """GET single page"""
        return await ops.get_page_out(page_id, org.id, crawl_id)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/pages/{page_id}",
        tags=["pages", "qa"],
        response_model=PageOutWithSingleQA,
    )
    async def get_page_with_qa(
        crawl_id: str,
        qa_run_id: str,
        page_id: UUID,
        org: Organization = Depends(org_crawl_dep),
    ):
        """GET single page with QA details"""
        return await ops.get_page_out(page_id, org.id, crawl_id, qa_run_id=qa_run_id)

    @app.patch(
        "/orgs/{oid}/crawls/{crawl_id}/pages/{page_id}",
        tags=["pages"],
        response_model=UpdatedResponse,
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
        response_model=PageNoteAddedResponse,
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
        response_model=PageNoteUpdatedResponse,
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
        response_model=DeletedResponse,
    )
    async def delete_page_notes(
        crawl_id: str,
        page_id: UUID,
        delete: PageNoteDelete,
        org: Organization = Depends(org_crawl_dep),
    ):
        """Delete page note"""
        return await ops.delete_page_notes(page_id, org.id, delete, crawl_id)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/pages",
        tags=["pages", "crawls"],
        response_model=PaginatedPageOutResponse,
    )
    @app.get(
        "/orgs/{oid}/uploads/{crawl_id}/pages",
        tags=["pages", "uploads"],
        response_model=PaginatedPageOutResponse,
    )
    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}/pages",
        tags=["pages", "all-crawls"],
        response_model=PaginatedPageOutResponse,
    )
    async def get_crawl_pages_list(
        crawl_id: str,
        org: Organization = Depends(org_crawl_dep),
        search: Optional[str] = None,
        url: Optional[str] = None,
        urlPrefix: Optional[str] = None,
        ts: Optional[datetime] = None,
        isSeed: Optional[bool] = None,
        depth: Optional[int] = None,
        reviewed: Optional[bool] = None,
        approved: Optional[str] = None,
        hasNotes: Optional[bool] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of pages"""
        formatted_approved: Optional[List[Union[bool, None]]] = None
        if approved:
            formatted_approved = str_list_to_bools(approved.split(","))

        pages, total = await ops.list_pages(
            crawl_ids=[crawl_id],
            org=org,
            search=search,
            url=url,
            url_prefix=urlPrefix,
            ts=ts,
            is_seed=isSeed,
            depth=depth,
            reviewed=reviewed,
            approved=formatted_approved,
            has_notes=hasNotes,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            include_total=True,
        )
        return paginated_format(pages, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/pagesSearch",
        tags=["pages", "crawls"],
        response_model=PageOutItemsResponse,
    )
    async def get_search_pages_list(
        crawl_id: str,
        org: Organization = Depends(org_crawl_dep),
        search: Optional[str] = None,
        url: Optional[str] = None,
        ts: Optional[datetime] = None,
        isSeed: Optional[bool] = None,
        depth: Optional[int] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
    ):
        """Retrieve paginated list of pages"""
        pages, _ = await ops.list_pages(
            crawl_ids=[crawl_id],
            search=search,
            url=url,
            ts=ts,
            is_seed=isSeed,
            depth=depth,
            org=org,
            page_size=pageSize,
            page=page,
            include_total=False,
        )
        return {"items": pages}

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/public/pages",
        tags=["pages", "collections"],
        response_model=PageOutItemsResponse,
    )
    async def get_public_collection_pages_list(
        coll_id: UUID,
        response: Response,
        org: Organization = Depends(org_public),
        search: Optional[str] = None,
        url: Optional[str] = None,
        ts: Optional[datetime] = None,
        isSeed: Optional[bool] = None,
        depth: Optional[int] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of pages in collection"""
        pages, _ = await ops.list_pages(
            coll_id=coll_id,
            org=org,
            search=search,
            url=url,
            ts=ts,
            is_seed=isSeed,
            depth=depth,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            public_or_unlisted_only=True,
        )

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return {"items": pages}

    @app.options(
        "/orgs/{oid}/collections/{coll_id}/pages",
        tags=["pages", "collections"],
        response_model=EmptyResponse,
    )
    @app.options(
        "/orgs/{oid}/collections/{coll_id}/public/pages",
        tags=["pages", "collections"],
        response_model=EmptyResponse,
    )
    async def get_replay_preflight(response: Response):
        response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return {}

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/pages",
        tags=["pages", "collections"],
        response_model=PageOutItemsResponse,
    )
    async def get_collection_pages_list(
        coll_id: UUID,
        response: Response,
        org: Organization = Depends(org_viewer_dep),
        search: Optional[str] = None,
        url: Optional[str] = None,
        ts: Optional[datetime] = None,
        isSeed: Optional[bool] = None,
        depth: Optional[int] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of pages in collection"""
        pages, _ = await ops.list_pages(
            coll_id=coll_id,
            org=org,
            search=search,
            url=url,
            ts=ts,
            is_seed=isSeed,
            depth=depth,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return {"items": pages}

    @app.get(
        "/orgs/{oid}/crawls/{crawl_id}/qa/{qa_run_id}/pages",
        tags=["pages", "qa"],
        response_model=PaginatedPageOutWithQAResponse,
    )
    async def get_pages_list_with_qa(
        crawl_id: str,
        qa_run_id: str,
        filterQABy: Optional[str] = None,
        gte: Optional[float] = None,
        gt: Optional[float] = None,
        lte: Optional[float] = None,
        lt: Optional[float] = None,
        reviewed: Optional[bool] = None,
        approved: Optional[str] = None,
        hasNotes: Optional[bool] = None,
        org: Organization = Depends(org_crawl_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sortBy: Optional[str] = None,
        sortDirection: Optional[int] = -1,
    ):
        """Retrieve paginated list of pages"""
        formatted_approved: Optional[List[Union[bool, None]]] = None
        if approved:
            formatted_approved = str_list_to_bools(approved.split(","))

        pages, total = await ops.list_pages(
            crawl_ids=[crawl_id],
            org=org,
            qa_run_id=qa_run_id,
            qa_filter_by=filterQABy,
            qa_gte=gte,
            qa_gt=gt,
            qa_lte=lte,
            qa_lt=lt,
            reviewed=reviewed,
            approved=formatted_approved,
            has_notes=hasNotes,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
        )
        return paginated_format(pages, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/collections/{coll_id}/pageUrlCounts",
        tags=["collections"],
        response_model=PageUrlCountResponse,
    )
    async def get_collection_url_list(
        coll_id: UUID,
        # oid: UUID,
        urlPrefix: Optional[str] = None,
        pageSize: int = DEFAULT_PAGE_SIZE,
        # page: int = 1,
    ):
        """Retrieve paginated list of urls in collection sorted by snapshot count"""
        pages = await ops.list_page_url_counts(
            coll_id=coll_id,
            url_prefix=urlPrefix,
            page_size=pageSize,
        )
        return {"items": pages}

    return ops
