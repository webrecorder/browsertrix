# Crawl Workflow Settings

One of the key features of Browsertrix is the ability to refine crawler settings to the exact specifications of your crawl and website.

Changes to a setting will only apply to subsequent crawls.

Crawl settings are shown in the crawl workflow detail **Settings** tab and in the archived item **Crawl Settings** tab.

## Scope

Specify the range and depth of your crawl.

Crawl scopes are categorized as a **Page Crawl** or **Site Crawl**:

#### Page Crawl
:   Choose one of these crawl scopes if you know the URL of every page you'd like to crawl and don't need to include any additional pages beyond one hop out.

    A Page Crawl workflow can be simpler to configure, since you don't need to worry about configuring the workflow to exclude parts of the website that you may not want to archive.

    ??? info "Page Crawl Use Cases"
        - You want to archive a social media post (`Single Page`)
        - You have a list of URLs that you can copy-and-paste (`List of Pages`)
        - You want to include URLs with different domain names in the same crawl (`List of Pages`)

#### Site Crawl
:   Choose one of these crawl scopes to have the the crawler automatically find pages based on a domain name, start page URL, or directory on a website.

    Site Crawl workflows are great for advanced use cases where you don't need (or want) to know every single URL of the website that you're archiving.

    ??? info "Site Crawl Use Cases"
        - You're archiving a subset of a website, like everything under _website.com/your-username_ (`Pages in Same Directory`)
        - You're archiving an entire website _and_ external pages linked to from the website (`Pages on Same Domain` + _Include Any Linked Page_ checked)

### Crawl Scope Options

#### Page Crawl

##### Single Page
:   Crawls a single URL and does not include any linked pages.

##### List of Pages
:   Crawls a list of specified URLs.

    Select one of two options to provide a list of URLs:

    ###### Enter URLs
    :    If the list is small enough, 100 URLs or less, the URLs can be entered directly into the text area. If a large list is pasted into the textbox, it will be converted into an uploaded URL list and attached to the workflow.

    ###### Upload URL List
    :    A longer list of URLs can be provided as a text file, containing one URL per line. The text file may not exceed 25MB, but there is no limit to the number of URLs in the file. Once a file is added, a link will be provided to view the file (but not edit it). To change the file, a new file can be uploaded in its place.

    For both options, each line should contain a valid URL (starting with https:// or http://). Invalid or duplicate URLs will be skipped. The crawl will fail if the list contains no valid URLs or if the file is not a list of URLs.

    While the uploaded text file can contain an unlimited number of URLs, the crawl will still be limited by the [page limit](#max-pages) for the workflow or organization - URLs beyond the limit will not be crawled.

    If both a list of entered list and an uploaded file are provided, the currently selected option will be used.

##### In-Page Links
:   Crawls only the specified URL and treats linked sections of the page as distinct pages.

    Any link that begins with the _Crawl Start URL_ followed by a hashtag symbol (`#`) and then a string is considered an in-page link. This is commonly used to link to a section of a page. For example, because the "Scope" section of this guide is linked by its heading as `/user-guide/workflow-setup/#scope` it would be treated as a separate page under the _In-Page Links_ scope.

    This scope can also be useful for crawling websites that are single-page applications where each page has its own hash, such as `example.com/#/blog` and `example.com/#/about`.

#### Site Crawl

##### Pages in Same Directory
:   This scope will only crawl pages in the same directory as the _Crawl Start URL_. If `example.com/path` is set as the _Crawl Start URL_, `example.com/path/path2` will be crawled but `example.com/path3` will not.

##### Pages on Same Domain
:   This scope will crawl all pages on the domain entered as the _Crawl Start URL_ however it will ignore subdomains such as `subdomain.example.com`.

##### Pages on Same Domain + Subdomains
:   This scope will crawl all pages on the domain and any subdomains found. If `example.com` is set as the _Crawl Start URL_, both pages on `example.com` and `subdomain.example.com` will be crawled.

##### Pages with URL Prefix
:   This scope will crawl the _Crawl Start URL_ and then include only those pages that begin with the URLs listed in [_Page Prefix URLs_](#page-prefix-urls).

##### Custom Page Match
:   This scope will crawl the _Crawl Start URL_ and then include only those pages with URLs that match the regular expression patterns listed in [_Page Regex Patterns_](#page-regex-patterns).

### Crawl Start URL / URL(s) to Crawl

This is the URL used by the crawler to initiate the crawling process. The URL input may be labeled _Crawl Start URL_ or _URL(s) to Crawl_ depending on which crawl scope is used:

| Crawl Scope | Label | Description |
| ----------- | ----- | ----------- |
| _Single Page_ | URL&nbsp;to&nbsp;Crawl | The crawler will visit only this URL. |
| _List of Pages_ | URLs&nbsp;to&nbsp;Crawl | The crawler will visit each URL specified in the text list or file. |
| _In-Page Links_<br/>_Pages in Same Directory_<br/>_Pages on Same Domain_<br/>_Pages on Same Domain + Subdomains_<br/>_Custom Page Prefix_ | Crawl&nbsp;Start&nbsp;URL | The crawler will visit this URL as its starting point and use this URL to collect information on which linked pages it should also visit. |


URLs must follow [valid URL syntax](https://www.w3.org/Addressing/URL/url-spec.html). For example, if you're crawling a page that can be accessed on the public internet, your URL should start with `http://` or `https://`.

Refer to a specific [_Crawl Scope_ option](#crawl-scope-options) for details on how each crawl scope interacts with this URL.

??? example "Crawling with HTTP basic auth"

    All crawl scopes support [HTTP Basic Auth](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication) which can be provided as part of the URL, for example: `https://username:password@example.com`.

    **These credentials WILL BE WRITTEN into the archive.** We recommend exercising caution and only archiving with dedicated archival accounts, changing your password or deleting the account when finished.

### Skip Pages Disallowed By Robots.txt

When enabled, the crawler will check for a [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html) file at /robots.txt for each host encountered during crawling and skip any pages that are disallowed by the rules found therein.

### Include Any Linked Page

When enabled, the crawler will visit all the links it finds within each URL defined in the [URL input field](#crawl-start-url-urls-to-crawl) under _Crawl Scope_.

??? example "Crawling tags & search queries with Page List crawls"
    This setting can be useful for crawling a list of specific pages and pages they link to, such as a list of search queries. For example, you can add a list of multiple URLs such as: `https://example.com/search?q=search_this`, `https://example.com/search?q=also_search_this`, etc... to the _URLs to Crawl_ text box and enable _Include Any Linked Page_ to crawl all the content present on these search query pages.

### Fail Crawl if Not Logged In

When enabled, the crawl will fail if a [page behavior](#page-behavior) detects the presence or absence of content on supported pages indicating that the browser is not logged in.

For details about which websites are supported and how to add this functionality to your own [custom behaviors](#use-custom-behaviors), see the [Browsertrix Crawler documentation for Fail on Content Check](https://crawler.docs.browsertrix.com/user-guide/behaviors/#fail-on-content-check).

### Fail Crawl on Failed URL

When enabled, the crawler will fail the entire crawl if any of the provided URLs are invalid or unsuccessfully crawled. The resulting archived item will have a status of "Failed".

### Max Depth in Scope

Instructs the crawler to stop visiting new links past a specified depth.

### Page Prefix URLs

When using a scope of `Pages with URL Prefix`, this field accepts a list of URLs that a page URL should begin with if it is to be crawled.

For example, specifying `https://example.com/new` will capture the following:

- `https://example.com/new?page=1`
- `https://example.com/newsworthy`

By default, _Page Prefix URLs_ will be prefilled with the _Crawl Start URL_ up to the last slash (`/`). That is, if `https://example.com/path/page` is set as the _Crawl Start URL_, `https://example.com/path/` will be automatically added to _Page Prefix URLs_. This URL prefix can then be removed or modified as needed.

!!! tip "Use Case: Crawl website that uses multiple TLDs"
    This field can be useful for crawling websites that span multiple top-level domains (e.g. `example.org` and `example.net`) by specifying each domain in the list.

### Page Regex Patterns

When using a scope of `Custom Page Match`, this field accepts a list of regular expressions (regexes) that will be matched against page URLs to be crawled.

For example, specifying `/new$` will capture the following:

- `https://example.com/new`
- `https://example.com/blog/new`

A URL like `https://example.com/newsworthy` would not be captured due to the `$` assertion indicating that the URL should end with `new`.

Patterns should be written in the JavaScript regular expression syntax without the enclosed slashes, as it would be passed to a [`RegExp` constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/RegExp). See [Writing a Regular Expression Pattern (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#writing_a_regular_expression_pattern) for examples.

!!! tip "Use Case: Crawl website that uses multiple protocols"
    This field can be useful for crawling websites that link to both `http` and `https` pages by using a regex pattern like `^https?://example.com`. The `?` quantifier indicates that that the preceding character `s` is to be matched 0 times (in the case of `http`) or 1 time (in the case of `https`.)

### Include Any Linked Page ("one hop out")

When enabled, the crawler bypasses the _Crawl Scope_ setting to visit links it finds in each page within scope. The crawler will not visit links it finds in the pages found outside of scope (hence only "one hop out".)

This can be useful for capturing links on a page that lead outside the website that is being crawled but should still be included in the archive for context.

### Check For Sitemap

When enabled, the crawler will check for a sitemap at /sitemap.xml and use it to discover pages to crawl if found. It will not crawl pages found in the sitemap that do not meet the crawl's scope settings or limits.

This can be useful for discovering and capturing pages on a website that aren't linked to from the seed and which might not otherwise be captured.

### Link Selectors

Instructs the crawler which HTML elements should be used to extract URLs, i.e. considered a “link.” By default, the crawler checks the `href` value of all anchor (`<a>`) elements on a page.

Specifying a custom link selector can be useful for websites that hyperlink to pages using an element other than the standard `<a>` tag, or use an attribute other than `href` to specify the URL.

For example, for a page with the given HTML markup:

```html
<button class="link" data-href="/blog">Blog</button>
<button class="link" data-href="/about">About</button>
```

The _CSS Selector_ for a custom link selector could be `button.link` and its _Link Attribute_ would be `data-href`.

See [Basic CSS selectors (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Basic_selectors) for examples of valid CSS selectors.

### Additional Pages

A list of page URLs outside of the _Crawl Scope_ to include in the crawl.

### Exclude Pages

The exclusions table will instruct the crawler to ignore links it finds on pages where all or part of the link matches an exclusion found in the table. The table is only available in Page List crawls when _Include Any Linked Page_ is enabled.

This can be useful for avoiding crawler traps — sites that may automatically generate pages such as calendars or filter options — or other pages that should not be crawled according to their URL.

#### Matches text
:   Will perform simple matching of entered text and exclude all URLs where matching text is found.

    e.g: If `about` is entered, `example.com/aboutme/` will not be crawled.

#### Regex
:   Regular expressions (Regex) can also be used to perform more complex matching.

    e.g: If `#!regex \babout\/?\b` is entered, `example.com/about/` will not be crawled however `example.com/aboutme/` will be crawled.

## Crawl Limits

Enforce maximum limits on your crawl.

### Max Pages

Adds a hard limit on the number of pages that will be crawled. The crawl will be gracefully stopped after this limit is reached.

### Crawl Time Limit

The crawl will be gracefully stopped after this set period of elapsed time.

### Crawl Size Limit

The crawl will be gracefully stopped after reaching this set size in GB.

## Page Behavior

Customize how and when the browser performs specific operations on a page.

_**Behaviors**_

Behaviors are browser operations that can be enabled for additional page interactivity.

### Autoscroll

When enabled, the browser will automatically scroll to the end of the page.

### Autoclick

When enabled, the browser will automatically click on all link-like elements.

When clicking a link-like element that would normally result in navigation, autoclick will only record the click and prevent navigation away from the current page.

??? Info "Autoclick use cases"
    This behavior can be helpful for:

    - Websites that use anchor links (`<a>`) in non-standard ways, such as by using JavaScript in place of the standard `href` attribute to create a hyperlink.

    - Websites that use `<a>` in place of a `<button>` to reveal in-page content.

#### Click Selector

When autoclick is enabled, you can customize which element is automatically clicked by specifying a CSS selector.

See [Basic CSS selectors (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Basic_selectors) for examples of valid CSS selectors.

### Use Custom Behaviors

Enable custom behaviors to add your own behavior scripts. See [Browser Behaviors crawler documentation](https://crawler.docs.browsertrix.com/user-guide/behaviors/#built-in-behaviors) on creating custom behaviors.

Custom behaviors can be specified as:

#### URL

A URL for a single JavaScript or JSON behavior file to download. This should be a URL that the crawler has access to. The workflow editor will validate that the supplied URL can be reached.

#### Git repository

A URL for a public Git repository containing one or more behavior files. Optionally, you can specify a branch and/or a relative path within the repository to specify exactly which behavior files within the repository should be used. The workflow editor will validate that the URL can be reached and is a Git repository. If a branch name is specified, the workflow editor will also validate that the branch exists in the Git repository.

_**Page Timing**_

Page timing gives you more granular control over how long the browser should stay on a page and when behaviors should run on a page. Add limits to decrease the amount of time the browser spends on a page, and add delays to increase the amount of time the browser waits on a page. Adding delays will increase the total amount of time spent on a crawl and may impact your overall crawl minutes.

### Page Load Limit

Limits amount of elapsed time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.

### Delay After Page Load

Waits on the page after initial HTML page load for a set number of seconds prior to moving on to next steps such as link extraction and behaviors. Can be useful with pages that are slow to load page contents.

### Behavior Limit

Limits amount of elapsed time behaviors have to complete.

### Delay Before Next Page

Waits on the page for a set number of seconds before unloading the current page. If any [behaviors](#autoscroll) are enabled, this delay will take place after all behaviors have finished running. This can be helpful to avoid rate limiting.

## Browser Settings

Configure the browser used to visit URLs during the crawl.

### Browser Profile

Sets the [_Browser Profile_](browser-profiles/browser-profiles-overview.md) to be used for this crawl.

### Crawler Proxy Server

!!! Info "This setting will be shown if the organization supports multiple proxies."

Sets the proxy server that [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) will direct traffic through while crawling. When a proxy is selected, crawled websites will see traffic as coming from the IP address of the proxy rather than where Browsertrix Crawler is deployed.

If a _Browser Profile_ is specified, this field will be disabled and the proxy settings of the browser profile will be used when crawling. This prevents potential crawl failures that result from conflicting proxies.

### Browser Windows

Sets the number of browser windows that are used to visit webpages while crawling. Increasing the number of browser windows will speed up crawls by capturing more pages in parallel.

There are some trade-offs:

- This may result in a higher chance of getting rate limited due to the increase in traffic sent to the website.
- More execution minutes will be used per-crawl.

### Crawler Release Channel

!!! Info "This setting will be shown if the organization supports multiple release channels."

Sets the release channel of [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler). Crawls of this workflow will use the latest crawler version from the selected release channel. Generally reserved for advanced use cases, such as enabling experimental features that may not have been fully tested yet.

### Block Ads by Domain

Will prevent any content from the domains listed in [Steven Black's Unified Hosts file](https://github.com/StevenBlack/hosts) (ads & malware) from being captured by the crawler.

### Save Local and Session Storage

When enabled, instructs the crawler to save the browser's `localStorage` and `sessionStorage` data for each page in the web archive as part of the `WARC-JSON-Metadata` field. This option may be necessary to properly archive and replay certain websites. Use caution when sharing WACZ files created with this option enabled, as the saved browser storage may contain sensitive information.

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

## Scheduling

Automatically start crawls periodically on a daily, weekly, or monthly schedule.

### Crawl Schedule Type

#### Run on a Recurring Basis
:   When selected, additional configuration options for instructing the system when to run the crawl will be shown. If a crawl is already running when the schedule is set to activate it, the scheduled crawl will not run.

    !!! tip "Tip: Scheduling crawl workflows with logged-in browser profiles"
        Some websites will log users out after a set period of time. This can cause issues with scheduled crawl workflows—which will run even if the [selected browser profile](./browser-profiles/browser-profiles-overview.md) has been logged out.
    
        For some websites, a short schedule frequency can help keep the browser profile logged in by regularly and [automatically refreshing the login session](./browser-profiles/usage-in-crawls.md#effects-of-crawling). A separate crawl workflow could be created for this purpose. We recommend manually [checking the profile](./browser-profiles/configure-sites.md#saved-sites) periodically to ensure that it is still logged in.

#### No Schedule
:   When selected, the configuration options that have been set will be saved but the system will not do anything with them unless manually instructed.

### Frequency

Set how often a scheduled crawl will run.

#### Options

All option support specifying the specific hour and minute the crawl should run.

##### Daily

Run crawl once every day.

##### Weekly

Run crawl once every week.

##### Monthly

Run crawl once every month.

##### Custom

Run crawl at a custom interval, such as hourly or yearly. See [Cron Schedule](#cron-schedule) for details.

### Day

Sets the day of the week for which crawls scheduled with a `Weekly` _Frequency_ will run.

### Date

Sets the date of the month for which crawls scheduled with a `Monthly` _Frequency_ will run.

### Start Time

Sets the time that the scheduled crawl will start according to your current timezone.

### Cron Schedule

When using a `Custom` _Frequency_, a custom schedule can be specified by using a Cron expression or supported macros.

Cron expressions should follow the Unix Cron format:

| Position | * | * | * | * | * |
| - | - | - | - | - | - |
| **Description** | minute | hour | day of the month | month | day of the week |
| **Possible Values** | 0 - 59 | 0 - 23 | 1 - 31 | 1 - 12 | 0 - 6<br/>or `sun`, `mon`, `tue`, `wed`, `thu`, `fri`, `sat` |

For example, `0 0 31 12 *` would run a crawl on December 31st every year and `0 0 * * fri` would run a crawl every Friday at midnight.

Additionally, the following macros are supported:

| Value | Description |
| - | - |
| `@yearly` | Run once a year at midnight of 1 January |
| `@monthly` | 	Run once a month at midnight of the first day of the month |
| `@weekly` | Run once a week at midnight on Sunday |
| `@daily` | Run once a day at midnight |
| `@hourly` | Run once an hour at the beginning of the hour |

You can use a tool like [crontab.guru](https://crontab.guru/) to check Cron syntax validity and view [common expressions](https://crontab.guru/examples.html).

Cron schedules are always in [UTC](https://en.wikipedia.org/wiki/Coordinated_Universal_Time).

## Collections

### Auto-Add to Collection

Search for and specify [collections](collection.md) that this crawl workflow should automatically add archived items to as soon as crawling finishes. Canceled and Failed crawls will not be added to collections.

## Metadata

Describe and organize your crawl workflow and the resulting archived items.

### Name

Allows a custom name to be set for the workflow. If no name is set, the workflow's name will be set to the first URL to crawl specified in _Scope_. For _Page List_ crawls, the workflow name may show an added `+N` where `N` represents the number of URLs in addition to the first URL to crawl.

### Description

Leave optional notes about the workflow's configuration.

### Tags

Apply tags to the workflow. Tags applied to the workflow will propagate to every crawl created with it at the time of crawl creation.
