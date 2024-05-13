# Crawl Review

The Crawl Review page provides a streamlined interface for assessing the capture quality of pages within an archived item using the heuristics collected during crawl analysis.

Crawls can only be reviewed once [crawl analysis](archived-items.md#crawl-analysis) has been run. If multiple analysis runs have been completed, the page analysis heuristics will be used from the selected analysis run, which are displayed next to the archived item name. The most recent analysis run is selected by default, but you can choose to display data from any other completed or stopped analysis run here as well.

## Heuristics

Crawl analysis generates comparisons across three heuristics that can indicate which pages may be the most problematic.

### Screenshot Comparison

Screenshots taken during crawl analysis are compared with the page thumbnail created during crawling. Screenshots are compared using [Pixelmatch](https://github.com/mapbox/pixelmatch).

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

The pages list can be sorted using the analysis heuristics to determine the pages that are likely more important to review vs those that might require less attention. After selecting a page to review, looking over the analysis heuristics, and checking them against replay, make a decision about if the page capture was successful or unsuccessful and leave a note using the about what worked well or what might be problematic.

??? Question "Should I review every page? (Spoiler alert: probably not!)"
    When reviewing a crawl of a site that has many similar pages, all of which exhibit the same error and have similar heuristic scores, they're likely all like that and you can _probably_ save yourself the trouble. Depending on the website, the heuristic scores may not always be an accurate predictor of quality, but in our testing they are fairly consistent — consistency being the important factor of this tool. It is up to you, the curator, to make the final quality judgement!

    Our recommended workflow is: run crawl analysis, examine the most severe issues as highlighted, examine some key examples of common layouts, review any other key pages, and score the crawl accordingly!

## Finish Review

Once a satisfactory amount of pages have been reviewed, press the _Finish Review_ button to give the archived item an overall quality score ranging from "Excellent!" to "Bad". Update the description with any additional notes or considerations.
