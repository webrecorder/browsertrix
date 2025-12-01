# Intro to Browser Profiles

Browser profiles are saved instances of a web browsing session that can be reused to preconfigure a website before it is crawled. For example, a website can be preconfigured to be logged in, which gives the crawler access to content that can only be viewed by logged-in users.

!!! tip "Best practice: Use an account created specifically for archiving a website"

    We recommend creating dedicated accounts for archiving pages that are behind a login wall but otherwise public. Login walls are commonly used by social media platforms.

    Although dedicated accounts are not required to benefit from browser profiles, they can address the following potential issues:

    - While usernames and passwords are never saved by Browsertrix, the private tokens that enable access to logged in content are stored. Thus, anyone with access to your Browsertrix account, intentional or malicious, may be able to access the logged in content.

    - Some websites may rate limit or lock accounts for reasons they deem to be suspicious, such as logging in from a new geographical location or if the site determines crawls to be robot activity.

    - Personalized data such as cookies, location, etc. may be included in the resulting crawl.

    - The logged in interface may display unwanted personally identifiable information such as a username or profile picture.

    An exception to this practice is for when your  goal is to archive personalized or private content accessible only from designated accounts. In these instances we recommend changing the account's password after crawling is complete.

## Create a New Browser Profile

To create a new browser profile, press _New Browser Profile_ on the **Browser Profiles** page.

The following settings are displayed:

### Primary Site URL

The URL of the first page to visit in the embedded browser. For example, the login page for a social media website.

### Profile Name

A custom name for the browser profile. The domain name of the Primary Site URL will be used if this field is left blank.

Depending on your organization settings, additional settings may be available:

### Proxy Server

The proxy server to be used by the embedded browser as well as any crawl that uses this profile.

!!! tip "Implication for crawl workflows using proxies"

    When a browser profile is added to a crawl workflow, the browser profile’s proxy setting will take precedence over the crawl workflow’s Crawler Proxy Server setting. This prevents potential crawl failures that result from conflicting proxies.

### Crawler Release Channel

For advanced use cases, you can specify a Browsertrix Crawler release that contains another version of the embedded browser, such as a beta version that may contain experimental features.

Press _Start Browser_ to load the temporary embedded browser. It may take a few moments for the embedded browser to load. The browser profile will not be saved until _Create Profile_ is pressed.

## Configure Sites

Websites are configured through a temporary browser that is embedded directly in the Browsertrix interface. Every website that is visited using the embedded browser is added to the list of _Saved Sites_. When the embedded browser session ends, personalized data from the sites are collected into a profile. This profile of preconfigured sites can then be saved and used by multiple crawl workflows.

### Use Cases

The following are some common use cases for configuring a profile.

#### Website Sign In

To crawl content as a logged in user, log into the website you wish to archive as you would on any other browser. Once the account has been logged in, confirm by accessing a page on the site that the crawler should also have access to. You may need to periodically log in again as websites may log out users after a certain period of time.

#### Hide Popups

Websites may be required to get informed consent from users to track them, require their users to verify their age, or prompt users to choose their geographical location before displaying the rest of the page. Configure a browser profile to accept, dismiss, or otherwise hide these dialogs so that the content behind them is visible to the crawler

#### Advanced: Customize the Crawling Browser

The embedded browser used to configure profiles is the same browser behind Browsertrix’s high-fidelity crawls. This enables advanced use cases like using a browser profile to customize the browser used at crawl time. To view all available browser settings, load any site in the profile and then navigate to `brave://settings` in the embedded browser.

Note: This is for advanced use cases and it is not generally recommended to change these settings. We offer browser customization like ad blocking and language in workflow settings. Changing browser settings directly in the profile may result in conflicting settings that are difficult to troubleshoot. If using this advanced feature, we recommend adding clear metadata to the browser profile that describes the change.

??? example "Example: Blocking page resources with Brave's Shields"
    Whereas the crawler's scoping settings can be used to define which pages should be crawled, Brave's [Shields](https://brave.com/shields/) feature can block resources on pages from being loaded. By default, Shields will block [EasyList's cookie list](https://easylist.to/) but it can be set to block a number of other included lists under Brave `Settings > Shields > Filter Lists`.

    _Custom Filters_ can also be useful for blocking sites with resources that aren't blocked by one of the existing lists. We use this at Webrecorder to block our web analytics script while crawling our own website by adding `stats.browsertrix.com` to the filter list. In this example, `browsertrix.com` will still load, but Brave will block any communication to `stats.browsertrix.com` and our analytics won't register a page view as a result. While lots of common analytics tools may already be blocked in an existing blocklist, this one likely isn't because we run it ourselves!

    The [Ublock Origin filter syntax](https://github.com/gorhill/uBlock/wiki/Static-filter-syntax) can be used for more specificity over what in-page resources should be blocked.

    All browser setting related blocking features can be used in addition with the [_Block Ads by Domain_](workflow-setup.md#block-ads-by-domain) crawler setting.

### Saving the Profile

After you are done interacting with the embedded browser, press _Save Profile_ (or _Create Profile_ for new browser profiles.) All sites loaded in the embedded browser will appear in the Saved Sites list. Sites in this list can be selected to view or reconfigure the site.

### Load New URL

You may want to load a URL that is not listed in the _Saved Sites_ to preview how a page may appear to the crawler, or to add a new site. Due to the nature of the embedded browser, it can be difficult to navigate between different websites if there are no hyperlinks between them. The easiest way to load a new URL is to press Load New URL from the browser profile page and enter the URL.

Although browser profiles have no limit on the number of saved sites, we recommend one site per browser profile to make troubleshooting crawls easier. An exception is when using a [URL List](./workflow-setup.md#list-of-pages) workflow to crawl multiple websites that require a profile, as we only allow one browser profile per workflow.

## Editing Browser Profiles

Sometimes websites will log users out or expire cookies or login sessions after a period of time. In these cases, the browser profile may not behave as it did at crawl time as when it was configured.

To update the profile, go to the browser profile page, open the Actions menu, and select Load Profile. The following settings are displayed:

### Primary Site

The primary site that is configured in the browser profile. A new primary site can be configured by choosing New Site in the dropdown. If the browser profile is in use by crawl workflows with a crawl start URL that is not a saved site, a section named Suggestions from Related Workflows with suggested options will be displayed in the dropdown.

### URL to Load

The URL of the first page in the primary site to visit in the embedded browser. For example, the login page for a social media website

### Reset previous configuration on save

If checked, all previously saved sites and their associated data will be removed from the browser profile. If your organization supports proxies, this will also enable choosing a different proxy server.

Depending on your organization settings, additional settings may be available:

### Proxy Server

The proxy server to be used by the embedded browser as well as any crawl that uses this profile.

!!! tip "Implication for crawl workflows using proxies"

    When a browser profile is added to a crawl workflow, the browser profile’s proxy setting will take precedence over the crawl workflow’s Crawler Proxy Server setting. This prevents potential crawl failures that result from conflicting proxies.

### Crawler Release Channel

For advanced use cases, you can specify a Browsertrix Crawler release that contains another version of the embedded browser, such as a beta version that may contain experimental features.

Press _Start Browser_ to load the temporary embedded browser. It may take a few moments for the embedded browser to load.

When finished, press the _Save Profile_ button to return to the profile's details page. Profiles are automatically backed up on save if replica storage locations are configured.

### Editing Browser Profile Metadata

To edit the name, description, and tags, select _Edit Metadata_ from the action menu on the browser profile page.
