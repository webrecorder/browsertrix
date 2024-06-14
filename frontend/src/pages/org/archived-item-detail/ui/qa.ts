import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlSelect,
  SlShowEvent,
} from "@shoelace-style/shoelace";
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

import { QA_RUNNING_STATES } from "../archived-item-detail";

import { TailwindElement } from "@/classes/TailwindElement";
import { type Dialog } from "@/components/ui/dialog";
import type { MenuItemLink } from "@/components/ui/menu-item-link";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
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
import { type Auth, type AuthState } from "@/utils/AuthService";
import { finishedCrawlStates } from "@/utils/crawler";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { formatNumber, getLocale } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";

type QAStatsThreshold = {
  lowerBoundary: `${number}` | "No data";
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
@localized()
@customElement("btrix-archived-item-detail-qa")
export class ArchivedItemDetailQA extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-cell-padding-top: var(--sl-spacing-x-small);
      --btrix-cell-padding-bottom: var(--sl-spacing-x-small);
      --btrix-cell-padding-left: var(--sl-spacing-small);
      --btrix-cell-padding-right: var(--sl-spacing-small);
    }
  `;

  @property({ type: Object, attribute: false })
  authState?: AuthState;

  @property({ type: String, attribute: false })
  orgId?: string;

  @property({ type: String, attribute: false })
  crawlId?: string;

  @property({ type: String, attribute: false })
  itemType: ArchivedItem["type"] = "crawl";

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
    task: async ([
      orgId,
      crawlId,
      qaRunId,
      authState,
      mostRecentNonFailedQARun,
    ]) => {
      if (!qaRunId || !authState || !mostRecentNonFailedQARun)
        throw new Error("Missing args");
      const stats = await this.getQAStats(orgId, crawlId, qaRunId, authState);
      return stats;
    },
    args: () =>
      [
        this.orgId!,
        this.crawlId!,
        this.qaRunId,
        this.authState,
        this.mostRecentNonFailedQARun,
      ] as const,
  });

  @state()
  private deleting: string | null = null;

  @query("#qaPagesSortBySelect")
  private readonly qaPagesSortBySelect?: SlSelect | null;

  @query("#deleteQARunDialog")
  private readonly deleteQADialog?: Dialog | null;

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      void this.fetchPages();
    }
  }

  render() {
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
          ${when(this.mostRecentNonFailedQARun && this.qaRuns, (qaRuns) =>
            this.renderAnalysis(qaRuns),
          )}

          <div>
            <h4 class="mb-2 mt-4 text-lg leading-8">
              <span class="font-semibold">${msg("Pages")}</span> (${(
                this.pages?.total ?? 0
              ).toLocaleString()})
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
              <btrix-table-header-cell class="px-1">
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
            <sl-format-date
              lang=${getLocale()}
              date=${`${run.started}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          </btrix-table-cell>
          <btrix-table-cell>
            ${run.finished
              ? html`
                  <sl-format-date
                    lang=${getLocale()}
                    date=${`${run.finished}Z`}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="2-digit"
                    minute="2-digit"
                  ></sl-format-date>
                `
              : notApplicable()}
          </btrix-table-cell>
          <btrix-table-cell>${run.userName}</btrix-table-cell>
          <btrix-table-cell class="px-1">
            <div class="col action">
              <btrix-overflow-dropdown
                @sl-show=${async (e: SlShowEvent) => {
                  const dropdown = e.currentTarget as OverflowDropdown;
                  const downloadLink = dropdown.querySelector<MenuItemLink>(
                    "btrix-menu-item-link",
                  );

                  if (!downloadLink) {
                    console.debug("no download link");
                    return;
                  }

                  downloadLink.loading = true;
                  const file = await this.getQARunDownloadLink(run.id);
                  if (file) {
                    downloadLink.disabled = false;
                    downloadLink.href = file.path;
                  } else {
                    downloadLink.disabled = true;
                  }
                  downloadLink.loading = false;
                }}
              >
                <sl-menu>
                  ${run.state === "canceled"
                    ? nothing
                    : html`
                        <btrix-menu-item-link href="#" download>
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
            <sl-format-date
              lang=${getLocale()}
              date=${`${runToBeDeleted.started}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
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
    const isRunning =
      this.mostRecentNonFailedQARun &&
      QA_RUNNING_STATES.includes(this.mostRecentNonFailedQARun.state);
    const qaRun = qaRuns.find(({ id }) => id === this.qaRunId);

    if (!qaRun && isRunning) {
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
      <btrix-card>
        <div slot="title" class="flex flex-wrap justify-between">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            ${msg("Page Match Analysis")}
            ${when(this.qaRuns, (qaRuns) => {
              const finishedQARuns = qaRuns.filter(({ state }) =>
                finishedCrawlStates.includes(state),
              );
              const latestFinishedSelected =
                this.qaRunId === finishedQARuns[0]?.id;

              const finishedAndRunningQARuns = qaRuns.filter(
                ({ state }) =>
                  finishedCrawlStates.includes(state) ||
                  QA_RUNNING_STATES.includes(state),
              );
              const mostRecentSelected =
                this.qaRunId === finishedAndRunningQARuns[0]?.id;

              return html`
                <div>
                  <sl-tooltip
                    content=${mostRecentSelected
                      ? msg("You’re viewing the latest analysis run results.")
                      : msg(
                          "You’re viewing results from an older analysis run.",
                        )}
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
                : `${formatNumber(qaRun.stats.done)}/${formatNumber(qaRun.stats.found)}
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
              <btrix-table-header-cell>
                ${msg("Chart")}
              </btrix-table-header-cell>
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
      </btrix-card>
    `;
  }

  private renderMeter(pageCount?: number, barData?: QAStatsThreshold[]) {
    if (!pageCount || !barData) {
      return html`<sl-skeleton
        class="h-4 flex-1 [--border-radius:var(--sl-border-radius-medium)]"
        effect="sheen"
      ></sl-skeleton>`;
    }

    const barTotal = barData.reduce((prev, cur) => prev + cur.count, 0);

    // TODO remove this once we stop including identical files in "No data" counts
    // see https://github.com/webrecorder/browsertrix/issues/1859
    if (barTotal > pageCount) {
      barData[
        barData.findIndex((bar) => bar.lowerBoundary === "No data")
      ].count -= barTotal - pageCount;
    }

    const analyzedPageCount =
      pageCount -
      (barData.find((bar) => bar.lowerBoundary === "No data")?.count ?? 0);

    return html`
      <btrix-meter class="flex-1" value=${analyzedPageCount} max=${pageCount}>
        ${barData.map((bar) => {
          const threshold = qaStatsThresholds.find(
            ({ lowerBoundary }) => bar.lowerBoundary === lowerBoundary,
          );
          const idx = threshold ? qaStatsThresholds.indexOf(threshold) : -1;

          const isNoDataBar = bar.lowerBoundary === "No data";

          return bar.count !== 0
            ? html`
                <btrix-meter-bar
                  value=${(bar.count /
                    (isNoDataBar ? pageCount : analyzedPageCount)) *
                  100}
                  style="--background-color: ${threshold?.cssColor}"
                  aria-label=${bar.lowerBoundary}
                  slot=${ifDefined(isNoDataBar ? "available" : undefined)}
                >
                  <div class="text-center">
                    ${bar.lowerBoundary === "No data"
                      ? msg("No Data")
                      : threshold?.label}
                    <div class="text-xs opacity-80">
                      ${bar.lowerBoundary !== "No data"
                        ? html`${idx === 0
                              ? `<${+qaStatsThresholds[idx + 1].lowerBoundary * 100}%`
                              : idx === qaStatsThresholds.length - 1
                                ? `>=${threshold ? +threshold.lowerBoundary * 100 : 0}%`
                                : `${threshold ? +threshold.lowerBoundary * 100 : 0}-${+qaStatsThresholds[idx + 1].lowerBoundary * 100 || 100}%`}
                            match <br />`
                        : nothing}
                      ${formatNumber(bar.count)} ${pluralOf("pages", bar.count)}
                    </div>
                  </div>
                </btrix-meter-bar>
              `
            : nothing;
        })}
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
                          href=${`${this.navigate.orgBasePath}/items/${this.itemType}/${this.crawlId}/review/screenshots?qaRunId=${this.qaRunId}&itemPageId=${page.id}`}
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
                            `${page.notes.length.toLocaleString()} ${pluralOf("comments", page.notes.length)}`,
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
      this.authState!,
    );
  }

  private async getQARunDownloadLink(qaRunId: string) {
    try {
      const { resources } = await this.api.fetch<QARun>(
        `/orgs/${this.orgId}/crawls/${this.crawlId}/qa/${qaRunId}/replay.json`,
        this.authState!,
      );
      // TODO handle more than one file
      return resources?.[0];
    } catch (e) {
      console.debug(e);
    }
  }

  private async deleteQARun(id: string) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.crawlId}/qa/delete`,
        this.authState!,
        { method: "POST", body: JSON.stringify({ qa_run_ids: [id] }) },
      );
    } catch (e) {
      console.error(e);
    }
  }

  private async getQAStats(
    orgId: string,
    crawlId: string,
    qaRunId: string,
    authState: Auth,
  ) {
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
      `/orgs/${orgId}/crawls/${crawlId}/qa/${qaRunId}/stats?${query}`,
      authState,
    );
  }
}
