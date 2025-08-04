"""crawl logs"""

from typing import TYPE_CHECKING, Union, Any, Optional, Dict, Tuple, List

import json
from uuid import UUID, uuid4

from fastapi import HTTPException
import pymongo

from .models import CrawlLogLine, Organization
from .pagination import DEFAULT_PAGE_SIZE

if TYPE_CHECKING:
    from .orgs import OrgOps
else:
    OrgOps = object


# ============================================================================
class CrawlLogOps:
    """crawl log management"""

    org_ops: OrgOps

    # pylint: disable=too-many-locals, too-many-arguments, invalid-name

    def __init__(self, mdb, org_ops):
        self.logs = mdb["crawl_logs"]
        self.org_ops = org_ops

    async def init_index(self):
        """init index for crawl logs"""
        # TODO: Add indices
        await self.logs.create_index([("oid", pymongo.HASHED)])

    async def add_log_line(
        self,
        crawl_id: str,
        oid: UUID,
        is_qa: bool,
        log_line: str,
        qa_run_id: Optional[str] = None,
    ) -> bool:
        """add crawl log line to database"""
        try:
            log_dict = json.loads(log_line)

            # Ensure details are a dictionary
            # If they are a list, convert to a dict
            details = None
            log_dict_details = log_dict.get("details")
            if log_dict_details:
                if isinstance(log_dict_details, Dict):
                    details = log_dict_details
                else:
                    details = {"items": log_dict_details}

            log_to_add = CrawlLogLine(
                id=uuid4(),
                crawl_id=crawl_id,
                oid=oid,
                isQA=is_qa,
                qaRunId=qa_run_id,
                timestamp=log_dict["timestamp"],
                logLevel=log_dict["logLevel"],
                context=log_dict["context"],
                message=log_dict["message"],
                details=details,
            )
            res = await self.logs.insert_one(log_to_add.to_dict())
            return res is not None
        # pylint: disable=broad-exception-caught
        except Exception as err:
            print(
                f"Error adding log line for crawl {crawl_id} to database: {err}",
                flush=True,
            )
            return False

    async def get_crawl_logs(
        self,
        org: Organization,
        crawl_id: str,
        page_size: int = DEFAULT_PAGE_SIZE,
        page: int = 1,
        sort_by: str = "timestamp",
        sort_direction: int = -1,
        contexts: List[str] = None,
        log_levels: List[str] = None,
    ) -> Tuple[list[CrawlLogLine], int]:
        """list all logs for particular crawl"""
        # pylint: disable=too-many-locals, duplicate-code

        # Zero-index page for query
        page = page - 1
        skip = page_size * page

        match_query: Dict[str, Union[str, List[str]]] = {
            "oid": org.id,
            "crawl_id": crawl_id,
        }

        if contexts:
            match_query["context"] = {"$in": contexts}

        if log_levels:
            match_query["logLevel"] = {"$in": log_levels}

        aggregate: List[Dict[str, Any]] = [{"$match": match_query}]

        if sort_by:
            if sort_by not in (
                "timestamp",
                "logLevel",
                "context",
            ):
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

        cursor = self.logs.aggregate(aggregate)
        results = await cursor.to_list(length=1)
        result = results[0]
        items = result["items"]

        try:
            total = int(result["total"][0]["count"])
        except (IndexError, ValueError):
            total = 0

        log_lines = [CrawlLogLine.from_dict(res) for res in items]

        return log_lines, total
