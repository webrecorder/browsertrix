# Edit Browser Profile

Sometimes websites will log users out by expiring cookies or login sessions after a period of time. Although running crawls on a regular basis can help keep websites logged in for longer, most websites will log users out after an extended period of time, be it a week or 30 days. In this case, the browser profile may not behave as expected at crawl time and will need to be reconfigured.

To check or update the profile, go to the browser profile page and select _Load Profile_ from the action menu.

!!! tip "Tip: Fail crawls early to identify logged-out profiles"

    Enabling [_Fail Crawl If Not Logged In_](../workflow-setup.md#fail-crawl-if-not-logged-in) on a workflow can help identify which profiles need attention and prevent adding unwanted logged-out content to a collection.

## Load / Edit Profile Settings

: ### Primary Site

: The primary site that is configured in the browser profile. A new primary site can be configured by choosing _New Site_ in the dropdown.

: If the browser profile is in use by crawl workflows with a [crawl start URL](../workflow-setup.md#crawl-start-url-urls-to-crawl) that is not a saved site, a section titled _Suggestions from Related Workflows_ with suggested options will be displayed in the dropdown.

: ### URL to Load

: The URL of the first page in the primary site to visit in the embedded browser. For example, the login page for a social media website.

: ### Reset previous configuration on save

: If checked, all previously saved sites and their associated data will be removed from the browser profile. If your organization supports proxies, this will also enable choosing a different proxy server.

Depending on your organization settings, additional settings may be available:

: ### Proxy Server

: The proxy server to be used by the embedded browser as well as any crawl that uses this profile.

    ??? tip "Implication for crawl workflows using proxies"
    
        When a browser profile is added to a crawl workflow, the browser profile’s proxy setting will take precedence over the crawl workflow’s [_Crawler Proxy Server_](../workflow-setup.md#crawler-proxy-server) setting. This prevents potential crawl failures that result from conflicting proxies.

: ### Crawler Release Channel

: For advanced use cases, you can specify a [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) release that contains another version of the embedded browser, such as a beta version that may contain experimental features.

Press _Start Browser_ to load the temporary embedded browser. It may take a few moments for the embedded browser to load.

When finished, press the _Save Profile_ button to return to the profile's details page. Profiles are automatically backed up on save if replica storage locations are configured.

## Edit Browser Profile Metadata

To edit the name, description, and tags, select _Edit Metadata_ from the action menu on the browser profile page.

: ### Name

: A custom name for the browser profile.

: ### Description

: A short description of the browser profile.

: ### Tags

: Tag the browser profile with additional metadata like category or keywords. Tags are displayed on the browser profiles list page.
