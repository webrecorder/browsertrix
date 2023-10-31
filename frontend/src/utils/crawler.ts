import type { CrawlState } from "../types/crawler";
export const activeCrawlStates: CrawlState[] = [
  "starting",
  "waiting_org_limit",
  "waiting_capacity",
  "running",
  "generate-wacz",
  "uploading-wacz",
  "pending-wait",
  "stopping",
];

export const finishedCrawlStates: CrawlState[] = [
  "partial_complete",
  "complete",
  "complete:user-stop",
  "complete:time-limit",
  "complete:size-limit",
  "complete:page-limit",
  "complete:exec-time-quota",
];

export const inactiveCrawlStates: CrawlState[] = [
  ...finishedCrawlStates,
  "canceled",
  "skipped_quota_reached",
  "failed",
];

export function isActive(state: CrawlState) {
  return activeCrawlStates.includes(state);
}
