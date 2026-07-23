# Running Crawls

Running crawls can be modified from the crawl workflow **Latest Crawl** tab. You may want to modify a running crawl if you find that the workflow is crawling pages that you didn't intend to archive, or if you want a boost of speed.

## Crawl Workflow Status

When a workflow run is initiated, the workflow status changes to <span class="status-violet-600">:bootstrap-hourglass-split: Waiting</span> or <span class="status-violet-600">:btrix-status-dot: Starting</span>, depending on whether the conditions for starting a crawl are in place (such as resource capacity.) The workflow status will change to <span class="status-green-600">:btrix-status-dot: Running</span> once the crawler loads the first crawl URL.

## Watch Crawl

You can watch the current state of the browser windows as the crawler visits pages in the **Watch** tab of **Latest Crawl**. A list of queued URLs are displayed below in the **Upcoming Pages** section.

## Live Exclusion Editing

While [exclusion rules](workflow-setup.md#custom-exclusion-rules) can be set before running a crawl workflow, you may want to update rules based on the real-time page queue: the crawler may find new parts of the site that shouldn't be crawled, or get stuck browsing parts of a website that automatically generate URLs known as ["crawler traps"](https://en.wikipedia.org/wiki/Spider_trap).

If the page queue contains URLs that should not be crawled, use the _Edit Exclusion Rules_ button in the **Watch** tab or from the workflow’s action menu.

Edited exclusion rules will take effect immediately on the running crawl. Additionally, the workflow’s settings will automatically update with the edited exclusion rules so that subsequent crawls use the same rules.

## Changing the Number of Browser Windows

Like exclusions, the number of [browser windows](workflow-setup.md#browser-windows) can also be adjusted while crawling. On the **Watch** tab, press the **+/-** button next to the _Running in_ N _browser windows_ text and set the desired value.

This change takes effect immediately on the running crawl and updates the crawl workflow settings for future runs.

## Pausing and Resuming Crawls

If you need to reassess or rescope your crawl at any point after it has started, you can pause the running crawl.

To pause a running crawl, click the _Pause_ button. The crawl status will change from _Running_ to _Pausing_ as in-progress pages are completed, and then to _Paused_ once the crawler is successful paused. Paused crawls do not continue to accrue execution time.

While a crawl is paused, it is possible to replay the pages crawled up to that point and to download the WACZ files from the _Latest Crawl_ tab.

To resume a paused crawl, simply click the _Resume_ button. The crawl status will update from _Resuming_ to _Running_ to indicate that the crawler has started crawling again. Any changes to the workflow settings will be applied in the the resumed crawl.

???+ Note
    Paused crawls that are not resumed within 7 days of being paused are automatically updated to _Stopped_. Once stopped, the crawl is finished and can no longer be resumed.

## Rate Limit Detection

A website may limit the number of requests it receives in a given amount of time. This practice is called [rate limiting](https://en.wikipedia.org/wiki/Rate_limiting) and it can improve server performance, mitigate network attacks, and reduce spam traffic.

Rate limiting can also make pages harder to archive: when a visitor (human, bot, or crawler) is rate limited by a website, they may see an error or [CAPTCHA](https://en.wikipedia.org/wiki/CAPTCHA) page instead of the actual page content for the given URL. Browsertrix attempts to capture only actual page content (i.e. prevent including error pages in an archive) by automatically detecting and temporarily skipping such error pages.

If too many error pages are encountered, the crawler adapts by slowing down and retrying the page URL after a longer delay. This behavior is distinct from the [page delay](workflow-setup.md#delay-before-next-page) workflow setting, which can reduce the chance of being rate limited by increasing the time spent on each page, at the cost of increasing the overall crawl time.

Unfortunately, there is not much Browsertrix can do to prevent being rate limited altogether. Adding a [browser profile](browser-profiles/browser-profiles-overview.md) or configuring a [proxy server](workflow-setup.md#crawler-proxy-server) may help reduce rate limits for certain sites, while other sites may need to provide explicit permission to be crawled, thus requiring the list of IP ranges used by Browsertrix.

???+ "Allow-listing Browsertrix on your website"
    `Paid Feature`{ .badge-green }
    If you subscribe to hosted Browsertrix and need help with being rate limited by your own website, please reach out to [support](support@webrecorder.org) for assistance.

### Rate Limited Workflow Status

If the crawler can no longer continue by skipping error pages while being rate limited, it will switch to a time-delay-based strategy to continue running. The workflow status during this state will be <span class="status-amber-600">:btrix-status-dot: Running (Rate Limited)</span>. In this state, the crawler will slow down and retry the page URL at longer intervals, up to once every 5 minutes. Pages that were not captured before will be queued to be retried. Crawls in this state will only use a few seconds of crawl time to check that it is still rate limited, thus avoiding wasting execution minutes on error pages.

If the crawl remains rate limited for an extended period of time (12 hours by default), the crawl may be automatically paused to avoid retrying indefinitely. The workflow status will then be <span class="status-neutral-500">:bootstrap-pause-circle: Paused: Rate Limit Timeout</span>.

## End a Crawl

If a crawl workflow is not crawling websites as intended it may be preferable to end crawling operations and update the crawl workflow's settings before trying again. There are two operations to end crawls, available both on the workflow's details page, or as part of the actions menu in the workflow list.

### Stopping

Stopping a crawl will gracefully finish crawling the open page and save all content that has been captured so far. Stopped crawls are shown in **Archived Items** and can be used like any other archived item in the app, such as being added to collections.

### Canceling

Canceling a crawl will throw away all data collected and immediately end the process. Canceled crawls do not show up in **Archived Items**, though a record of the runtime and workflow settings can be found in the crawl workflow's list of crawls.
