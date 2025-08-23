# Review Crawl

## Overview of Crawl Quality
In a QA analysis, Browsertrix collects data in two stages: first during the initial crawl, and then again during the replay. Rather than comparing the replay to the live site, we compare it to the data captured during the crawl. This ensures that the web archive that is to be downloaded, added to a collection, or shared provides a high quality replay.

When reviewing the page, you will be able to analyze specific elements beginning with the Starting URL. 

You will be able to review the crawled pages by:

- **Screenshots**: A static visual snapshot of a section of the captured page
- **Text**: A full transcript of the text within the page
- **Resources**: Web documents (i.e. HTML, stylesheets, fonts, etc.) that make up the page

!!! note "Navigation Prevented in Replay within QA"
    To navigate through the captured website, use the Replay feature in the Crawling section. Links will not be clickable when using the Replay tab within the Analysis view.

!!! note "Limited View in Default Mode"
    When you first view an analysis of a page, the screenshot, text, and resource comparison views are only available for analyzed crawls. You'll need to run an analysis to view and compare all quality metrics.
    
## QA on Your Web Archive
When you run an analysis, you'll have a comparison view of the data collected. If multiple analysis runs have been completed, the page data will be used from the selected analysis run, which are displayed next to the archived item name. The most recent analysis run is selected by default, but you can choose to display data from any other completed or stopped analysis run here as well.

The depth of your page review may vary depending on available time and the complexity of the page. For automated support, crawl analysis can generate comparisons across three key factors to help highlight potentially problematic pages. If you prefer a manual approach, you can still assess crawls even without running an analysis. You’re still able to review page quality manually and leave comments, provide ratings, and examine the screenshots, text, and resources.

### Screenshot Comparison
Screenshots are compared by measuring the perceived difference between color samples and by the intensity of difference between pixels. These metrics are provided by the open source tool [Pixelmatch](https://observablehq.com/@mourner/pixelmatch-demo).

Discrepancies between crawl and replay screenshots may occur because resources aren't loaded or rendered properly (usually indicating a replay issue).

!!! Tip "Caveats"
    If many similar pages exhibit similarly poor screenshot comparison scores but look fine in the replay tab, it may be because of page loading time not being long enough during analysis.

    Some websites may take more time to load than others, including on replay! If the page wasn't given enough time to load during crawl analysis — because crawl analysis uses the same workflow limit settings as crawling — increasing the [_Delay After Page Load_ workflow setting](workflow-setup.md#delay-after-page-load) may yield better screenshot analysis scores, at the cost of extra execution time.

### Extracted Text Comparison
Text extracted during crawl analysis is compared to the text extracted during crawling. Text is compared on the basis of [Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance).

Resources not loaded properly on replay may display ReplayWeb.page's `Archived Page Not Found` error within the extracted text.

### Resource Comparison
The resource comparison tab displays a table of resource types, and their [HTTP status code](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes) count grouped by "good" and "bad". 2xx & 3xx range status codes are assigned "good", 4xx & 5xx range status codes are assigned "bad". Bad status codes on crawl indicate that a resource was not successfully captured. Bad status codes on replay that marked good when crawling usually indicate a replay issue.

!!! Tip "Caveats"
    The number of resources may be higher on replay due to how components of ReplayWeb.page re-write certain request types. A discrepancy alone may not be an indicator that the page is broken, though generally it is a positive sign when the counts are equal.

    Due to the complicated nature of resource count comparison, this is not available as a sorting option in the pages list.

## Page Review
The pages from the crawl will be listed so you can click on pages based on particular interest, comparison rating, or just random spot checking from your workflow.

<!-- ### sort by approval
### leave comments
### rate -->

??? Question "Should I review every page?"
    Probably not! When reviewing a crawl of a site that has many similar pages, all of which exhibit the same error and have similar heuristic scores, it's likely that they all are similarly broken, and you can _probably_ save yourself the trouble. Depending on the website, the heuristic scores may not always be an accurate predictor of quality, but in our testing they are fairly consistent — consistency being the important factor of this tool. It is up to you, the curator, to make the final quality judgement!

    Our recommended workflow is as follows: run crawl analysis, examine the most severe issues as highlighted, examine some key examples of common layouts, review any other key pages, and score the crawl accordingly!

## Finish Review
Once a satisfactory amount of pages have been reviewed, press the Finish Review button to give the archived item an overall quality score ranging from "Excellent!" to "Bad". You can add any additional notes or considerations in the archived item description, which can be edited during this step.

### Rate This Crawl
This quality score helps others in your organization understand how well the page was captured and whether it needs to be recaptured. You can choose from the following rating ranges:
- Excellent! This archived item perfectly replicates the original pages
- Good. Looks and functions nearly the same as the original pages
- Fair. Similar to the original pages, but may be missing non-critical content or functionality
- Bad. Missing all content and functionality from original pages

### Update Crawl Metadata
You can include additional metadata in the provided text area. There is a maximum of 500 characters for this section.