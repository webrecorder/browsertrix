import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";

import { type FormState } from "@/utils/workflow";

type Field = keyof FormState;

const infoText: Partial<Record<Field, string | TemplateResult>> = {
  exclusions: msg(
    "Specify exclusion rules for what pages should not be visited.",
  ),
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
  browserProfile:
    msg(`Choose a custom profile to make use of saved cookies and logged-in
  accounts. Note that websites may log profiles out after a period of time.`),
  crawlerChannel: msg(
    `Choose a Browsertrix Crawler Release Channel. If available, other versions may provide new/experimental crawling features.`,
  ),
  blockAds: msg(
    html`Blocks advertising content from being loaded. Uses
      <a
        href="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
        class="text-blue-600 hover:text-blue-500"
        target="_blank"
        rel="noopener noreferrer nofollow"
        >Steven Black’s Hosts file</a
      >.`,
  ),
  userAgent: msg(
    html`Set custom user agent for crawler browsers to use in requests. For
      common user agents see
      <a
        href="https://www.useragents.me/"
        class="text-blue-600 hover:text-blue-500"
        target="_blank"
        rel="noopener noreferrer nofollow"
        >Useragents.me</a
      >.`,
  ),
  lang: msg(`Websites that observe the browser’s language setting may serve
  content in that language if available.`),
  proxyId: msg(`Choose a proxy to crawl through`),
};

export default infoText;
