# Behaviors

Behaviors are browser operations that can be enabled to customize how the crawler interacts with a page. Browsertrix provides several built-in behaviors, some of which are automatically applied to ensure the highest crawl fidelity, and some of which can be configured. It is also possible to add fully custom behaviors to trigger specific actions on certain pages that are not supported by built-in behaviors.

## Built-In Behaviors

### Site-Specific

If an applicable page is detected, the required site-specific behavior will automatically be enabled.
Browsertrix enables site-specific behaviors for the following platforms:

| **Platform Name** | **Page Host**      | **Applicable Pages** | **Smart Scoping Available**                      |
|-------------------|--------------------|----------------------|--------------------------------------------------|
| Bluesky           | bsky.app           | All                  | No                                               |
| Facebook          | facebook.com       | Timeline, Posts, Photos, Reels | [Yes](workflow-setup.md#use-smart-scoping-rules) |
| Instagram         | instagram.com      | Posts, Profiles, Stories       | [Yes](workflow-setup.md#use-smart-scoping-rules) |
| Twitter           | x.com, twitter.com | Timeline, Posts             | No                                               |
| Telegram          | t.me               | Public Channels                | No                                               |
| TikTok            | tiktok.com         | Video       | No                                               |
| YouTube           | youtube.com        | Video                | No                                               |

Site-specific behaviors will take precedence over other built-in behaviors and custom behaviors.

### Opt-In

The following behaviors can be enabled or disabled in the workflow: [**autoscroll**](workflow-setup.md#autoscroll) and [**autoclick**](workflow-setup.md#autoclick). These behaviors may be overridden by site-specific and custom behaviors.

## Custom Behaviors

Custom behaviors allow you to add and modify page interactions for sites that are not supported by Browsertrix’s built-in behaviors. Custom behaviors can written using the Browsertrix JavaScript behavior format or created in the Chrome Dev Tools Recorder tab and provided to Browsertrix in the JSON User Flow format. See [Browser Behaviors docs](https://crawler.docs.browsertrix.com/user-guide/behaviors/#creating-custom-behaviors) for a detailed overview of creating custom behaviors.

Once created and hosted on a public site or Git repository, the custom behavior script can be [added to a workflow](workflow-setup.md#use-custom-behaviors).
