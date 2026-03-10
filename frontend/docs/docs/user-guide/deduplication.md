# Deduplication

## Overview

Deduplication (or “dedupe”) is the process of preventing duplicate content from being stored during crawling. When deduplication is enabled, the crawler will reference a collection’s existing items when checking for new content and URLs. Content that is identical, even when found at a different URL, will be deduplicated by writing "revisit" records rather than the full resource in the resulting crawl WACZ files. This results in a smaller, space-saving collection and smaller archived items.

Deduplication in Browsertrix is facilitated by a _deduplication index_ associated with a given collection, which contains information for every resource and URL in the collection’s archived items. 

## Tradeoffs and Considerations

While deduplication can help save storage space, the process also creates dependencies between items. Because content for a given page may be spread throughout multiple crawls, one crawled item may depend on another for its skipped and omitted content. To view the complete, deduplicated content of a crawled site, the entire collection must be replayed or downloaded.

For individual crawls, replay may not work as expected after downloading the crawl unless you select the option to download the crawl with dependencies. This option will bundle the crawl WACZ with all of the WACZ files from other archived items in the collection that the crawl’s deduplicated resources depend on as a single combined WACZ file.

Because content for a given page may be spread throughout multiple crawls, deleting crawls in a deduplicated collection will also result in replay not working as expected for some pages and resources.

Deduplication may be more appropriate for some users of Browsertrix than others. It might be a good fit for you if you:

- Keep your web archives primarily within Browsertrix, utilizing the collection sharing features to provide access; or if you
- Regularly export your archived items from Browsertrix and add their contents to playback systems where they are all replayed together, such as large web archive collections powered by wayback machine-style software such as [pywb](https://github.com/webrecorder/pywb).

Deduplication might not be the best fit for you if you:

- Regularly download your archived items as WACZ files to store and share as discrete files that will be replayed independently from each other, such as in a digital preservation repository or digital library that uses ReplayWeb.page as a web archive viewer. You may find that the need to download each crawl as a combined WACZ file with all dependencies from other items included for replay outside of Browsertrix negates the storage savings that would otherwise be gained from using deduplication.

!!! tip "Tip: Removing Items from a Collection with Deduplication"
    Crawls in a deduplicated collection that are deleted will not have the URLs encountered during those crawls removed from the collection’s deduplication index by default. Org admins are able to prune a collection’s deduplication index down to only its current items by clicking _Purge Index_ in the **Deduplication** tab of the collection, or in the **Deduplication** section of [Org Settings](./org-settings.md). This will start a new job to rebuild the index without the removed items.

## Enable Deduplication

To enable deduplication, specify a collection to use as the deduplication source when creating or editing a workflow. The first time a crawl workflow is run with deduplication enabled, a deduplication index will be created for the collection and available to view in the collection’s **Deduplication** tab. It is also possible to create the deduplication index of the collection’s archived items before running crawl workflows from the collection’s **Deduplication** tab by selecting the _Create Dedupe Index_ button, which is visible if the index does not yet exist.

Building the deduplication index may take some time, especially for collections that already contain a large number of archived items, as Browsertrix will index each URL from all items in the collection.

## Manage Deduplication Index

The collection’s **Deduplication** tab contains information about the size and contents of the deduplication index, as well as the impact on storage from deduplication.

In the Index Overview action menu, org admins can delete the deduplication index, or purge the index to rebuild it from only the collection’s current archived items.

The Deduplication tab also lists the deduplicated crawls that have been created using this collection as a deduplication source, as well as the crawl dependencies that deduplicated crawls rely upon to successfully replay.

## Enable Deduplication Across Your Entire Organization

It is possible to deduplicate all crawls in your org by taking advantage of **crawling defaults**. To deduplicate as broadly as possible, first create a collection that all archived items in your org will belong to.

If you already have existing archived items and crawl workflows in your org, be sure to add them all to this collection. This can be done in the collection’s **Select Items** dialog, or one-by-one by individually editing the archived items and crawl workflows.

Finally, have an org admin set the collection as the default deduplication source in the **Crawling Defaults** section of [Org Settings](./org-settings.md). Once this is done, all new crawl workflows will have deduplication enabled, and all crawls run with these workflows will be deduplicated against the collection containing all of the items in your org.

## Technical Details

More information about how deduplication is implemented in Browsertrix Crawler is available in the [crawler documentation](https://crawler.docs.browsertrix.com/user-guide/dedupe/).
