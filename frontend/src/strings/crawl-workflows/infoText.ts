import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";

import { type FormState } from "@/utils/workflow";

type Field = keyof FormState;

const sitemap_xml = html`<code>sitemap.xml</code>`;
const robots_txt = html`<code>robots.txt</code>`;

export const infoTextFor = {
  urlList: msg("The crawler will visit and record each URL listed here."),
  includeLinkedPages: msg(
    "Expands crawl scope to include pages that are one link away.",
  ),
  exclusions: msg("Specify rules for which pages should not be visited."),
  pageLimit: msg(
    "Adds a hard limit on the number of pages that will be crawled.",
  ),
  crawlTimeoutMinutes: msg(
    `Gracefully stop the crawler after a specified time limit.`,
  ),
  maxCrawlSizeGB: msg(
    `Gracefully stop the crawler after a specified size limit.`,
  ),
  pageLoadTimeoutSeconds: msg(
    `Limits amount of time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.`,
  ),
  postLoadDelaySeconds: msg(
    `Waits on the page after initial HTML page load prior to moving on to next steps such as link extraction and behaviors. Can be useful with pages that are slow to load page contents.`,
  ),
  behaviorTimeoutSeconds: msg(
    `Limits how long behaviors can run on each page.`,
  ),
  pageExtraDelaySeconds: msg(
    `Waits on the page after behaviors are complete before moving onto the next page. Can be helpful for rate limiting.`,
  ),
  browserProfile: html`${msg(`Choose a custom profile to make use of saved cookies and logged-in
    accounts.`)}<br /><br />
    ${msg(
      "For websites that require login, we always recommend using a profile that's logged-in to an account created specifically for crawling.",
    )} `,
  crawlerChannel: msg(
    `Choose a Browsertrix Crawler release channel. If available, other versions may provide new or experimental crawling features.`,
  ),
  blockAds: msg("Blocks advertising content from being loaded."),
  userAgent: msg(
    "Set custom user agent for crawler browsers to use in requests.",
  ),
  lang: msg(`Websites that observe the browser’s language setting may serve
  content in that language if available.`),
  proxyId: msg(`Choose a proxy to crawl through.`),
  selectLinks: msg("Customize how page links are extracted."),
  customBehavior: msg(
    `Enable custom page actions with behavior scripts. You can specify any publicly accessible URL or public Git repository.`,
  ),
  failOnFailedSeed: msg(
    "If any URL in the list of pages fails to load, the crawler will cease crawling and mark the workflow run as failed.",
  ),
  failOnContentCheck: html`${msg(
    "Fail the crawl if a page behavior detects the browser is not logged in on supported pages.",
  )}
  ${msg("Note that websites may log profiles out after a period of time.")}`,
  saveStorage: html`${msg(
    "During a crawl, websites may store data in the browser itself, e.g. to persist logins.",
  )}
  ${msg(
    "Checking this will include data from the browser’s local and session storage in the archive.",
  )}
  ${msg(
    "This can improve replay quality, but may come with security implications.",
  )}`,
  useSitemap: msg(
    html`For each page host with a ${sitemap_xml} file, the crawler will use the
    sitemap to discover pages.`,
  ),
  useRobots: msg(
    html`Tells the crawler to check for a ${robots_txt} file for each page host
    and skip any disallowed pages.`,
  ),
  customIncludeList: msg(
    "Only crawl the page if the URL matches a regular expression pattern listed here.",
  ),
  dedupeType: msg(
    "Enable deduplication to prevent content that has already been crawled from being stored.",
  ),
  dedupeCollection: msg(
    "All crawls of this workflow will be deduplicated against this collection.",
  ),
} as const satisfies Partial<Record<Field, string | TemplateResult>>;

export default infoTextFor;
