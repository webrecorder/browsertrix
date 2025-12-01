# Create a New Browser Profile

To create a new browser profile, press _New Browser Profile_ on the **Browser Profiles** page.

## New Browser Profile Settings

### Primary Site URL

: The URL of the first page to visit in the embedded browser. For example, the login page for a social media website.

### Profile Name

: A custom name for the browser profile. The domain name of the _Primary Site URL_ will be used if this field is left blank.

Depending on your organization settings, additional settings may be available:

### Proxy Server

: The proxy server to be used by the embedded browser as well as any crawl that uses this profile.

    !!! tip "Implication for crawl workflows using proxies"
    
        When a browser profile is added to a crawl workflow, the browser profile’s proxy setting will take precedence over the crawl workflow’s [_Crawler Proxy Server_](../workflow-setup.md#crawler-proxy-server) setting. This prevents potential crawl failures that result from conflicting proxies.

### Crawler Release Channel

: For advanced use cases, you can specify a [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) release that contains another version of the embedded browser, such as a beta version that may contain experimental features.

Press _Start Browser_ to load the temporary embedded browser used to configure sites. It may take a few moments for the embedded browser to load. The browser profile will not be saved until _Create Profile_ is pressed.
