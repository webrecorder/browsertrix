# Status Icons

Browsertrix uses a standard set of status icons to communicate success, neutral, and failure states throughout the app. Colors are used only to reinforce their distinct shapes which have been chosen so they remain accessible to those who may not be able to distinguish differences based on color alone.

Status icons always use filled icon variants (when available), as opposed to buttons or actions which use strokes.

When used without labels, status icons should include tooltips to provider further clarity as to what they indicate.

## Implementation

| Status | Description |
| ---- | ---- |
| <span class="status-empty">:bootstrap-slash-circle-fill: Empty</span> | Used for empty states where no data is present |
| <span class="status-waiting">:bootstrap-hourglass-split: Waiting</span> | Used when a task is queued but has not started |
| <span class="status-success">:bootstrap-check-circle-fill: Success</span> | Used for positive / successful states |
| <span class="status-neutral">:bootstrap-dash-square-fill: Neutral</span> | Used for ambiguous states, generally good but could be better  |
| <span class="status-neutral">:bootstrap-exclamation-square-fill: Less Neutral</span> | Same as neutral but with more caveats |
| <span class="status-warning">:bootstrap-x-octagon-fill: Warning</span> | Used for cautionary states and actions with caveats |
| <span class="status-danger">:bootstrap-exclamation-triangle-fill: Severe</span> | Used for serious errors and actions that should be taken with extreme care |
