# Getting started with crawl workflows

Crawl workflows enable you to run crawls, which in turn produces an [archived item](./archived-items.md). A crawl workflow consists of a list of configuration options that instruct the crawler what it should capture and metadata about the workflow itself.

## Create a Crawl Workflow

You can create new crawl workflows from the Crawling page, or the  _Create New ..._ shortcut from the org overview.

### Choose what to crawl

The first step in creating a new [crawl workflow](crawl-workflows.md) is to choose what you'd like to crawl. This determines whether the crawl type will be **URL List** or **Seeded Crawl**. Crawl types can't be changed after the workflow is created—you'll need to create a new crawl workflow.

#### Known URLs `URL List`{ .badge-blue }

Crawl a single page, or choose this option if you already know the URL of every page you'd like to crawl. The crawler will visit every URL specified in a list, and optionally every URL linked on those pages.

A URL list is simpler to configure, since you don't need to worry about configuring the workflow to exclude parts of the website that you may not want to archive.

#### Automated Discovery `Seeded Crawl`{ .badge-orange }

Let the crawler automatically discover pages based on a domain or start page that you specify.

Seeded crawls are great for advanced use cases where you don't need (or want) to know every single URL of the website that you're archiving.

Upon choosing you can begin to set up your workflow. A detailed breakdown of available settings can be found in the [workflow settings guide](workflow-setup.md).

## Run Crawl

Run a crawl workflow by clicking _Run Crawl_ in the actions menu of the workflow in the crawl workflow list, or by clicking the _Run Crawl_ button on the workflow's details page.

While crawling, the Watch Crawl page displays a list of queued URLs that will be visited, and streams the current state of the browser windows as they visit pages from the queue. You can [modify the crawl live](./running-crawl.md) by adding URL exclusions or changing the number of crawling instances.

Running a crawl workflow that has successfully run previously can be useful to capture content as it changes over time, or to run with an updated [Crawl Scope](workflow-setup.md#scope).

## Status

Finished crawl workflows inherit the [status of the last archived item they created](archived-items.md#status).