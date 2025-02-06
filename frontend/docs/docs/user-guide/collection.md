# Intro to Collections

## Create a Collection

You can create a collection from the Collections page, or the  _Create New ..._ shortcut from the org overview.

### Adding Collection Content

Collections are the primary way of organizing and combining archived items into groups for presentation.

!!! tip "Tip: Combining items from multiple sources"
    If the crawler has not captured every resource or interaction on a webpage, our [ArchiveWeb.page browser extension](https://webrecorder.net/archivewebpage) can be used to manually capture missing content and upload it directly to your org.

    After adding the crawl and the upload to a collection, the content from both will become available in the replay viewer.

Crawls and uploads can be added to a collection after creation by selecting _Select Archived Items_ from the collection's actions menu.

A crawl workflow can also be set to [automatically add any completed archived items to a collection](workflow-setup.md#collection-auto-add) in the workflow's settings.

## Collection Description

The description can be formatted with basic [Markdown](https://github.github.com/gfm/#what-is-markdown-) syntax to include headings, bolded and italicized text, lists, and links. The editor is powered by [ink-mde](https://github.com/davidmyersdev/ink-mde), an open source Markdown editor.

## Sharing Collections

Collections are private by default, but can be made public by marking them as sharable in the Metadata step of collection creation, or by toggling the _Collection is Shareable_ switch in the share collection dialogue.

After a collection has been made public, it can be shared with others using the public URL available in the share collection dialogue. The collection can also be embedded into other websites using the provided embed code. Un-sharing the collection will break any previously shared links.

For further resources on embedding archived web content into your own website, see the [ReplayWeb.page docs page on embedding](https://replayweb.page/docs/embedding).

## Downloading Collections

Downloading a collection will export every archived item within it as a single WACZ file. To download a collection, use the _Download Collection_ option under the collection's _Actions_ dropdown.
