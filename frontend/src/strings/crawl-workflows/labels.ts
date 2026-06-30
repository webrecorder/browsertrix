import { msg } from "@lit/localize";

import type { FormStateField } from "@/utils/workflow";

export const labelFor = {
  customBehavior: msg("Custom Behaviors"),
  autoscrollBehavior: msg("Autoscroll"),
  autoclickBehavior: msg("Autoclick"),
  pageLoadTimeoutSeconds: msg("Page Load Limit"),
  postLoadDelaySeconds: msg("Delay After Page Load"),
  behaviorTimeoutSeconds: "Behavior Limit",
  pageExtraDelaySeconds: msg("Delay Before Next Page"),
  selectLinks: msg("Custom Link Selectors"),
  clickSelector: msg("Click Selector"),
  dedupeType: msg("Crawl Deduplication"),
  saveStorage: msg("Include browser storage data"),
  maxScopeDepth: msg("Max Discovery Depth"),
  includeLinkedPages: msg("Visit any linked page"),
  useSitemap: msg("Use sitemap"),
  useRobots: msg("Use robots.txt disallow list"),
  customIncludeList: msg("Page Prefix URLs"),
  urlList: msg("Additional URLs to Crawl"),
  failOnContentCheck: msg("Fail crawl if not logged in"),
  failOnFailedSeed: msg("Fail crawl if any URL fails"),
  exclusions: msg("Custom Exclusion Rules"),
} as const satisfies Partial<Record<FormStateField, string>>;

export const titlecaseLabelFor = {
  saveStorage: msg("Include Browser Storage Data"),
  includeLinkedPages: msg("Visit Any Linked Page"),
  useSitemap: msg("Use Sitemap"),
  useRobots: msg("Use Robots.txt Disallow List"),
  failOnContentCheck: msg("Fail Crawl if Not Logged In"),
} as const satisfies Partial<Record<FormStateField, string>>;
