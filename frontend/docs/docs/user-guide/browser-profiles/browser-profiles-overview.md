# Intro to Browser Profiles

Browser profiles are saved instances of a web browsing session that can be used to preconfigure a website before it is crawled. For example, a website can be preconfigured to be logged in, which gives the crawler access to content that can only be viewed by logged-in users.

## Best Practices

### Use an account created specifically for archiving a website

We recommend creating dedicated accounts for archiving pages that are behind a login wall but otherwise public. Login walls are commonly used by social media platforms.

Although dedicated accounts are not required to benefit from browser profiles, they can address the following potential issues:

- While usernames and passwords are never saved by Browsertrix, the private tokens that enable access to logged in content _are_ stored. Thus, anyone with access to your Browsertrix account, intentional or malicious, may be able to access the logged in content.

- Some websites may rate limit or lock accounts for reasons they deem to be suspicious, such as logging in from a new geographical location or if the site determines crawls to be robot activity.

- Personalized data such as cookies, location, etc. may be included in the resulting crawl.

- The logged in interface may display unwanted personally identifiable information such as a username or profile picture.

An exception to this practice is if your goal is to archive personalized or private content accessible only from designated accounts. In these instances we recommend changing the account's password after crawling is complete.
