# Usage in Crawls

To use a browser profile, choose the browser profile in the crawl workflow’s [_Browser Settings_]((../workflow-setup.md#browser-settings)). The next workflow run will use the browser profile when crawling.

To view a list of crawl workflows that use a specific browser profile, filter the crawl workflows list (**Crawling** > **Workflows**) using _Browser Profile_ filter, or go to a browser profile’s detail page to view its _Related Workflows_ section.

## Effects of Crawling

The crawling process may modify the browser profile. If website data—such as cookies or session data—is refreshed during a crawl, Browsertrix will automatically update the browser profile with this data when the crawl successfully finishes. This keeps saved sites in sync with sites at crawl time, preventing the use of expired profile data in subsequent crawls.

The following fields in the browser profile’s detail page can indicate whether the profile has been modified by a crawl:

: ### Modified by Crawl

: Links to the relevant crawl if modified, otherwise displays “Never”.

: ### Last Modified By

: Links to the relevant crawl, otherwise displays the name of the user who last edited or created the browser profile.
