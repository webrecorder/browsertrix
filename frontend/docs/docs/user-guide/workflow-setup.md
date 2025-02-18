# Crawl Workflow Settings

One of the key features of Browsertrix is the ability to refine crawler settings to the exact specifications of your crawl and website.

Changes to a setting will only apply to subsequent crawls.

Crawl settings are shown in the crawl workflow detail **Settings** tab and in the archived item **Crawl Settings** tab.

## Scope

Specify the range and depth of your crawl.

Crawl scopes are categorized as a **Page Crawl** or **Site Crawl**:

_Page Crawl_
:   Choose one of these crawl scopes if you know the URL of every page you'd like to crawl and don't need to include any additional pages beyond one hop out.

    A Page Crawl workflow can be simpler to configure, since you don't need to worry about configuring the workflow to exclude parts of the website that you may not want to archive.

    ??? info "Page Crawl Use Cases"
        - You want to archive a social media post (`Single Page`)
        - You have a list of URLs that you can copy-and-paste (`List of Pages`)
        - You want to include URLs with different domain names in the same crawl (`List of Pages`)

_Site Crawl_
:   Choose one of these crawl scopes to have the the crawler automatically find pages based on a domain name, start page URL, or directory on a website.

    Site Crawl workflows are great for advanced use cases where you don't need (or want) to know every single URL of the website that you're archiving.

    ??? info "Site Crawl Use Cases"
        - You're archiving a subset of a website, like everything under _website.com/your-username_ (`Pages in Same Directory`)
        - You're archiving an entire website _and_ external pages linked to from the website (`Pages on Same Domain` + _Include Any Linked Page_ checked)

### Crawl Scope Options

#### Page Crawl

`Single Page`
:   Crawls a single URL and does not include any linked pages.

`List of Pages`
:   Crawls only specified URLs and does not include any linked pages.

`In-Page Links`
:   Crawls only the specified URL and treats linked sections of the page as distinct pages.

    Any link that begins with the _Crawl Start URL_ followed by a hashtag symbol (`#`) and then a string is considered an in-page link. This is commonly used to link to a section of a page. For example, because the "Scope" section of this guide is linked by its heading as `/user-guide/workflow-setup/#scope` it would be treated as a separate page under the _In-Page Links_ scope.

    This scope can also be useful for crawling websites that are single-page applications where each page has its own hash, such as `example.com/#/blog` and `example.com/#/about`.

#### Site Crawl

`Pages in Same Directory`
:   This scope will only crawl pages in the same directory as the _Crawl Start URL_. If `example.com/path` is set as the _Crawl Start URL_, `example.com/path/path2` will be crawled but `example.com/path3` will not.

`Pages on Same Domain`
:   This scope will crawl all pages on the domain entered as the _Crawl Start URL_ however it will ignore subdomains such as `subdomain.example.com`.

`Pages on Same Domain + Subdomains`
:   This scope will crawl all pages on the domain and any subdomains found. If `example.com` is set as the _Crawl Start URL_, both pages on `example.com` and `subdomain.example.com` will be crawled.

`Custom Page Prefix`
:   This scope will crawl all pages that begin with the _Crawl Start URL_ as well as pages from any URL that begin with the URLs listed in `Extra URL Prefixes in Scope`

### Page URL(s)

One or more URLs of the page to crawl. URLs must follow [valid URL syntax](https://www.w3.org/Addressing/URL/url-spec.html). For example, if you're crawling a page that can be accessed on the public internet, your URL should start with `http://` or `https://`.

??? example "Crawling with HTTP basic auth"

    All crawl scopes support [HTTP Basic Auth](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication) which can be provided as part of the URL, for example: `https://username:password@example.com`.
    
    **These credentials WILL BE WRITTEN into the archive.** We recommend exercising caution and only archiving with dedicated archival accounts, changing your password or deleting the account when finished.

### Crawl Start URL

This is the first page that the crawler will visit. _Site Crawl_ scopes are based on this URL.

### Include Any Linked Page

When enabled, the crawler will visit all the links it finds within each page defined in the _Crawl URL(s)_ field.

??? example "Crawling tags & search queries with Page List crawls"
    This setting can be useful for crawling the content of specific tags or search queries. Specify the tag or search query URL(s) in the _Crawl URL(s)_ field, e.g: `https://example.com/search?q=tag`, and enable _Include Any Linked Page_ to crawl all the content present on that search query page.

### Fail Crawl on Failed URL

When enabled, the crawler will fail the entire crawl if any of the provided URLs are invalid or unsuccessfully crawled. The resulting archived item will have a status of "Failed".

### Max Depth in Scope

Instructs the crawler to stop visiting new links past a specified depth.

### Extra URL Prefixes in Scope

This field accepts additional URLs or domains that will be crawled if URLs that lead to them are found.

This can be useful for crawling websites that span multiple domains such as `example.org` and `example.net`.

### Include Any Linked Page ("one hop out")

When enabled, the crawler bypasses the _Crawl Scope_ setting to visit links it finds in each page within scope. The crawler will not visit links it finds in the pages found outside of scope (hence only "one hop out".)

This can be useful for capturing links on a page that lead outside the website that is being crawled but should still be included in the archive for context.

### Check For Sitemap

When enabled, the crawler will check for a sitemap at /sitemap.xml and use it to discover pages to crawl if found. It will not crawl pages found in the sitemap that do not meet the crawl's scope settings or limits.

This can be useful for discovering and capturing pages on a website that aren't linked to from the seed and which might not otherwise be captured.

### Additional Pages

A list of page URLs outside of the _Crawl Scope_ to include in the crawl.

### Exclude Pages

The exclusions table will instruct the crawler to ignore links it finds on pages where all or part of the link matches an exclusion found in the table. The table is only available in Page List crawls when _Include Any Linked Page_ is enabled.

This can be useful for avoiding crawler traps — sites that may automatically generate pages such as calendars or filter options — or other pages that should not be crawled according to their URL.

`Matches text`
:   Will perform simple matching of entered text and exclude all URLs where matching text is found.

    e.g: If `about` is entered, `example.com/aboutme/` will not be crawled.

`Regex`
:   Regular expressions (Regex) can also be used to perform more complex matching.

    e.g: If `#!regex \babout\/?\b` is entered, `example.com/about/` will not be crawled however `example.com/aboutme/` will be crawled.

## Limits

Enforce maximum limits on your crawl.

### Max Pages

Adds a hard limit on the number of pages that will be crawled. The crawl will be gracefully stopped after this limit is reached.

### Crawl Time Limit

The crawl will be gracefully stopped after this set period of elapsed time.

### Crawl Size Limit

The crawl will be gracefully stopped after reaching this set size in GB.

### Page Load Timeout

Limits amount of elapsed time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.

### Delay After Page Load

Waits on the page after initial HTML page load for a set number of seconds prior to moving on to next steps such as link extraction and behaviors. Can be useful with pages that are slow to load page contents.

### Behavior Timeout

Limits amount of elapsed time behaviors have to complete.

### Autoscroll Behavior

When enabled, the browser will automatically scroll to the end of the page.

### Autoclick Behavior

When enabled, the browser will automatically click on all links, even if they're empty or don't navigate to another page.

This can be helpful for web applications that use JavaScript to handle navigation and don't link to things properly with `href=""` attributes.

### Delay Before Next Page

Waits on the page for a set period of elapsed time after any behaviors have finished running. This can be helpful to avoid rate limiting however it will slow down your crawl.

## Browser Settings

Configure the browser used to visit URLs during the crawl.

### Browser Profile

Sets the [_Browser Profile_](browser-profiles.md) to be used for this crawl.

### Browser Windows

Sets the number of browser windows that are used to visit webpages while crawling. Increasing the number of browser windows will speed up crawls by capturing more pages in parallel.

There are some trade-offs:

- This may result in a higher chance of getting rate limited due to the increase in traffic sent to the website.
- More execution minutes will be used per-crawl.

### Crawler Release Channel

Sets the release channel of [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) to be used for this crawl. Crawls started by this workflow will use the latest crawler version from the selected release channel. Generally "Default" will be the most stable, however others may have newer features (or bugs)!  

This setting will only be shown if multiple different release channels are available for use.

### Block Ads by Domain

Will prevent any content from the domains listed in [Steven Black's Unified Hosts file](https://github.com/StevenBlack/hosts) (ads & malware) from being captured by the crawler.

### User Agent

Sets the browser's [user agent](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/User-Agent) in outgoing requests to the specified value. If left blank, the crawler will use the Brave browser's default user agent. For a list of common user agents see [useragents.me](https://www.useragents.me/).

??? example "Using custom user agents to get around restrictions"
    Despite being against best practices, some websites will block specific browsers based on their user agent: a string of text that browsers send web servers to identify what type of browser or operating system is requesting content. If Brave is blocked, using a user agent string of a different browser (such as Chrome or Firefox) may be sufficient to convince the website that a different browser is being used.

    User agents can also be used to voluntarily identify your crawling activity, which can be useful when working with a website's owners to ensure crawls can be completed successfully. We recommend using a user agent string similar to the following, replacing the `orgname` and URL comment with your own:

    ```
    Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.3 orgname.browsertrix (+https://example.com/crawling-explination-page)
    ```

    If you have no webpage to identify your organization or statement about your crawling activities available as a link, omit the bracketed comment section at the end entirely.

    This string must be provided to the website's owner so they can allowlist Browsertrix to prevent it from being blocked.

### Language

Sets the browser's language setting. Useful for crawling websites that detect the browser's language setting and serve content accordingly.

### Proxy

Sets the proxy server that [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) will direct traffic through while crawling. When a proxy is selected, crawled websites will see traffic as coming from the IP address of the proxy rather than where the Browsertrix Crawler node is deployed.

## Scheduling

Automatically start crawls periodically on a daily, weekly, or monthly schedule.

!!! tip "Tip: Scheduling crawl workflows with logged-in browser profiles"
    Some websites will log users out after a set period of time. When crawling with a custom [browser profile](browser-profiles.md) that is logged into a website, we recommend checking the profile before crawling to ensure it is still logged in.

    This can cause issues with scheduled crawl workflows — which will run even if the selected browser profile has been logged out.

### Crawl Schedule Type

`Run Immediately on Save`
:   When selected, the crawl will run immediately as configured. It will not run again unless manually instructed.

`Run on a Recurring Basis`
:   When selected, additional configuration options for instructing the system when to run the crawl will be shown. If a crawl is already running when the schedule is set to activate it, the scheduled crawl will not run.

`No Schedule`
:   When selected, the configuration options that have been set will be saved but the system will not do anything with them unless manually instructed.

### Frequency

Set how often a scheduled crawl will run.

### Day

Sets the day of the week for which crawls scheduled with a `Weekly` _Frequency_ will run.

### Date

Sets the date of the month for which crawls scheduled with a `Monthly` _Frequency_ will run.

### Start Time

Sets the time that the scheduled crawl will start according to your current timezone.

## Metadata

Describe and organize your crawl workflow and the resulting archived items.

### Name

Allows a custom name to be set for the workflow. If no name is set, the workflow's name will be set to the _Crawl Start URL_. For Page List crawls, the workflow's name will be set to the first URL present in the _Crawl URL(s)_ field, with an added `(+x)` where `x` represents the total number of URLs in the list.

### Description

Leave optional notes about the workflow's configuration.

### Tags

Apply tags to the workflow. Tags applied to the workflow will propagate to every crawl created with it at the time of crawl creation.

### Collection Auto-Add

Search for and specify [collections](collection.md) that this crawl workflow should automatically add archived items to as soon as crawling finishes. Canceled and Failed crawls will not be added to collections.
