# Org Settings

The Org Settings page is only available to organization admins. It can be found in the main navigation menu.

## Org Information

This tab lets you change the organization's name. This name must be unique.

## Members

This tab lists all current members who have access to the organization, as well as any invited members who have not yet accepted an invitation to join the organization. In the _Active Members_ table, admins can change the permission level of all users in the organization, including other admins. At least one user must be an admin per-organization. Admins can also remove members by pressing the trash button.

Admins can add new members to the organization by pressing the _Invite New Member_ button. Enter the email address associated with the user, select the appropriate role, and press _Invite_ to send a link to join the organization via email.

Sent invites can be invalidated by pressing the trash button in the relevant _Pending Invites_ table row.

### Permission Levels

`Viewer`
:   Users with the viewer role have read-only access to all material within the organization. They cannot create or edit archived items, crawl workflows, browser profiles, or collections.

`Crawler`
:   Users with the crawler role can create crawl workflows and collections, but they cannot delete existing archived items that they were not responsible for creating.

`Admin`
:   Users with the administrator role have full access to the organization, including its settings page.

<!-- ## Limits

This tab lets organization admins set an additional number of allowed overage minutes when the organization's monthly execution minutes quota has been reached. If set, this serves as a hard cap after which all running crawls will be stopped. When set at the default of 0, crawls will be stopped as soon as the monthly quota is reached. -->
