# Overview of archived items

Archived Items consist of one or more WACZ files created by a crawl workflow, or uploaded to Browsertrix. They can be individually replayed, or combined with other archived items in a [collection](collections.md). The Archived Items page lists all items in the organization.

## Uploading Web Archives

WACZ files can be given metadata and uploaded to Browsertrix by pressing the _Upload WACZ_ button on the archived items list page. Only one WACZ file can be uploaded at a time.

## Status

The status of an archived item depends on its type. Uploads will always have the status <span class="status-success">:bootstrap-upload: Uploaded</span>, crawls have four possible states:

| Status | Description |
| ---- | ---- |
| <span class="status-success">:bootstrap-check-circle-fill: Complete</span>     | The crawl completed according to the workflow's settings. Workflows with [limits](workflow-setup.md#limits) set may stop running before they capture every queued page, but the resulting archived item will still be marked as "Complete". |
| <span class="status-neutral">:bootstrap-dash-square-fill: Stopped</span>       | The crawl workflow was _stopped_ gracefully by a user and data is saved. |
| <span class="status-neutral">:bootstrap-exclamation-square-fill: Stopped: Reason</span> | A workflow limit (listed as the reason) was reached and data is saved. |
| <span class="status-warning">:bootstrap-x-octagon-fill: Canceled</span>        | The crawl workflow was _canceled_ by a user, no data is saved. |
| <span class="status-danger">:bootstrap-exclamation-triangle-fill: Failed</span> | A serious error occurred while crawling, no data is saved.|

Because <span class="status-warning">:bootstrap-x-octagon-fill: Canceled</span> and <span class="status-danger">:bootstrap-exclamation-triangle-fill: Failed</span> crawls do not contain data, they are omitted from the archived items list page and cannot be added to a collection.

## Archived Item Details

The archived item details page is composed of the following sections, though some are only available for crawls and not uploads.

### Overview

The Overview tab displays the item's metadata and statistics associated with its creation process.

Metadata can be edited by pressing the pencil icon at the top right of the metadata section to edit the item's description, tags, and collections it is associated with.

### Quality Assurance

The Quality Assurance tab displays crawl quality information collected from analysis runs and user assessment of pages. This is where you can start new analysis runs, view quality metrics from older runs, and delete previous analysis runs. This tab is not available for uploaded archived items and not accessible for users with [viewer permissions](org-settings.md#permission-levels).

The pages list provides a record of all pages within the archived item, as well as any ratings or notes given to the page during review. If analysis has been run, clicking on a page in the pages list will go to that page in the review interface.

#### Crawl Analysis

Running crawl analysis will re-visit all pages within the archived item, comparing the data collected during analysis with the data collected during crawling. Crawl analysis runs with the same workflow limit settings used during crawling.

Crawl analysis can be run multiple times, though results should only differ if the crawler version has been updated between runs. The analysis process is being constantly improved and future analysis runs should produce better results. Analysis run data can be downloaded or deleted from the _Analysis Runs_ tab. While they are stored as WACZ files, analysis run WACZs only contain analysis data and may not open correctly or be useful in other programs that replay archived content.

Once a crawl has been analyzed — either fully, or partially — it can be reviewed by pressing the _Review Crawl_ button. For more on reviewing crawls and how to interpret analysis data, see: [Crawl Review](review.md).

`Paid Feature`{ .badge-green }

Like running a crawl workflow, running crawl analysis also uses execution time. Crawls and crawl analysis share the same concurrent crawling limit, but crawl analysis runs will be paused in favor of new crawls if the concurrent crawling limit is reached.

### Replay

The Replay tab displays the web content contained within the archived item.

For more details on navigating web archives within ReplayWeb.page, see the [ReplayWeb.page user documentation.](https://replayweb.page/docs/user-guide/exploring/)

### Exporting Files

While crawling, Browsertrix will output one or more WACZ files — the crawler aims to output files in consistently sized chunks, and each [crawler instance](workflow-setup.md#crawler-instances) will output separate WACZ files.

The Files tab lists the individually downloadable WACZ files that make up the archived item as well as their file sizes and backup status. To combine one or more archived items and download them all as a single WACZ file, add them to a collection and [download the collection](collections.md#downloading-collections).

### Error Logs

The Error Logs tab displays a list of errors encountered during crawling. Clicking an errors in the list will reveal additional information.

All log entries with that were recorded in the creation of the Archived Item can be downloaded in JSONL format by pressing the _Download Logs_ button.

### Crawl Settings

The Crawl Settings tab displays the crawl workflow configuration options that were used to generate the resulting archived item. Many of these settings also apply when running crawl analysis.
