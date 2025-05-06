# Status Icons

Browsertrix uses a standard set of status icons to communicate success, neutral, and failure states throughout the app. Colors are used only to reinforce their distinct shapes which have been chosen so they remain accessible to those who may not be able to distinguish differences based on color alone.

Status icons always use filled icon variants (when available), as opposed to buttons or actions which use strokes.

When used without labels, status icons should include tooltips to provider further clarity as to what they indicate.

## In Use (as of 2025-05-06)

| Icon & Label | Color | Context | Description |
|------|-------|---------|-------------|
| <span class="status-green-600">:btrix-status-dot: 1 Crawl Running</span> | `--sl-color-green-600` | Dashboard | Count of crawls in "running" status when that count is non-zero |
| <span class="status-neutral-600">:btrix-status-dot: 0 Crawls Running</span> | `--sl-color-neutral-600` | Dashboard | Count of crawls in "running" status when that count is zero |
| <span class="status-violet-600">:bootstrap-hourglass-split: 1 Crawl Workflow Waiting</span> | `--sl-color-violet-600` | Dashboard | Count of crawls in "waiting" status |
| <span class="status-neutral-400">:bootstrap-slash-circle: No Crawls Yet</span> | `--sl-color-neutral-400` | Crawl Workflows | Used to show that a workflow has no crawls |
| <span class="status-green-600">:bootstrap-check-circle-fill: Complete</span> | `--sl-color-green-600` | Crawl Workflows | Used to show that a workflow's most recent crawl was completed |
| <span class="status-amber-600">:bootstrap-dash-square-fill: Stopped</span> | `--sl-color-amber-600` | Crawl Workflows | Used to show that a workflow's most recent crawl was stopped |
| <span class="status-orange-600">:bootstrap-x-octagon-fill: Canceled</span> | `--sl-color-orange-600` | Crawl Workflows | Used to show that a workflow's most recent crawl was canceled |
| <span class="status-violet-600"><span class="animate-pulse">:btrix-status-dot:</span> Starting</span> | `--sl-color-violet-600` | Crawl Workflows | Used to show that a crawl is starting |
| <span class="status-green-600"><span class="animate-pulse">:btrix-status-dot:</span> Running</span> | `--sl-color-green-600` | Crawl Workflows | Used to show that a crawl is running |
| <span class="status-amber-600">:bootstrap-exclamation-diamond-fill: Behavior timed out</span> | `--sl-color-amber-600` | Crawl Logs | Used to show a warning log from a behavior |
| <span class="status-green-600">:bootstrap-check2-circle: Success</span> | `--sl-color-green-600` | Toasts | Used to show a success notification |
| <span class="status-amber-600">:bootstrap-exclamation-triangle: Warning</span> | `--sl-color-amber-600` | Toasts | Used to show a warning notification |
| <span class="status-orange-600">:bootstrap-exclamation-octagon: Danger</span> | `--sl-color-orange-600` | Toasts | Used to show an error notification |

## Intended Implementation

| Status | Color | Description | Icons | Examples |
| ---- | ---- | ---- | ---- | ---- |
| <span class="status-neutral-400">:bootstrap-slash-circle: Empty</span> | `neutral-400` | Used for empty states where no data is present | :bootstrap-slash-circle: `slash-circle` |<span class="status-neutral-400">:bootstrap-slash-circle: No Crawls Yet</span> |
| <span class="status-violet-600">:bootstrap-hourglass-split: Pending</span> | `violet-600` | Used when a process is queued or starting but is not yet running. Should be animated when indicating the status of a single object. | :bootstrap-hourglass-split: `hourglass-split`, or the icon of the next state being transitioned to (pulsing) | <span class="status-violet-600">:bootstrap-hourglass-split: 1 Crawl Workflow Waiting</span> <br /> <span class="status-violet-600"><span class="animate-pulse">:btrix-status-dot:</span> Starting</span> <br /> <span class="status-violet-600"><span class="animate-pulse">:bootstrap-play-circle:</span> Resuming</span> |
| <span class="status-green-600"><span class="animate-pulse">:btrix-status-dot:</span> Running</span> | `green-600` | Used when a process is actively running. Should be animated when indicating the status of a single object. | :btrix-status-dot: `dot` | <span class="status-green-600"><span class="animate-pulse">:btrix-status-dot:</span> Running</span> |
| <span class="status-neutral-600">:bootstrap-pause-circle: Paused</span> | `neutral-600` | Used for paused states | :bootstrap-pause-circle: `pause-circle` or :bootstrap-play-circle: `play-circle` | <span class="status-neutral-600">:bootstrap-pause-circle: Pause</span> <br/> <span class="status-neutral-600">:bootstrap-play-circle: Resume</span> |
| <span class="status-green-600">:bootstrap-check-circle-fill: Success</span> | `green-600` | Used for positive / successful states | :bootstrap-check-circle-fill: `check-circle-fill` or :bootstrap-check2-circle: `:check2-circle:` | <span class="status-green-600">:bootstrap-check-circle-fill: Complete</span> |
| <span class="status-amber-600">:bootstrap-dash-square-fill: Neutral</span> | `amber-600` | Used for ambiguous states, generally good but could be better | :bootstrap-dash-square-fill: `dash-square-fill` | <span class="status-amber-600">:bootstrap-dash-square-fill: Stopped</span> |
| <span class="status-amber-600">:bootstrap-exclamation-diamond-fill: Warning</span> | `amber-600` | Used for warning states, something is wrong but not critically | :bootstrap-exclamation-diamond-fill: `exclamation-diamond-fill` or :bootstrap-exclamation-diamond: `exclamation-diamond` | <span class="status-amber-600">:bootstrap-exclamation-diamond-fill: Warning</span> |
| <span class="status-orange-600">:bootstrap-x-octagon-fill: Danger</span> | `orange-600` | Used for serious errors and actions that should be taken with extreme care | :bootstrap-x-octagon-fill: `x-octagon-fill` or :bootstrap-x-octagon: `x-octagon` | <span class="status-orange-600">:bootstrap-x-octagon-fill: Error</span> |
