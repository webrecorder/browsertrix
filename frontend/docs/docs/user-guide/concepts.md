# Concepts

The following are high level concepts and terms that are used throughout the Browsertrix web application and user guide.

For a general introduction to the web archiving process, we recommend reading our [“What is web archiving?” :octicons-link-external-16:](https://webrecorder.net/resources/what-is-web-archiving/){ target="_blank" } guide.

For a full list of terminology, refer to our [Glossary of Terms :octicons-link-external-16:](https://webrecorder.net/resources/glossary/){ target="_blank" }.

## Crawling

Crawling is the automated act of browsing the web and saving its contents. In other tools this process may be referred to as “harvesting” or “capturing”. The program responsible for the automation is called a “crawler”.

## Crawler

A crawler is a program which systematically browses the Web to collect data from web pages (i.e. crawling). As a Browsertrix user, you will set specific instructions for the crawler, like which URLs to visit, by using a crawl workflow.

## Crawl Workflow

A crawl workflow is particular configuration used by the crawler when crawling. This may sometimes be shortened to just “workflow”. An [archived item](#archived-item){ data-preview } is produced at the end of each successful crawl workflow run.

## Crawl Run

To run a crawl workflow means to instruct the crawler to begin crawling, per the instructions set by the crawl workflow. When used as a noun, a “crawl workflow run” or “crawl run” is any instance of a crawl that started (though not necessarily finished yet) from a crawl workflow.

In Browsertrix, crawl runs are grouped by the crawl workflow that was used to run the crawl. Although multiple crawls can run at the same time using different crawl workflows, only one crawl for a given workflow can run at a time.

## Scope

The scope is an outline of what the archive contains and what it aims to encompass based on a common theme or subject matter. This can mean choosing a specific website and a set of web pages to include or exclude during a crawl. A crawl’s scope is configured through a crawl workflow.

## Page

A page, web page, or webpage is a document that can be viewed using an Internet browser. Web archives are primarily made up of archived web pages.

The Browsertrix web application uses the shorted form “page”, e.g. “crawled pages” to mean “crawled web pages”.

## Link

A link (or “hyperlink”) is a reference that connects web pages or data items to one another. In Browsertrix, the crawler discovers new pages to archive through links.

## URL

A URL is the text entered into an Internet browser’s address bar to access a document, such as a web page. A URL can also be referred to as a web address, or a “link” when used in the context of a URL that leads to a connected webpage.

## Browser

A browser is a program that retrieves and displays pages from the Web. Popular browsers are Google Chrome, Mozilla Firefox, Apple Safari, and Microsoft Edge.

Browsers are most commonly used by humans to access a website; in Browsertrix, browsers are also used by a crawler to faithfully replicate a human visiting a website.

## Browser Profile

A browser profile is a data package consisting of login sessions and other settings that pertinent to browser. During a crawl, the browser profile will be used to customize how web pages are retrieved and displayed.

## Archived Item

Archived items provide an interface between Browsertrix users and archived web content, enabling such organizational actions as grouping, reviewing, naming, and exporting archived content.

Every successful Browsertrix [crawl run](#crawl-run){ data-preview } is associated with an archived item. This type of archived item is referred to as a “crawled item”.

Archived items can be imported and exported from Browsertrix as a [WACZ file](#wacz-file). When a WACZ file is imported into Browsertrix, the resulting archived item is referred to as an “uploaded item”.

## WACZ File

A WACZ (Web Archive Collection Zipped) file is an archival file that contains all the data necessary for the contextualized [replay](#replay){ data-preview } of a web archiving session, in a format that is portable and interoperable. WACZ files can be easily transported from one storage system to another, sent as an attachment in an email, placed on a thumb drive, and viewed in a web browser using a website like [ReplayWeb.page :octicons-link-external-16:](https://replayweb.page/){ target="_blank" }.

The primary components of a WACZ file are:

- **WARC (Web ARChive) files**: Files that encapsulate HTTP transactions from a web crawl.
- **Contextual information**: Descriptive information about the web archive that helps a person using that web archive understand and interpret what the archive contains. This information can include why the content was selected for the archive, when it was created, who created it, and what tools or applications were used to create it.
- **Page index**: A set of entry points or [pages](#page){ data-preview } to use for browsing the web archive.

In Browsertrix, WACZ files are generated by [crawl workflow runs](#crawl-run){ data-preview } to store the crawled content and associated metadata. WACZ files that are created outside of Browsertrix can be imported into Browsertrix as an [archived item](#archived-item).

???+ Info "Migrating from WARC"
    The WACZ format was developed by Webrecorder to establish a file packaging convention for all the data needed by a browser for the efficient rendering and user-friendly contextualization of a web archive ([view full specification :octicons-link-external-16:](https://specs.webrecorder.net/wacz/latest/){ target="_blank" }). To convert your existing WARC files to WACZ, use our [Python command line tool :octicons-link-external-16:](https://github.com/webrecorder/py-wacz){ target="_blank" }.

## Replay

A replay is the display of a web archive’s contents as interactive web pages, as they appeared when they were crawled. In Browsertrix replay, web pages and documents (like images) are browseable and searchable.

To replay (verb) a web archive means to access and view its contents.

## Collection

A Browsertrix collection is a set of archived items that have been grouped together based on a common theme, topic, time period, or any other conceptual or arbitrary grouping.

## Org

An org (or “organization”) is a web archiving workspace that can be shared between multiple users. In other tools this concept may be referred to as a team, workspace, or project.
