# Behaviors

Behaviors are browser operations that can be enabled to customize how the crawler interacts with a page. Browsertrix provides several built-in behaviors, some of which are automatically applied to ensure the highest crawl fidelity, and some of which can be configured. It is also possible to add fully custom behaviors to trigger specific actions on certain pages that are not supported by built-in behaviors.

## Behavior Types

### Default

Default behaviors apply to all pages. Some default behaviors, such as auto-playing videos, are always enabled. The following default behaviors can be enabled or disabled per workflow: [**autoscroll**](workflow-setup.md#autoscroll) and [**autoclick**](workflow-setup.md#autoclick).

### Platform-Specific

Browsertrix automatically enables behaviors for popular social media platforms in order to provide the highest quality capture of the platform’s features. Built-in behaviors are available for the following platforms:

| **Platform Name** | **Page Host**      | **Applicable Pages**           | **Smart Scoping Available**                      |
|-------------------|--------------------|--------------------------------|--------------------------------------------------|
| Bluesky           | bsky.app           | All                            | No                                               |
| Facebook          | facebook.com       | Timeline, Posts, Photos, Reels | [Yes](workflow-setup.md#use-smart-scoping-rules) |
| Instagram         | instagram.com      | Posts, Profiles, Stories       | [Yes](workflow-setup.md#use-smart-scoping-rules) |
| Twitter           | x.com, twitter.com | Timeline, Posts                | No                                               |
| Telegram          | t.me               | Public Channels                | No                                               |
| TikTok            | tiktok.com         | Video                          | No                                               |
| YouTube           | youtube.com        | Video                          | No                                               |

A detailed description of each behavior can be found in [Browser Behavior docs](https://crawler.docs.browsertrix.com/user-guide/behaviors/#site-specific-behaviors).

### Custom

Custom behaviors allow you to add and modify page interactions for pages that are not supported by Browsertrix’s built-in behaviors. Custom behaviors can be written using the Browsertrix **JavaScript Behavior** format or created in the Chrome DevTools  **JSON User Flow** format. See [Browser Behaviors docs](https://crawler.docs.browsertrix.com/user-guide/behaviors/#creating-custom-behaviors) for a detailed overview of creating custom behaviors in either format.

Once created and hosted on a public site or Git repository, the custom behavior script can be [added to a workflow](workflow-setup.md#use-custom-behaviors).

## Behavior Precedence

Only one behavior type is enabled per page. During a crawl, each page is checked against the page match rules given a set of behaviors enabled for a workflow.

Page-matching is prioritized in the following order:

1. Platform-Specific
2. Custom
3. Default

For example, given a crawl URL of <https://bsky.app/profile/webrecorder.net>, only the platform-specific Bluesky behavior will be applied, even if a custom behavior matching the page URL or the default _Autoscroll_ behavior is enabled.
