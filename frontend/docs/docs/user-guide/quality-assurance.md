# Introduction to QA

Quality assurance (QA) in web archiving is the systematic process of verifying that archived web content is accurate, complete, and usable. It often involves checking for broken links, missing content, and ensuring the archived version matches the website website at the time it was crawled, especially sites with dynamic and interactive elements.

Quality assurance has often been performed manually, typically by visually comparing crawl results to the live site and clicking on the hyperlinks of a crawled web page. This can be tedious and prone to issues if some interactive elements are overlooked, especially if the live site has changed since the time it was crawled and archived. Browsertrix addresses these potential issues through QA tools that provide immediate feedback on the capture quality of the crawl, so that crawl or replay issues can be identified and resolved promptly.

## Overview of Quality Assurance
With assisted QA, you can analyze any web archive crawled through Browsertrix to compare, replay, and review pages in the web archive.

!!! note "Types of crawls you can review"
    You are able to review and analyze crawls that have been completed or even stopped. You would not be able to review or run an analysis on cancelled crawls, paused crawls or uploaded crawls.

At a quick glance, you can tell: 

- **Analysis Status**: By default, the status of your analysis will be shown as *Not Analyzed* because QA analysis does not run automatically. You will need to run analysis if you want an HTML Page match analysis and side-by-side screenshot comparisons. 
- **QA Rating**: Users can rate crawls if they are Excellent, Good, Fair, Poor, or Bad depending on the quality.
- **Total Analysis Time**: Similar to Execution Time (crawl running time), an analysis uses minutes to measure the total runtime of a crawl scaled by the Browser Windows value during a crawl.

### Crawl Results
You will be automatically given a summarization of your crawl, even without running analysis. 

You will get a count of all the HTML (HyperText Markup Language) files captured as well as non-HTML files. Non-HTML files include PDFs, Word and text files, images, and other downloadable content that the crawler discovers through clickable links on a page. These files are not analyzed, as they are standalone assets without comparable Web elements. Failed pages did not respond when the crawlers tried to visit them. 

### Pages 
A Page refers to a Web page. A Web page is a Web document that is accessed in a web browser that would typically be linked together with other Web pages to create a website. 

You will see a list of all the Web pages crawled featuring its Title, URL, any approval rating and comments done by users of the org.

<!-- ## Run Analysis
From the Quality Assurance tab in the Crawl overview page, you will be able to [*Run Analysis*](./qa-run-analysis.md) or *Rerun Analysis* depending on which step of the workflow you are at.  -->

## Review Crawl Analysis
From the Quality Assurance tab in the Crawl overview page, you will be able to [*Review Crawl*](./qa-review.md) when you are ready to analyze the quality of the pages from the crawl.