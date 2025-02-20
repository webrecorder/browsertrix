import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlChangeEvent, SlSelect } from "@shoelace-style/shoelace";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { type Dialog } from "@/components/ui/dialog";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { iconFor as iconForPageReview } from "@/features/qa/page-list/helpers";
import * as pageApproval from "@/features/qa/page-list/helpers/approval";
import type { SelectDetail } from "@/features/qa/qa-run-dropdown";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import { type ArchivedItem, type ArchivedItemPage } from "@/types/crawler";
import type { QARun } from "@/types/qa";
import { isActive, isSuccessfullyFinished } from "@/utils/crawler";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { pluralOf } from "@/utils/pluralize";

type QAStatsThreshold = {
  lowerBoundary: `${number}`;
  count: number;
};
type QAStats = Record<"screenshotMatch" | "textMatch", QAStatsThreshold[]>;

const qaStatsThresholds = [
  {
    lowerBoundary: "0.0",
    cssColor: "var(--sl-color-danger-500)",
    label: msg("Severe Inconsistencies"),
  },
  {
    lowerBoundary: "0.5",
    cssColor: "var(--sl-color-warning-500)",
    label: msg("Moderate Inconsistencies"),
  },
  {
    lowerBoundary: "0.9",
    cssColor: "var(--sl-color-success-500)",
    label: msg("Good Match"),
  },
];

const notApplicable = () =>
  html`<span class="text-neutral-400">${msg("n/a")}</span>`;

function statusWithIcon(
  icon: TemplateResult<1>,
  label: string | TemplateResult<1>,
) {
  return html`
    <div class="flex items-center gap-2">
      <span class="inline-flex text-base">${icon}</span>${label}
    </div>
  `;
}

/**
 * @fires btrix-qa-runs-update
 */
@customElement("btrix-archived-item-detail-qa")
@localized()
export class ArchivedItemDetailQA extends BtrixElement {
  static styles = css`
    btrix-table {
      --btrix-cell-padding-top: var(--sl-spacing-x-small);
      --btrix-cell-padding-bottom: var(--sl-spacing-x-small);
      --btrix-cell-padding-left: var(--sl-spacing-small);
      --btrix-cell-padding-right: var(--sl-spacing-small);
    }
  `;

  @property({ type: String, attribute: false })
  workflowId?: string;

  @property({ type: String, attribute: false })
  crawlId?: string;

  @property({ type: Object, attribute: false })
  crawl?: ArchivedItem;

  @property({ type: String, attribute: false })
  qaRunId?: string;

  @property({ type: Array, attribute: false })
  qaRuns?: QARun[];

  @property({ attribute: false })
  mostRecentNonFailedQARun?: QARun;

  @state()
  private pages?: APIPaginatedList<ArchivedItemPage>;

  private readonly qaStats = new Task(this, {
    // mostRecentNonFailedQARun passed as arg for reactivity so that meter will auto-update
    // like progress bar as the analysis run finishes new pages
    task: async ([crawlId, qaRunId, mostRecentNonFailedQARun]) => {
      if (!qaRunId || !mostRecentNonFailedQARun)
        throw new Error("Missing args");
      const stats = await this.getQAStats(crawlId, qaRunId);
      return stats;
    },
    args: () =>
      [this.crawlId!, this.qaRunId, this.mostRecentNonFailedQARun] as const,
  });

  @state()
  private deleting: string | null = null;

  @query("#qaPagesSortBySelect")
  private readonly qaPagesSortBySelect?: SlSelect | null;

  @query("#deleteQARunDialog")
  private readonly deleteQADialog?: Dialog | null;

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      void this.fetchPages();
    }
  }

  render() {
    const fileCount = this.crawl?.filePageCount || 0;
    const errorCount = this.crawl?.errorPageCount || 0;
    const doneCount = this.crawl?.stats?.done
      ? parseInt(this.crawl.stats.done)
      : 0;
    const htmlCount = doneCount - fileCount - errorCount;

    return html`
      <div class="mb-5 rounded-lg border p-2">
        <btrix-desc-list horizontal>
          <btrix-desc-list-item label=${msg("Analysis Status")}>
            ${when(
              this.qaRuns,
              () =>
                this.mostRecentNonFailedQARun
                  ? html`<btrix-crawl-status
                      state=${this.mostRecentNonFailedQARun.state}
                      type="qa"
                      class="min-w-32"
                    ></btrix-crawl-status>`
                  : statusWithIcon(
                      html`<sl-icon
                        name="slash-circle"
                        class="text-neutral-400"
                      ></sl-icon>`,
                      html`<span class="text-neutral-400">
                        ${msg("Not Analyzed")}
                      </span>`,
                    ),

              this.renderLoadingDetail,
            )}
          </btrix-desc-list-item>
          ${this.mostRecentNonFailedQARun?.state === "running"
            ? html`
                <btrix-desc-list-item label=${msg("Analysis Progress")}>
                  <sl-tooltip
                    content="${msg(
                      str`${
                        this.mostRecentNonFailedQARun.stats.found === 0
                          ? msg("Loading")
                          : `${this.mostRecentNonFailedQARun.stats.done}/${this.mostRecentNonFailedQARun.stats.found}`
                      } ${pluralOf("pages", this.mostRecentNonFailedQARun.stats.found)}`,
                    )}"
                    placement="bottom"
                    hoist
                  >
                    <sl-progress-bar
                      value=${(100 * this.mostRecentNonFailedQARun.stats.done) /
                        this.mostRecentNonFailedQARun.stats.found || 1}
                      ?indeterminate=${this.mostRecentNonFailedQARun.stats
                        .found === 0}
                      style="--height: 0.5rem;"
                      class="mt-2 w-32"
                    ></sl-progress-bar>
                  </sl-tooltip>
                </btrix-desc-list-item>
              `
            : ""}
          <btrix-desc-list-item label=${msg("QA Rating")}>
            ${when(
              this.crawl,
              (crawl) =>
                html`<btrix-qa-review-status
                  .status=${crawl.reviewStatus}
                ></btrix-qa-review-status>`,
              this.renderLoadingDetail,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Total Analysis Time")}>
            ${when(
              this.qaRuns,
              () =>
                this.mostRecentNonFailedQARun && this.crawl?.qaCrawlExecSeconds
                  ? humanizeExecutionSeconds(this.crawl.qaCrawlExecSeconds)
                  : notApplicable(),

              this.renderLoadingDetail,
            )}
          </btrix-desc-list-item>
        </btrix-desc-list>
      </div>
      ${this.renderDeleteConfirmDialog()}
      <btrix-tab-group>
        <btrix-tab-group-tab slot="nav" panel="pages">
          <sl-icon name="file-richtext-fill"></sl-icon>
          ${msg("Pages")}
        </btrix-tab-group-tab>
        <btrix-tab-group-tab
          slot="nav"
          panel="runs"
          ?disabled=${!this.qaRuns?.length}
        >
          <sl-icon name="list-ul"></sl-icon>
          ${msg("Analysis Runs")}
        </btrix-tab-group-tab>

        <sl-divider></sl-divider>

        <btrix-tab-group-panel name="pages" class="block">
          <btrix-card class="gap-y-1">
            <div slot="title" class="flex flex-wrap justify-between">
              ${msg("Crawl Results")}
              <div class="text-neutral-500">
                <sl-tooltip
                  content=${msg(
                    "Non-HTML files captured as pages are known good files that the crawler found as clickable links on a page and don't need to be analyzed. Failed pages did not respond when the crawler tried to visit them.",
                  )}
                >
                  <sl-icon class="text-base" name="info-circle"></sl-icon>
                </sl-tooltip>
              </div>
            </div>
            ${this.crawl
              ? html`<div class="tabular-nums">
                  <p>
                    ${msg(html`
                      <span class="text-primary">${htmlCount}</span>
                      HTML ${pluralOf("pages", htmlCount)}
                    `)}
                  </p>
                  <p>
                    ${msg(html`
                      <span class="text-neutral-600">${fileCount}</span>
                      Non-HTML files captured as ${pluralOf("pages", fileCount)}
                    `)}
                  </p>
                  <p>
                    ${msg(html`
                      <span class="text-danger">${errorCount}</span>
                      Failed ${pluralOf("pages", errorCount)}
                    `)}
                    ${errorCount > 0
                      ? html`—
                          <a
                            class="text-primary"
                            href=${`/orgs/${this.orgSlugState}/workflows/${this.workflowId}/crawls/${this.crawlId}#logs`}
                            >${msg("View error logs")}</a
                          >`
                      : ""}
                  </p>
                </div> `
              : html`
                  <sl-skeleton class="mb-[5px] w-24"></sl-skeleton>
                  <sl-skeleton class="mb-[5px] w-64"></sl-skeleton>
                  <sl-skeleton class="mb-[5px] w-28"></sl-skeleton>
                `}
            ${when(this.mostRecentNonFailedQARun && this.qaRuns, (qaRuns) =>
              this.renderAnalysis(qaRuns),
            )}
          </btrix-card>

          <div>
            <h4 class="mb-2 mt-4 text-lg tabular-nums leading-8">
              <span class="font-semibold">${msg("Pages")}</span>
              ${this.pages != null
                ? `(${this.localize.number(this.pages.total)})`
                : html`<sl-skeleton
                    class="inline-block h-6 w-5 align-[-6px]"
                  ></sl-skeleton>`}
            </h4>
          </div>
          ${this.renderPageListControls()} ${this.renderPageList()}
        </btrix-tab-group-panel>
        <btrix-tab-group-panel name="runs" class="block">
          <btrix-table
            class="-mx-3 grid-cols-[repeat(4,_auto)_min-content] overflow-x-auto px-3"
          >
            <btrix-table-head>
              <btrix-table-header-cell>
                ${msg("Status")}
              </btrix-table-header-cell>
              <btrix-table-header-cell>
                ${msg("Started")}
              </btrix-table-header-cell>
              <btrix-table-header-cell>
                ${msg("Finished")}
              </btrix-table-header-cell>
              <btrix-table-header-cell>
                ${msg("Started by")}
              </btrix-table-header-cell>
              <btrix-table-header-cell class="px-0">
                <span class="sr-only">${msg("Row actions")}</span>
              </btrix-table-header-cell>
            </btrix-table-head>
            <btrix-table-body class="rounded border">
              ${when(this.qaRuns, this.renderQARunRows)}
            </btrix-table-body>
          </btrix-table>
        </btrix-tab-group-panel>
      </btrix-tab-group>
    `;
  }

  private readonly renderQARunRows = (qaRuns: QARun[]) => {
    if (!qaRuns.length) {
      return html`
        <div
          class="col-span-4 flex h-full flex-col items-center justify-center gap-2 p-3 text-xs text-neutral-500"
        >
          <sl-icon name="slash-circle"></sl-icon>
          ${msg("No analysis runs, yet")}
        </div>
      `;
    }
    const authToken = this.authState!.headers.Authorization.split(" ")[1];
    return qaRuns.map(
      (run, idx) => html`
        <btrix-table-row class=${idx > 0 ? "border-t" : ""}>
          <btrix-table-cell>
            <btrix-crawl-status
              .state=${run.state}
              type="qa"
            ></btrix-crawl-status>
          </btrix-table-cell>
          <btrix-table-cell>
            <btrix-format-date
              date=${run.started}
              month="2-digit"
              day="2-digit"
              year="numeric"
              hour="2-digit"
              minute="2-digit"
            ></btrix-format-date>
          </btrix-table-cell>
          <btrix-table-cell>
            ${run.finished
              ? html`
                  <btrix-format-date
                    date=${run.finished}
                    month="2-digit"
                    day="2-digit"
                    year="numeric"
                    hour="2-digit"
                    minute="2-digit"
                  ></btrix-format-date>
                `
              : notApplicable()}
          </btrix-table-cell>
          <btrix-table-cell>${run.userName}</btrix-table-cell>
          <btrix-table-cell class="p-0">
            <div class="col action">
              <btrix-overflow-dropdown>
                <sl-menu>
                  ${run.state === "canceled"
                    ? nothing
                    : html`
                        <btrix-menu-item-link
                          href=${`/api/orgs/${this.orgId}/crawls/${this.crawlId}/qa/${run.id}/download?auth_bearer=${authToken}`}
                          download
                        >
                          <sl-icon
                            name="cloud-download"
                            slot="prefix"
                          ></sl-icon>
                          ${msg("Download Analysis Run")}
                        </btrix-menu-item-link>
                        <sl-divider></sl-divider>
                      `}
                  <sl-menu-item
                    @click=${() => {
                      this.deleting = run.id;
                      void this.deleteQADialog?.show();
                    }}
                    style="--sl-color-neutral-700: var(--danger)"
                  >
                    <sl-icon name="trash3" slot="prefix"></sl-icon>
                    ${msg("Delete Analysis Run")}
                  </sl-menu-item>
                </sl-menu>
              </btrix-overflow-dropdown>
            </div>
          </btrix-table-cell>
        </btrix-table-row>
      `,
    );
  };

  private readonly renderDeleteConfirmDialog = () => {
    const runToBeDeleted = this.qaRuns?.find((run) => run.id === this.deleting);

    return html`
      <btrix-dialog
        id="deleteQARunDialog"
        .label=${msg("Delete Analysis Run?")}
      >
        <b class="font-semibold"
          >${msg(
            "All of the data included in this analysis run will be deleted.",
          )}</b
        >
        ${runToBeDeleted &&
        html`<div>
            ${msg(
              str`This analysis run includes data for ${runToBeDeleted.stats.done} ${pluralOf("pages", runToBeDeleted.stats.done)} and was started on `,
            )}
            <btrix-format-date
              date=${runToBeDeleted.started}
              month="2-digit"
              day="2-digit"
              year="numeric"
              hour="2-digit"
              minute="2-digit"
            ></btrix-format-date>
            ${msg("by")} ${runToBeDeleted.userName}.
          </div>
          <div slot="footer" class="flex justify-between">
            <sl-button
              size="small"
              @click=${() => void this.deleteQADialog?.hide()}
            >
              ${msg("Cancel")}
            </sl-button>
            <sl-button
              size="small"
              variant="danger"
              @click=${async () => {
                await this.deleteQARun(runToBeDeleted.id);
                this.dispatchEvent(new CustomEvent("btrix-qa-runs-update"));
                this.deleting = null;
                void this.deleteQADialog?.hide();
              }}
              >${msg("Delete Analysis Run")}</sl-button
            >
          </div>`}
      </btrix-dialog>
    `;
  };

  private readonly renderLoadingDetail = () =>
    html`<div class="min-w-32"><sl-spinner class="size-4"></sl-spinner></div>`;

  private renderAnalysis(qaRuns: QARun[]) {
    const isRunningOrStarting =
      this.mostRecentNonFailedQARun && isActive(this.mostRecentNonFailedQARun);
    const qaRun = qaRuns.find(({ id }) => id === this.qaRunId);

    if (!qaRun && isRunningOrStarting) {
      return html`<btrix-alert class="mb-3" variant="success">
        ${msg("Running QA analysis on pages...")}
      </btrix-alert>`;
    }

    if (!qaRun) {
      return html`<btrix-alert class="mb-3" variant="warning">
        ${msg("This analysis run doesn't exist.")}
      </btrix-alert>`;
    }

    return html`
      <div
        class="mb-3 mt-6 flex flex-wrap justify-between border-b pb-3 text-base font-semibold leading-none"
      >
        <div class="flex flex-wrap items-center gap-x-3">
          ${msg("HTML Page Match Analysis")}
          ${when(this.qaRuns, (qaRuns) => {
            const finishedQARuns = qaRuns.filter((qaRun) =>
              isSuccessfullyFinished(qaRun),
            );
            const latestFinishedSelected =
              this.qaRunId === finishedQARuns[0]?.id;

            const finishedAndRunningQARuns = qaRuns.filter(
              (qaRun) => isSuccessfullyFinished(qaRun) || isActive(qaRun),
            );
            const mostRecentSelected =
              this.qaRunId === finishedAndRunningQARuns[0]?.id;

            return html`
              <div>
                <sl-tooltip
                  content=${mostRecentSelected
                    ? msg("You’re viewing the latest analysis run results.")
                    : msg("You’re viewing results from an older analysis run.")}
                >
                  <sl-tag
                    size="small"
                    variant=${mostRecentSelected ? "success" : "warning"}
                  >
                    ${mostRecentSelected
                      ? msg("Current")
                      : latestFinishedSelected
                        ? msg("Last Finished")
                        : msg("Outdated")}
                  </sl-tag>
                </sl-tooltip>
                <btrix-qa-run-dropdown
                  .items=${finishedAndRunningQARuns}
                  selectedId=${this.qaRunId || ""}
                  @btrix-select=${(e: CustomEvent<SelectDetail>) =>
                    (this.qaRunId = e.detail.item.id)}
                ></btrix-qa-run-dropdown>
              </div>
            `;
          })}
        </div>
        <div class="flex items-center gap-2 text-neutral-500">
          <div class="text-sm font-normal">
            ${qaRun.state === "starting"
              ? msg("Analysis starting")
              : `${this.localize.number(qaRun.stats.done)}/${this.localize.number(qaRun.stats.found)}
                ${pluralOf("pages", qaRun.stats.found)} ${msg("analyzed")}`}
          </div>

          <sl-tooltip
            content=${msg(
              "Match analysis compares pages during a crawl against their replay during an analysis run. A good match indicates that the crawl is probably good, whereas severe inconsistencies may indicate a bad crawl.",
            )}
          >
            <sl-icon class="text-base" name="info-circle"></sl-icon>
          </sl-tooltip>
        </div>
      </div>
      <figure>
        <btrix-table class="grid-cols-[min-content_1fr]">
          <btrix-table-head class="sr-only">
            <btrix-table-header-cell>
              ${msg("Statistic")}
            </btrix-table-header-cell>
            <btrix-table-header-cell> ${msg("Chart")} </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body>
            <btrix-table-row>
              <btrix-table-cell class="font-medium">
                ${msg("Screenshots")}
              </btrix-table-cell>
              <btrix-table-cell class="p-0">
                ${this.qaStats.value
                  ? this.renderMeter(
                      qaRun.stats.found,
                      this.qaStats.value.screenshotMatch,
                      isRunningOrStarting,
                    )
                  : this.renderMeter()}
              </btrix-table-cell>
            </btrix-table-row>
            <btrix-table-row>
              <btrix-table-cell class="font-medium">
                ${msg("Text")}
              </btrix-table-cell>
              <btrix-table-cell class="p-0">
                ${this.qaStats.value
                  ? this.renderMeter(
                      qaRun.stats.found,
                      this.qaStats.value.textMatch,
                      isRunningOrStarting,
                    )
                  : this.renderMeter()}
              </btrix-table-cell>
            </btrix-table-row>
          </btrix-table-body>
        </btrix-table>
      </figure>
      <figcaption slot="footer" class="mt-2">
        <dl class="flex flex-wrap items-center justify-end gap-4">
          ${qaStatsThresholds.map(
            (threshold) => html`
              <div class="flex items-center gap-2">
                <dt
                  class="size-4 flex-shrink-0 rounded"
                  style="background-color: ${threshold.cssColor}"
                >
                  <span class="sr-only">${threshold.lowerBoundary}</span>
                </dt>
                <dd>${threshold.label}</dd>
              </div>
            `,
          )}
        </dl>
      </figcaption>
    `;
  }

  private renderMeter(): TemplateResult<1>;
  private renderMeter(
    pageCount: number,
    barData: QAStatsThreshold[],
    qaIsRunning: boolean | undefined,
  ): TemplateResult<1>;
  private renderMeter(
    pageCount?: number,
    barData?: QAStatsThreshold[],
    qaIsRunning?: boolean,
  ) {
    if (!pageCount || !barData) {
      return html`<sl-skeleton
        class="h-4 flex-1 [--border-radius:var(--sl-border-radius-medium)]"
        effect="sheen"
      ></sl-skeleton>`;
    }

    barData = barData.filter(
      (bar) => (bar.lowerBoundary as string) !== "No data",
    );

    const analyzedPageCount = barData.reduce(
      (prev, cur) => prev + cur.count,
      0,
    );

    const remainingPageCount = pageCount - analyzedPageCount;
    const remainderBarLabel = qaIsRunning ? msg("Pending") : msg("Incomplete");

    console.log({ pageCount, barData, analyzedPageCount });
    return html`
      <btrix-meter class="flex-1" value=${analyzedPageCount} max=${pageCount}>
        ${barData.map((bar) => {
          const threshold = qaStatsThresholds.find(
            ({ lowerBoundary }) => bar.lowerBoundary === lowerBoundary,
          );
          const idx = threshold ? qaStatsThresholds.indexOf(threshold) : -1;

          return bar.count !== 0
            ? html`
                <btrix-meter-bar
                  value=${(bar.count / analyzedPageCount) * 100}
                  style="--background-color: ${threshold?.cssColor ?? "none"}"
                  aria-label=${threshold?.label ?? ""}
                >
                  <div class="text-center">
                    ${threshold?.label}
                    <div class="text-xs opacity-80">
                      ${idx === 0
                        ? `<${+qaStatsThresholds[idx + 1].lowerBoundary * 100}%`
                        : idx === qaStatsThresholds.length - 1
                          ? `>=${threshold ? +threshold.lowerBoundary * 100 : 0}%`
                          : `${threshold ? +threshold.lowerBoundary * 100 : 0}-${+qaStatsThresholds[idx + 1].lowerBoundary * 100 || 100}%`}
                      ${msg("match", { desc: "label for match percentage" })}
                      <br />
                      ${this.localize.number(bar.count)}
                      ${pluralOf("pages", bar.count)}
                    </div>
                  </div>
                </btrix-meter-bar>
              `
            : nothing;
        })}
        ${remainingPageCount > 0
          ? html`
              <btrix-meter-bar
                slot="available"
                value=${(remainingPageCount / pageCount) * 100}
                aria-label=${remainderBarLabel}
                style="--background-color: none"
              >
                <div class="text-center">
                  ${remainderBarLabel}
                  <div class="text-xs opacity-80">
                    ${this.localize.number(remainingPageCount)}
                    ${pluralOf("pages", remainingPageCount)}
                  </div>
                </div>
              </btrix-meter-bar>
            `
          : nothing}
      </btrix-meter>
    `;
  }

  private renderPageListControls() {
    return html`
      <div
        class="z-40 mb-1 flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 px-5 py-3"
      >
        <div class="flex w-full grow items-center md:w-fit">
          <sl-select
            id="qaPagesSortBySelect"
            class="label-same-line"
            label=${msg("Sort by:")}
            size="small"
            value=${this.qaRunId ? "approved.-1" : "url.1"}
            pill
            @sl-change=${(e: SlChangeEvent) => {
              const { value } = e.target as SlSelect;
              const [field, direction] = (
                Array.isArray(value) ? value[0] : value
              ).split(".");
              void this.fetchPages({
                sortBy: field,
                sortDirection: +direction,
                page: 1,
              });
            }}
          >
            <sl-option value="title.1">${msg("Title")}</sl-option>
            <sl-option value="url.1">${msg("URL")}</sl-option>
            <sl-option value="notes.-1" ?disabled=${!this.qaRunId}
              >${msg("Most Comments")}</sl-option
            >
            <sl-option value="approved.-1" ?disabled=${!this.qaRunId}>
              ${msg("Recently Approved")}
            </sl-option>
            <sl-option value="approved.1" ?disabled=${!this.qaRunId}>
              ${msg("Not Approved")}
            </sl-option>
          </sl-select>
        </div>
      </div>
    `;
  }

  private renderPageList() {
    const pageTitle = (page: ArchivedItemPage) => html`
      <div class="truncate font-medium">
        ${page.title ||
        html`<span class="opacity-50">${msg("No page title")}</span>`}
      </div>
      <div class="truncate text-xs leading-4 text-neutral-600">${page.url}</div>
    `;
    return html`
      <btrix-table
        class="-mx-3 overflow-x-auto px-5"
        style="grid-template-columns: ${[
          "[clickable-start] minmax(12rem, auto)",
          "minmax(min-content, 12rem)",
          "minmax(min-content, 12rem) [clickable-end]",
        ].join(" ")}"
      >
        <btrix-table-head>
          <btrix-table-header-cell>${msg("Page")}</btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Approval")}</btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Comments")}</btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body class="rounded border">
          ${this.pages?.items.map(
            (page, idx) => html`
              <btrix-table-row
                class="${idx > 0 ? "border-t" : ""} ${this.qaRunId
                  ? "cursor-pointer transition-colors focus-within:bg-neutral-50 hover:bg-neutral-50"
                  : ""} select-none"
              >
                <btrix-table-cell
                  class="block overflow-hidden"
                  rowClickTarget=${ifDefined(this.qaRunId ? "a" : undefined)}
                >
                  ${this.qaRunId
                    ? html`
                        <a
                          href=${`${this.navigate.orgBasePath}/workflows/${this.workflowId}/crawls/${this.crawlId}/review/screenshots?qaRunId=${this.qaRunId}&itemPageId=${page.id}`}
                          title=${msg(str`Review "${page.title ?? page.url}"`)}
                          @click=${this.navigate.link}
                        >
                          ${pageTitle(page)}
                        </a>
                      `
                    : pageTitle(page)}
                </btrix-table-cell>
                <btrix-table-cell
                  >${this.renderApprovalStatus(page)}</btrix-table-cell
                >
                <btrix-table-cell>
                  ${page.notes?.length
                    ? html`
                        <sl-tooltip class="invert-tooltip">
                          <div slot="content">
                            <div class="text-xs text-neutral-400">
                              ${msg("Newest comment:")}
                            </div>
                            <div class="leading04 max-w-60 text-xs">
                              ${page.notes[page.notes.length - 1].text}
                            </div>
                          </div>
                          ${statusWithIcon(
                            html`<sl-icon
                              name="chat-square-text-fill"
                              class="text-blue-600"
                            ></sl-icon>`,
                            `${this.localize.number(page.notes.length)} ${pluralOf("comments", page.notes.length)}`,
                          )}
                        </sl-tooltip>
                      `
                    : html`<span class="text-neutral-400">
                        ${msg("None")}
                      </span>`}
                </btrix-table-cell>
              </btrix-table-row>
            `,
          )}
        </btrix-table-body>
      </btrix-table>
      ${when(this.pages, (pages) =>
        pages.total > pages.pageSize
          ? html`
              <footer class="mt-3 flex justify-center">
                <btrix-pagination
                  page=${pages.page}
                  size=${pages.pageSize}
                  totalCount=${pages.total}
                  @page-change=${(e: PageChangeEvent) => {
                    void this.fetchPages({
                      page: e.detail.page,
                    });
                  }}
                ></btrix-pagination>
              </footer>
            `
          : nothing,
      )}
    `;
  }

  private renderApprovalStatus(page: ArchivedItemPage) {
    const approvalStatus = pageApproval.approvalFromPage(page);
    const status = approvalStatus === "commentOnly" ? null : approvalStatus;
    const icon = iconForPageReview(status);
    const label =
      pageApproval.labelFor(status) ??
      html`<span class="text-neutral-400">${msg("None")}</span>`;

    return statusWithIcon(icon, label);
  }

  async fetchPages(params?: APIPaginationQuery & APISortQuery): Promise<void> {
    try {
      await this.updateComplete;

      let sortBy = params?.sortBy;
      let sortDirection = params?.sortDirection;

      if (!sortBy && this.qaPagesSortBySelect?.value[0]) {
        const value = this.qaPagesSortBySelect.value;
        if (value) {
          const [field, direction] = (
            Array.isArray(value) ? value[0] : value
          ).split(".");
          sortBy = field;
          sortDirection = +direction;
        }
      }

      this.pages = await this.getPages({
        page: params?.page ?? this.pages?.page ?? 1,
        pageSize: params?.pageSize ?? this.pages?.pageSize ?? 10,
        sortBy,
        sortDirection,
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-error",
      });
    }
  }

  private async getPages(
    params?: APIPaginationQuery & APISortQuery & { reviewed?: boolean },
  ): Promise<APIPaginatedList<ArchivedItemPage>> {
    const query = queryString.stringify(
      {
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );
    return this.api.fetch<APIPaginatedList<ArchivedItemPage>>(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/pages?${query}`,
    );
  }

  private async deleteQARun(id: string) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.crawlId}/qa/delete`,
        { method: "POST", body: JSON.stringify({ qa_run_ids: [id] }) },
      );
    } catch (e) {
      console.error(e);
    }
  }

  private async getQAStats(crawlId: string, qaRunId: string) {
    const query = queryString.stringify(
      {
        screenshotThresholds: [0.5, 0.9],
        textThresholds: [0.5, 0.9],
      },
      {
        arrayFormat: "comma",
      },
    );

    return this.api.fetch<QAStats>(
      `/orgs/${this.orgId}/crawls/${crawlId}/qa/${qaRunId}/stats?${query}`,
    );
  }
}
