# Workflow Setup

## Scope

### List of URLs

This list informs the crawler what pages it should capture as part of a URL List crawl.

### Include Any Linked Page

If checked, the crawler will visit all the links it finds within each page defined in the _List of URLs_ field.

??? tip "Crawling tags & search queries with URL List crawls"
    This setting can be useful for crawling the content of specific tags or searh queries.  Specify the tag or search query URL(s) in the _List of URLs_ field, e.g: `https://example.com/search?q=tag`, and enable _Include Any Linked Page_ to crawl all the content present on that search query page.

### Crawl Start URL

This is the first page that the crawler will visit. It's important to set _Crawl Start URL_ that accurately represents the scope of the pages you wish to crawl as the _Start URL Scope_ selection will depend on this field's contents.

You must specify the protocol (likely `http://` or `https://`) as a part of the URL entered into this field.

### Start URL Scope

`Hashtag Links Only`
:   This scope will ignore links that lead to other addresses such as `example.com/linkedpage` and will instead instruct the crawler to visit hashtag links such as `example.com/#linkedsection`.

    This scope can be useful for crawling certian web apps that may not use unique URLs for their pages.

`Pages in the Same Directory`
:   

`Pages on This Domain`
:   

`Pages on This Domain and Subdomains`
:   

`Custom Page Prefix`
:   

### Max Depth

Only shown with a _Start URL Scope_ of `Pages on This Domain` and above, the _Max Depth_ setting instructs the crawler to stop visiting new links past a specified depth.

### Extra URLs in Scope

Only shown with a _Start URL Scope_ of `Custom Page Prefix`, this field accepts additional URLs or domains that will be crawled if URLs that lead to them are found.  

This can be useful for crawling websites that span multiple domains such as `example.org` and `example.net`

### Include Any Linked Page ("one hop out")

If checked, the crawler will visit all the links it finds within each page, regardless of the _Start URL Scope_ setting.

This can be useful for capturing links on a page that lead outside the website that is being crawled but should still be included in the archive for context.

### Exclusions

The exclusions table will instruct the crawler to ignore links it finds on pages where all or part of the link matches an exclusion found in the table.

This can be useful for avoiding crawler traps — sites that may automatically generate pages such as calendars or filter options — or other pages that should not be crawled according to their URL.

`Matches text`
:   Will perform simple matching of entered text and exclude all URLs where matching text is found.

    e.g: If `about` is entered, `example.com/aboutme/` will not be crawled.

`Regex`
:   Regular expressions (Regex) can also be used to perform more complex matching.

    e.g: If `#!regex \babout\/?\b` is entered, `example.com/about/` will not be crawled however `example.com/aboutme/` will be crawled.

## Limits

## Browser Settings

## Scheduling

## Metadata