import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, type TemplateResult } from "lit";

import type {
  ArchivedItem,
  Crawl,
  CrawlReplay,
  Upload,
  Workflow,
} from "@/types/crawler";
import {
  FAILED_STATES,
  PAUSED_STATES,
  RUNNING_AND_WAITING_STATES,
  SUCCESSFUL_AND_FAILED_STATES,
  SUCCESSFUL_STATES,
} from "@/types/crawlState";
import type { QARun } from "@/types/qa";
import { WorkflowScopeType } from "@/types/workflow";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";

// Match backend TYPE_RUNNING_AND_WAITING_STATES in models.py
export const activeCrawlStates = RUNNING_AND_WAITING_STATES;
export const finishedCrawlStates = SUCCESSFUL_STATES;
export const inactiveCrawlStates = SUCCESSFUL_AND_FAILED_STATES;

export const DEFAULT_MAX_SCALE = 8;

export const DEPTH_SUPPORTED_SCOPES = [
  "prefix",
  "host",
  "domain",
  "custom",
  "any",
];

export function isCrawl(item: Crawl | Upload): item is Crawl {
  return item.type === "crawl";
}

export function isCrawlReplay(
  item: ArchivedItem | CrawlReplay,
): item is CrawlReplay {
  return isCrawl(item) && "config" in item;
}

export function isActive({ state }: Partial<Crawl | QARun>) {
  return (activeCrawlStates as readonly (typeof state)[]).includes(state);
}

export function isSuccessfullyFinished({ state }: { state: string | null }) {
  return state && (SUCCESSFUL_STATES as readonly string[]).includes(state);
}

export function isSkipped({ state }: { state: string | null }) {
  return state?.startsWith("skipped");
}

export function isNotFailed({ state }: { state: string | null }) {
  return (
    state && !(FAILED_STATES as readonly string[]).some((str) => str === state)
  );
}

export function isPaused(state: string | null) {
  return state && (PAUSED_STATES as readonly string[]).includes(state);
}

export function isPageScopeType(
  scope?: (typeof WorkflowScopeType)[keyof typeof WorkflowScopeType],
) {
  return (
    scope === WorkflowScopeType.Page || scope === WorkflowScopeType.PageList
  );
}

export function renderName(
  item:
    | Pick<Workflow | ArchivedItem, "name" | "seedCount" | "firstSeed">
    | null
    | undefined,
  className?: string,
) {
  if (!item)
    return html`<sl-skeleton class="inline-block h-8 w-60"></sl-skeleton>`;

  if (item.name)
    return html`<span class=${clsx("truncate", className)}>${item.name}</span>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      nameSuffix = html`<span class="ml-1 whitespace-nowrap text-neutral-500">
        +${localize.number(remainder, { notation: "compact" })}
        ${pluralOf("URLs", remainder)}
      </span>`;
    }
    return html`
      <span class="inline-flex w-full overflow-hidden whitespace-nowrap">
        <span class=${clsx("min-w-0 truncate", className)}>
          ${item.firstSeed}
        </span>
        ${nameSuffix}
      </span>
    `;
  }

  return html`<div class=${clsx("truncate text-neutral-500", className)}>
    ${msg("(unnamed item)")}
  </div>`;
}
