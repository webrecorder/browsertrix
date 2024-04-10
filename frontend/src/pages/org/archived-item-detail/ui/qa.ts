import { localized, msg, str } from "@lit/localize";
import type { SlChangeEvent, SlSelect } from "@shoelace-style/shoelace";
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

import { TailwindElement } from "@/classes/TailwindElement";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import { iconFor as iconForPageReview } from "@/features/qa/page-list/helpers";
import {
  approvalFromPage,
  labelFor as labelForPageReview,
} from "@/features/qa/page-list/helpers/reviewStatus";
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
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

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

  @state()
  private pages?: APIPaginatedList<ArchivedItemPage>;

  @query("#qaPagesSortBySelect")
  private readonly qaPagesSortBySelect?: SlSelect | null;

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
              (qaRuns) =>
                qaRuns[0]
                  ? html`
                      <btrix-crawl-status
                        state=${qaRuns[0]?.state}
                        type="qa"
                      ></btrix-crawl-status>
                    `
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
          <btrix-desc-list-item label=${msg("Crawl Rating")}>
            ${when(
              this.crawl,
              (crawl) => this.renderReviewStatus(crawl.reviewStatus),
              this.renderLoadingDetail,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Elapsed Time")}>
            ${when(
              this.qaRuns,
              (qaRuns) =>
                qaRuns[0] && this.crawl?.qaCrawlExecSeconds
                  ? humanizeExecutionSeconds(this.crawl.qaCrawlExecSeconds)
                  : html`<span class="text-neutral-400">${msg("N/A")}</span>`,

              this.renderLoadingDetail,
            )}
          </btrix-desc-list-item>
        </btrix-desc-list>
      </div>

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
          <section class="mb-7">
            <div class="mb-2 flex items-center gap-1">
              <h4 class="text-lg font-semibold leading-8">
                ${msg("QA Analysis")}
              </h4>
              ${when(this.qaRuns, (qaRuns) => {
                const finishedQARuns = qaRuns.length
                  ? qaRuns.filter(({ finished }) => finished)
                  : [];
                return html`
                  <btrix-qa-run-dropdown
                    .items=${finishedQARuns}
                    selectedId=${this.qaRunId || ""}
                    @btrix-select=${(e: CustomEvent<SelectDetail>) =>
                      (this.qaRunId = e.detail.item.id)}
                  ></btrix-qa-run-dropdown>
                `;
              })}
            </div>

            ${when(
              this.qaRuns,
              (qaRuns) =>
                qaRuns[0]
                  ? this.renderAnalysis()
                  : html`
                      <div
                        class="rounded-lg border bg-slate-50 p-4 text-center text-slate-600"
                      >
                        ${msg(
                          "This crawl hasn’t been analyzed yet. Run an analysis to access crawl quality metrics.",
                        )}
                      </div>
                    `,

              () =>
                html`<div
                  class="grid h-[55px] place-content-center rounded-lg border bg-slate-50 p-4 text-lg text-slate-600"
                >
                  <sl-spinner></sl-spinner>
                </div>`,
            )}
          </section>
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
              date=${`${run.started}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          </btrix-table-cell>
          <btrix-table-cell>
            <sl-format-date
              date=${`${run.finished}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          </btrix-table-cell>
          <btrix-table-cell>${run.userName}</btrix-table-cell>
          <btrix-table-cell class="px-1">
            <div class="col action">
              <btrix-overflow-dropdown
                @click=${(e: MouseEvent) => {
                  // Prevent navigation to detail view
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <sl-menu>
                  <sl-menu-item
                    @click=${() => {
                      console.log("download");
                    }}
                  >
                    <sl-icon name="download" slot="prefix"></sl-icon>
                    ${msg("Download QA Run")}
                  </sl-menu-item>
                  <sl-divider></sl-divider>
                  <sl-menu-item
                    @click=${() => {
                      console.log("delete");
                    }}
                    style="--sl-color-neutral-700: var(--danger)"
                  >
                    <sl-icon name="trash3" slot="prefix"></sl-icon>
                    ${msg("Delete Item")}
                  </sl-menu-item>
                </sl-menu>
              </btrix-overflow-dropdown>
            </div>
          </btrix-table-cell>
        </btrix-table-row>
      `,
    );
  };

  private readonly renderLoadingDetail = () =>
    html`<sl-spinner class="h-4 w-4"></sl-spinner>`;

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
    return html`
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
            <sl-option value="notes.-1">${msg("Most comments")}</sl-option>
            <sl-option value="approved.-1"
              >${msg("Recently approved")}</sl-option
            >
            <sl-option value="approved.1">${msg("Not approved")}</sl-option>
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
}
