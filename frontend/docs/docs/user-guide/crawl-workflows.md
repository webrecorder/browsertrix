# Intro to Crawl Workflows

Crawl workflows are the bread and butter of automated browser-based crawling. A crawl workflow enables you to specify how and what the crawler should capture on a website.

A finished crawl results in an [archived item](./archived-items.md) that can be downloaded and shared. To easily identify and find archived items within your org, you can automatically name and tag archived items through custom workflow metadata.

You can create, view, search for, and run crawl workflows from the **Crawling** page.

## Create a Crawl Workflow

Create new crawl workflows from the **Crawling** page, or the  _Create New ..._ shortcut from **Dashboard**.

### Choose what to crawl

The first step in creating a new crawl workflow is to choose what you'd like to crawl by defining a **Crawl Scope**. Crawl scopes are categorized as a **Page Crawl** or **Site Crawl**.

#### Page Crawl

Choose one of these crawl scopes if you know the URL of every page you'd like to crawl and don't need to include any additional pages beyond one hop out.

A Page Crawl workflow is simpler to configure, since you don't need to worry about configuring the workflow to exclude parts of the website that you may not want to archive.

#### Site Crawl

Choose one of these crawl scopes to have the the crawler automatically find pages based on a domain name, start page URL, or directory on a website.

Site Crawl workflows are great for advanced use cases where you don't need (or want) to know every single URL of the website that you're archiving.

After deciding what type of crawl you'd like to run, you can begin to set up your workflow. A detailed breakdown of available settings can be found in the [workflow settings guide](workflow-setup.md).

## Run Crawl

Run a crawl workflow by clicking _Run Crawl_ in the actions menu of the workflow in the crawl workflow list, or by clicking the _Run Crawl_ button on the workflow's details page.

While crawling, the **Latest Crawl** section streams the current state of the browser windows as they visit pages. You can [modify the crawl live](./running-crawl.md) by adding URL exclusions or changing the number of crawling instances.

Re-running a crawl workflow can be useful to capture a website as it changes over time, or to run with an updated [crawl scope](workflow-setup.md#crawl-scope-options).

## Status

Finished crawl workflows inherit the [status of the last archived item they created](archived-items.md#status). Crawl workflows that are in progress maintain their [own statuses](./running-crawl.md#crawl-workflow-status).
