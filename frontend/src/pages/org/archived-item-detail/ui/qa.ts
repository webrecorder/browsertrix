import { localized, msg, str } from "@lit/localize";
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
import {
  approvalFromPage,
  labelFor as labelForPageReview,
} from "@/features/qa/page-list/helpers/reviewStatus";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SelectDetail } from "@/features/qa/qa-run-dropdown";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import {
  ReviewStatus,
  type ArchivedItem,
  type ArchivedItemPage,
} from "@/types/crawler";
import type { QARun } from "@/types/qa";
import { type AuthState } from "@/utils/AuthService";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { finishedCrawlStates } from "@/utils/crawler";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { getLocale, pluralize } from "@/utils/localization";

const iconForCrawlReview = (status: ArchivedItem["reviewStatus"]) => {
  switch (status) {
    case ReviewStatus.Bad:
    case ReviewStatus.Poor:
      return html`<sl-icon
        name="patch-exclamation-fill"
        class="text-danger-600"
      ></sl-icon>`;
    case ReviewStatus.Fair:
      return html`<sl-icon
        name="patch-minus"
        class="text-success-600"
      ></sl-icon>`;
    case ReviewStatus.Good:
    case ReviewStatus.Excellent:
      return html`<sl-icon
        name="patch-check-fill"
        class="text-success-600"
      ></sl-icon>`;

    default:
      return;
  }
};

const labelForCrawlReview = (severity: ArchivedItem["reviewStatus"]) => {
  switch (severity) {
    case ReviewStatus.Bad:
      return msg("Bad");
    case ReviewStatus.Poor:
      return msg("Poor");
    case ReviewStatus.Fair:
      return msg("Fair");
    case ReviewStatus.Good:
      return msg("Good");
    case ReviewStatus.Excellent:
      return msg("Excellent");
    default:
      return;
  }
};

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
                      } Pages`,
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
          <btrix-desc-list-item label=${msg("Crawl Rating")}>
            ${when(
              this.crawl,
              (crawl) => this.renderReviewStatus(crawl.reviewStatus),
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
          ${msg("Review Pages")}
        </btrix-tab-group-tab>
        ${when(
          this.qaRuns,
          (qaRuns) => html`
            <btrix-tab-group-tab
              slot="nav"
              panel="runs"
              ?disabled=${!qaRuns.length}
            >
              <sl-icon name="list-ul"></sl-icon>
              ${msg("Analysis Runs")}
            </btrix-tab-group-tab>
          `,
        )}

        <sl-divider></sl-divider>

        <btrix-tab-group-panel name="pages" class="block">
          ${
            // TODO un-hide this once we've got data in here
            nothing
            // <section class="mb-7">
            //   <div class="mb-2 flex items-center">
            //     <h4 class="mr-3 text-lg font-semibold leading-8">
            //       ${msg("QA Analysis")}
            //     </h4>
            //     ${when(this.qaRuns, (qaRuns) => {
            //       const finishedQARuns = qaRuns.filter(({ state }) =>
            //         finishedCrawlStates.includes(state),
            //       );

            //       if (!finishedQARuns.length) {
            //         return nothing;
            //       }

            //       const mostRecentSelected =
            //         this.mostRecentNonFailedQARun &&
            //         this.mostRecentNonFailedQARun.id === this.qaRunId;
            //       const latestFinishedSelected =
            //         this.qaRunId === finishedQARuns[0].id;

            //       return html`
            //         <sl-tooltip
            //           content=${mostRecentSelected
            //             ? msg(
            //                 "You're viewing the latest results from a finished analysis run.",
            //               )
            //             : msg(
            //                 "You're viewing results from an older analysis run.",
            //               )}
            //         >
            //           <sl-tag
            //             size="small"
            //             variant=${mostRecentSelected ? "success" : "warning"}
            //           >
            //             ${mostRecentSelected
            //               ? msg("Current")
            //               : latestFinishedSelected
            //                 ? msg("Last Finished")
            //                 : msg("Outdated")}
            //           </sl-tag>
            //         </sl-tooltip>
            //         <btrix-qa-run-dropdown
            //           .items=${finishedQARuns}
            //           selectedId=${this.qaRunId || ""}
            //           @btrix-select=${(e: CustomEvent<SelectDetail>) =>
            //             (this.qaRunId = e.detail.item.id)}
            //         ></btrix-qa-run-dropdown>
            //       `;
            //     })}
            //   </div>
            //   ${when(
            //     this.qaRuns,
            //     () =>
            //       this.mostRecentNonFailedQARun
            //         ? this.renderAnalysis()
            //         : html`
            //             <div
            //               class="rounded-lg border bg-slate-50 p-4 text-center text-slate-600"
            //             >
            //               ${msg(
            //                 "This crawl hasn’t been analyzed yet. Run an analysis to access crawl quality metrics.",
            //               )}
            //             </div>
            //           `,

            //     () =>
            //       html`<div
            //         class="grid h-[55px] place-content-center rounded-lg border bg-slate-50 p-4 text-lg text-slate-600"
            //       >
            //         <sl-spinner></sl-spinner>
            //       </div>`,
            //   )}
            // </section>
          }
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
                ${msg("State")}
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
          ${msg("No analysis runs found")}
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
            "All of the data included in this Analysis Run will be deleted.",
          )}</b
        >
        ${runToBeDeleted &&
        html`<div>
            ${msg(
              str`This Analysis Run includes data for ${runToBeDeleted.stats.done} ${pluralize(runToBeDeleted.stats.done, { zero: msg("pages", { desc: 'plural form of "page" for zero pages', id: "pages.plural.zero" }), one: msg("page"), two: msg("pages", { desc: 'plural form of "page" for two pages', id: "pages.plural.two" }), few: msg("pages", { desc: 'plural form of "page" for few pages', id: "pages.plural.few" }), many: msg("pages", { desc: 'plural form of "page" for many pages', id: "pages.plural.many" }), other: msg("pages", { desc: 'plural form of "page" for multiple/other pages', id: "pages.plural.other" }) })} and was started on `,
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
              .autofocus=${true}
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
    html`<div class="min-w-32"><sl-spinner class="h-4 w-4"></sl-spinner></div>`;

  private renderReviewStatus(status: ArchivedItem["reviewStatus"]) {
    const icon =
      iconForCrawlReview(status) ??
      html` <sl-icon name="slash-circle" class="text-neutral-400"></sl-icon> `;
    const label =
      labelForCrawlReview(status) ??
      html`<span class="text-neutral-400">${msg("None Submitted")}</span>`;

    return statusWithIcon(icon, label);
  }

  private renderAnalysis() {
    const isRunning =
      this.mostRecentNonFailedQARun &&
      QA_RUNNING_STATES.includes(this.mostRecentNonFailedQARun.state);

    return html`
      ${isRunning
        ? html`<btrix-alert class="mb-3" variant="warning">
            ${msg(
              "This crawl is being analyzed. You're currently viewing results from an older analysis run.",
            )}
          </btrix-alert>`
        : nothing}
      <div class="flex flex-col gap-6 md:flex-row">
        <btrix-card class="flex-1">
          <span slot="title">${msg("Screenshots")}</span>
          TODO
        </btrix-card>
        <btrix-card class="flex-1">
          <span slot="title">${msg("Extracted Text")}</span>
          TODO
        </btrix-card>
        <btrix-card class="flex-1">
          <span slot="title">${msg("Page Resources")}</span>
          TODO
        </btrix-card>
      </div>
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
            value="approved.-1"
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
            <sl-option value="notes.-1">${msg("Most Comments")}</sl-option>
            <sl-option value="approved.-1"
              >${msg("Recently Approved")}</sl-option
            >
            <sl-option value="approved.1">${msg("Not Approved")}</sl-option>
          </sl-select>
        </div>
      </div>
    `;
  }

  private renderPageList() {
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
                class="${idx > 0
                  ? "border-t"
                  : ""} cursor-pointer select-none transition-colors focus-within:bg-neutral-50 hover:bg-neutral-50"
              >
                <btrix-table-cell
                  class="block overflow-hidden"
                  rowClickTarget="a"
                >
                  <a
                    class="truncate text-sm font-semibold"
                    href=${`${
                      this.navigate.orgBasePath
                    }/items/${this.itemType}/${this.crawlId}/review/screenshots?qaRunId=${
                      this.qaRunId || ""
                    }&itemPageId=${page.id}`}
                    title="${page.title ?? page.url}"
                    @click=${this.navigate.link}
                    >${page.title}</a
                  >
                  <div class="truncate text-xs leading-4 text-neutral-600">
                    ${page.url}
                  </div>
                </btrix-table-cell>
                <btrix-table-cell
                  >${this.renderApprovalStatus(page)}</btrix-table-cell
                >
                <btrix-table-cell
                  >${page.notes?.length
                    ? statusWithIcon(
                        html`<sl-icon
                          name="chat-square-text-fill"
                          class="text-blue-600"
                        ></sl-icon>`,
                        page.notes.length === 1
                          ? msg(str`1 comment`)
                          : msg(
                              str`${page.notes.length.toLocaleString()} comments`,
                            ),
                      )
                    : html`<span class="text-neutral-400"
                        >${msg("None")}</span
                      >`}</btrix-table-cell
                >
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
    const approvalStatus = approvalFromPage(page);
    const status = approvalStatus === "commentOnly" ? null : approvalStatus;
    const icon = iconForPageReview(status);
    const label =
      labelForPageReview(status) ??
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

  async getQARunDownloadLink(qaRunId: string) {
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

  async deleteQARun(id: string) {
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
}
