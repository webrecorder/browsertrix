import { localized, msg } from "@lit/localize";
import { merge } from "immutable";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { TailwindElement } from "@/classes/TailwindElement";
import { TWO_COL_SCREEN_MIN_CSS } from "@/components/ui/tab-list";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import { type QaPaginationChangeDetail } from "@/features/qa/page-list/page-list";
import { type UpdateItemPageDetail } from "@/features/qa/page-qa-toolbar";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { ArchivedItem, ArchivedItemPage } from "@/types/crawler";
import { type QARun } from "@/types/qa";
import { type AuthState } from "@/utils/AuthService";
import { renderName } from "@/utils/crawler";

const DEFAULT_PAGE_SIZE = 10;
const TABS = ["screenshots", "replay"] as const;
export type QATab = (typeof TABS)[number];

@localized()
@customElement("btrix-archived-item-qa")
export class ArchivedItemQA extends TailwindElement {
  static styles = css`
    :host {
      height: inherit;
      display: flex;
      flex-direction: column;
    }

    article {
      flex-grow: 1;
      display: grid;
      grid-gap: 1rem;
      grid-template:
        "mainHeader"
        "main"
        "pageListHeader"
        "pageList";
      grid-template-columns: 100%;
      grid-template-rows: repeat(4, max-content);
      min-height: 0;
    }

    article > * {
      min-height: 0;
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      article {
        grid-template:
          "mainHeader pageListHeader"
          "main pageList";
        grid-template-columns: 75% 1fr;
        grid-template-rows: min-content 1fr;
      }
    }

    .mainHeader {
      grid-area: mainHeader;
    }

    .pageListHeader {
      grid-area: pageListHeader;
    }

    .main {
      grid-area: main;
    }

    .pageList {
      grid-area: pageList;
    }
  `;

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
  tab: QATab = "screenshots";

  @state()
  private item?: ArchivedItem;

  @state()
  private qaRuns: QARun[] = [];

  @state()
  private notReviewedPages?: APIPaginatedList<ArchivedItemPage>;

  @state()
  private reviewedPages?: APIPaginatedList<ArchivedItemPage>;

  @state()
  private page?: ArchivedItemPage;

  @state()
  private crawlDataAvail = false;

  @state()
  private qaDataAvail = false;

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

  connectedCallback(): void {
    super.connectedCallback();

    // Check if replay-web-page is ready
    window.addEventListener("message", (event) => {
      const sourceLoc = (event.source as Window).location.href;

      // ensure its an rwp frame
      if (sourceLoc.indexOf("?source=") > 0) {
        // check if has /qa/ in path, then QA
        if (sourceLoc.indexOf("%2Fqa%2F") >= 0) {
          this.qaDataAvail = true;
          // otherwise main crawl replay
        } else {
          this.crawlDataAvail = true;
        }
      }
    });
  }

  protected willUpdate(
    changedProperties: PropertyValues<this> | Map<PropertyKey, unknown>,
  ): void {
    if (changedProperties.has("itemId") && this.itemId) {
      void this.initItem();
    }
    if (changedProperties.has("itemPageId") && this.itemPageId) {
      void this.fetchPage();
    }
  }

  private async initItem() {
    void this.fetchCrawl();

    if (this.qaRunId) {
      void this.fetchQARuns();
    } else {
      await this.fetchQARuns();
    }

    if (this.itemPageId) {
      void this.fetchNotReviewedPages({ page: 1 });
      void this.fetchReviewedPages({ page: 1 });
    } else {
      await Promise.all([
        this.fetchNotReviewedPages({ page: 1 }),
        this.fetchReviewedPages({ page: 1 }),
      ]);
    }

    const searchParams = new URLSearchParams(window.location.search);
    const firstQaRun = this.qaRuns?.[0];
    const firstPage =
      this.notReviewedPages?.items[0] || this.reviewedPages?.items[0];

    if (!this.qaRunId && firstQaRun) {
      searchParams.set("qaRunId", firstQaRun.id);
    }
    if (!this.itemPageId && firstPage) {
      searchParams.set("itemPageId", firstPage.id);
    }

    this.navigate.to(`${window.location.pathname}?${searchParams}`);
  }

  /**
   * Get current page position with previous and next items
   */
  private getPageListSliceByCurrent(
    pageId = this.itemPageId,
  ): ArchivedItemPage[] {
    if (!pageId || !this.notReviewedPages || !this.reviewedPages) {
      return [];
    }

    const pages = [...this.notReviewedPages.items, ...this.reviewedPages.items];
    const idx = pages.findIndex(({ id }) => id === pageId);
    return [pages[idx - 1], pages[idx], pages[idx + 1]];
  }

  private navToPage(pageId: string) {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("itemPageId", pageId);
    this.navigate.to(
      `${window.location.pathname}?${searchParams}`,
      undefined,
      /* resetScroll: */ false,
    );
  }

  render() {
    const crawlBaseUrl = `${this.navigate.orgBasePath}/items/crawl/${this.itemId}`;
    const searchParams = new URLSearchParams(window.location.search);
    const itemName = this.item ? renderName(this.item) : nothing;
    const [prevPage, , nextPage] = this.getPageListSliceByCurrent();
    return html`
      <nav class="mb-7 text-success-600">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${`${crawlBaseUrl}#qa`}
          @click=${this.navigate.link}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle">
            ${msg("Back to QA Overview")}
          </span>
        </a>
      </nav>

      <article>
        <header class="mainHeader outline">
          <h1>${msg("Review")} &mdash; ${itemName}</h1>
        </header>
        <section class="main outline">
          <nav class="flex items-center justify-between p-2">
            <div class="flex gap-4">
              <btrix-navigation-button
                id="screenshot-tab"
                href=${`${crawlBaseUrl}/review/screenshots?${searchParams}`}
                ?active=${this.tab === "screenshots"}
                @click=${this.navigate.link}
              >
                ${msg("Screenshots")}
              </btrix-navigation-button>
              <btrix-navigation-button
                id="replay-tab"
                href=${`${crawlBaseUrl}/review/replay?${searchParams}`}
                ?active=${this.tab === "replay"}
                @click=${this.navigate.link}
              >
                ${msg("Replay")}
              </btrix-navigation-button>
            </div>
            <div class="flex gap-4">
              ${prevPage
                ? html`
                    <sl-button size="small" @click=${this.navPrevPage}>
                      <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                      ${msg("Previous Page")}
                    </sl-button>
                  `
                : nothing}
              <btrix-page-qa-toolbar
                .authState=${this.authState}
                .orgId=${this.orgId}
                .itemId=${this.itemId}
                .pageId=${this.itemPageId}
                .page=${this.page}
                @btrix-update-item-page=${this.onUpdateItemPage}
              ></btrix-page-qa-toolbar>
              ${nextPage
                ? html`
                    <sl-button
                      variant="primary"
                      size="small"
                      @click=${this.navNextPage}
                    >
                      <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                      ${msg("Next Page")}
                    </sl-button>
                  `
                : nothing}
            </div>
          </nav>
          ${this.renderToolbar()} ${this.renderSections()}
        </section>
        <h2 class="pageListHeader outline">
          ${msg("Pages")}
          <sl-button>${msg("Finish Crawl Review")}</sl-button>
        </h2>
        <section class="pageList grid outline">
          <btrix-qa-page-list
            .qaRunId=${this.qaRunId}
            .itemPageId=${this.itemPageId}
            .notReviewedPages=${this.notReviewedPages}
            .reviewedPages=${this.reviewedPages}
            class="grid min-h-0 content-start justify-stretch"
            @btrix-qa-pagination-change=${(
              e: CustomEvent<QaPaginationChangeDetail>,
            ) => {
              const { page, groupName } = e.detail;
              if (groupName === "reviewed") {
                this.fetchReviewedPages({ page });
              } else {
                this.fetchNotReviewedPages({ page });
              }
            }}
            @btrix-qa-page-select=${(e: CustomEvent<string>) => {
              this.navToPage(e.detail);
            }}
          ></btrix-qa-page-list>
        </section>
      </article>
    `;
  }

  private renderToolbar() {
    return html`
      <div
        class="${this.tab === "replay"
          ? "rounded-t-lg"
          : "rounded-lg"} my-2 flex h-12 items-center border bg-neutral-50 text-base"
      >
        <div class="ml-1 flex">
          ${choose(this.tab, [
            [
              "replay",
              () => html`
                <sl-icon-button name="arrow-clockwise"></sl-icon-button>
              `,
            ],
            [
              "screenshots",
              () => html`
                <sl-icon-button name="intersect"></sl-icon-button>
                <sl-icon-button name="vr"></sl-icon-button>
              `,
            ],
          ])}
        </div>
        <div
          class="mx-1.5 flex h-8 min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden whitespace-nowrap rounded border bg-neutral-0 px-2 text-sm"
        >
          <div class="fade-out-r scrollbar-hidden flex-1 overflow-x-scroll">
            <span class="pr-2">${this.page?.url || "http://"}</span>
          </div>
          ${when(
            this.page,
            (page) => html`
              <sl-format-date
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

  private renderSections() {
    const tabSection: Record<
      QATab,
      { render: () => TemplateResult<1> | undefined }
    > = {
      screenshots: {
        render: this.renderScreenshots,
      },
      replay: {
        render: this.renderReplay,
      },
    };

    // All sections are rendered at page load to enable
    // quick switching between tabs without reloading RWP.
    //
    // This also enables us to reuse the replay tab RWP
    // embed to load the replay screenshot
    return html`
      ${TABS.map((tab) => {
        const section = tabSection[tab];
        const isActive = tab === this.tab;
        return html`
          <section
            class="${isActive ? "" : "offscreen"}"
            aria-labelledby="${this.tab}-tab"
            aria-hidden=${!isActive}
          >
            ${section.render()}
          </section>
        `;
      })}
    `;
  }

  private readonly renderScreenshots = () => {
    if (!this.page) return; // TODO loading indicator

    const timestamp = this.page.ts?.split(".")[0].replace(/\D/g, "");
    const crawlUrl = `/replay/w/${this.itemId}/${timestamp}mp_/urn:view:${this.page.url}`;
    const qaUrl = `/replay/w/${this.qaRunId}/${timestamp}mp_/urn:view:${this.page.url}`;
    const renderSpinner = () =>
      html`<div class="flex h-full w-full items-center justify-center text-2xl">
        <sl-spinner></sl-spinner>
      </div>`;

    return html`
      <div class="mb-2 flex justify-between text-base font-medium">
        <h3 id="crawlScreenshotHeading">${msg("Crawl Screenshot")}</h3>
        <h3 id="replayScreenshotHeading">${msg("Replay Screenshot")}</h3>
      </div>
      <div class="flex overflow-hidden rounded border bg-slate-50">
        <div
          class="aspect-video flex-1 outline -outline-offset-2 outline-yellow-400"
        >
          ${when(
            this.qaDataAvail,
            () => html`
              <iframe
                slot="before"
                name="crawlScreenshot"
                src="${crawlUrl}"
                class="h-full w-full"
                aria-labelledby="crawlScreenshotHeading"
                @load=${this.onScreenshotLoad}
              ></iframe>
            `,
            renderSpinner,
          )}
        </div>
        <div
          class="aspect-video flex-1 outline -outline-offset-2 outline-green-400"
        >
          ${when(
            this.crawlDataAvail,
            () => html`
              <iframe
                slot="after"
                name="replayScreenshot"
                src="${qaUrl}"
                class="h-full w-full"
                aria-labelledby="replayScreenshotHeading"
                @load=${this.onScreenshotLoad}
              ></iframe>
            `,
            renderSpinner,
          )}
        </div>
      </div>
      <div class="offscreen" aria-hidden="true">
        ${when(this.qaRunId, (id) =>
          this.renderReplay(id, { qa: true, screenshot: true }),
        )}
      </div>
    `;
  };

  private readonly renderReplay = (
    rwpId = this.itemId,
    { qa, screenshot } = { qa: false, screenshot: false },
  ) => {
    if (!rwpId) return;

    const replaySource = `/api/orgs/${this.orgId}/crawls/${this.itemId}${qa ? `/qa/${rwpId}` : ""}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html`<div class="aspect-4/3 w-full overflow-hidden">
      <replay-web-page
        source="${replaySource}"
        coll="${rwpId}"
        config="${config}"
        replayBase="/replay/"
        embed="replayonly"
        noCache="true"
        url="${screenshot ? "urn:view:" : ""}${this.page?.url}"
      ></replay-web-page>
    </div>`;
  };

  private readonly onScreenshotLoad = (e: Event) => {
    const iframe = e.currentTarget as HTMLIFrameElement;
    const img = iframe.contentDocument?.body.querySelector("img");
    // Make image fill iframe container
    if (img) {
      img.style.height = "auto";
      img.style.width = "100%";
    }
  };

  private async onUpdateItemPage(e: CustomEvent<UpdateItemPageDetail>) {
    const updated = e.detail;

    if (!this.page || this.page.id !== updated.id) return;

    const reviewStatusChanged =
      this.page.approved !== updated.approved ||
      this.page.notes?.length !== updated.notes?.length;

    if (reviewStatusChanged) {
      this.fetchNotReviewedPages();
      this.fetchReviewedPages();
    }

    this.page = merge<ArchivedItemPage>(this.page, updated);
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
      this.qaRuns = await this.getQARuns();
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
      `/orgs/${this.orgId}/crawls/${this.itemId}/qa`,
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

  private async getPage(pageId: string): Promise<ArchivedItemPage> {
    return this.api.fetch<ArchivedItemPage>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${pageId}`,
      this.authState!,
    );
  }

  private async fetchNotReviewedPages(
    params?: APIPaginationQuery,
  ): Promise<void> {
    try {
      this.notReviewedPages = await this.getPages({
        page: params?.page ?? this.notReviewedPages?.page ?? 1,
        pageSize:
          params?.pageSize ??
          this.notReviewedPages?.pageSize ??
          DEFAULT_PAGE_SIZE,
        reviewed: false,
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchReviewedPages(params?: APIPaginationQuery): Promise<void> {
    try {
      this.reviewedPages = await this.getPages({
        page: params?.page ?? this.reviewedPages?.page ?? 1,
        pageSize:
          params?.pageSize ?? this.reviewedPages?.pageSize ?? DEFAULT_PAGE_SIZE,
        reviewed: true,
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
    params?: APIPaginationQuery & { reviewed?: boolean },
  ): Promise<APIPaginatedList<ArchivedItemPage>> {
    const query = queryString.stringify(
      {
        ...params,
        reviewed: params?.reviewed,
      },
      {
        arrayFormat: "comma",
      },
    );
    return this.api.fetch<APIPaginatedList<ArchivedItemPage>>(
      this.qaRunId
        ? `/orgs/${this.orgId}/crawls/${this.itemId}/qa/${this.qaRunId}/pages?${query}`
        : `/orgs/${this.orgId}/crawls/${this.itemId}/pages?${query}`,
      this.authState!,
    );
  }
}
