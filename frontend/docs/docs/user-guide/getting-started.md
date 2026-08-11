# Your First Crawl

Let’s crawl your first webpage! This guide will walk you through the basic steps for setting up a webpage crawl.

## Accessing your dashboard

To start a crawl, you’ll need to log in using a Browsertrix account with access to crawls.

You likely have access already if:

- [x] You signed up for a [Browsertrix subscription](./signup.md)
- [x] You [joined an existing org](./join.md) and were given [“crawler” permissions](./org-members.md#crawler){ data-preview }
- [x] You are the admin of a self-hosted instance

Check if you have access by logging in. If you see a [+ Create New...](#accessing-your-dashboard){ .md-button .md-button--primary .btrix-button } button in the dashboard, you‘re able to start a site crawl. If you don’t see this button and think that you should, contact your org administrator to update your permissions.

## Starting the crawl

When you log in, the first page you see is the [org dashboard](overview.md){ data-preview }. If you’ve navigated away to another page, navigate back to **Dashboard**.

You will create a [crawl workflow](crawl-workflows.md){ data-preview } to set up the crawl.

1. Tap the [+ Create New...](#accessing-your-dashboard){ .md-button .md-button--primary .btrix-button } button and select **Crawl Workflow**.

1. Select the [Crawl Scope](workflow-setup.md#crawl-scope){ data-preview } that best fits what you would like to crawl:

    === "One page"

        To crawl only a single page of a website and nothing else, leave the setting at **Single Page**.

    === "Social media page"

        To crawl a social media post or profile, leave the setting at **Single Page**.

    === "Entire website"

        To crawl every webpage on _your-site_.com, _your-site_.org, or another site, choose **Pages on Same Domain**.

1. [Enter the URL](workflow-setup.md#crawl-start-url-urls-to-crawl){ data-preview } of the webpage that you want to archive.
1. Depending on what you’d like to crawl, fill out additional settings:

    === "One page"

        Even if the target of your web archive is a single page, you may also want to [include additional linked pages](workflow-setup.md#additional-scope){ data-preview } so that links do not appear to be broken when browsing the archived page. To do so, check **Include directly linked pages**.

    === "Social media page"

        Popular social media platforms may require logging in to view content. To log in, you will need to add a [browser profile](browser-profiles/browser-profiles-overview.md){ data-preview }:

        1. Scroll down and open the **Browser Settings** section.
        1. Open the **Browser Profile** menu and select **New Browser Profile**.
        1. Tap the **Start Browser**{ .md-button .md-button--success .btrix-button } button.
        1. Log in using an account [created specifically for web archiving](browser-profiles/browser-profiles-overview.md#use-logins-dedicated-to-web-archiving){ data-preview }.
        1. Tap **Create Profile**{ .md-button .md-button--primary .btrix-button } to save the profile.

    === "Entire website"

        It can be difficult to estimate how many pages are on a website, especially if it is your first time crawling the site. Setting [crawl limits](workflow-setup.md#crawl-limits){ data-preview } is recommended as you familiarize yourself with the site crawl:

        1. Scroll down and open the **Crawl Limits** section.
        1. Set a **Crawl Time Limit** or **Crawl Size Limit** according to what is reasonable within your org quotas.

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
- [Invite collaborators](org-members.md){ data-preview } to crawl with you.
