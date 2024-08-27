# Modifying running crawls

## In Progress Status

A crawl workflow that is in progress can be in one of five possible states:

| Status | Description |
| ---- | ---- |
| <span class="status-waiting">:bootstrap-hourglass-split: Waiting</span>     | The workflow can't start running yet but it is queued to run when resources are available. |
| <span class="status-waiting">:btrix-status-dot: Starting</span>       | New resources are starting up. Crawling should begin shortly.|
| <span class="status-success">:btrix-status-dot: Running</span>        | The crawler is finding and capturing pages! |
| <span class="status-waiting">:btrix-status-dot: Stopping</span> | A user has instructed this workflow to stop. Finishing capture of the current pages.|
| <span class="status-waiting">:btrix-status-dot: Finishing Crawl</span> | The workflow has finished crawling and data is being packaged into WACZ files.|
| <span class="status-waiting">:btrix-status-dot: Uploading WACZ</span> | WACZ files have been created and are being transferred to storage.|

## Live Exclusion Editing

While [exclusions](workflow-setup.md#exclusions) can be set before running a crawl workflow, sometimes while crawling the crawler may find new parts of the site that weren't previously known about and shouldn't be crawled, or get stuck browsing parts of a website that automatically generate URLs known as ["crawler traps"](https://en.wikipedia.org/wiki/Spider_trap).

If the crawl queue is filled with URLs that should not be crawled, use the _Edit Exclusions_ button on the Watch Crawl page to instruct the crawler what pages should be excluded from the queue.

Exclusions added while crawling are applied to the same exclusion table saved in the workflow's settings and will be used the next time the crawl workflow is run unless they are manually removed.

## Changing the Number of Crawler Instances

Like exclusions, the [crawler instance](workflow-setup.md#crawler-instances) scale can also be adjusted while crawling. On the Watch Crawl page, press the _Edit Crawler Instances_ button, and set the desired value.

Unlike exclusions, this change will not be applied to future workflow runs.

## End a Crawl

If a crawl workflow is not crawling websites as intended it may be preferable to end crawling operations and update the crawl workflow's settings before trying again. There are two operations to end crawls, available both on the workflow's details page, or as part of the actions menu in the workflow list.

### Stopping

Stopping a crawl will throw away the crawl queue but otherwise gracefully end the process and save anything that has been collected. Stopped crawls show up in **Archived Items** and can be used like any other item in the app.

### Canceling

Canceling a crawl will throw away all data collected and immediately end the process. Canceled crawls do not show up in **Archived Items**, though a record of the runtime and workflow settings can be found in the crawl workflow's list of crawls.
