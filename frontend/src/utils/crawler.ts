import { type TemplateResult, html } from "lit";
import { msg, str } from "@lit/localize";

import type { ArchivedItem, CrawlState, Workflow } from "@/types/crawler";

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
  "complete",
  "stopped_by_user",
  "stopped_quota_reached",
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

export function renderName(item: ArchivedItem | Workflow) {
  if (item.name) return html`<span>${item.name}</span>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="ml-1"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="ml-1"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <div class="overflow-hidden whitespace-nowrap flex">
        <span class="truncate min-w-0">${item.firstSeed}</span>
        <span>${nameSuffix}</span>
      </div>
    `;
  }

  return html`<span class="text-neutral-500">${msg("(unnamed item)")}</span>`;
}
