# Introduction to crawl workflows

Crawl workflows enable you to run crawls, which in turn produces an [archived item](./archived-items.md). A crawl workflow consists of a list of configuration options that instruct the crawler what it should capture and metadata about the workflow itself.

## Create a Crawl Workflow

You can create new crawl workflows from the Crawling page, or the  _Create New ..._ shortcut from the org overview. A detailed breakdown of available settings can be found in the [workflow configuration guide](workflow-setup.md).

## Run Crawl

Run a crawl workflow by clicking _Run Crawl_ in the actions menu of the workflow in the crawl workflow list, or by clicking the _Run Crawl_ button on the workflow's details page.

While crawling, the Watch Crawl page displays a list of queued URLs that will be visited, and streams the current state of the browser windows as they visit pages from the queue. You can [modify the crawl live](./running-crawl.md) by adding URL exclusions or changing the number of crawling instances.

Running a crawl workflow that has successfully run previously can be useful to capture content as it changes over time, or to run with an updated [Crawl Scope](workflow-setup.md#scope).

## Status

Finished crawl workflows inherit the [status of the last archived item they created](archived-items.md#status).