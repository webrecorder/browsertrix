# Running Crawls

Running crawls can be modified from the crawl workflow **Latest Crawl** tab. You may want to modify a running crawl if you find that the workflow is crawling pages that you didn't intend to archive, or if you want a boost of speed.

## Crawl Workflow Status

When a workflow run is initiated, the workflow status changes to <span class="status-violet-600">:bootstrap-hourglass-split: Waiting</span> or <span class="status-violet-600">:btrix-status-dot: Starting</span>, depending on whether the conditions for starting a crawl are in place (such as resource capacity.) The workflow status will change to <span class="status-green-600">:btrix-status-dot: Running</span> once the crawler loads the first crawl URL.

## Watch Crawl

You can watch the current state of the browser windows as the crawler visits pages in the **Watch** tab of **Latest Crawl**. A list of queued URLs are displayed below in the **Upcoming Pages** section.

## Live Exclusion Editing

While [exclusions](workflow-setup.md#exclude-pages) can be set before running a crawl workflow, sometimes while crawling the crawler may find new parts of the site that weren't previously known about and shouldn't be crawled, or get stuck browsing parts of a website that automatically generate URLs known as ["crawler traps"](https://en.wikipedia.org/wiki/Spider_trap).

If the crawl queue is filled with URLs that should not be crawled, use the _Edit Exclusions_ button in the **Watch** tab to instruct the crawler what pages should be excluded from the queue.

Exclusions added while crawling are applied to the same exclusion table saved in the workflow's settings and will be used the next time the crawl workflow is run unless they are manually removed.

## Changing the Number of Browser Windows

Like exclusions, the number of [browser windows](workflow-setup.md#browser-windows) can also be adjusted while crawling. On the **Watch** tab, press the **+/-** button next to the _Running in_ N _browser windows_ text and set the desired value.

This change takes effect immediately on the running crawl and updates the crawl workflow settings for future runs.

## Pausing and Resuming Crawls

If you need to reassess or rescope your crawl at any point after it has started, you can pause the running crawl.

To pause a running crawl, click the *Pause* button. The crawl status will change from *Running* to *Pausing* as in-progress pages are completed, and then to *Paused* once the crawler is successful paused. Paused crawls do not continue to accrue execution time.

While a crawl is paused, it is possible to replay the pages crawled up to that point and to download the WACZ files from the *Latest Crawl* tab.

To resume a paused crawl, simply click the *Resume* button. The crawl status will update from *Resuming* to *Running* to indicate that the crawler has started crawling again. Any changes to the workflow settings will be applied in the the resumed crawl.

???+ Note
    Paused crawls that are not resumed within 7 days of being paused are automatically updated to *Stopped*. Once stopped, the crawl is finished and can no longer be resumed.

## End a Crawl

If a crawl workflow is not crawling websites as intended it may be preferable to end crawling operations and update the crawl workflow's settings before trying again. There are two operations to end crawls, available both on the workflow's details page, or as part of the actions menu in the workflow list.

### Stopping

Stopping a crawl will throw away the crawl queue but otherwise gracefully end the process and save anything that has been collected. Stopped crawls show up in **Archived Items** and can be used like any other item in the app.

### Canceling

Canceling a crawl will throw away all data collected and immediately end the process. Canceled crawls do not show up in **Archived Items**, though a record of the runtime and workflow settings can be found in the crawl workflow's list of crawls.
