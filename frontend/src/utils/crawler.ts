import { msg, str } from "@lit/localize";
import { html, type TemplateResult } from "lit";

import { tw } from "./tailwind";

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

export const DEFAULT_MAX_SCALE = 3;

export const DEPTH_SUPPORTED_SCOPES = [
  "prefix",
  "host",
  "domain",
  "custom",
  "any",
];

export function isActive(state: CrawlState | null) {
  return state && activeCrawlStates.includes(state);
}

export function renderName(item: ArchivedItem | Workflow) {
  if (item.name) return html`<div class=${tw`truncate`}>${item.name}</div>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<div class=${tw`ml-1`}>
          ${msg(str`+${remainder} URL`)}
        </div>`;
      } else {
        nameSuffix = html`<div class=${tw`ml-1`}>
          ${msg(str`+${remainder} URLs`)}
        </div>`;
      }
    }
    return html`
      <div class=${tw`inline-flex w-full overflow-hidden whitespace-nowrap`}>
        <div class=${tw`min-w-0 truncate`}>${item.firstSeed}</div>
        ${nameSuffix}
      </div>
    `;
  }

  return html`<div class=${tw`truncate text-neutral-500`}>
    ${msg("(unnamed item)")}
  </div>`;
}
