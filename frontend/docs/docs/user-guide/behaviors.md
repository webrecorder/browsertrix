# Behaviors

Behaviors are browser operations that can be enabled to customize how the crawler interacts with a page. Browsertrix provides several built-in behaviors, some of which are automatically applied to ensure the highest crawl fidelity, and some of which can be configured. It is also possible to add fully custom behaviors to trigger specific actions on certain pages that are not supported by built-in behaviors.

## Built-In Behaviors

### Site-Specific

If an applicable page is detected, the required site-specific behavior will automatically be enabled.
Browsertrix enables site-specific behaviors for the following platforms:

| **Platform Name** | **Page Host**      | **Applicable Pages** | **Smart Scoping Available**                      |
|-------------------|--------------------|----------------------|--------------------------------------------------|
| Bluesky           | bsky.app           | All                  | No                                               |
| Facebook          | facebook.com       | Timeline             | [Yes](workflow-setup.md#use-smart-scoping-rules) |
| Instagram         | instagram.com      | Posts, Stories       | [Yes](workflow-setup.md#use-smart-scoping-rules) |
| Twitter           | x.com, twitter.com | Timeline             | No                                               |
| Telegram          | t.me               | Posts                | No                                               |
| TikTok            | tiktok.com         | Profile, Video       | No                                               |
| YouTube           | youtube.com        | Video                | No                                               |

Site-specific behaviors will take precedence over other built-in behaviors and custom behaviors.

### Opt-In

The following behaviors can be enabled or disabled in the workflow: [**autoscroll**](workflow-setup.md#autoscroll) and [**autoclick**](workflow-setup.md#autoclick). These behaviors may be overridden by site-specific and custom behaviors.

## Custom Behaviors

Custom behaviors allow you to add and modify page interactions for sites that are not supported by Browsertrix’s built-in behaviors. Like built-in behaviors, custom behaviors should be written using the Browsertrix JavaScript behavior format. See [Browser Behaviors docs](https://crawler.docs.browsertrix.com/user-guide/behaviors/#javascript-behaviors) for a detailed overview of the format.

Once created and hosted on a public site or Git repository, the custom behavior script can be [added to a workflow](workflow-setup.md#use-custom-behaviors).
