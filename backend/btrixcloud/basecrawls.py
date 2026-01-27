"""base crawl type"""

from datetime import datetime
from typing import (
    Annotated,
    Optional,
    List,
    Union,
    Dict,
    Any,
    Type,
    TYPE_CHECKING,
    cast,
    Tuple,
    AsyncIterable,
)
from uuid import UUID
import os
import urllib.parse

import asyncio
from fastapi import HTTPException, Depends, Query, Request
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
import pymongo

from .models import (
    SUCCESSFUL_STATES,
    TagsResponse,
    CrawlFile,
    CrawlFileOut,
    BaseCrawl,
    CrawlOut,
    CrawlOutWithResources,
    ListFilterType,
    UpdateCrawl,
    DeleteCrawlList,
    Organization,
    PaginatedCrawlOutResponse,
    User,
    StorageRef,
    RUNNING_AND_WAITING_STATES,
    SUCCESSFUL_AND_PAUSED_STATES,
    QARun,
    UpdatedResponse,
    DeletedResponseQuota,
    CrawlSearchValuesResponse,
    TYPE_CRAWL_TYPES,
    CRAWL_TYPES,
)
from .pagination import paginated_format, DEFAULT_PAGE_SIZE
from .utils import dt_now, get_origin, date_to_str

if TYPE_CHECKING:
    from .crawlconfigs import CrawlConfigOps
    from .users import UserManager
    from .orgs import OrgOps
    from .colls import CollectionOps
    from .storages import StorageOps
    from .webhooks import EventWebhookOps
    from .background_jobs import BackgroundJobOps
    from .pages import PageOps

else:
    CrawlConfigOps = UserManager = OrgOps = CollectionOps = PageOps = object
    StorageOps = EventWebhookOps = BackgroundJobOps = object


# ============================================================================
# pylint: disable=too-many-instance-attributes, too-many-public-methods, too-many-lines, too-many-branches
class BaseCrawlOps:
    """operations that apply to all crawls"""

    # pylint: disable=duplicate-code, too-many-arguments, too-many-locals

    crawl_configs: CrawlConfigOps
    user_manager: UserManager
    orgs: OrgOps
    colls: CollectionOps
    storage_ops: StorageOps
    event_webhook_ops: EventWebhookOps
    background_job_ops: BackgroundJobOps
    page_ops: PageOps

    def __init__(
        self,
        mdb: AsyncIOMotorDatabase,
        users: UserManager,
        orgs: OrgOps,
        crawl_configs: CrawlConfigOps,
        colls: CollectionOps,
        storage_ops: StorageOps,
        event_webhook_ops: EventWebhookOps,
        background_job_ops: BackgroundJobOps,
    ):
        self.crawls = mdb["crawls"]
        self.presigned_urls = mdb["presigned_urls"]
        self.crawl_configs = crawl_configs
        self.user_manager = users
        self.orgs = orgs
        self.colls = colls
        self.storage_ops = storage_ops
        self.event_webhook_ops = event_webhook_ops
        self.background_job_ops = background_job_ops
        self.page_ops = cast(PageOps, None)

    def set_page_ops(self, page_ops):
        """set page ops reference"""
        self.page_ops = page_ops

    async def get_crawl_raw(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
        type_: Optional[TYPE_CRAWL_TYPES] = None,
        project: Optional[dict[str, bool]] = None,
    ) -> Dict[str, Any]:
        """Get data for single crawl"""

        query: dict[str, object] = {"_id": crawlid}
        if org:
            query["oid"] = org.id

        if type_:
            query["type"] = type_

        res = await self.crawls.find_one(query, project)

        if not res:
            raise HTTPException(status_code=404, detail=f"Crawl not found: {crawlid}")

        return res

    async def _files_to_resources(
        self,
        files: List[Dict],
        org: Organization,
        crawlid: str,
    ) -> List[CrawlFileOut]:
        if not files:
            return []

        crawl_files = [CrawlFile(**data) for data in files]
        return await self.resolve_signed_urls(
            crawl_files, org, crawlid, session=session
        )

    async def get_wacz_files(self, crawl_id: str, org: Organization):
        """Return list of WACZ files associated with crawl."""
        wacz_files = []
        crawl = await self.get_base_crawl(crawl_id, org)
        for file_ in crawl.files:
            if file_.filename.endswith(".wacz"):
                wacz_files.append(file_)
        return wacz_files

    async def get_base_crawl(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
        type_: Optional[TYPE_CRAWL_TYPES] = None,
    ) -> BaseCrawl:
        """Get crawl data for internal use"""
        res = await self.get_crawl_raw(crawlid, org, type_)
        return BaseCrawl.from_dict(res)

    async def get_crawl_out(
        self,
        crawlid: str,
        org: Optional[Organization] = None,
        type_: Optional[TYPE_CRAWL_TYPES] = None,
        skip_resources=False,
        headers: Optional[dict] = None,
        cid: Optional[UUID] = None,
    ) -> CrawlOutWithResources:
        """Get crawl data for api output"""
        res = await self.get_crawl_raw(crawlid, org, type_)

        files = res.pop("files", None)
        res.pop("errors", None)
        res.pop("behaviorLogs", None)

        if not skip_resources:
            coll_ids = res.get("collectionIds")
            if coll_ids:
                res["collections"] = await self.colls.get_collection_names(coll_ids)

            if res.get("version", 1) == 2:
                res["initialPages"], _ = await self.page_ops.list_pages(
                    crawl_ids=[crawlid], page_size=25
                )

                oid = res.get("oid")
                if oid:
                    origin = get_origin(headers)
                    # If cid is passed, construct pagesSearch query for public
                    # shareable workflow
                    if cid:
                        res["pagesQueryUrl"] = (
                            origin
                            + f"/api/orgs/{oid}/crawlconfigs/{cid}/public/pagesSearch"
                        )
                    else:
                        res["pagesQueryUrl"] = (
                            origin + f"/api/orgs/{oid}/crawls/{crawlid}/pagesSearch"
                        )

                # this will now disable the downloadUrl in RWP
                res["downloadUrl"] = None

        crawl = CrawlOutWithResources.from_dict(res)

        if not skip_resources:
            crawl = await self._resolve_crawl_refs(crawl, org, files)
            if crawl.config and crawl.config.seeds:
                crawl.config.seeds = None

        if not org:
            org = await self.orgs.get_org_by_id(crawl.oid)

        crawl.storageQuotaReached = self.orgs.storage_quota_reached(org)
        crawl.execMinutesQuotaReached = self.orgs.exec_mins_quota_reached(org)

        return crawl

    async def get_internal_crawl_out(self, crawl_id):
        """add internal prefix for relative paths"""
        crawl_out = await self.get_crawl_out(crawl_id)
        resources = crawl_out.resources or []
        for file_ in resources:
            file_.path = self.storage_ops.resolve_internal_access_path(file_.path)

        return crawl_out

    async def _update_crawl_collections(
        self, crawl_id: str, org: Organization, collection_ids: List[UUID]
    ):
        """Update crawl collections to match updated list."""
        crawl = await self.get_crawl_out(crawl_id, org, skip_resources=True)

        prior_coll_ids = set(crawl.collectionIds or [])
        updated_coll_ids = set(collection_ids)

        # Add new collections
        added = list(updated_coll_ids.difference(prior_coll_ids))
        for coll_id in added:
            await self.colls.add_crawls_to_collection(coll_id, [crawl_id], org)

        # Remove collections crawl no longer belongs to
        removed = list(prior_coll_ids.difference(updated_coll_ids))
        for coll_id in removed:
            await self.colls.remove_crawls_from_collection(coll_id, [crawl_id], org)

    async def update_crawl(
        self, crawl_id: str, org: Organization, update: UpdateCrawl, type_=None
    ):
        """Update existing crawl"""
        update_values = update.dict(exclude_unset=True)
        if len(update_values) == 0:
            raise HTTPException(status_code=400, detail="no_update_data")

        # Update collections then unset from update_values
        # We handle these separately due to updates required for collection changes
        collection_ids = update_values.get("collectionIds")
        if collection_ids is not None:
            await self._update_crawl_collections(crawl_id, org, collection_ids)
        update_values.pop("collectionIds", None)

        query = {"_id": crawl_id, "oid": org.id}
        if type_:
            query["type"] = type_

        # update in db
        result = await self.crawls.find_one_and_update(
            query, {"$set": update_values}, return_document=pymongo.ReturnDocument.AFTER
        )

        if not result:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        if update_values.get("reviewStatus"):
            crawl = BaseCrawl.from_dict(result)

            asyncio.create_task(
                self.event_webhook_ops.create_crawl_reviewed_notification(
                    crawl.id,
                    crawl.oid,
                    crawl.reviewStatus,
                    crawl.description,
                )
            )

        return {"updated": True}

    async def update_crawl_state(self, crawl_id: str, state: str):
        """called only when job container is being stopped/canceled"""

        data: dict[str, Any] = {"state": state}
        # if cancelation, set the finish time here
        if state == "canceled":
            data["finished"] = dt_now()

        await self.crawls.find_one_and_update(
            {
                "_id": crawl_id,
                "type": "crawl",
                "state": {"$in": RUNNING_AND_WAITING_STATES},
            },
            {"$set": data},
        )

    async def update_usernames(self, userid: UUID, updated_name: str) -> None:
        """Update username references matching userid"""
        await self.crawls.update_many(
            {"userid": userid}, {"$set": {"userName": updated_name}}
        )

    async def replicate_crawl_files(
        self, crawl_id: str, org: Organization, type_: TYPE_CRAWL_TYPES
    ):
        """Replicate crawl files to configured replica locations"""
        try:
            crawl = await self.get_base_crawl(crawl_id, org, type_)
        # pylint: disable=broad-exception-caught
        except Exception:
            print(
                f"Not replicating files for crawl {crawl_id}: crawl not found",
                flush=True,
            )
            return

        for crawl_file in crawl.files:
            try:
                await self.background_job_ops.create_replica_jobs(
                    crawl.oid, crawl_file, crawl.id, type_
                )
            # pylint: disable=broad-exception-caught
            except Exception as exc:
                print("Replicate Exception", exc, flush=True)

    async def add_crawl_file_replica(
        self, crawl_id: str, filename: str, ref: StorageRef
    ) -> dict[str, object]:
        """Add replica StorageRef to existing CrawlFile"""
        return await self.crawls.find_one_and_update(
            {"_id": crawl_id, "files.filename": filename},
            {
                "$addToSet": {
                    "files.$.replicas": {"name": ref.name, "custom": ref.custom}
                }
            },
        )

    async def shutdown_crawl(self, crawl_id: str, org: Organization, graceful: bool):
        """placeholder, implemented in crawls, base version does nothing"""

    async def delete_crawls(
        self,
        org: Organization,
        delete_list: DeleteCrawlList,
        type_: TYPE_CRAWL_TYPES,
        user: Optional[User] = None,
    ) -> tuple[int, dict[UUID, dict[str, int]], bool]:
        """Delete a list of crawls by id for given org"""
        cids_to_update: dict[UUID, dict[str, int]] = {}
        collection_ids_to_update = set()

        size = 0

        for crawl_id in delete_list.crawl_ids:
            crawl = await self.get_base_crawl(crawl_id, org)
            if crawl.type != type_:
                continue

            # Ensure user has appropriate permissions for all crawls in list:
            # - Crawler users can delete their own crawls
            # - Org owners can delete any crawls in org
            if user and (crawl.userid != user.id) and not org.is_owner(user):
                raise HTTPException(status_code=403, detail="not_allowed")

            if type_ == "crawl" and not crawl.finished:
                try:
                    await self.shutdown_crawl(crawl_id, org, graceful=False)
                except Exception as exc:
                    # pylint: disable=raise-missing-from
                    raise HTTPException(
                        status_code=400, detail=f"Error Stopping Crawl: {exc}"
                    )

            await self.page_ops.delete_crawl_pages(crawl_id, org.id)

            if crawl.collectionIds:
                for coll_id in crawl.collectionIds:
                    collection_ids_to_update.add(coll_id)

            if type_ == "crawl":
                await self.delete_all_crawl_qa_files(crawl_id, org)

            crawl_size = await self._delete_crawl_files(crawl, org)
            size += crawl_size

            cid = crawl.cid
            successful = crawl.state in SUCCESSFUL_STATES
            if cid:
                if cids_to_update.get(cid):
                    cids_to_update[cid]["inc"] += 1
                    cids_to_update[cid]["size"] += crawl_size
                    if successful:
                        cids_to_update[cid]["successful"] += 1
                else:
                    cids_to_update[cid] = {}
                    cids_to_update[cid]["inc"] = 1
                    cids_to_update[cid]["size"] = crawl_size
                    if successful:
                        cids_to_update[cid]["successful"] = 1
                    else:
                        cids_to_update[cid]["successful"] = 0

            if type_ == "crawl":
                asyncio.create_task(
                    self.event_webhook_ops.create_crawl_deleted_notification(
                        crawl_id, org
                    )
                )
            if type_ == "upload":
                asyncio.create_task(
                    self.event_webhook_ops.create_upload_deleted_notification(
                        crawl_id, org
                    )
                )

        query = {"_id": {"$in": delete_list.crawl_ids}, "oid": org.id, "type": type_}
        res = await self.crawls.delete_many(query)

        await self.orgs.inc_org_bytes_stored(org.id, -size, type_)

        await self.orgs.set_last_crawl_finished(org.id)

        if collection_ids_to_update:
            for coll_id in collection_ids_to_update:
                await self.colls.update_collection_counts_and_tags(coll_id)

        quota_reached = self.orgs.storage_quota_reached(org)

        return res.deleted_count, cids_to_update, quota_reached

    async def _delete_crawl_files(
        self, crawl: Union[BaseCrawl, QARun], org: Organization
    ):
        """Delete files associated with crawl from storage."""
        size = 0
        for file_ in crawl.files:
            size += file_.size
            if not await self.storage_ops.delete_file_object(org, file_):
                raise HTTPException(status_code=400, detail="file_deletion_error")
            # Not replicating QA run WACZs yet
            if not isinstance(crawl, QARun):
                await self.background_job_ops.create_delete_replica_jobs(
                    org, file_, crawl.id, crawl.type
                )

        return size

    async def delete_failed_crawl_files(self, crawl_id: str, oid: UUID):
        """Delete crawl files for failed crawl"""
        crawl = await self.get_base_crawl(crawl_id)
        org = await self.orgs.get_org_by_id(oid)
        deleted_file_size = await self._delete_crawl_files(crawl, org)
        await self.crawls.find_one_and_update(
            {"_id": crawl_id, "oid": oid},
            {
                "$set": {
                    "files": [],
                    "fileCount": 0,
                    "fileSize": 0,
                }
            },
        )
        await self.orgs.inc_org_bytes_stored(oid, -deleted_file_size, "crawl")

    async def delete_all_crawl_qa_files(self, crawl_id: str, org: Organization):
        """Delete files for all qa runs in a crawl"""
        crawl_raw = await self.get_crawl_raw(crawl_id)
        qa_finished = crawl_raw.get("qaFinished", {})
        for qa_run_raw in qa_finished.values():
            qa_run = QARun(**qa_run_raw)
            await self._delete_crawl_files(qa_run, org)

    async def _resolve_crawl_refs(
        self,
        crawl: Union[CrawlOut, CrawlOutWithResources],
        org: Optional[Organization],
        files: Optional[list[dict]],
        session: AsyncIOMotorClientSession | None = None,
    ):
        """Resolve running crawl data"""
        # pylint: disable=too-many-branches
        if not org:
            org = await self.orgs.get_org_by_id(crawl.oid, session=session)
            if not org:
                raise HTTPException(status_code=400, detail="missing_org")

        if hasattr(crawl, "profileid") and crawl.profileid:
            try:
                profile = await self.crawl_configs.profiles.get_profile(
                    crawl.profileid, org, session=session
                )
                crawl.profileName = profile.name
            # pylint: disable=bare-except
            except:
                crawl.profileName = ""

        if (
            files
            and crawl.state in SUCCESSFUL_AND_PAUSED_STATES
            and isinstance(crawl, CrawlOutWithResources)
        ):
            crawl.resources = await self._files_to_resources(
                files, org, crawl.id, session=session
            )

        return crawl

    async def resolve_signed_urls(
        self,
        files: List[CrawlFile],
        org: Organization,
        crawl_id: Optional[str] = None,
        force_update=False,
        session: AsyncIOMotorClientSession | None = None,
    ) -> List[CrawlFileOut]:
        """Regenerate presigned URLs for files as necessary"""
        if not files:
            return []

        out_files = []

        cursor = self.presigned_urls.find(
            {"_id": {"$in": [file.filename for file in files]}}, session=session
        )

        presigned = await cursor.to_list(10000)

        files_dict = [file.dict() for file in files]

        # need an async generator to call bulk_presigned_files
        async def async_gen():
            yield {"presigned": presigned, "files": files_dict, "_id": crawl_id}

        out_files, _ = await self.bulk_presigned_files(async_gen(), org, force_update)

        return out_files

    async def get_presigned_files(
        self, match: dict[str, Any], org: Organization
    ) -> tuple[list[CrawlFileOut], bool]:
        """return presigned crawl files queried as batch, merging presigns with files in one pass"""
        cursor = self.crawls.aggregate(
            [
                {"$match": match},
                {"$project": {"files": "$files", "version": 1}},
                {
                    "$lookup": {
                        "from": "presigned_urls",
                        "localField": "files.filename",
                        "foreignField": "_id",
                        "as": "presigned",
                    }
                },
            ]
        )

        return await self.bulk_presigned_files(cursor, org)

    async def bulk_presigned_files(
        self,
        cursor: AsyncIterable[dict[str, Any]],
        org: Organization,
        force_update=False,
    ) -> tuple[list[CrawlFileOut], bool]:
        """process presigned files in batches"""
        resources = []
        pages_optimized = False

        sign_files = []

        async for result in cursor:
            pages_optimized = result.get("version") == 2

            mapping = {}
            # create mapping of filename -> file data
            for file in result["files"]:
                file["crawl_id"] = result["_id"]
                mapping[file["filename"]] = file

            if not force_update:
                # add already presigned resources
                for presigned in result["presigned"]:
                    file = mapping.get(presigned["_id"])
                    if file:
                        file["signedAt"] = presigned["signedAt"]
                        file["path"] = presigned["url"]
                        resources.append(
                            CrawlFileOut(
                                name=os.path.basename(file["filename"]),
                                path=presigned["url"],
                                hash=file["hash"],
                                size=file["size"],
                                crawlId=file["crawl_id"],
                                numReplicas=len(file.get("replicas") or []),
                                expireAt=date_to_str(
                                    presigned["signedAt"]
                                    + self.storage_ops.signed_duration_delta
                                ),
                            )
                        )

                        del mapping[presigned["_id"]]

            sign_files.extend(list(mapping.values()))

        by_storage: dict[str, dict] = {}
        for file in sign_files:
            storage_ref = StorageRef(**file.get("storage"))
            sid = str(storage_ref)

            storage_group = by_storage.get(sid)
            if not storage_group:
                storage_group = {"ref": storage_ref, "names": [], "files": []}
                by_storage[sid] = storage_group

            storage_group["names"].append(file["filename"])
            storage_group["files"].append(file)

        for storage_group in by_storage.values():
            s3storage = self.storage_ops.get_org_storage_by_ref(
                org, storage_group["ref"]
            )

            signed_urls, expire_at = await self.storage_ops.get_presigned_urls_bulk(
                org, s3storage, storage_group["names"]
            )

            for url, file in zip(signed_urls, storage_group["files"]):
                resources.append(
                    CrawlFileOut(
                        name=os.path.basename(file["filename"]),
                        path=url,
                        hash=file["hash"],
                        size=file["size"],
                        crawlId=file["crawl_id"],
                        numReplicas=len(file.get("replicas") or []),
                        expireAt=date_to_str(expire_at),
                    )
                )

        return resources, pages_optimized

    async def validate_all_crawls_successful(
        self, crawl_ids: List[str], org: Organization
    ):
        """Validate that crawls in list exist and have a succesful state, or throw"""
        # convert to set to remove any duplicates
        crawl_id_set = set(crawl_ids)

        count = await self.crawls.count_documents(
            {
                "_id": {"$in": list(crawl_id_set)},
                "oid": org.id,
                "state": {"$in": SUCCESSFUL_STATES},
            }
        )
        if count != len(crawl_id_set):
            raise HTTPException(
                status_code=400, detail="invalid_failed_or_unfinished_crawl"
            )

    async def add_to_collection(
        self, crawl_ids: List[str], collection_id: UUID, org: Organization
    ):
        """Add crawls to collection."""
        await self.crawls.update_many(
            {"_id": {"$in": crawl_ids}, "oid": org.id},
            {"$addToSet": {"collectionIds": collection_id}},
        )

    async def remove_from_collection(self, crawl_ids: List[str], collection_id: UUID):
        """Remove crawls from collection."""
        await self.crawls.update_many(
            {"_id": {"$in": crawl_ids}},
            {"$pull": {"collectionIds": collection_id}},
        )

    async def remove_collection_from_all_crawls(
        self, collection_id: UUID, org: Organization
    ):
        """Remove collection id from all crawls it's currently in."""
        await asyncio.gather(
            self.crawls.update_many(
                {"oid": org.id, "collectionIds": collection_id},
                {"$pull": {"collectionIds": collection_id}},
            ),
            self.crawl_configs.remove_collection_from_all_configs(collection_id, org),
        )

    # pylint: disable=too-many-branches, invalid-name, too-many-statements
    async def list_all_base_crawls(
        self,
        org: Optional[Organization] = None,
        userid: Optional[UUID] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: list[str] | None = None,
        tag_match: ListFilterType | None = None,
        collection_id: Optional[UUID] = None,
        states: Optional[List[str]] = None,
        first_seed: Optional[str] = None,
        type_: Optional[TYPE_CRAWL_TYPES] = None,
        cid: Optional[UUID] = None,
        cls_type: Type[Union[CrawlOut, CrawlOutWithResources]] = CrawlOut,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: Optional[str] = None,
        sort_direction: int = -1,
        review_status_range: tuple[int, int] | None = None,
    ):
        """List crawls of all types from the db"""
        # Zero-index page for query
        page = page - 1
        skip = page * page_size

        oid = org.id if org else None

        resources = False
        if cls_type == CrawlOutWithResources:
            resources = True

        query: dict[str, object] = {}
        if type_:
            query["type"] = type_
        if oid:
            query["oid"] = oid

        if userid:
            query["userid"] = userid

        if states:
            # validated_states = [value for value in state if value in ALL_CRAWL_STATES]
            query["state"] = {"$in": states}

        if cid:
            query["cid"] = cid

        if tags:
            query_type = "$all" if tag_match == ListFilterType.AND else "$in"
            query["tags"] = {query_type: tags}

        if review_status_range:
            query["reviewStatus"] = {
                "$gte": review_status_range[0],
                "$lte": review_status_range[1],
            }

        aggregate = [
            {"$match": query},
            {"$unset": ["errors", "behaviorLogs", "config"]},
            {"$set": {"activeQAStats": "$qa.stats"}},
            {
                "$set": {
                    "qaFinishedArray": {
                        "$map": {
                            "input": {"$objectToArray": "$qaFinished"},
                            "in": "$$this.v",
                        }
                    }
                }
            },
            # Add active QA run to array if exists prior to sorting, taking care not to
            # pass null to $concatArrays so that our result isn't null
            {
                "$set": {
                    "qaActiveArray": {"$cond": [{"$ne": ["$qa", None]}, ["$qa"], []]}
                }
            },
            {
                "$set": {
                    "qaArray": {"$concatArrays": ["$qaFinishedArray", "$qaActiveArray"]}
                }
            },
            {
                "$set": {
                    "sortedQARuns": {
                        "$sortArray": {
                            "input": "$qaArray",
                            "sortBy": {"started": -1},
                        }
                    }
                }
            },
            {"$set": {"lastQARun": {"$arrayElemAt": ["$sortedQARuns", 0]}}},
            {"$set": {"lastQAState": "$lastQARun.state"}},
            {"$set": {"lastQAStarted": "$lastQARun.started"}},
            {
                "$set": {
                    "qaRunCount": {
                        "$size": {
                            "$cond": [
                                {"$isArray": "$qaArray"},
                                "$qaArray",
                                [],
                            ]
                        }
                    }
                }
            },
            {
                "$unset": [
                    "lastQARun",
                    "qaActiveArray",
                    "qaFinishedArray",
                    "qaArray",
                    "sortedQARuns",
                ]
            },
        ]

        if not resources:
            aggregate.extend([{"$unset": ["files"]}])

        if name:
            aggregate.extend([{"$match": {"name": name}}])

        if first_seed:
            aggregate.extend([{"$match": {"firstSeed": first_seed}}])

        if description:
            aggregate.extend([{"$match": {"description": description}}])

        if collection_id:
            aggregate.extend([{"$match": {"collectionIds": {"$in": [collection_id]}}}])

        if sort_by:
            if sort_by not in (
                "started",
                "finished",
                "fileSize",
                "reviewStatus",
                "lastQAStarted",
                "lastQAState",
                "qaRunCount",
            ):
                raise HTTPException(status_code=400, detail="invalid_sort_by")
            if sort_direction not in (1, -1):
                raise HTTPException(status_code=400, detail="invalid_sort_direction")

            sort_query = {sort_by: sort_direction}

            # Ensure crawls are always sorted first for QA-related sorts
            if sort_by in ("lastQAStarted", "lastQAState"):
                sort_query["type"] = 1

            aggregate.extend([{"$sort": sort_query}])

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
        cursor = self.crawls.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        crawls = []
        for res in items:
            crawl = cls_type.from_dict(res)

            if resources or crawl.type == "crawl":
                # pass files only if we want to include resolved resources
                files = res.get("files") if resources else None
                crawl = await self._resolve_crawl_refs(crawl, org, files=files)

            crawls.append(crawl)

        return crawls, total

    async def delete_crawls_all_types(
        self,
        delete_list: DeleteCrawlList,
        org: Organization,
        user: Optional[User] = None,
    ) -> dict[str, bool]:
        """Delete uploaded crawls"""
        crawls: list[str] = []
        uploads: list[str] = []

        for crawl_id in delete_list.crawl_ids:
            crawl = await self.get_base_crawl(crawl_id, org)
            if crawl.type == "crawl":
                crawls.append(crawl_id)
            if crawl.type == "upload":
                uploads.append(crawl_id)

        crawls_length = len(crawls)
        uploads_length = len(uploads)

        if crawls_length + uploads_length == 0:
            raise HTTPException(status_code=400, detail="nothing_to_delete")

        deleted_count = 0
        # Value is set in delete calls, but initialize to keep linter happy.
        quota_reached = False

        if crawls_length:
            crawl_delete_list = DeleteCrawlList(crawl_ids=crawls)
            deleted, cids_to_update, quota_reached = await self.delete_crawls(
                org, crawl_delete_list, "crawl", user
            )
            deleted_count += deleted

            for cid, cid_dict in cids_to_update.items():
                cid_size = cid_dict["size"]
                cid_inc = cid_dict["inc"]
                cid_successful = cid_dict["successful"]
                await self.crawl_configs.stats_recompute_last(
                    cid, -cid_size, -cid_inc, -cid_successful
                )

        if uploads_length:
            upload_delete_list = DeleteCrawlList(crawl_ids=uploads)
            deleted, _, quota_reached = await self.delete_crawls(
                org, upload_delete_list, "upload", user
            )
            deleted_count += deleted

        if deleted_count < 1:
            raise HTTPException(status_code=404, detail="crawl_not_found")

        return {"deleted": True, "storageQuotaReached": quota_reached}

    async def get_all_crawl_search_values(
        self, org: Organization, type_: Optional[TYPE_CRAWL_TYPES] = None
    ):
        """List unique names, first seeds, and descriptions from all captures in org"""
        match_query: dict[str, object] = {"oid": org.id}
        if type_:
            match_query["type"] = type_

        names = await self.crawls.distinct("name", match_query)
        descriptions = await self.crawls.distinct("description", match_query)
        cids = (
            await self.crawls.distinct("cid", match_query)
            if not type_ or type_ == "crawl"
            else []
        )

        # Remove empty strings
        names = [name for name in names if name]
        descriptions = [description for description in descriptions if description]

        first_seeds = set()
        for cid in cids:
            if not cid:
                continue
            try:
                config = await self.crawl_configs.get_crawl_config(cid, org.id)
                first_seed = config.config.seeds[0]
                first_seeds.add(first_seed.url)
            # pylint: disable=bare-except
            except:
                pass

        return {
            "names": names,
            "descriptions": descriptions,
            "firstSeeds": list(first_seeds),
        }

    async def download_crawl_as_single_wacz(
        self, crawl_id: str, org: Organization, prefer_single_wacz: bool = False
    ):
        """Download archived item as a single WACZ file

        If prefer_single_wacz is false, always returns a multi-WACZ
        If prefer_single_wacz is true and archived item has only one WACZ,
        returns that instead
        """
        crawl = await self.get_crawl_out(crawl_id, org)

        if not crawl.resources:
            raise HTTPException(status_code=400, detail="no_crawl_resources")

        metadata = {"type": crawl.type, "id": crawl_id, "organization": org.slug}
        if crawl.name:
            metadata["title"] = crawl.name

        if crawl.description:
            metadata["description"] = crawl.description

        resp = await self.storage_ops.download_streaming_wacz(
            metadata, crawl.resources, prefer_single_wacz=prefer_single_wacz
        )

        filename = f"{crawl_id}.wacz"
        if len(crawl.resources) == 1 and prefer_single_wacz:
            filename = crawl.resources[0].name

        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return StreamingResponse(
            resp, headers=headers, media_type="application/wacz+zip"
        )

    async def calculate_org_crawl_file_storage(
        self, oid: UUID, type_: Optional[TYPE_CRAWL_TYPES] = None
    ) -> Tuple[int, int, int]:
        """Calculate and return total size of crawl files in org.

        Returns tuple of (total, crawls only, uploads only)
        """
        total_size = 0
        crawls_size = 0
        uploads_size = 0

        cursor = self.crawls.find({"oid": oid})
        async for crawl_dict in cursor:
            files = crawl_dict.get("files", [])
            type_ = crawl_dict.get("type")

            item_size = 0
            for file_ in files:
                item_size += file_.get("size", 0)

            total_size += item_size
            if type_ == "crawl":
                crawls_size += item_size
            if type_ == "upload":
                uploads_size += item_size

        return total_size, crawls_size, uploads_size

    async def get_org_last_crawl_finished(self, oid: UUID) -> Optional[datetime]:
        """Get last crawl finished time for org"""
        last_crawl_finished: Optional[datetime] = None

        cursor = (
            self.crawls.find({"oid": oid, "finished": {"$ne": None}})
            .sort({"finished": -1})
            .limit(1)
        )
        last_crawl = await cursor.to_list(length=1)
        if last_crawl:
            last_crawl_finished = last_crawl[0].get("finished")

        return last_crawl_finished

    async def get_all_crawls_tag_counts(
        self,
        org: Organization,
        only_successful: bool = True,
        type_: Optional[TYPE_CRAWL_TYPES] = None,
    ):
        """get distinct tags from archived items for this org"""
        match_query: Dict[str, Any] = {"oid": org.id}
        if only_successful:
            match_query["state"] = {"$in": SUCCESSFUL_STATES}
        if type_ in CRAWL_TYPES:
            match_query["type"] = type_

        tags = await self.crawls.aggregate(
            [
                {"$match": match_query},
                {"$unwind": "$tags"},
                {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
                {"$project": {"tag": "$_id", "count": "$count", "_id": 0}},
                {"$sort": {"count": -1, "tag": 1}},
            ]
        ).to_list()
        return tags


# ============================================================================
def init_base_crawls_api(app, user_dep, *args):
    """base crawls api"""
    # pylint: disable=invalid-name, duplicate-code, too-many-arguments, too-many-locals

    ops = BaseCrawlOps(*args)

    org_viewer_dep = ops.orgs.org_viewer_dep
    org_crawl_dep = ops.orgs.org_crawl_dep

    @app.get(
        "/orgs/{oid}/all-crawls",
        tags=["all-crawls"],
        response_model=PaginatedCrawlOutResponse,
    )
    async def list_all_base_crawls(
        org: Organization = Depends(org_viewer_dep),
        pageSize: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        userid: Optional[UUID] = None,
        name: Optional[str] = None,
        state: Annotated[list[str] | None, Query()] = None,
        firstSeed: Optional[str] = None,
        description: Optional[str] = None,
        tags: Annotated[list[str] | None, Query()] = None,
        tag_match: Annotated[
            ListFilterType | None,
            Query(
                alias="tagMatch",
                title="Tag Match Type",
                description='Defaults to `"and"` if omitted',
            ),
        ] = ListFilterType.AND,
        collectionId: Optional[UUID] = None,
        crawlType: Optional[TYPE_CRAWL_TYPES] = None,
        cid: Optional[UUID] = None,
        reviewStatus: Annotated[list[int] | None, Query()] = None,
        sortBy: Optional[str] = "finished",
        sortDirection: int = -1,
    ):
        # Support both comma-separated values and multiple search parameters
        # e.g. `?state=running,paused` and `?state=running&state=paused`
        if state and len(state) == 1:
            states: list[str] | None = state[0].split(",")
        else:
            states = state if state else None

        if firstSeed:
            firstSeed = urllib.parse.unquote(firstSeed)

        if name:
            name = urllib.parse.unquote(name)

        if description:
            description = urllib.parse.unquote(description)

        review_status_range: tuple[int, int] | None = None

        if reviewStatus:
            if len(reviewStatus) > 2 or any(qa < 1 or qa > 5 for qa in reviewStatus):
                raise HTTPException(status_code=400, detail="invalid_qa_review_range")
            review_status_range = (
                reviewStatus[0],
                reviewStatus[1] if len(reviewStatus) > 1 else reviewStatus[0],
            )

        crawls, total = await ops.list_all_base_crawls(
            org,
            userid=userid,
            name=name,
            description=description,
            tags=tags,
            tag_match=tag_match,
            collection_id=collectionId,
            states=states,
            first_seed=firstSeed,
            type_=crawlType,
            cid=cid,
            page_size=pageSize,
            page=page,
            sort_by=sortBy,
            sort_direction=sortDirection,
            review_status_range=review_status_range,
        )
        return paginated_format(crawls, total, page, pageSize)

    @app.get(
        "/orgs/{oid}/all-crawls/search-values",
        tags=["all-crawls"],
        response_model=CrawlSearchValuesResponse,
    )
    async def get_all_crawls_search_values(
        org: Organization = Depends(org_viewer_dep),
        crawlType: Optional[TYPE_CRAWL_TYPES] = None,
    ):
        return await ops.get_all_crawl_search_values(org, type_=crawlType)

    @app.get(
        "/orgs/{oid}/all-crawls/tagCounts",
        tags=["all-crawls"],
        response_model=TagsResponse,
    )
    async def get_all_crawls_tag_counts(
        org: Organization = Depends(org_viewer_dep),
        onlySuccessful: bool = True,
        crawlType: Optional[TYPE_CRAWL_TYPES] = None,
    ):
        tags = await ops.get_all_crawls_tag_counts(
            org, only_successful=onlySuccessful, type_=crawlType
        )
        return {"tags": tags}

    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}",
        tags=["all-crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_base_crawl(
        crawl_id: str, request: Request, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.get_crawl_out(crawl_id, org, headers=dict(request.headers))

    @app.get(
        "/orgs/all/all-crawls/{crawl_id}/replay.json",
        tags=["all-crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_base_crawl_admin(
        crawl_id, request: Request, user: User = Depends(user_dep)
    ):
        if not user.is_superuser:
            raise HTTPException(status_code=403, detail="Not Allowed")

        return await ops.get_crawl_out(crawl_id, None, headers=dict(request.headers))

    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}/replay.json",
        tags=["all-crawls"],
        response_model=CrawlOutWithResources,
    )
    async def get_crawl_out(
        crawl_id, request: Request, org: Organization = Depends(org_viewer_dep)
    ):
        return await ops.get_crawl_out(crawl_id, org, headers=dict(request.headers))

    @app.get(
        "/orgs/{oid}/all-crawls/{crawl_id}/download",
        tags=["all-crawls"],
        response_model=bytes,
    )
    async def download_base_crawl_as_single_wacz(
        crawl_id: str,
        preferSingleWACZ: bool = False,
        org: Organization = Depends(org_viewer_dep),
    ):
        return await ops.download_crawl_as_single_wacz(
            crawl_id, org, prefer_single_wacz=preferSingleWACZ
        )

    @app.patch(
        "/orgs/{oid}/all-crawls/{crawl_id}",
        tags=["all-crawls"],
        response_model=UpdatedResponse,
    )
    async def update_crawl(
        update: UpdateCrawl, crawl_id: str, org: Organization = Depends(org_crawl_dep)
    ):
        return await ops.update_crawl(crawl_id, org, update)

    @app.post(
        "/orgs/{oid}/all-crawls/delete",
        tags=["all-crawls"],
        response_model=DeletedResponseQuota,
    )
    async def delete_crawls_all_types(
        delete_list: DeleteCrawlList,
        user: User = Depends(user_dep),
        org: Organization = Depends(org_crawl_dep),
    ):
        return await ops.delete_crawls_all_types(delete_list, org, user)

    return ops
