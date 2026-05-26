# Intro to Crawl Workflows

Crawl workflows are the bread and butter of automated browser-based crawling. A crawl workflow enables you to specify how and what the crawler should capture on a website.

A finished crawl results in an [archived item](./archived-items.md) that can be downloaded and shared. To easily identify and find archived items within your org, you can automatically name and tag archived items through custom workflow metadata.

You can create, view, search for, and run crawl workflows from the **Crawling** page.

## Create a Crawl Workflow

Create new crawl workflows from the **Crawling** page, or the  _Create New ..._ shortcut from **Dashboard**.

### Choose what to crawl

The first step in creating a new crawl workflow is to choose what you'd like to crawl by defining a **Crawl Scope**. Crawl scopes are categorized as a **Page Crawl** or **Site Crawl**.

#### Page Crawl

Choose one of these crawl scopes if you know the URL of every page you'd like to crawl and don't need to include any additional pages beyond one hop out.

A Page Crawl workflow is simpler to configure, since you don't need to worry about configuring the workflow to exclude parts of the website that you may not want to archive.

#### Site Crawl

Choose one of these crawl scopes to have the the crawler automatically find pages based on a domain name, start page URL, or directory on a website.

Site Crawl workflows are great for advanced use cases where you don't need (or want) to know every single URL of the website that you're archiving.

After deciding what type of crawl you'd like to run, you can begin to set up your workflow. A detailed breakdown of available settings can be found in the [workflow settings guide](workflow-setup.md).

## Run Crawl

Run a crawl workflow by clicking _Run Crawl_ in the actions menu of the workflow in the crawl workflow list, or by clicking the _Run Crawl_ button on the workflow's details page.

While crawling, the **Latest Crawl** section streams the current state of the browser windows as they visit pages. You can [modify the crawl live](./running-crawl.md) by adding URL exclusions or changing the number of crawling instances.

Re-running a crawl workflow can be useful to capture a website as it changes over time, or to run with an updated [crawl scope](workflow-setup.md#crawl-scope-options).

## Workflow Status

The status of the crawl workflow is updated as the workflow runs, or as a result of user intervention, or automatically when certain org-wide limits are reached.

Statuses may be displayed with a reason that details how the current status came to be.

| Status | Description |
| ---- | ---- |
| <span class="status-violet-600">:bootstrap-hourglass-split: Waiting for Resources</span> | The workflow is queued to run and is waiting for the computational resources needed to start the crawl. |
| <span class="status-violet-600">:bootstrap-hourglass-split: Waiting: _Reason_</span> | The workflow run is queued for one of the following reasons:<br/>**At Crawl Limit**: Org has reached maximum number of concurrent crawls<br/>**Dedupe Index**: An update to the deduplication index is in progress |
| <span class="status-violet-600">:btrix-status-dot: Starting</span> | The crawler is being initialized. Crawling will begin shortly. |
| <span class="status-green-600">:btrix-status-dot: Running</span> | The crawler is visiting and archiving pages. |
| <span class="status-violet-600">:bootstrap-pause-circle: Pausing</span> | The crawler has been instructed to pause and is finishing crawl of the current page. |
| <span class="status-violet-600">:bootstrap-pause-circle: Pausing (Finishing Downloads)</span> | The crawler is finalizing downloads on the current page. |
| <span class="status-violet-600">:bootstrap-pause-circle: Pausing (Creating WACZ)</span> | Pages crawled so far are being packaged into WACZ files and transferred to storage. |
| <span class="status-neutral-500">:bootstrap-pause-circle: Paused</span> | The workflow run has been paused by a user. It can be resumed for up to 7 days; afterwards, the run stops. |
| <span class="status-neutral-500">:bootstrap-pause-circle: Paused: _Reason_</span> | The workflow run has been paused automatically due to an enforced limit, as specified in the reason. |
| <span class="status-violet-600">:bootstrap-play-circle: Resuming</span> | The workflow run is starting back up after being paused. |
| <span class="status-violet-600">:btrix-status-dot: Stopping</span> | The crawler has been instructed to stop and is finishing crawl of the current page.|
| <span class="status-violet-600">:btrix-status-dot: Finishing Downloads</span> | The crawler is waiting for the current page to finish downloading to finalize the crawl.|
| <span class="status-violet-600">:btrix-status-dot: Generating WACZ</span> | Crawled pages are being packaged into WACZ files.|
| <span class="status-violet-600">:btrix-status-dot: Uploading WACZ</span> | WACZ files have been created and are being transferred to storage.|
| <span class="status-green-600">:bootstrap-check-circle-fill: Complete</span> | All pages within the workflow's scope and limits have been crawled and saved as WACZ, resulting in an [archived item](archived-items.md). |
| <span class="status-amber-600">:bootstrap-dash-square-fill: Stopped</span> | The workflow run was stopped by a user and allowed to finish gracefully, resulting in an archived item. |
| <span class="status-amber-600">:bootstrap-dash-square-fill: Stopped: Paused Too Long</span> | The workflow run was stopped automatically because it was not resumed within the given time limit. |
| <span class="status-amber-600">:bootstrap-dash-square-fill: Stopped: _Reason_</span> | The workflow run was stopped automatically due to an enforced limit, as specified in the reason. |
| <span class="status-neutral-600">:bootstrap-x-octagon: Canceled</span> | The workflow run was canceled by a user; crawled content is discarded. |
| <span class="status-red-600">:bootstrap-exclamation-triangle-fill: Skipped: _Reason_</span> | The workflow run was skipped due to an enforced limit, as specified in the reason. |
| <span class="status-red-600">:bootstrap-x-octagon-fill: Failed</span> | A serious error occurred while crawling causing the crawler to exit; no crawled content is saved. |
| <span class="status-red-600">:bootstrap-x-octagon-fill: Failed: Not Logged In</span> | The crawler detected a logged out page and failed the crawl per [Fail Crawl if Not Logged In](workflow-setup.md#fail-crawl-if-not-logged-in) setting. |

### Enforced Limit Reasons

Workflow runs may be automatically paused, stopped, or skipped due to an enforced quota or limit. The status will always be displayed with a reason:

| Reason | Description |
| ---- | ---- |
| **Storage Quota Reached** | Disk space allocated for the org is full. |
| **Time Quota Reached** | All execution time allocated for the org has been spent. |
| **Crawling Disabled** | Crawling has been disabled for the entire org. |
