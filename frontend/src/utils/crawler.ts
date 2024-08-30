import { msg, str } from "@lit/localize";
import clsx from "clsx";
import { html, type TemplateResult } from "lit";

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
  "stopped_storage_quota_reached",
  "stopped_time_quota_reached",
  "stopped_org_readonly",
];

export const inactiveCrawlStates: CrawlState[] = [
  ...finishedCrawlStates,
  "canceled",
  "skipped_storage_quota_reached",
  "skipped_time_quota_reached",
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

export function renderName(item: ArchivedItem | Workflow, className?: string) {
  if (item.name)
    return html`<div class=${clsx("truncate", className)}>${item.name}</div>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<div class="ml-1">
          ${msg(str`+${remainder} URL`)}
        </div>`;
      } else {
        nameSuffix = html`<div class="ml-1">
          ${msg(str`+${remainder} URLs`)}
        </div>`;
      }
    }
    return html`
      <div class="inline-flex w-full overflow-hidden whitespace-nowrap">
        <div class=${clsx("min-w-0 truncate", className)}>
          ${item.firstSeed}
        </div>
        ${nameSuffix}
      </div>
    `;
  }

  return html`<div class=${clsx("truncate text-neutral-500", className)}>
    ${msg("(unnamed item)")}
  </div>`;
}
