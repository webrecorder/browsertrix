# Configure Sites

Websites are configured through a temporary browser that is embedded directly in the Browsertrix interface. Every website that is visited using the embedded browser is added to the list of _Saved Sites_. When the embedded browser session ends, personalized data from the sites are collected into a profile. This profile of preconfigured sites can then be saved and used by multiple [crawl workflows](../crawl-workflows.md).

The embedded browser is used during the process of [creating a new browser profile](./create-browser-profile.md) and when [editing an existing profile](./edit-browser-profile.md).

## Use Cases

### Website Sign In

To crawl content as a logged in user, load the website you intend to archive in the embedded browser and sign in as you would on any other browser. Once the account has been logged in, confirm by accessing a page on the site that the crawler should have access to. You may need to periodically log in again as websites may log users out after a certain period of time.

### Hide Popups

Load the website you intend to archive in the embedded browser and accept or otherwise dismiss the prompt. If the developers of the website have built the site in such a way that the result of your interaction is saved, the popup should remain hidden at crawl time. This can be confirmed by exiting the embedded browser session and then loading the site again.

### Customize the Crawling Browser

The embedded browser used to configure profiles is the same browser behind Browsertrix’s high-fidelity crawls. This enables advanced use cases like using a browser profile to customize the browser at crawl time. To view all available browser settings, load any site in the profile and then navigate to `brave://settings` in the embedded browser.

!!! info "Advanced Use Case: Proceed with caution"
    Customizing the crawler browser is for advanced use cases and it is not generally recommended to change these settings. We offer crawl-time browser customization like [ad blocking](../workflow-setup.md#block-ads-by-domain) and [language](../workflow-setup.md#language) in workflow settings. Changing browser settings directly in the profile may result in conflicting settings that are difficult to troubleshoot. If using this advanced feature, we recommend [adding clear metadata](./edit-browser-profile.md#edit-browser-profile-metadata) to the browser profile that describes the change.

??? example "Example: Blocking page resources with Brave's Shields"
    Whereas the crawler's scoping settings can be used to define which pages should be crawled, Brave's [Shields](https://brave.com/shields/) feature can block resources on pages from being loaded. By default, Shields will block [EasyList's cookie list](https://easylist.to/) but it can be set to block a number of other included lists under Brave `Settings > Shields > Filter Lists`.

    _Custom Filters_ can also be useful for blocking sites with resources that aren't blocked by one of the existing lists. We use this at Webrecorder to block our web analytics script while crawling our own website by adding `stats.browsertrix.com` to the filter list. In this example, `browsertrix.com` will still load, but Brave will block any communication to `stats.browsertrix.com` and our analytics won't register a page view as a result. While lots of common analytics tools may already be blocked in an existing blocklist, this one likely isn't because we run it ourselves!

    The [Ublock Origin filter syntax](https://github.com/gorhill/uBlock/wiki/Static-filter-syntax) can be used for more specificity over what in-page resources should be blocked.

    All browser setting related blocking features can be used in addition with the [_Block Ads by Domain_](../workflow-setup.md#block-ads-by-domain) crawler setting.

## Saving the Profile

After you are done interacting with the embedded browser, press _Save Profile_ (or _Create Profile_ for new browser profiles.)

## Saved Sites

All sites that are loaded in the embedded browser and then saved will appear in the _Saved Sites_ list. Select a site in the list to view or reconfigure the site in the embedded browser.

## Load New URL

You may want to load a URL that is not listed in the _Saved Sites_ to preview how a page may appear to the crawler, or to add a new site. Due to the nature of the embedded browser, it can be difficult to navigate between different websites if there are no hyperlinks between them. The easiest way to load a new URL is to press _Load New URL_ from the browser profile page and enter the URL.

Although browser profiles have no limit on the number of saved sites, we recommend one site per browser profile to make troubleshooting crawls easier. An exception is when using a [URL List](../workflow-setup.md#list-of-pages) workflow to crawl multiple websites that require a profile, as we only allow one browser profile per workflow.
