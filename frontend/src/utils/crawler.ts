import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, type TemplateResult } from "lit";

import type { ArchivedItem, Crawl, Workflow } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import type { QARun } from "@/types/qa";
import { formatNumber } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";

// Match backend TYPE_RUNNING_STATES in models.py
const RUNNING_STATES: CrawlState[] = [
  "running",
  "pending-wait",
  "generate-wacz",
  "uploading-wacz",
] as const;

// Match backend TYPE_WAITING_STATES in models.py
const WAITING_STATES: CrawlState[] = [
  "starting",
  "waiting_capacity",
  "waiting_org_limit",
] as const;

// Match backend TYPE_SUCCESSFUL_STATES in models.py
const SUCCESSFUL_STATES: CrawlState[] = [
  "complete",
  "stopped_by_user",
  "stopped_storage_quota_reached",
  "stopped_time_quota_reached",
  "stopped_org_readonly",
] as const;

// Match backend TYPE_FAILED_STATES in models.py
const FAILED_STATES: CrawlState[] = [
  "canceled",
  "failed",
  "skipped_storage_quota_reached",
  "skipped_time_quota_reached",
] as const;

// Match backend TYPE_RUNNING_AND_WAITING_STATES in models.py
export const activeCrawlStates: CrawlState[] = [
  ...WAITING_STATES,
  ...RUNNING_STATES,
];

export const finishedCrawlStates = SUCCESSFUL_STATES;

export const inactiveCrawlStates: CrawlState[] = [
  ...SUCCESSFUL_STATES,
  ...FAILED_STATES,
];

export const DEFAULT_MAX_SCALE = 3;

export const DEPTH_SUPPORTED_SCOPES = [
  "prefix",
  "host",
  "domain",
  "custom",
  "any",
];

export function isActive({ state, stopping }: Partial<Crawl | QARun>) {
  return (state && activeCrawlStates.includes(state)) || stopping === true;
}

export function renderName(item: ArchivedItem | Workflow, className?: string) {
  if (item.name)
    return html`<div class=${clsx("truncate", className)}>${item.name}</div>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      nameSuffix = html`<div class="ml-1">
        +${formatNumber(remainder, { notation: "compact" })}
        ${pluralOf("URLs", remainder)}
      </div>`;
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
