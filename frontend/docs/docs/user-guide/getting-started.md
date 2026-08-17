---
hide:
  - tags
tags:
  - Social Media
---

# Your First Crawl

<!-- markdownlint-disable MD033 -->

Set up your first website or social media page crawl in just a few minutes
{ .hero-paragraph }

---

This guide will walk you through the basic steps for starting a website crawl.

## Accessing your dashboard

To start a crawl, you’ll need to log in using a Browsertrix account with access to crawls.

You likely have access already if:

- [x] You signed up for a Browsertrix subscription.
- [x] You joined an existing org and were given “crawler” permissions.
- [x] You are the admin of a self-hosted instance.

Check if you have access by logging in. If you see a [+ Create New...](#accessing-your-dashboard){ .md-button .md-button--primary .btrix-button } button in the dashboard, you’re able to start a site crawl. If you don’t see this button and think that you should, contact your org administrator to update your permissions.

## Choose what to archive

Open the webpage that you would like to archive in a new browser tab. Copy the URL; we will use this URL to start the crawl.

Choose one of the following options to tailor this guide to what you’d like to archive:

=== "One page<div data-tab-description="Archive a single page on a site"></div>"

    <!--  -->

=== "Social media page<div data-tab-description="Archive a social media post or profile"></div>"

    #### Before You Start

    Many popular social media platforms require logging in to view the full page. To check if the social media page requires login, open the page in private browsing or incognito mode (instructions for [Chrome](https://support.google.com/chrome/answer/95464), [Safari](https://support.apple.com/guide/safari/browse-privately-ibrw1069/mac), [Edge](https://support.microsoft.com/en-us/edge/browse-inprivate-in-microsoft-edge), [Firefox](https://www.firefox.com/en-US/features/private-browsing/)). If you see a prompt to sign up or login, the site will need to be provided login credentials during the crawl.

    If this is the case, sign up for a new account using login credentials dedicated to archiving. Make note of these credentials in a secure place before continuing.
    
    ??? Question "Can I use my existing social media account?"
        Although there is nothing preventing you from doing so, using your personal account to archive social media pages may [put your personal login information at risk](browser-profiles/browser-profiles-overview.md#use-logins-dedicated-to-web-archiving){ data-preview }. We always recommend creating a new account dedicated to archiving to reduce the risk of accidentally archiving your private data.

=== "Entire website<div data-tab-description="Archive every page on a webs"></div>"

## Starting the crawl

When you log in, the first page you see is the [org dashboard](overview.md){ data-preview }. If you’ve navigated away to another page, navigate back to **Dashboard**.

You will create a [crawl workflow](crawl-workflows.md){ data-preview } to set up the crawl.

1. Tap the [+ Create New...](#accessing-your-dashboard){ .md-button .md-button--primary .btrix-button } button and select **Crawl Workflow**.

1. Select the [Crawl Scope](workflow-setup.md#crawl-scope){ data-preview } that best fits what you intend to archive:

    === "One page"

        Leave the setting at **Single Page**.

    === "Social media page"

        Leave the setting at **Single Page**. Browsertrix [automatically adjust the scope](workflow-setup.md#use-smart-scoping-rules){ data-preview } for popular social media platforms.

    === "Entire website"

        Choose **Pages on Same Domain**. This will find and archive every page that shares the same domain (e.g. _your-site_.com).

1. Enter the URL of the webpage that you copied earlier.
1. Configure optional settings:

    === "One page"

        Check **Include directly linked pages** to crawl pages linked from your target page. Including directly linked pages can improve the replay experience by preventing broken links.

    === "Social media page"

        If the social media page requires logging in, you can use a [browser profile](browser-profiles/browser-profiles-overview.md){ data-preview } to provide the login credentials.

        To add a browser profile:

        1. Scroll down and open the **Browser Settings** section.
        1. Open the **Browser Profile** menu and select **New Browser Profile**.
        1. Tap the **Start Browser**{ .md-button .md-button--success .btrix-button } button.
        1. Log in using the account [that you created earlier](#before-you-start).
        1. Tap **Create Profile**{ .md-button .md-button--primary .btrix-button } to save the profile.

    === "Entire website"

        It can be difficult to estimate how many pages are on a website, especially if it is your first time crawling the site. Setting [crawl limits](workflow-setup.md#crawl-limits){ data-preview } is recommended as you familiarize yourself with the site crawl.

        To add a crawl limit:

        1. Scroll down and open the **Crawl Limits** section.
        1. Set a **Crawl Time Limit** and/or **Crawl Size Limit** according to what is reasonable within your org quotas.

1. When you’re finished entering workflow settings, tap **Run Crawl**{ .md-button .md-button--primary .btrix-button }.

You should now see your new crawl workflow running. Give the crawler a few moments to warm up, and then watch as it crawls the webpage!

---

## Next steps

After running your first crawl, you may want to:

- [Include pages](workflow-setup.md#additional-scope){ data-preview } that the crawler didn’t visit.
- [Exclude pages](workflow-setup.md#exclude-pages){ data-preview } that shouldn’t be crawled.
- Explore all available [crawl workflow setup](workflow-setup.md){ data-preview } options.
- Review the crawled content for [quality assurance](quality-assurance.md){ data-preview }.
- Import [previously archived content](archived-items.md#uploading-web-archives){ data-preview }.
- Start a [collection](collection.md){ data-preview } of crawled content.
