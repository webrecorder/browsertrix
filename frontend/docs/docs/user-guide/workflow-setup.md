# Crawl Workflow Settings

One of the key features of Browsertrix is the ability to refine crawler settings to the exact specifications of your crawl and website.

Changes to a setting will only apply to subsequent crawls.

Crawl settings are shown in the crawl workflow detail **Settings** tab and in the archived item **Crawl Settings** tab.

## Scope

Specify the range and depth of your crawl.

### Crawl Scope

The crawl scope selects pages to be crawled based on the [provided URL](#crawl-start-url-urls-to-crawl).

Crawl scopes are categorized as a **Page Crawl** or **Site Crawl**:

#### Page Crawl

:   Choose one of these crawl scopes if you know the URL of every page you'd like to crawl and don't need to include any additional pages beyond one link out.

    A page-based scope can be simpler to configure, since you don't need to worry about configuring the workflow to exclude parts of the website that you may not want to archive.

    ??? info "Page Crawl Use Cases"
        - You want to archive a social media post (`Single Page`)
        - You have a list of URLs that you can copy-and-paste (`List of Pages`)
        - You want to include URLs with different domain names in the same crawl (`List of Pages`)

#### Site Crawl

:   Choose one of these crawl scopes to have the the crawler automatically discover pages based on a domain name, start page URL, or directory on a website.

    Site-based scopes are great for advanced use cases where you don't need (or want) to know every single URL of the website that you're archiving.

    ??? info "Site Crawl Use Cases"
        - You're archiving a subset of a website, like everything under _website.com/your-username_ (`Pages in Same Directory`)
        - You're archiving an entire website _and_ external pages linked to from the website (`Pages on Same Domain` + _Include Directly Linked Pages_ checked)

The crawl scope is your starting point for scoping. The scope can be expanded to include more pages or limited to less pages by combining the crawl scope with [Additional Scope](#additional-scope) and [Exclude Pages](#exclude-pages) settings.

### Page Crawl Scopes

#### Single Page

:   Crawls a single URL.

#### List of Pages

:   Crawls a list of specified URLs.

    Select one of two options to provide a list of URLs:

    _Enter URLs_
    :    If the list is small enough, 100 URLs or less, the URLs can be entered directly into the text area. If a large list is pasted into the textbox, it will be converted into an uploaded URL list and attached to the workflow.

    _Upload URL List_
    :    A longer list of URLs can be provided as a text file, containing one URL per line. The text file may not exceed 25MB, but there is no limit to the number of URLs in the file. Once a file is added, a link will be provided to view the file (but not edit it). To change the file, a new file can be uploaded in its place.

        While the text file can contain an unlimited number of URLs, the crawl will still be limited by the [page limit](#max-pages) for the workflow or organization. URLs beyond the limit will not be crawled.

    For both options, each line should contain a valid URL (starting with `https://` or `http://`). Duplicate URLs will be skipped. Invalid URLs will be ignored unless _[Fail Crawl if Any URL Fails](#fail-crawl-if-any-url-fails)_ is enabled, in which case the crawl will fail. The crawl will always fail if the entered URL list contains no valid URLs or if the file is not a list of URLs.

    ##### Fail Crawl if Any URL Fails

    If enabled, the crawler will exit upon encountering any URL that fails to load. No crawled content will be saved and the workflow status will be <span class="status-red-600">:bootstrap-x-octagon-fill: Failed</span>.

#### In-Page Links

:   Crawls only the specified URL and treats linked sections of the page as distinct pages.

    Any link that begins with the _Crawl Start URL_ followed by a hashtag symbol (`#`) and then a string is considered an in-page link. This is commonly used to link to a section of a page. For example, because the "Scope" section of this guide is linked by its heading as `/user-guide/workflow-setup/#scope` it would be treated as a separate page under the _In-Page Links_ scope.

    This scope can also be useful for crawling websites that are single-page applications where each page has its own hash, such as `example.com/#/blog` and `example.com/#/about`.

### Site Crawl Scopes

#### Pages in Same Directory

:   Crawls pages in the same directory as the _Crawl Start URL_ and subdirectories.

    For example, if <https://webrecorder.net/blog/product> is provided, the following pages would also be crawled:

    - <https://webrecorder.net/blog/product/2>
    - <https://webrecorder.net/blog/2026-04-09-deduplication/>
    - <https://webrecorder.net/blog/resources>
    
    The following page would not be crawled: <https://webrecorder.net/resources> (because it's outside of the **`/blog/`** directory).

#### Pages on Same Domain

:   Crawls all pages on the same domain as the _Crawl Start URL_ and ignores subdomains (ex: `subdomain.example.com`).

    The `www` subdomain is an exemption; pages on `www.example.com` will be treated as the same domain as `example.com`. See [Special Treatment of Redirects](#special-treatment-of-redirects)

#### Pages on Same Domain + Subdomains

:   Crawls all pages on the domain and any linked subdomains. If `example.com` is set as the _Crawl Start URL_, both pages on `example.com` and `subdomain.example.com` will be crawled.

#### Custom Page Prefix

:   Crawls the _Crawl Start URL_ and only those pages that begin with the URLs listed in [_Page Prefix URLs_](#page-prefix-urls).

#### Custom Page Match

:   Crawls the _Crawl Start URL_ only those pages with URLs that match the regular expression patterns listed in [_Page Regex Patterns_](#page-regex-patterns).

### Crawl Start URL / URL(s) to Crawl

This is the URL used by the crawler to select pages to crawl and initiate the crawling process. The URL input may be labeled _Crawl Start URL_ or _URL(s) to Crawl_ depending on which crawl scope is used:

| Crawl Scope | Label | Description |
| ----------- | ----- | ----------- |
| Single Page | URL&nbsp;to&nbsp;Crawl | The crawler will visit only this URL. |
| List of Pages | URLs&nbsp;to&nbsp;Crawl | The crawler will visit each URL specified in the text list or file. |
| - In-Page Links<br/>- Pages in Same Directory<br/>- Pages on Same Domain<br/>- Pages on Same Domain + Subdomains<br/>- Custom Page Prefix | Crawl&nbsp;Start&nbsp;URL | The crawler will visit this URL as its starting point and use this URL to collect information on which linked pages it should also visit. |

URLs must follow [valid URL syntax](https://www.w3.org/Addressing/URL/url-spec.html). For example, if you're crawling a page that can be accessed on the public internet, your URL should start with `http://` or `https://`.

Refer to a specific [_Crawl Scope_ option](#crawl-scope) for details on how each crawl scope interacts with this URL.

#### Special Treatment of Redirects

Browsertrix will handle redirects from `http` to `https` and a bare domain to the `www` subdomain gracefully. This means that if `webrecorder.net` redirects to `www.webrecorder.net`, `www.webrecorder.net` will be treated as being the same domain in the context of crawl scope.

??? example "Crawling with HTTP basic auth"

    All crawl scopes support [HTTP Basic Auth](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication) which can be provided as part of the URL, for example: `https://username:password@example.com`.

    **These credentials WILL BE WRITTEN into the archive.** We recommend exercising caution and only archiving with dedicated archival accounts, changing your password or deleting the account when finished.

### Configure Site Crawl

Choosing a crawl scope that belongs to the _Site Crawl_ category will enable additional options that modify the crawl scope.

#### Max Discovery Depth

When using a domain-based crawl scope, adds a limit to how far the crawler should recursively visit same-domain hyperlinks away from the starting page.

#### Page Prefix URLs

When using a scope of `Custom Page Prefix`, this field accepts a list of URLs that a page URL should begin with if it is to be crawled.

For example, specifying `https://example.com/new` will capture the following:

- `https://example.com/new?page=1`
- `https://example.com/newsworthy`

By default, _Page Prefix URLs_ will be prefilled with the _Crawl Start URL_ up to the last slash (`/`). That is, if `https://example.com/path/page` is set as the _Crawl Start URL_, `https://example.com/path/` will be automatically added to _Page Prefix URLs_. This URL prefix can then be removed or modified as needed.

!!! tip "Use Case: Crawl website that uses multiple TLDs"
    This field can be useful for crawling websites that span multiple top-level domains (e.g. `example.org` and `example.net`) by specifying each domain in the list.

#### Page Regex Patterns

When using a scope of `Custom Page Match`, this field accepts a list of regular expressions (regexes) that will be matched against page URLs to be crawled.

For example, specifying `/new$` will capture the following:

- `https://example.com/new`
- `https://example.com/blog/new`

A URL like `https://example.com/newsworthy` would not be captured due to the `$` assertion indicating that the URL should end with `new`.

Patterns should be written in the JavaScript regular expression syntax without the enclosed slashes, as it would be passed to a [`RegExp` constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/RegExp). See [Writing a Regular Expression Pattern (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#writing_a_regular_expression_pattern) for examples.

!!! tip "Use Case: Crawl website that uses multiple protocols"
    This field can be useful for crawling websites that link to both `http` and `https` pages by using a regex pattern like `^https?://example.com`. The `?` quantifier indicates that that the preceding character `s` is to be matched 0 times (in the case of `http`) or 1 time (in the case of `https`.)

#### Use Sitemap

`Named “Check for sitemap” prior to v1.24`{ .callout-blue }

When enabled, the crawler will check for a sitemap at `/sitemap.xml` and `/robots.txt` and use it to discover pages that match the crawl scope.

This can be useful for selecting pages on a website that are not hyperlinked and may not otherwise be captured.

#### Custom Link Selectors

Instructs the crawler which HTML elements should be used to extract URLs, i.e. considered a “link.” By default, the crawler checks the `href` value of all anchor (`<a>`) elements on a page.

Specifying a custom link selector can be useful for websites that hyperlink to pages using an element other than the standard `<a>` tag, or use an attribute other than `href` to specify the URL.

For example, for a page with the given HTML markup:

```html
<button class="link" data-href="/blog">Blog</button>
<button class="link" data-href="/about">About</button>
```

The _CSS Selector_ for a custom link selector could be `button.link` and its _Link Attribute_ would be `data-href`.

See [Basic CSS selectors (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Basic_selectors) for examples of valid CSS selectors.

### Additional Scope

To include more pages than what is selected by the [crawl scope](#crawl-scope), you can specify scoping rules that will add those pages to the scope.

#### Include Directly Linked Pages

`Named “Include any linked page (“one hop out”)” prior to v1.24`{ .callout-blue }

When enabled, the crawler will follow any hyperlink that is on a page selected by the crawl scope. This can be useful for capturing supplementary pages without having to manually add their URLs.

Links will only be followed one level deep (aka “one hop out”). For example, given a site crawl of [webrecorder.net](https://webrecorder.net/), the crawler will visit [github.com/webrecorder](https://github.com/webrecorder/) because it is hyperlinked in the footer of the website. The crawler will _not_ visit any of the links on the GitHub page (like [github.com/webrecorder/browsertrix](https://github.com/webrecorder/browsertrix/)) because those links are two visits (or “hops”) away from the crawl URL that is in scope.

#### Use Smart Scoping Rules

`New in v1.24`{ .callout-green }

Smart scoping rules reduce the complexity associated with scoping social media sites. When enabled, scoping rules for major social media platforms and other page-specific scoping rules will be automatically applied to the workflow. This setting is only applicable if a page selected by the crawl scope is hosted by a social media platform that Browsertrix supports, or if the page is selected by a custom behavior.

We recommend keeping this setting enabled to ensure that pages from social media sites are archived to completion and are replayable. Disabling this setting may result in replay issues for popular social media platforms.

Browsertrix provides smart scoping rules for the following sites:

| **Platform Name** | **Page Host** | **Applicable Pages** |
|-------------------|---------------|----------------------|
| Facebook          | facebook.com  | Timeline             |
| Instagram         | instagram.com | Profile              |

##### Custom Scoping Rules

Scoping rules for other platforms can be added through [custom behavior scripts](#use-custom-behaviors). When _Use Smart Scoping Rules_ is enabled, any URLs added to the crawl through the [`addLink()`](https://crawler.docs.browsertrix.com/user-guide/behaviors/#additional-links-from-behaviors) method in a custom behavior will be queued regardless of whether they would otherwise be in scope.

Customizing scope through custom behaviors should only be done to achieve advanced use cases for sites that are not listed above, as Browsertrix’s built-in behaviors and scoping rules will take precedence over custom behavior scripts.

#### Additional URLs to Crawl

`Named “Additional Pages” prior to v1.24`{ .callout-blue }

A list of URLs of pages to crawl. Each line should contain a valid URL (starting with `https://` or `http://`). Invalid URLs will be ignored unless _[Fail Crawl if Any URL Fails](#fail-crawl-if-any-url-fails-for-additional-urls-to-crawl)_ is enabled.

#### Fail Crawl if Any URL Fails (For _Additional URLs to Crawl_)

If enabled, the crawler will exit upon encountering any URL in _Additional URLs to Crawl_ that fails to load. No crawled content will be saved and the workflow status will be <span class="status-red-600">:bootstrap-x-octagon-fill: Failed</span>.

### Exclude Pages

You can prevent the crawler from visiting parts of a website that you do not want to be archived by setting exclusion rules. Exclusion rules will be applied last, after crawl scope and additional scoping rules are applied.

#### Use Robots.txt Disallow List

`Named “Skip pages disallowed by robots.txt” prior to v1.24`{ .callout-blue }

When enabled, the crawler will check for a [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html) file at `/robots.txt` for each host encountered during crawling and skip any pages that are disallowed by the rules found therein.

#### Custom Exclusion Rules

Exclusion rules instruct the crawler to ignores pages with URLs that match a specified pattern. Patterns can be written as plain text or a regular expression per selected _Exclusion Type_:

##### Matches Text

:   Text patterns will be matched against any part of the URL. For example, a text pattern of `chi` will apply to `https://en.wikipedia.org/wiki/Web_archiving` (<code>ar**chi**ving</code>) and `https://www.chicago.gov` (<code>**chi**cago</code>).

    Text patterns are case-sensitive. For example, `web` will apply to `https://webrecorder.net` but not `https://en.wikipedia.org/wiki/Web_archiving` since `Web` is capitalized.

##### Regex

:   Regular expressions (Regex) can be used to perform more complex matching. Regex patterns should be written in the JavaScript regular expression syntax without the enclosed slashes, as it would be passed to a [RegExp constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#writing_a_regular_expression_pattern).

    Example: If `#!regex \babout\/?\b` is entered, `example.com/about/` will not be crawled however `example.com/aboutme/` will be crawled.

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

[Custom behaviors](behaviors.md#custom) can be enabled by specifying the location of the behavior script. Scripts can be provided through one of two source options:

#### URL

:   A URL for a single JavaScript or JSON behavior file to download. This should be a URL that the crawler has access to. The workflow editor will validate that the supplied URL can be reached.

#### Git repository

:   A URL for a public Git repository containing one or more behavior files. Optionally, you can specify a branch and/or a relative path within the repository to specify exactly which behavior files within the repository should be used. The workflow editor will validate that the URL can be reached and is a Git repository. If a branch name is specified, the workflow editor will also validate that the branch exists in the Git repository.

Custom behaviors will take precedence over the default [_Autoscroll_](#autoscroll) and [_Autoclick_](#autoclick) behaviors and may be overridden by platform-specific behaviors (see [Behavior Precedence](behaviors.md#behavior-precedence)).

_**Page Timing**_

Page timing gives you more granular control over how long the browser should stay on a page and when behaviors should run on a page. Add limits to decrease the amount of time the browser spends on a page, and add delays to increase the amount of time the browser waits on a page. Adding delays will increase the total amount of time spent on a crawl and may impact your overall crawl minutes.

### Page Load Limit

Limits amount of elapsed time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.

### Delay After Page Load

Waits on the page after initial HTML page load for a set number of seconds prior to moving on to next steps such as link extraction and behaviors. Can be useful with pages that are slow to load page contents.

### Behavior Limit

Limits the amount of elapsed time that behaviors have to complete.

### Delay Before Next Page

Waits on the page for a set number of seconds before unloading the current page. If any [behaviors](#autoscroll) are enabled, this delay will take place after all behaviors have finished running. This can be helpful to avoid rate limiting.

## Browser Settings

Configure the browser used to visit URLs during the crawl.

### Browser Profile

Sets the [_Browser Profile_](browser-profiles/browser-profiles-overview.md) to be used for this crawl.

!!! Tip "Best Practices: Use login profiles dedicated to crawling"
    We highly recommend avoiding use of your personal accounts when logging into websites during the profile creation process. Crawling with a browser profile that uses your personal account may expose you to risks such as compromised private tokens and unwanted sharing of user preferences. Although accounts dedicated to crawling are not necessary to benefit from browser profiles, they can address these potential issues and more. [Continue reading about dedicated accounts](browser-profiles/browser-profiles-overview.md#use-logins-dedicated-to-web-archiving)

### Fail Crawl if Not Logged In

When enabled, the crawl will fail if a [page behavior](#page-behavior) detects the presence or absence of content on supported pages indicating that the browser is not logged in.

For details about which websites are supported and how to add this functionality to your own [custom behaviors](#use-custom-behaviors), see the [Browsertrix Crawler documentation for Fail on Content Check](https://crawler.docs.browsertrix.com/user-guide/behaviors/#fail-on-content-check).

### Include Browser Storage Data

When enabled, instructs the crawler to save the browser's `localStorage` and `sessionStorage` data for each page in the web archive as part of the `WARC-JSON-Metadata` field. Enabling this option is recommended to properly archive and replay certain websites, as long as privacy and security implications have been reviewed.

!!! Warning "Privacy & security implications when used with browser profiles"
    Websites can use browser storage to store arbitrary data. During the browser profile creation process, some websites may save sensitive data such as login information and user-identifying preferences in browser storage. Since every website can implement browser storage differently, Browsertrix does not attempt to detect whether the information stored is potentially sensitive.

    Use caution when sharing WACZ files created with this option enabled, especially if you’re crawling pages that require login. We always recommend creating dedicated website logins to be used only for crawling to mitigate the risk of compromised login information.

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
| `@monthly` |  Run once a month at midnight of the first day of the month |
| `@weekly` | Run once a week at midnight on Sunday |
| `@daily` | Run once a day at midnight |
| `@hourly` | Run once an hour at the beginning of the hour |

You can use a tool like [crontab.guru](https://crontab.guru/) to check Cron syntax validity and view [common expressions](https://crontab.guru/examples.html).

Cron schedules are always in [UTC](https://en.wikipedia.org/wiki/Coordinated_Universal_Time).

## Deduplication

!!! info "Deduplication is in Beta"

    As of the current release, the feature is still in beta and may not be available to all users.
    If you don't see the options below, consult your admin or reach out to support to request access.

Prevent duplicate content from being crawled and stored.

### Crawl Deduplication

#### No Deduplication

:   When selected, deduplication will not be enabled in crawls of this workflow.

#### Deduplicate using a collection

:   When selected, crawls of this workflow will reference items in the specified Collection to Use when checking for new content and URLs.

### Collection to Use

Specify the collection to use as the deduplication source. All crawls of the workflow will be automatically added to this collection.

#### Collection Name

Name of the collection to use. If the name entered does not belong to an existing collection, a new collection will be created upon saving the workflow.

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
