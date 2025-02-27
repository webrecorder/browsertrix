# Actions Dropdowns

While controls are always placed next to the most relevant content area, we expose most controls for an object in an _Actions_ dropdown menu to enable discovery of actions in a single place, and allow power-users to quickly accomplish tasks.

## Implementation

Actions dropdowns should generally contain a consistent set of actions for a given object. Whereas `---` symbolizes a horizontal separator, these actions should be ordered as follows:

```txt
Actions related only to the current page (eg: remove archived item from collection)
---
Actions related to editing the object (eg: edit workflow config, edit item metadata)
Other actions related to the current object (eg: run crawl)
---
Actions related to exporting/downloading (eg: download archived item)
---
Copy information to clipboard (eg: copy share link)
Copy IDs to clipboard (eg: copy item ID)
---
Destructive actions (eg: delete item)
```
