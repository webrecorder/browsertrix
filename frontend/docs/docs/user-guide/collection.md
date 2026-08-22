# Intro to Collections

Collections provide a way to dynamically combine and group multiple individual crawls and uploads into a contextual, unified archive replay experience.

## Create a Collection

You can create a collection from the **Collections** page directly, or the  _Create New..._ shortcut from the org dashboard.

### Name and Summary

Choose a collection name that identifies your collection within the org. The name can contain letters, numbers, and special characters (like emojis). The collection name should include at least one letter.

The summary is a short description that summarizes this collection. If the collection is shareable, this will appear next to the collection name. You can add a longer description in the **About** section after creating the collection.

### Visibility

In most cases, you will want to keep the default _Private_ visibility setting until items are added to your collection. If you do change this setting, the empty collection will be [shareable](#collection-access) upon creation.

## Configure the Collection

### Add Archived Items

Choose _Configure Items_ from the collection's actions menu to select crawled and uploaded items to add to a collection.

A crawl workflow can also be set to [automatically add crawled items to a collection](workflow-setup.md#auto-add-to-collection).

### Add a Description

Whereas the collection summary can help describe the collection at a glance, the long-form description lets you add details that can help contextualize the collection and its contents.

To write a description, select _Add Description_ from the **About** tab or choose _Edit Description_ from the _Actions_ menu. The description supports basic text formatting like headings, bold and italicized text, lists, and links.

If the collection is shareable, the description will be made public in **About This Collection**.

### Add a Thumbnail

The collection thumbnail represents the content of the collection by using a page screenshot. To choose a page screenshot, select the :bootstrap-pencil: button on top of the collection thumbnail to view compatible page screenshots.

## Browse Collection

The **Browse Collection** section of a collection allows you to view a combined replay of all archived items in the collection. The combined replay highlights another key feature of collections: the ability to “patch”, or fix, an archived item that contains links to missing pages. Add a crawled item with just the missing pages to the same collection and the link will now work as expected.

!!! tip "Tip: Patching a crawl with interactive archiving"
    If the crawler has not captured every resource or interaction on a webpage, our [ArchiveWeb.page browser extension](https://webrecorder.net/archivewebpage) can be used to interactively capture missing content using your web browser and upload it directly to your org.

To update the initial view of **Browse Collection**, select _Set Homepage_ and choose an option:

- **Current Page** — The page that is currently open in your replay view.
- **Page List** — A list of all crawl URLs.

If the _Current Page_ option is chosen, the collection thumbnail will automatically be updated to a screenshot of that page.

## Download a Collection

Downloading a collection will export every archived item in it as a single WACZ file. To download a collection, use the _Download Collection_ option under the collection's _Actions_ dropdown.

## Collection Access

Collections can be set to one of the one following access modes:

- **Private** — Collection is only accessible to logged-in members in the same organization.
- **Unlisted** — Collection can be shared with others, given the link to the collection.
- **Public** — Collection can be shared with others and is listed in the [public collections gallery](org-settings.md#public-collections-gallery).

The [Presentation & Sharing](./presentation-sharing.md) guide provides further details for options on how to present and share collections.

## Deduplicate Content

Deduplication (or “dedupe”) is the process of preventing duplicate content from being stored. When deduplication is enabled, the crawler will reference a collection’s existing items when checking for new content and URLs. Content that is identical, even when found at a different URL, will be deduplicated by writing "revisit" records rather than the full resource in the resulting crawl WACZ files. This results in a smaller, space-saving collection and smaller archived items.

The [Deduplication](./deduplication.md) page goes into further detail on how deduplication works in Browsertrix, some of the tradeoffs and considerations for replay and download to keep in mind, and how to create and manage the deduplication index for a collection.

## Remove a Collection

To permanently remove a collection from your org, choose _Delete Collection_ from the collection _Actions_ menu. Deleting a collection will not delete any archived items.
