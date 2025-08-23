import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlRequestCloseEvent, SlTextarea } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { merge } from "immutable";
import { html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import throttle from "lodash/fp/throttle";
import queryString from "query-string";

import stylesheet from "./archived-item-qa.stylesheet.css";
import type * as QATypes from "./types";
import { renderResourceDiff, renderResources } from "./ui/resources";
import { renderImage, renderScreenshots } from "./ui/screenshots";
import { renderSeverityBadge } from "./ui/severityBadge";
import { renderText, renderTextDiff } from "./ui/text";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { isQaPage } from "@/features/qa/page-list/helpers/page";
import {
  type QaFilterChangeDetail,
  type QaPaginationChangeDetail,
  type QaSortChangeDetail,
  type SortableFieldNames,
  type SortDirection,
} from "@/features/qa/page-list/page-list";
import { type UpdatePageApprovalDetail } from "@/features/qa/page-qa-approval";
import type { SelectDetail } from "@/features/qa/qa-run-dropdown";
import { pageBack } from "@/layouts/pageHeader";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { ArchivedItem, ArchivedItemPageComment } from "@/types/crawler";
import type { ArchivedItemQAPage, QARun } from "@/types/qa";
import { SortDirection as APISortDirection } from "@/types/utils";
import {
  isActive,
  isSuccessfullyFinished,
  renderName,
  type finishedCrawlStates,
} from "@/utils/crawler";
import { maxLengthValidator } from "@/utils/form";
import { isArchivingDisabled } from "@/utils/orgs";
import { formatRwpTimestamp } from "@/utils/replay";
import { tw } from "@/utils/tailwind";

const POLL_INTERVAL_SECONDS = 10;
const DEFAULT_PAGE_SIZE = 100;

const styles = unsafeCSS(stylesheet);

type PageResource = {
  status?: number;
  mime?: string;
  type?: string;
};

// From https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types
const IMG_EXTS = [
  "apng",
  "avif",
  "gif",
  "jpg",
  "jpeg",
  "jfif",
  "pjpeg",
  "pjp",
  "png",
  "svg",
  "webp",
  "tif",
  "tiff",
  "bmp",
  "ico",
  "cur",
];

const tabToPrefix: Record<QATypes.QATab, string> = {
  screenshots: "view",
  text: "text",
  resources: "pageinfo",
  replay: "",
};

@customElement("btrix-archived-item-qa")
@localized()
export class ArchivedItemQA extends BtrixElement {
  static styles = styles;

  @property({ type: String })
  workflowId?: string;

  @property({ type: String })
  itemId?: string;

  @property({ type: String })
  itemPageId?: string;

  @property({ type: String })
  qaRunId?: string;

  @property({ type: String })
  tab: QATypes.QATab = "screenshots";

  @state()
  private item?: ArchivedItem;

  @state()
  notFailedQaRuns?: (QARun & {
    state: (typeof finishedCrawlStates)[number];
  })[];

  @state()
  private pages?: APIPaginatedList<QATypes.Page>;

  @property({ type: Object })
  page?: QATypes.Page;

  @state()
  private crawlData: QATypes.ReplayData = null;

  @state()
  private qaData: QATypes.ReplayData = null;

  // indicate whether the crawl / qa endpoints have been registered in SW
  // if not, requires loading via <replay-web-page>
  // endpoints may be registered but crawlData / qaData may still be missing
  @state()
  private crawlDataRegistered = false;

  @state()
  private qaDataRegistered = false;

  @state()
  private splitView = true;

  @state()
  private isReloadingReplay = false;

  @state()
  filterPagesBy: {
    filterQABy?: string;
    gte?: number;
    gt?: number;
    lte?: number;
    lt?: number;
    reviewed?: boolean;
    approved?: boolean;
    hasNotes?: boolean;
  } = {};

  @state()
  sortPagesBy: APISortQuery & { sortBy: SortableFieldNames } = {
    sortBy: "screenshotMatch",
    sortDirection: 1,
  };

  private readonly replaySwReg =
    navigator.serviceWorker.getRegistration("/replay/");
  private readonly validateItemDescriptionMax = maxLengthValidator(500);
  private readonly validatePageCommentMax = maxLengthValidator(500);

  @query("#hiddenReplayFrame")
  private readonly hiddenReplayFrame?: HTMLIFrameElement | null;

  @query("#interactiveReplayFrame")
  private readonly interactiveReplayFrame?: HTMLIFrameElement | null;

  @query(".reviewDialog")
  private readonly reviewDialog?: Dialog | null;

  @query(".commentDialog")
  private readonly commentDialog?: Dialog | null;

  @query('sl-textarea[name="pageComment"]')
  private readonly commentTextarea?: SlTextarea | null;

  private get noRuns() {
    return this.notFailedQaRuns && !this.notFailedQaRuns.length;
  }

  private get selectedFinishedRun() {
    if (!this.qaRunId) return;

    return this.notFailedQaRuns?.find(({ id }) => id === this.qaRunId);
  }

  private get analyzed() {
    return this.selectedFinishedRun && !isActive(this.selectedFinishedRun);
  }

  private readonly pollTask = new Task(this, {
    task: async ([qaRuns]) => {
      if (!qaRuns) return;

      const anyActive = qaRuns.some(isActive);

      if (!anyActive) {
        window.clearTimeout(this.pollTask.value);
        return;
      }

      return window.setTimeout(() => {
        void this.fetchQARuns();
      }, POLL_INTERVAL_SECONDS * 1000);
    },
    args: () => [this.notFailedQaRuns] as const,
  });

  connectedCallback(): void {
    super.connectedCallback();

    // Receive messages from replay-web-page windows
    void this.replaySwReg.then((reg) => {
      if (!reg) {
        console.debug("no reg, listening to messages");
        // window.addEventListener("message", this.onWindowMessage);
      }
    });

    window.addEventListener("message", this.onWindowMessage);
    window.addEventListener("scroll", this.onWindowScroll);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    window.clearTimeout(this.pollTask.value);

    if (this.crawlData?.blobUrl) URL.revokeObjectURL(this.crawlData.blobUrl);
    if (this.qaData?.blobUrl) URL.revokeObjectURL(this.qaData.blobUrl);

    window.removeEventListener("message", this.onWindowMessage);
    window.addEventListener("scroll", this.onWindowScroll);
  }

  private scrollY = 0;
  private readonly onWindowScroll = throttle(100)(() => {
    // Set scroll snap only when scrolling down
    if (window.scrollY > this.scrollY) {
      if (!document.documentElement.classList.contains(tw`snap-y`)) {
        document.documentElement.classList.add(tw`snap-y`);
      }
    } else {
      document.documentElement.classList.remove(tw`snap-y`);
    }

    this.scrollY = window.scrollY;
  });

  private readonly onWindowMessage = (event: MessageEvent) => {
    const sourceLoc = (event.source as Window | null)?.location.href;

    // ensure its an rwp frame
    if (sourceLoc && sourceLoc.indexOf("?source=") > 0) {
      void this.handleRwpMessage(sourceLoc);
    }
  };

  /**
   * Callback for when hidden RWP embeds are loaded and ready.
   * This won't fire if the RWP service worker is already
   * registered on the page due to RWP conditionally rendering
   * if the sw is not present.
   */
  private async handleRwpMessage(sourceLoc: string) {
    console.debug("handleRwpMessage", sourceLoc);
    // check if has /qa/ in path, then QA
    if (sourceLoc.indexOf("%2Fqa%2F") >= 0 && !this.qaDataRegistered) {
      this.qaDataRegistered = true;
      console.debug("onWindowMessage qa", this.qaData);
      await this.fetchContentForTab({ qa: true });
      await this.updateComplete;
      // otherwise main crawl replay
    } else if (!this.crawlDataRegistered) {
      this.crawlDataRegistered = true;
      console.debug("onWindowMessage crawl", this.crawlData);
      await this.fetchContentForTab();
      await this.updateComplete;
    }
    // if (this.crawlData && this.qaData) {
    //   window.removeEventListener("message", this.onWindowMessage);
    // }
  }

  protected async willUpdate(
    changedProperties: PropertyValues<this> | Map<PropertyKey, unknown>,
  ) {
    if (changedProperties.has("itemId") && this.itemId) {
      void this.initItem();
    } else if (
      changedProperties.has("filterPagesBy") ||
      changedProperties.has("sortPagesBy") ||
      changedProperties.has("qaRunId")
    ) {
      void this.fetchPages();
    }
    if (
      (changedProperties.has("itemPageId") ||
        changedProperties.has("qaRunId")) &&
      this.itemPageId
    ) {
      void this.fetchPage();
    }
    // Re-fetch when tab, archived item page, or QA run ID changes
    // from an existing one, probably due to user interaction
    if (changedProperties.get("tab") || changedProperties.get("page")) {
      if (changedProperties.get("page")) {
        if (this.crawlData?.blobUrl)
          URL.revokeObjectURL(this.crawlData.blobUrl);
        if (this.qaData?.blobUrl) URL.revokeObjectURL(this.qaData.blobUrl);

        if (this.tab === "replay") {
          this.showReplayPageLoadingDialog();
        } else {
          // FIXME Set to null to render loading state, should be refactored
          // to handle loading state separately in https://github.com/webrecorder/browsertrix/issues/1716
          this.crawlData = null;
          this.qaData = null;
        }
      }
      // TODO prefetch content for other tabs?
      void this.fetchContentForTab();
      void this.fetchContentForTab({ qa: true });
    } else if (changedProperties.get("qaRunId")) {
      // FIXME Set to null to render loading state, should be refactored
      // to handle loading state separately in https://github.com/webrecorder/browsertrix/issues/1716
      this.qaData = null;
      void this.fetchContentForTab({ qa: true });
    }
  }

  private async initItem() {
    void this.fetchCrawl();
    await this.fetchQARuns();

    const searchParams = new URLSearchParams(window.location.search);

    if (this.itemPageId) {
      void this.fetchPages({ page: 1 });
    } else {
      await this.fetchPages({ page: 1 });
    }

    const firstQARun = this.notFailedQaRuns?.[0];
    const firstPage = this.pages?.items[0];

    if (!this.qaRunId && firstQARun) {
      searchParams.set("qaRunId", firstQARun.id);
    }
    if (!this.itemPageId && firstPage) {
      searchParams.set("itemPageId", firstPage.id);
    }

    this.navigate.to(
      `${window.location.pathname}?${searchParams.toString()}`,
      undefined,
      undefined,
      /* replace: */ true,
    );
  }

  /**
   * Get current page position with previous and next items
   */
  private getPageListSliceByCurrent(
    pageId = this.itemPageId,
  ): [
    QATypes.Page | undefined,
    QATypes.Page | undefined,
    QATypes.Page | undefined,
  ] {
    if (!pageId || !this.pages) {
      return [undefined, undefined, undefined];
    }

    const pages = this.pages.items;
    const idx = pages.findIndex(({ id }) => id === pageId);
    return [pages[idx - 1], pages[idx], pages[idx + 1]];
  }

  private navToPage(pageId: string) {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("itemPageId", pageId);
    this.navigate.to(
      `${window.location.pathname}?${searchParams.toString()}`,
      undefined,
      /* resetScroll: */ false,
    );
  }

  private get fromWorkflow() {
    const searchParams = new URLSearchParams(window.location.search);

    return searchParams.get("from") === "workflow";
  }

  private get backUrl() {
    if (this.fromWorkflow) {
      return `${this.navigate.orgBasePath}/workflows/${this.workflowId}/latest`;
    }

    return `${this.navigate.orgBasePath}/workflows/${this.workflowId}/crawls/${this.itemId}#qa`;
  }

  render() {
    const crawlBaseUrl = `${this.navigate.orgBasePath}/workflows/${this.workflowId}/crawls/${this.itemId}`;

    const searchParams = new URLSearchParams(window.location.search);
    const itemName = this.item ? renderName(this.item) : nothing;
    const [prevPage, currentPage, nextPage] = this.getPageListSliceByCurrent();

    return html`
      ${this.renderHidden()}

      <div class="mb-4 flex items-center">${this.renderBackLink()}</div>

      <article class="qa-grid grid min-h-screen gap-x-6 gap-y-0 lg:snap-start">
        <header
          class="grid--header flex flex-wrap items-center justify-between gap-2 border-b py-2 md:flex-nowrap"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <h1
              class="flex min-w-32 max-w-prose flex-1 flex-shrink-0 gap-1 truncate text-base font-semibold leading-tight"
            >
              ${msg("Review")} ${itemName}
            </h1>
          </div>
          <sl-button-group class="ml-auto">
            <sl-button
              variant="success"
              size="small"
              @click=${() => void this.reviewDialog?.show()}
            >
              <sl-icon slot="prefix" name="patch-check"></sl-icon>
              ${msg("Finish Review")}
            </sl-button>
            <sl-dropdown distance="4" hoist>
              <sl-button
                slot="trigger"
                variant="success"
                size="small"
                caret
                aria-label=${msg("More options")}
              ></sl-button>
              <sl-menu>
                <sl-menu-item @click=${() => void this.reviewDialog?.show()}>
                  <sl-icon slot="prefix" name="patch-check-fill"></sl-icon>
                  ${msg("Rate Crawl")}
                </sl-menu-item>
                <btrix-menu-item-link href="${crawlBaseUrl}#qa">
                  <sl-icon slot="prefix" name="clipboard2-data-fill"></sl-icon>
                  ${msg("Go to QA Overview")}
                </btrix-menu-item-link>
              </sl-menu>
            </sl-dropdown>
          </sl-button-group>
        </header>

        <div
          class="grid--pageToolbar flex flex-wrap items-center justify-stretch gap-2 border-b py-2 @container"
        >
          <h3
            class="flex-auto flex-shrink-0 flex-grow basis-52 truncate font-semibold leading-7 text-neutral-700"
            title="${this.page?.title ?? ""}"
          >
            ${this.page?.title ||
            html`<span class="opacity-50">${msg("No page title")}</span>`}
          </h3>
          <div
            class="ml-auto flex flex-grow basis-auto flex-wrap justify-between gap-2 @lg:flex-grow-0"
          >
            <sl-button
              size="small"
              @click=${this.navPrevPage}
              ?disabled=${!prevPage}
              class="order-1"
            >
              <sl-icon slot="prefix" name="arrow-left"></sl-icon>
              ${msg("Previous")}
              <span class="sr-only @lg:not-sr-only">${msg("Page")}</span>
            </sl-button>
            <btrix-page-qa-approval
              class="order-3 mx-auto @lg:order-2 @lg:mx-0 @lg:w-auto"
              .itemId=${this.itemId}
              .pageId=${this.itemPageId}
              .page=${this.page}
              @btrix-show-comments=${() => void this.commentDialog?.show()}
              @btrix-update-page-approval=${this.onUpdatePageApproval}
            ></btrix-page-qa-approval>
            <sl-button
              variant=${nextPage && !this.noRuns ? "primary" : "default"}
              size="small"
              ?disabled=${!nextPage}
              @click=${this.navNextPage}
              class="order-2 @lg:order-3"
            >
              <sl-icon slot="suffix" name="arrow-right"></sl-icon>
              ${msg("Next")}
              <span class="sr-only @lg:not-sr-only">${msg("Page")}</span>
            </sl-button>
          </div>
        </div>

        <div class="grid--tabGroup flex min-w-0 flex-col">
          <nav
            aria-label="${msg("Page heuristics")}"
            class="-mx-3 my-0 flex flex-wrap items-center gap-2 overflow-x-auto px-3 py-2 lg:mx-0 lg:px-0"
          >
            <btrix-navigation-button
              id="screenshot-tab"
              href=${`${crawlBaseUrl}/review/screenshots?${searchParams.toString()}`}
              ?active=${this.tab === "screenshots"}
              @click=${this.onTabNavClick}
            >
              <sl-icon name="images"></sl-icon>
              ${msg("Screenshot")}
              ${when(this.page || currentPage, (page) =>
                isQaPage(page)
                  ? renderSeverityBadge(page.qa.screenshotMatch)
                  : nothing,
              )}
            </btrix-navigation-button>
            <btrix-navigation-button
              id="text-tab"
              href=${`${crawlBaseUrl}/review/text?${searchParams.toString()}`}
              ?active=${this.tab === "text"}
              @click=${this.onTabNavClick}
            >
              <sl-icon name="file-text-fill"></sl-icon>
              ${msg("Text")}
              ${when(this.page || currentPage, (page) =>
                isQaPage(page)
                  ? renderSeverityBadge(page.qa.textMatch)
                  : nothing,
              )}
            </btrix-navigation-button>
            <btrix-navigation-button
              id="text-tab"
              href=${`${crawlBaseUrl}/review/resources?${searchParams.toString()}`}
              ?active=${this.tab === "resources"}
              @click=${this.onTabNavClick}
            >
              <sl-icon name="puzzle-fill"></sl-icon>
              ${msg("Resources")}
            </btrix-navigation-button>
            <btrix-navigation-button
              id="replay-tab"
              href=${`${crawlBaseUrl}/review/replay?${searchParams.toString()}`}
              ?active=${this.tab === "replay"}
              @click=${this.onTabNavClick}
            >
              <sl-icon name="replaywebpage" library="app"></sl-icon>
              ${msg("Replay")}
            </btrix-navigation-button>
            <div class="ml-auto flex items-center gap-3">
              ${when(
                !this.analyzed,
                () =>
                  html`<btrix-popover
                    content=${msg(
                      "Screenshot, text, and resource comparison views are only available for analyzed crawls. Run analysis to view and compare all quality metrics.",
                    )}
                  >
                    <div
                      class="flex items-center gap-1.5 whitespace-nowrap text-xs text-neutral-500"
                    >
                      <sl-icon class="text-sm" name="info-circle"></sl-icon>
                      ${msg("Limited view")}
                    </div>
                  </btrix-popover>`,
              )}
              ${when(
                this.noRuns,
                () => html`
                  <sl-button
                    size="small"
                    variant="primary"
                    @click=${() => void this.startQARun()}
                    ?disabled=${isArchivingDisabled(this.org, true)}
                  >
                    <sl-icon
                      slot="prefix"
                      name="microscope"
                      library="app"
                    ></sl-icon>
                    ${msg("Run Analysis")}
                  </sl-button>
                `,
                () =>
                  when(
                    this.notFailedQaRuns,
                    (qaRuns) => html`
                      <btrix-qa-run-dropdown
                        .items=${qaRuns}
                        crawlId=${this.itemId || ""}
                        selectedId=${this.qaRunId || ""}
                        @btrix-select=${(e: CustomEvent<SelectDetail>) => {
                          const params = new URLSearchParams(searchParams);
                          params.set("qaRunId", e.detail.item.id);
                          this.navigate.to(
                            `${window.location.pathname}?${params.toString()}`,
                            undefined,
                            false,
                          );
                        }}
                      ></btrix-qa-run-dropdown>
                    `,
                  ),
              )}
            </div>
          </nav>
          ${this.renderPanelToolbar()} ${this.renderPanel()}
        </div>

        <section
          class="grid--pageList grid grid-rows-[auto_1fr] *:min-h-0 *:min-w-0"
        >
          <h2
            class="my-4 text-base font-semibold leading-none text-neutral-800"
          >
            ${msg("Pages")}
          </h2>
          <btrix-qa-page-list
            class="flex flex-col lg:contain-size"
            .qaRunId=${this.qaRunId}
            ?analyzed=${this.analyzed}
            .itemPageId=${this.itemPageId}
            .pages=${this.pages}
            .orderBy=${{
              field: this.sortPagesBy.sortBy,
              direction: (this.sortPagesBy.sortDirection ===
              APISortDirection.Descending
                ? "desc"
                : "asc") as SortDirection,
            }}
            .filterBy=${this.filterPagesBy}
            totalPages=${+(this.item?.stats?.done || 0)}
            @btrix-qa-pagination-change=${(
              e: CustomEvent<QaPaginationChangeDetail>,
            ) => {
              const { page } = e.detail;
              void this.fetchPages({ page });
            }}
            @btrix-qa-page-select=${(e: CustomEvent<string>) => {
              this.navToPage(e.detail);
            }}
            @btrix-qa-filter-change=${(
              e: CustomEvent<QaFilterChangeDetail>,
            ) => {
              this.filterPagesBy = {
                ...this.filterPagesBy,
                ...e.detail,
              };
            }}
            @btrix-qa-sort-change=${(e: CustomEvent<QaSortChangeDetail>) => {
              this.sortPagesBy = {
                ...this.sortPagesBy,
                ...e.detail,
              };
            }}
          ></btrix-qa-page-list>
        </section>
      </article>

      <btrix-dialog class="commentDialog" label=${msg("Page Comments")}>
        ${this.renderComments()}

        <sl-button
          slot="footer"
          size="small"
          variant="primary"
          @click=${() => this.commentDialog?.submit()}
        >
          ${msg("Submit Comment")}
        </sl-button>
      </btrix-dialog>

      ${this.renderReviewDialog()}
    `;
  }

  private renderBackLink() {
    return pageBack({
      href: this.backUrl,
      content: this.fromWorkflow ? msg("Workflow") : msg("Crawl QA Overview"),
    });
  }

  private renderReviewDialog() {
    const { helpText, validate } = this.validateItemDescriptionMax;
    return html`
      <btrix-dialog
        class="reviewDialog [--width:60rem]"
        label=${msg("Finish Review")}
      >
        <form class="qaReviewForm" @submit=${this.onSubmitReview}>
          <div class="flex flex-col gap-6 md:flex-row">
            <div>
              <sl-radio-group
                class="mb-5"
                name="reviewStatus"
                label=${msg("Rate this crawl:")}
                value=${this.item?.reviewStatus ?? ""}
                required
              >
                <sl-radio value="5">
                  <strong class="font-semibold">${msg("Excellent!")}</strong>
                  <div class="text-xs text-neutral-600">
                    ${msg(
                      "This archived item perfectly replicates the original pages.",
                    )}
                  </div>
                </sl-radio>
                <sl-radio value="4">
                  <strong class="font-semibold">${msg("Good")}</strong>
                  <div class="text-xs text-neutral-600">
                    ${msg(
                      "Looks and functions nearly the same as the original pages.",
                    )}
                  </div>
                </sl-radio>
                <sl-radio value="3" checked>
                  <strong class="font-semibold">${msg("Fair")}</strong>
                  <div class="text-xs text-neutral-600">
                    ${msg(
                      "Similar to the original pages, but may be missing non-critical content or functionality.",
                    )}
                  </div>
                </sl-radio>
                <sl-radio value="2">
                  <strong class="font-semibold">${msg("Poor")}</strong>
                  <div class="text-xs text-neutral-600">
                    ${msg(
                      "Some similarities with the original pages, but missing critical content or functionality.",
                    )}
                  </div>
                </sl-radio>
                <sl-radio value="1">
                  <strong class="font-semibold">${msg("Bad")}</strong>
                  <div class="text-xs text-neutral-600">
                    ${msg(
                      "Missing all content and functionality from the original pages.",
                    )}
                  </div>
                </sl-radio>
              </sl-radio-group>
            </div>
            <div class="flex-1 pl-4 md:border-l">
              <sl-textarea
                label=${msg("Update crawl metadata?")}
                name="description"
                value=${this.item?.description ?? ""}
                placeholder=${msg("Add a description")}
                rows="10"
                autocomplete="off"
                help-text=${helpText}
                @sl-input=${validate}
              ></sl-textarea>
            </div>
          </div>
        </form>

        <div slot="footer" class="flex justify-between">
          <sl-button size="small" @click=${() => void this.reviewDialog?.hide()}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            size="small"
            type="submit"
            @click=${() => this.reviewDialog?.submit()}
          >
            <sl-icon name="patch-check" slot="prefix"></sl-icon>
            ${msg("Submit Review")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private renderHidden() {
    const iframe = (reg?: ServiceWorkerRegistration) =>
      when(this.page, () => {
        const onLoad = reg
          ? () => {
              void this.fetchContentForTab();
              void this.fetchContentForTab({ qa: true });
            }
          : () => {
              console.debug("waiting for post message instead");
            };
        // Use iframe to access replay content
        // Use a 'non-existent' URL on purpose so that RWP itself is not rendered,
        // but we need a /replay iframe for proper fetch() to service worker
        return html`
          <iframe
            class="hidden"
            id="hiddenReplayFrame"
            src="/replay/non-existent"
            @load=${onLoad}
          ></iframe>
        `;
      });
    const rwp = (reg?: ServiceWorkerRegistration) =>
      when(
        !reg || !this.crawlDataRegistered || !this.qaDataRegistered,
        () => html`
          <div class="offscreen" aria-hidden="true">
            ${this.itemId && !this.crawlDataRegistered
              ? this.renderRWP(this.itemId, { qa: false })
              : nothing}
            ${this.qaRunId && !this.qaDataRegistered
              ? this.renderRWP(this.qaRunId, { qa: true })
              : nothing}
          </div>
        `,
      );
    return guard(
      [
        this.replaySwReg,
        this.page,
        this.itemId,
        this.qaRunId,
        this.crawlDataRegistered,
        this.qaDataRegistered,
      ],
      () =>
        html`${until(
          this.replaySwReg.then((reg) => {
            return html`${iframe(reg)}${rwp(reg)}`;
          }),
        )}`,
    );
  }

  private renderComments() {
    const { helpText, validate } = this.validatePageCommentMax;
    return html`
      ${when(
        this.page?.notes?.length,
        (commentCount) => html`
          <btrix-details open>
            <span slot="title">
              ${msg(str`Comments (${this.localize.number(commentCount)})`)}
            </span>
            <ul>
              ${this.page?.notes?.map(
                (comment) =>
                  html`<li class="mb-3">
                    <div
                      class="flex items-center justify-between rounded-t border bg-neutral-50 text-xs leading-none text-neutral-600"
                    >
                      <div class="p-2">
                        ${msg(
                          str`${comment.userName} commented on ${this.localize.date(
                            comment.created,
                            {
                              year: "numeric",
                              month: "numeric",
                              day: "numeric",
                            },
                          )}`,
                        )}
                      </div>
                      <sl-tooltip content=${msg("Delete comment")}>
                        <sl-icon-button
                          class="hover:text-danger"
                          name="trash3"
                          label=${msg("Delete comment")}
                          @click=${async () =>
                            this.deletePageComment(comment.id)}
                        ></sl-icon-button>
                      </sl-tooltip>
                    </div>
                    <div class="rounded-b border-b border-l border-r p-2">
                      ${comment.text}
                    </div>
                  </li> `,
              )}
            </ul>
          </btrix-details>
        `,
      )}
      <form @submit=${this.onSubmitComment}>
        <sl-textarea
          name="pageComment"
          label=${msg("Add a comment")}
          placeholder=${msg("Enter page feedback")}
          rows="4"
          autocomplete="off"
          help-text=${helpText}
          @sl-input=${validate}
        ></sl-textarea>
      </form>
    `;
  }

  private renderPanelToolbar() {
    const buttons = html`
      ${choose(this.tab, [
        [
          "replay",
          () => html`
            <div class="flex">
              <sl-tooltip
                content=${msg("Reload Replay")}
                placement="bottom-start"
              >
                <btrix-button
                  size="small"
                  class="m-0.5"
                  @click=${() => {
                    if (
                      this.interactiveReplayFrame?.contentDocument
                        ?.readyState === "complete"
                    ) {
                      this.isReloadingReplay = true;
                      this.showReplayPageLoadingDialog();
                      this.interactiveReplayFrame.contentWindow?.location.reload();
                    }
                  }}
                >
                  <sl-icon
                    name="arrow-clockwise"
                    label=${msg("Reload page")}
                  ></sl-icon>
                </btrix-button>
              </sl-tooltip>
            </div>
          `,
        ],
        [
          "screenshots",
          () =>
            this.qaRunId
              ? html`
                  <div class="flex">
                    <sl-tooltip
                      content=${msg("Toggle screenshot wipe view")}
                      placement="bottom-start"
                    >
                      <btrix-button
                        raised
                        ?filled=${!this.splitView}
                        size="small"
                        @click="${() => (this.splitView = !this.splitView)}"
                        class="m-0.5"
                        aria-pressed=${!this.splitView}
                      >
                        <sl-icon name="vr"></sl-icon>
                      </btrix-button>
                    </sl-tooltip>
                  </div>
                `
              : undefined,
        ],
      ])}
    `;
    return html`
      <div
        class="${this.tab === "replay"
          ? "rounded-t-lg"
          : "rounded-lg mb-3"} flex h-12 items-center gap-2 border bg-neutral-50 p-2 text-base"
      >
        ${buttons}
        <div
          class="flex h-8 min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden whitespace-nowrap rounded border bg-neutral-0 px-2 text-sm"
        >
          <div class="fade-out-r scrollbar-hidden flex-1 overflow-x-scroll">
            <span class="pr-2">${this.page?.url || "http://"}</span>
          </div>
          ${when(
            this.page,
            (page) => html`
              <btrix-format-date
                class="font-monostyle text-xs text-neutral-500"
                .date=${page.ts}
                month="2-digit"
                day="2-digit"
                year="numeric"
                hour="2-digit"
                minute="2-digit"
              >
              </btrix-format-date>
            `,
          )}
        </div>
      </div>
    `;
  }

  private renderPanel() {
    // cache DOM for faster switching between tabs
    const choosePanel = () => {
      switch (this.tab) {
        case "screenshots":
          return this.analyzed
            ? renderScreenshots(this.crawlData, this.qaData, this.splitView)
            : html`<div
                class="aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50"
              >
                ${renderImage(this.crawlData)}
              </div>`;
        case "text":
          return this.analyzed
            ? renderTextDiff(this.crawlData, this.qaData)
            : renderText(this.crawlData);
        case "resources":
          return this.analyzed
            ? renderResourceDiff(this.crawlData, this.qaData)
            : renderResources(this.crawlData);
        case "replay":
          return this.renderReplay();
        default:
          break;
      }
    };
    return html`
      <section
        aria-labelledby="${this.tab}-tab"
        class="flex-1 overflow-hidden lg:pb-3 lg:contain-size"
      >
        ${cache(choosePanel())}
      </section>
    `;
  }

  private renderReplay() {
    return html`
      <div
        class="replayContainer ${tw`h-full min-h-96 [contain:paint] lg:min-h-0`}"
      >
        <div
          class=${tw`relative h-full overflow-hidden rounded-b-lg border-x border-b bg-slate-100 p-4 shadow-inner`}
        >
          ${when(
            this.crawlData?.replayUrl,
            (replayUrl) =>
              html`<iframe
                id="interactiveReplayFrame"
                src=${replayUrl}
                class=${tw`h-full w-full overflow-hidden overscroll-contain rounded-lg border bg-neutral-0 shadow-lg`}
                @load=${async (e: Event) => {
                  // NOTE This is all pretty hacky. To be improved with
                  // https://github.com/webrecorder/browsertrix/issues/1780

                  const iframe = e.currentTarget as HTMLIFrameElement;
                  const iframeContainer = iframe.closest(".replayContainer");
                  const showDialog = async () => {
                    await iframeContainer
                      ?.querySelector<Dialog>(
                        "btrix-dialog.clickPreventedDialog",
                      )
                      ?.show();
                  };

                  // Hide loading indicator
                  void iframeContainer
                    ?.querySelector<Dialog>("btrix-dialog.loadingPageDialog")
                    ?.hide();

                  // Prevent anchor tag navigation
                  iframe.contentDocument?.querySelectorAll("a").forEach((a) => {
                    a.addEventListener("click", (e: MouseEvent) => {
                      if (a.hasAttribute("href")) {
                        e.preventDefault();
                        e.stopPropagation();
                        void showDialog();
                      }
                    });
                  });

                  // Handle visibility change as fallback in case navigation happens anyway
                  const onVisibilityChange = async () => {
                    if (this.tab !== "replay") {
                      return;
                    }

                    // Check if we're reloading the page, not navigating away
                    if (this.isReloadingReplay) {
                      this.isReloadingReplay = false;
                      return;
                    }

                    iframe.contentWindow?.removeEventListener(
                      "visibilitychange",
                      onVisibilityChange,
                    );

                    // // We've navigated away--notify and go back
                    // await showDialog();
                    // iframe.contentWindow?.history.back();
                  };

                  iframe.contentWindow?.addEventListener(
                    "visibilitychange",
                    onVisibilityChange,
                  );
                }}
              ></iframe>`,
          )}
        </div>
        <btrix-dialog
          class="loadingPageDialog"
          ?open=${this.tab === "replay"}
          no-header
          @sl-request-close=${(e: SlRequestCloseEvent) => e.preventDefault()}
        >
          <div class="sr-only">${msg("Loading page")}</div>
          <sl-progress-bar
            indeterminate
            class="[--height:0.5rem]"
          ></sl-progress-bar>
        </btrix-dialog>
        <btrix-dialog
          class="clickPreventedDialog"
          .label=${msg("Navigation prevented")}
        >
          ${msg("Following links during review is disabled.")}
        </btrix-dialog>
      </div>
    `;
  }

  private readonly renderRWP = (rwpId: string, { qa }: { qa: boolean }) => {
    if (!rwpId) return;

    const replaySource = `/api/orgs/${this.orgId}/crawls/${this.itemId}${qa ? `/qa/${rwpId}` : ""}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });
    console.debug("rendering rwp", rwpId);
    return guard(
      [rwpId, this.page, this.authState],
      () => html`
        <replay-web-page
          source="${replaySource}"
          coll="${rwpId}"
          config="${config}"
          replayBase="/replay/"
          embed="replayonly"
          noCache="true"
          url=${
            /* TODO investigate if there's an RWP fix for preventing history manipulation when url is omitted */
            "about:blank"
          }
        ></replay-web-page>
      `,
    );
  };

  private readonly onTabNavClick = (e: MouseEvent) => {
    this.navigate.link(e, undefined, /* resetScroll: */ false);
  };

  private async onUpdatePageApproval(e: CustomEvent<UpdatePageApprovalDetail>) {
    const updated = e.detail;

    if (!this.page || this.page.id !== updated.id) return;

    const reviewStatusChanged = this.page.approved !== updated.approved;

    this.page = merge<QATypes.Page>(this.page, updated);

    if (reviewStatusChanged) {
      void this.fetchPages();
    }
  }

  private async fetchCrawl(): Promise<void> {
    try {
      this.item = await this.getCrawl();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-error",
      });
    }
  }

  private navNextPage() {
    const [, , nextPage] = this.getPageListSliceByCurrent();
    if (nextPage) {
      this.navToPage(nextPage.id);
    }
  }

  private navPrevPage() {
    const [prevPage] = this.getPageListSliceByCurrent();
    if (prevPage) {
      this.navToPage(prevPage.id);
    }
  }

  private showReplayPageLoadingDialog() {
    if (!this.interactiveReplayFrame) return;
    void this.interactiveReplayFrame
      .closest(".replayContainer")
      ?.querySelector<Dialog>("btrix-dialog.loadingPageDialog")
      ?.show();
  }

  private async onSubmitComment(e: SubmitEvent) {
    e.preventDefault();
    const value = this.commentTextarea?.value;

    if (!value) return;

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    void this.commentDialog?.hide();

    try {
      const { data } = await this.api.fetch<{ data: ArchivedItemPageComment }>(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${this.itemPageId}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ text: value }),
        },
      );

      const commentForm = this.commentDialog?.querySelector("form");
      if (commentForm) {
        commentForm.reset();
      }

      const comments = [...this.page!.notes!, data];
      this.page = merge<QATypes.Page>(this.page!, {
        notes: comments,
      });

      void this.fetchPages();
    } catch (e: unknown) {
      void this.commentDialog?.show();

      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't add comment at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-error",
      });
    }
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  private async deletePageComment(commentId: string): Promise<void> {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${this.itemPageId}/notes/delete`,
        {
          method: "POST",
          body: JSON.stringify({ delete_list: [commentId] }),
        },
      );

      const comments = this.page!.notes!.filter(({ id }) => id !== commentId);
      this.page = merge<QATypes.Page>(this.page!, {
        notes: comments,
      });

      void this.fetchPages();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't delete comment at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-error",
      });
    }
  }

  private async fetchQARuns(): Promise<void> {
    try {
      this.notFailedQaRuns = (await this.getQARuns()).filter(
        (qaRun) => isSuccessfullyFinished(qaRun) || isActive(qaRun),
      ) as ArchivedItemQA["notFailedQaRuns"];

      const latestRun = this.notFailedQaRuns?.[0];

      if (latestRun && !this.qaRunId && !isActive(latestRun)) {
        this.qaRunId = latestRun.id;
      }
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve analysis runs at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-error",
      });
    }
  }

  private async getQARuns(): Promise<QARun[]> {
    return this.api.fetch<QARun[]>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/qa`,
    );
  }

  private async getCrawl(): Promise<ArchivedItem> {
    return this.api.fetch<ArchivedItem>(
      `/orgs/${this.orgId}/crawls/${this.itemId}`,
    );
  }

  private async fetchPage(): Promise<void> {
    if (!this.itemPageId) return;

    try {
      this.page = await this.getPage(this.itemPageId);
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve page at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-error",
      });
    }
  }

  private resolveType(url: string, { mime = "", type }: PageResource) {
    if (type) {
      type = type.toLowerCase();
    }

    // Map common mime types where important information would be lost
    // if we only use first half to more descriptive resource types
    if (type === "script" || mime.includes("javascript")) {
      return "javascript";
    }
    if (type === "stylesheet" || mime.includes("css")) {
      return "stylesheet";
    }
    if (type === "image") {
      return "image";
    }
    if (type === "font") {
      return "font";
    }
    if (type === "ping") {
      return "other";
    }

    if (url.endsWith("favicon.ico")) {
      return "favicon";
    }

    let path = "";

    try {
      path = new URL(url).pathname;
    } catch (e) {
      // ignore
    }

    const ext = path.slice(path.lastIndexOf(".") + 1);

    if (type === "fetch" || type === "xhr") {
      if (IMG_EXTS.includes(ext)) {
        return "image";
      }
    }

    if (mime.includes("json") || ext === "json") {
      return "json";
    }

    if (mime.includes("pdf") || ext === "pdf") {
      return "pdf";
    }

    if (
      type === "document" ||
      mime.includes("html") ||
      ext === "html" ||
      ext === "htm"
    ) {
      return "html";
    }

    if (!mime) {
      return "other";
    }

    return mime.split("/")[0];
  }

  private async fetchContentForTab({ qa } = { qa: false }): Promise<void> {
    const page = this.page;
    const tab = this.tab;
    const sourceId = qa ? this.qaRunId : this.itemId;
    const frameWindow = this.hiddenReplayFrame?.contentWindow;

    if (!page || !sourceId || !frameWindow) {
      console.debug(
        "no page replaId or frameWindow",
        page,
        sourceId,
        frameWindow,
      );
      return;
    }

    if (qa && tab === "replay") {
      return;
    }

    const timestamp = formatRwpTimestamp(page.ts) || "";
    const pageUrl = page.url;

    const doLoad = async (isQA: boolean) => {
      const urlPrefix = tabToPrefix[tab];
      const urlPart = `${timestamp}mp_/${urlPrefix ? `urn:${urlPrefix}:` : ""}${pageUrl}`;
      const url = `/replay/w/${sourceId}/${urlPart}`;
      // TODO check status code

      const resp = await frameWindow.fetch(url);

      //console.log("resp:", resp);

      if (!resp.ok) {
        throw resp.status;
      }

      if (tab === "replay") {
        return { replayUrl: url };
      }
      if (tab === "screenshots") {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob) || "";
        return { blobUrl };
      }
      if (tab === "text") {
        const text = await resp.text();
        return { text };
      }
      {
        // tab === "resources"

        const json = (await resp.json()) as {
          urls: PageResource[];
        };
        // console.log(json);

        const typeMap = new Map<string, QATypes.GoodBad>();
        let good = 0,
          bad = 0;

        for (const [url, entry] of Object.entries(json.urls)) {
          const { status = 0, type, mime } = entry;
          const resType = this.resolveType(url, entry);

          // for debugging
          logResource(isQA, resType, url, type, mime, status);

          if (!typeMap.has(resType)) {
            if (status < 400) {
              typeMap.set(resType, { good: 1, bad: 0 });
              good++;
            } else {
              typeMap.set(resType, { good: 0, bad: 1 });
              bad++;
            }
          } else {
            const count = typeMap.get(resType);
            if (status < 400) {
              count!.good++;
              good++;
            } else {
              count!.bad++;
              bad++;
            }
            typeMap.set(resType, count!);
          }
        }

        typeMap.set("Total", { good, bad });

        // const text = JSON.stringify(
        //   Object.fromEntries(typeMap.entries()),
        //   null,
        //   2,
        // );

        return { resources: Object.fromEntries(typeMap.entries()) };
      }
    };

    try {
      const content = await doLoad(qa);

      if (qa) {
        this.qaData = {
          ...this.qaData,
          ...content,
        };
        this.qaDataRegistered = true;
      } else {
        this.crawlData = {
          ...this.crawlData,
          ...content,
        };
        this.crawlDataRegistered = true;
      }
    } catch (e: unknown) {
      console.debug("error:", e);

      // check if this endpoint is registered, if not, ensure re-render
      if (e === 404) {
        let hasEndpoint = false;
        try {
          const resp = await frameWindow.fetch(`/replay/w/api/c/${sourceId}`);
          hasEndpoint = !!resp.ok;
        } catch (e) {
          hasEndpoint = false;
        }
        if (qa) {
          this.qaData = hasEndpoint ? {} : null;
          this.qaDataRegistered = hasEndpoint;
        } else {
          this.crawlData = hasEndpoint ? {} : null;
          this.crawlDataRegistered = hasEndpoint;
        }
      }
    }
  }

  private async getPage(pageId: string): Promise<ArchivedItemQAPage> {
    return this.api.fetch<ArchivedItemQAPage>(
      this.analyzed
        ? `/orgs/${this.orgId}/crawls/${this.itemId}/qa/${this.qaRunId}/pages/${pageId}`
        : `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${pageId}`,
    );
  }

  private async fetchPages(params?: APIPaginationQuery): Promise<void> {
    try {
      this.pages = await this.getPages({
        page: params?.page ?? this.pages?.page ?? 1,
        pageSize: params?.pageSize ?? this.pages?.pageSize ?? DEFAULT_PAGE_SIZE,
        ...(this.analyzed
          ? this.sortPagesBy
          : // The non-QA /pages endpoint doesn't support sorting
            {}),
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve pages at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-error",
      });
    }
  }

  private async getPages(
    params?: APIPaginationQuery & APISortQuery & { reviewed?: boolean },
  ) {
    const query = queryString.stringify(
      {
        ...this.filterPagesBy,
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );

    return this.api.fetch<APIPaginatedList<QATypes.Page>>(
      `/orgs/${this.orgId}/crawls/${this.itemId ?? ""}${this.qaRunId && this.analyzed ? `/qa/${this.qaRunId}` : ""}/pages?${query}`,
    );
  }

  private async onSubmitReview(e: SubmitEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const params = serialize(form);

    if (!params.reviewStatus) return;

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/all-crawls/${this.itemId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            reviewStatus: +params.reviewStatus,
            description: params.description,
          }),
        },
      );

      if (!data.updated) {
        throw data;
      }

      void this.reviewDialog?.hide();

      this.navigate.to(this.backUrl);
      this.notify.toast({
        message: msg("Saved QA review."),
        variant: "success",
        icon: "check2-circle",
        id: "qa-review-status",
      });
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't submit QA review at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-review-status",
      });
    }
  }

  private async startQARun() {
    try {
      await this.api.fetch<{ started: string }>(
        `/orgs/${this.orgId}/crawls/${this.itemId}/qa/start`,
        {
          method: "POST",
        },
      );

      void this.fetchQARuns();

      this.notify.toast({
        message: msg("Starting QA analysis..."),
        variant: "success",
        icon: "check2-circle",
        id: "qa-start-status",
      });
    } catch (e: unknown) {
      let message = msg("Sorry, couldn't start QA run at this time.");
      if (e instanceof Error && e.message === "qa_not_supported_for_crawl") {
        message = msg(
          "Sorry, QA analysis is not supported for this crawl as it was run with an older crawler version. Please run a new crawl with the latest crawler and QA should be available.",
        );
      }
      console.debug(e);

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-start-status",
      });
    }
  }
}

// leaving here for further debugging of resources
function logResource(
  _isQA: boolean,
  _resType: string,
  _url: string,
  _type?: string,
  _mime?: string,
  _status = 0,
) {
  // console.log(
  //   _isQA ? "replay" : "crawl",
  //   _status >= 400 ? "bad" : "good",
  //   _resType,
  //   _type,
  //   _mime,
  //   _status,
  //   _url,
  // );
}
