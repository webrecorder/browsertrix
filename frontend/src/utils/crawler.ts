import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, type TemplateResult } from "lit";

import type { ArchivedItem, Crawl, Workflow } from "@/types/crawler";
import {
  FAILED_STATES,
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

export function isPageScopeType(
  scope?: (typeof WorkflowScopeType)[keyof typeof WorkflowScopeType],
) {
  return (
    scope === WorkflowScopeType.Page || scope === WorkflowScopeType.PageList
  );
}

export function renderName(item: ArchivedItem | Workflow, className?: string) {
  if (item.name)
    return html`<div class=${clsx("truncate", className)}>${item.name}</div>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      nameSuffix = html`<div class="ml-1 text-neutral-500">
        +${localize.number(remainder, { notation: "compact" })}
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
