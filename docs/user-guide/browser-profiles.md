# Browser Profiles

Browser profiles are saved instances of a web browsing session that can be reused to crawl websites as they were configued, with any cookies or saved login sessions. Using a pre-configured profile also means that content that can only be viewed by logged in users can be archived, without archiving the actual login credentials.

!!! tip "Best practice: Create and use web archiving-specific accounts for crawling with browser profiles"

    For the following reasons, we recommend creating dedicated accounts for archiving anything that is locked behind login credentials but otherwise public, especially on social media platforms.

    - While user names and passwords are not, the access tokens for logged in websites used in the browser profile creation process _are stored_ by the server.

    - Some websites may rate limit or lock accounts for reasons they deem to be suspicious, such as logging in from a new location or any crawling-related activity.

    - While login information (username, password) is not archived, *other* data such as cookies, location, etc.. may be included in the resulting crawl (after all, personalized content is often the goal of sites that require credentials to view content).

    - Due to nature of social media specifically, existing accounts may have personally identifiable information, even when accessing otherwise public content.

    Of course, there are exceptions — such as when the goal is to archive personalized or private content accessible only from designated accounts.

## Creating New Browser Profiles

New browser profiles can be created on the Browser Profiles page by pressing the _New Browser Profile_ button and providing a starting URL. Once in the profile creator, log in to any websites that should behave as logged in while crawling and accept any pop-ups that require interaction from the user to proceed with using the website.

Press the _Next_ button to save the browser profile with a _Name_ and _Description_ of what is logged in or otherwise notable about this browser session.

## Editing Existing Browser Profiles

Sometimes websites will log users out or expire cookies after a period of time. In these cases, when crawling the browser profile can still be loaded but may not behave as it did when it was initially set up.

To update the profile, go to the profile's details page and press the _Edit Browser Profile_ button to load and interact with the sites that need to be re-configured. When finished, press the _Save Browser Profile_ button to return to the profile's details page.
