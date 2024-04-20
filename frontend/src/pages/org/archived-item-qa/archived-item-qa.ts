import { localized, msg } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { merge } from "immutable";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { styles } from "./styles";
import type * as QATypes from "./types";
import { renderReplay } from "./ui/replay";
import { renderResources } from "./ui/resources";
import { renderScreenshots } from "./ui/screenshots";
import { renderSeverityBadge } from "./ui/severityBadge";
import { renderText } from "./ui/text";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import {
  type QaFilterChangeDetail,
  type QaPaginationChangeDetail,
  type QaSortChangeDetail,
  type SortableFieldNames,
  type SortDirection,
} from "@/features/qa/page-list/page-list";
import { type UpdateItemPageDetail } from "@/features/qa/page-qa-approval";
import type { SelectDetail } from "@/features/qa/qa-run-dropdown";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { ArchivedItem } from "@/types/crawler";
import type { ArchivedItemQAPage, QARun } from "@/types/qa";
import { type AuthState } from "@/utils/AuthService";
import { finishedCrawlStates, isActive, renderName } from "@/utils/crawler";
import { getLocale } from "@/utils/localization";

const DEFAULT_PAGE_SIZE = 100;

const tabToPrefix: Record<QATypes.QATab, string> = {
  screenshots: "view",
  text: "text",
  resources: "pageinfo",
  replay: "",
};

const resourceTypes = [
  "document",
  "image",
  "media",
  "stylesheet",
  "font",
  "script",
  "xhr",
  "fetch",
  "prefetch",
  "eventsource",
  "websocket",
  "manifest",
  "ping",
  "cspviolationreport",
  "preflight",
  "signedexchange",
  "texttrack",
  "other",
];

@localized()
@customElement("btrix-archived-item-qa")
export class ArchivedItemQA extends TailwindElement {
  static styles = styles;

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  itemId?: string;

  @property({ type: String })
  itemPageId?: string;

  @property({ type: String })
  qaRunId?: string;

  @property({ type: Boolean })
  isCrawler = false;

  @property({ type: String })
  tab: QATypes.QATab = "screenshots";

  @state()
  private item?: ArchivedItem;

  @state()
  finishedQARuns:
    | (QARun & { state: (typeof finishedCrawlStates)[number] })[]
    | undefined = [];

  @state()
  private pages?: APIPaginatedList<ArchivedItemQAPage>;

  @property({ type: Object })
  page?: ArchivedItemQAPage;

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

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);
  private readonly replaySwReg =
    navigator.serviceWorker.getRegistration("/replay/");

  @query("#replayframe")
  private readonly replayFrame?: HTMLIFrameElement | null;

  @query(".reviewDialog")
  private readonly reviewDialog?: Dialog | null;

  connectedCallback(): void {
    super.connectedCallback();
    // Receive messages from replay-web-page windows
    void this.replaySwReg.then((reg) => {
      if (!reg) {
        console.log("[debug] no reg, listening to messages");
        // window.addEventListener("message", this.onWindowMessage);
      }
    });

    window.addEventListener("message", this.onWindowMessage);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.crawlData?.blobUrl) URL.revokeObjectURL(this.crawlData.blobUrl);
    if (this.qaData?.blobUrl) URL.revokeObjectURL(this.qaData.blobUrl);
    window.removeEventListener("message", this.onWindowMessage);
  }

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
    console.log("[debug] handleRwpMessage", sourceLoc);
    // check if has /qa/ in path, then QA
    if (sourceLoc.indexOf("%2Fqa%2F") >= 0 && !this.qaDataRegistered) {
      this.qaDataRegistered = true;
      console.log("[debug] onWindowMessage qa", this.qaData);
      await this.fetchContentForTab({ qa: true });
      await this.updateComplete;
      // otherwise main crawl replay
    } else if (!this.crawlDataRegistered) {
      this.crawlDataRegistered = true;
      console.log("[debug] onWindowMessage crawl", this.crawlData);
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
      if (this.tab === "screenshots") {
        if (this.crawlData?.blobUrl)
          URL.revokeObjectURL(this.crawlData.blobUrl);
        if (this.qaData?.blobUrl) URL.revokeObjectURL(this.qaData.blobUrl);
      }
      // TODO prefetch content for other tabs?
      void this.fetchContentForTab();
      void this.fetchContentForTab({ qa: true });
    } else if (changedProperties.get("qaRunId")) {
      void this.fetchContentForTab({ qa: true });
    }
  }

  private async initItem() {
    void this.fetchCrawl();
    await this.fetchQARuns();

    const searchParams = new URLSearchParams(window.location.search);

    if (this.qaRunId) {
      if (this.itemPageId) {
        void this.fetchPages({ page: 1 });
      } else {
        await this.fetchPages({ page: 1 });
      }
    }

    const firstQARun = this.finishedQARuns?.[0];
    const firstPage = this.pages?.items[0];

    if (!this.qaRunId && firstQARun) {
      searchParams.set("qaRunId", firstQARun.id);
    }
    if (!this.itemPageId && firstPage) {
      searchParams.set("itemPageId", firstPage.id);
    }

    this.navigate.to(`${window.location.pathname}?${searchParams.toString()}`);
  }

  /**
   * Get current page position with previous and next items
   */
  private getPageListSliceByCurrent(
    pageId = this.itemPageId,
  ): [
    ArchivedItemQAPage | undefined,
    ArchivedItemQAPage | undefined,
    ArchivedItemQAPage | undefined,
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

  render() {
    const crawlBaseUrl = `${this.navigate.orgBasePath}/items/crawl/${this.itemId}`;
    const searchParams = new URLSearchParams(window.location.search);
    const itemName = this.item ? renderName(this.item) : nothing;
    const [prevPage, currentPage, nextPage] = this.getPageListSliceByCurrent();
    const currentQARun = this.finishedQARuns?.find(
      ({ id }) => id === this.qaRunId,
    );
    const disableReview = !currentQARun || isActive(currentQARun.state);

    return html`
      ${this.renderHidden()}

      <article class="grid gap-x-6 gap-y-4 md:gap-y-0">
        <header
          class="grid--header flex items-center justify-between gap-1 border-b py-2"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <h1 class="flex-1 truncate text-base font-semibold leading-tight">
              ${itemName}
            </h1>
            ${when(
              this.finishedQARuns,
              (qaRuns) => html`
                <btrix-qa-run-dropdown
                  .items=${qaRuns}
                  selectedId=${this.qaRunId || ""}
                  @btrix-select=${(e: CustomEvent<SelectDetail>) => {
                    const params = new URLSearchParams(searchParams);
                    params.set("qaRunId", e.detail.item.id);
                    this.navigate.to(
                      `${window.location.pathname}?${params.toString()}`,
                    );
                  }}
                ></btrix-qa-run-dropdown>
              `,
            )}
          </div>
          <div>
            <sl-button
              size="small"
              variant="text"
              href=${`${crawlBaseUrl}#qa`}
              @click=${this.navigate.link}
              >${msg("Exit Review")}</sl-button
            >
            <sl-tooltip
              content=${msg(
                "Reviews are temporarily disabled during analysis runs.",
              )}
              ?disabled=${!disableReview}
            >
              <sl-button
                variant="success"
                size="small"
                @click=${() => void this.reviewDialog?.show()}
                ?disabled=${disableReview}
              >
                <sl-icon slot="prefix" name="patch-check"> </sl-icon>
                ${this.item?.reviewStatus
                  ? msg("Update Review")
                  : msg("Finish Review")}
              </sl-button>
            </sl-tooltip>
          </div>
        </header>

        <div
          class="grid--pageToolbar flex items-center justify-between overflow-hidden border-b py-2"
        >
          <h2
            class="mr-4 truncate text-base font-semibold text-neutral-700"
            title="${this.page ? this.page.title : nothing}"
          >
            ${this.page ? this.page.title || msg("no page title") : nothing}
          </h2>
          <div class="flex gap-4">
            <sl-button
              size="small"
              @click=${this.navPrevPage}
              ?disabled=${!prevPage}
            >
              <sl-icon slot="prefix" name="arrow-left"></sl-icon>
              ${msg("Previous Page")}
            </sl-button>
            <sl-tooltip
              content=${msg(
                "Approvals are temporarily disabled during analysis runs.",
              )}
              ?disabled=${!disableReview}
            >
              <btrix-page-qa-approval
                .authState=${this.authState}
                .orgId=${this.orgId}
                .itemId=${this.itemId}
                .pageId=${this.itemPageId}
                .page=${this.page}
                ?disabled=${disableReview}
                @btrix-update-item-page=${this.onUpdateItemPage}
              ></btrix-page-qa-approval>
            </sl-tooltip>
            <sl-button
              variant="primary"
              size="small"
              ?disabled=${!nextPage}
              outline
              @click=${this.navNextPage}
            >
              <sl-icon slot="suffix" name="arrow-right"></sl-icon>
              ${msg("Next Page")}
            </sl-button>
          </div>
        </div>

        <div class="grid--tabGroup flex flex-col">
          <nav class="my-2 flex gap-2">
            <btrix-navigation-button
              id="screenshot-tab"
              href=${`${crawlBaseUrl}/review/screenshots?${searchParams.toString()}`}
              ?active=${this.tab === "screenshots"}
              @click=${this.onTabNavClick}
            >
              <sl-icon name="images"></sl-icon>
              ${msg("Screenshots")}
              ${when(this.page?.qa || currentPage?.qa, (qa) =>
                renderSeverityBadge(qa.screenshotMatch),
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
              ${when(this.page?.qa || currentPage?.qa, (qa) =>
                renderSeverityBadge(qa.textMatch),
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
          </nav>
          ${this.renderPanelToolbar()} ${this.renderPanel()}
        </div>

        <section class="grid--pageList overflow-hidden">
          <h2
            class="my-4 text-base font-semibold leading-none text-neutral-800"
          >
            ${msg("Pages")}
          </h2>
          <btrix-qa-page-list
            class="flex h-full flex-col"
            .qaRunId=${this.qaRunId}
            .itemPageId=${this.itemPageId}
            .pages=${this.pages}
            .orderBy=${{
              field: this.sortPagesBy.sortBy,
              direction: (this.sortPagesBy.sortDirection === -1
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
      <btrix-dialog
        class="reviewDialog [--width:60rem]"
        label=${msg("QA Review")}
      >
        <form class="qaReviewForm" @submit=${this.onReviewSubmit}>
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
                label=${msg("Update archived item description?")}
                name="description"
                value=${this.item?.description ?? ""}
                placeholder=${msg("No description")}
              ></sl-textarea>
            </div>
          </div>
        </form>

        <div slot="footer" class="flex justify-between">
          <sl-button size="small">${msg("Cancel")}</sl-button>
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
            id="replayframe"
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
        until(
          this.replaySwReg.then((reg) => {
            return html`${iframe(reg)}${rwp(reg)}`;
          }),
        ),
    );
  }

  private renderPanelToolbar() {
    const buttons = html`
      ${choose(this.tab, [
        // [
        //   "replay",
        //   () => html`
        //     <div class="flex">
        //        <sl-icon-button name="arrow-clockwise"></sl-icon-button>
        //     </div>
        //   `,
        // ],
        [
          "screenshots",
          () => html`
            <div class="flex">
              <sl-tooltip
                content=${msg("Toggle screenshot wipe view")}
                placement="bottom-start"
              >
                <btrix-button
                  icon
                  variant=${!this.splitView ? "primary" : "neutral"}
                  @click="${() => (this.splitView = !this.splitView)}"
                >
                  <sl-icon name="vr" label=${msg("Split view")}></sl-icon>
                </btrix-button>
              </sl-tooltip>
            </div>
          `,
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
              <sl-format-date
                lang=${getLocale()}
                class="font-monostyle text-xs text-neutral-500"
                date=${`${page.ts}Z`}
                month="2-digit"
                day="2-digit"
                year="2-digit"
                hour="2-digit"
                minute="2-digit"
              >
              </sl-format-date>
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
          return renderScreenshots(this.crawlData, this.qaData, this.splitView);
        case "text":
          return renderText(this.crawlData, this.qaData);
        case "resources":
          return renderResources(this.crawlData, this.qaData);
        case "replay":
          return renderReplay(this.crawlData);
        default:
          break;
      }
    };
    return html`
      <section aria-labelledby="${this.tab}-tab" class="flex-1 overflow-hidden">
        ${cache(choosePanel())}
      </section>
    `;
  }

  private readonly renderRWP = (
    rwpId: string,
    { qa, url }: { qa: boolean; url?: string },
  ) => {
    if (!rwpId) return;

    const replaySource = `/api/orgs/${this.orgId}/crawls/${this.itemId}${qa ? `/qa/${rwpId}` : ""}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });
    console.log("[debug] rendering rwp", rwpId);
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
          url="${ifDefined(url)}"
        ></replay-web-page>
      `,
    );
  };

  private readonly onTabNavClick = (e: MouseEvent) => {
    this.navigate.link(e, undefined, /* resetScroll: */ false);
  };

  private async onUpdateItemPage(e: CustomEvent<UpdateItemPageDetail>) {
    const updated = e.detail;

    if (!this.page || this.page.id !== updated.id) return;

    const reviewStatusChanged =
      this.page.approved !== updated.approved ||
      this.page.notes?.length !== updated.notes?.length;

    if (reviewStatusChanged) {
      void this.fetchPages();
    }

    this.page = merge<ArchivedItemQAPage>(this.page, updated);
  }

  private async fetchCrawl(): Promise<void> {
    try {
      this.item = await this.getCrawl();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
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

  private async fetchQARuns(): Promise<void> {
    try {
      this.finishedQARuns = (await this.getQARuns()).filter(({ state }) =>
        finishedCrawlStates.includes(state),
      );
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve QA data at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getQARuns(): Promise<QARun[]> {
    return this.api.fetch<QARun[]>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/qa?skipFailed=true`,
      this.authState!,
    );
  }

  private async getCrawl(): Promise<ArchivedItem> {
    return this.api.fetch<ArchivedItem>(
      `/orgs/${this.orgId}/crawls/${this.itemId}`,
      this.authState!,
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
      });
    }
  }

  private async fetchContentForTab({ qa } = { qa: false }): Promise<void> {
    const page = this.page;
    const tab = this.tab;
    const sourceId = qa ? this.qaRunId : this.itemId;
    const frameWindow = this.replayFrame?.contentWindow;

    if (!page || !sourceId || !frameWindow) {
      console.log(
        "[debug] no page replaId or frameWindow",
        page,
        sourceId,
        frameWindow,
      );
      return;
    }

    if (qa && tab === "replay") {
      return;
    }

    const timestamp = page.ts?.split(".")[0].replace(/\D/g, "");
    const pageUrl = page.url;

    const doLoad = async () => {
      const urlPrefix = tabToPrefix[tab];
      const urlPart = `${timestamp}mp_/${urlPrefix ? `urn:${urlPrefix}:` : ""}${pageUrl}`;
      const url = `/replay/w/${sourceId}/${urlPart}`;
      // TODO check status code

      if (tab === "replay") {
        return { replayUrl: url };
      }
      const resp = await frameWindow.fetch(url);

      //console.log("resp:", resp);

      if (!resp.ok) {
        throw resp.status;
      }

      if (tab === "screenshots") {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob) || "";
        return { blobUrl };
      } else if (tab === "text") {
        const text = await resp.text();
        return { text };
      } else {
        // tab === "resources"

        const json = (await resp.json()) as {
          urls: { status?: number; type?: string }[];
        };
        // console.log(json);

        const typeMap = new Map<string, QATypes.GoodBad>();
        resourceTypes.forEach((x) => typeMap.set(x, { good: 0, bad: 0 }));
        let good = 0,
          bad = 0;

        for (const entry of Object.values(json.urls)) {
          const { type: resType_ = "", status = 0 } = entry;
          const resType = resType_.toLowerCase();

          if (typeMap.has(resType)) {
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

        // remove empty entries
        resourceTypes.forEach((x) => {
          if (!typeMap.get(x)) {
            typeMap.delete(x);
          }
        });

        typeMap.set("Total", { good, bad });

        // const text = JSON.stringify(
        //   Object.fromEntries(typeMap.entries()),
        //   null,
        //   2,
        // );

        return { resources: Object.fromEntries(typeMap.entries()) };
      }
      return { text: "" };
    };

    try {
      const content = await doLoad();

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
      console.log("[debug] error:", e);

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
      this.qaRunId
        ? `/orgs/${this.orgId}/crawls/${this.itemId}/qa/${this.qaRunId}/pages/${pageId}`
        : `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${pageId}`,
      this.authState!,
    );
  }

  private async fetchPages(params?: APIPaginationQuery): Promise<void> {
    try {
      this.pages = await this.getPages({
        page: params?.page ?? this.pages?.page ?? 1,
        pageSize: params?.pageSize ?? this.pages?.pageSize ?? DEFAULT_PAGE_SIZE,
        ...this.sortPagesBy,
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve pages at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getPages(
    params?: APIPaginationQuery & APISortQuery & { reviewed?: boolean },
  ): Promise<APIPaginatedList<ArchivedItemQAPage>> {
    const query = queryString.stringify(
      {
        ...this.filterPagesBy,
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );
    return this.api.fetch<APIPaginatedList<ArchivedItemQAPage>>(
      `/orgs/${this.orgId}/crawls/${this.itemId ?? ""}/qa/${this.qaRunId ?? ""}/pages?${query}`,
      this.authState!,
    );
  }

  private async onReviewSubmit(e: SubmitEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const params = serialize(form);

    if (!params.reviewStatus) {
      return;
    }

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/all-crawls/${this.itemId}`,
        this.authState!,
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
      this.notify.toast({
        message: msg("Submitted QA review."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't submit QA review at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
