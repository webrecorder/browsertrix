# View Usage Stats and Quotas

Your **Dashboard** delivers key statistics about the org's resource usage. You can also create crawl workflows, upload archived items, create collections, and create browser profiles through the _Create New ..._ shortcut.

## Storage

For organizations with a set storage quota, the storage panel displays a visual breakdown of how much space the organization has left and how much has been taken up by all types of archived items and browser profiles. To view additional information about each item, hover over its section in the graph.

For organizations with no storage limits the storage panel displays the total size and count of all types of archived items and browser profiles.

For all organizations the storage panel displays the total number of archived items.

## Crawling

The crawling panel lists the number of currently running and waiting crawls, as well as the total number of pages captured.

### Execution Time

`Paid Feature`{.badge-green}

For organizations with a set execution minute limit, the crawling panel displays a graph of how much execution time has been used and how much is currently remaining. Monthly execution time limits reset on the first of each month at 12:00 AM GMT.

??? Question "How is execution time calculated?"
    Execution time is the total runtime of a crawl scaled by the [_Browser Windows_](workflow-setup.md/#browser-windows) value during a crawl. Like elapsed time, this is tracked while the crawl runs. Changing the amount of _Browser Windows_ while a crawl is running may change the amount of execution time used in a given time period.

## Collections

The collections panel displays the number of total collections and collections marked as sharable.
