import { localized, msg } from "@lit/localize";
import { merge } from "immutable";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BadgeVariant } from "@/components/ui/badge";
import { TWO_COL_SCREEN_MIN_CSS } from "@/components/ui/tab-list";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import { severityFromMatch } from "@/features/qa/page-list/helpers";
import {
  type QaFilterChangeDetail,
  type QaPaginationChangeDetail,
  type QaSortChangeDetail,
  type SortableFieldNames,
  type SortDirection,
} from "@/features/qa/page-list/page-list";
import { formatPercentage } from "@/features/qa/page-list/ui/page-details";
import { type UpdateItemPageDetail } from "@/features/qa/page-qa-toolbar";
import type { SelectDetail } from "@/features/qa/qa-run-dropdown";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { ArchivedItem } from "@/types/crawler";
import type { ArchivedItemQAPage, QARun } from "@/types/qa";
import { type AuthState } from "@/utils/AuthService";
import { renderName } from "@/utils/crawler";

const DEFAULT_PAGE_SIZE = 100;
const TABS = ["screenshots", "text", "resources", "replay"] as const;
export type QATab = (typeof TABS)[number];

const tabToPrefix: Record<QATab, string> = {
  screenshots: "view",
  text: "text",
  resources: "pageinfo",
  replay: "",
};

type GoodBad = {
  good: number;
  bad: number;
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

type BlobPayload = { blobUrl: string };
type TextPayload = { text: string };
type ReplayData = {
  blobUrl: BlobPayload["blobUrl"];
  text: TextPayload["text"];
  resources: TextPayload["text"];
};
const initialReplayData: ReplayData = {
  blobUrl: "",
  text: "",
  resources: "",
};

@localized()
@customElement("btrix-archived-item-qa")
export class ArchivedItemQA extends TailwindElement {
  static styles = css`
    article {
      /* TODO calculate screen space instead of hardcoding */
      height: 100vh;
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
        grid-template-columns: 1fr 35rem;
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

    sl-image-comparer::part(divider) {
      background-color: yellow;
      /* mix-blend-mode: difference; */
    }

    sl-image-comparer::part(handle) {
      background-color: red;
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
  private pages?: APIPaginatedList<ArchivedItemQAPage>;

  @property({ type: Object })
  page?: ArchivedItemQAPage;

  @state()
  crawlSwAvail = false;

  @state()
  qaSwAvail = false;

  @state()
  private crawlData = initialReplayData;

  @state()
  private qaData = initialReplayData;

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

  connectedCallback(): void {
    super.connectedCallback();

    // Check if replay-web-page is ready
    window.addEventListener("message", (event) => {
      const sourceLoc = (event.source as Window).location.href;

      console.log("message:", sourceLoc);

      // ensure its an rwp frame
      if (sourceLoc.indexOf("?source=") > 0) {
        // check if has /qa/ in path, then QA
        if (sourceLoc.indexOf("%2Fqa%2F") >= 0) {
          this.qaSwAvail = true;
          // otherwise main crawl replay
        } else {
          this.crawlSwAvail = true;
        }
      }
    });
  }

  @query("#replayframe")
  private replayFrame?: HTMLIFrameElement | null;

  protected willUpdate(
    changedProperties: PropertyValues<this> | Map<PropertyKey, unknown>,
  ): void {
    if (changedProperties.has("itemId") && this.itemId) {
      void this.initItem();
    } else if (
      changedProperties.get("filterPagesBy") ??
      changedProperties.get("sortPagesBy")
    ) {
      void this.fetchPages();
    }
    if (changedProperties.has("itemPageId") && this.itemPageId) {
      void this.fetchPage();
    }

    if (
      changedProperties.get("page") ||
      (changedProperties.has("crawlSwAvail") && this.crawlSwAvail) ||
      (changedProperties.has("qaSwAvail") && this.qaSwAvail)
    ) {
      void this.fetchContent();
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
      void this.fetchPages({ page: 1 });
    } else {
      await this.fetchPages({ page: 1 });
    }

    const searchParams = new URLSearchParams(window.location.search);
    const firstQaRun = this.qaRuns?.[0];
    const firstPage = this.pages?.items[0];

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
  ): ArchivedItemQAPage[] {
    if (!pageId || !this.pages) {
      return [];
    }

    const pages = this.pages.items;
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
    const [prevPage, currentPage, nextPage] = this.getPageListSliceByCurrent();
    const finishedQARuns = this.qaRuns
      ? this.qaRuns.filter(({ finished }) => finished)
      : [];

    return html`
      <!-- Use iframe to access replay content -->
      <iframe class="hidden" id="replayframe" src="/replay/"></iframe>
      <div class="offscreen" aria-hidden="true">
        ${when(this.qaRunId && this.tab !== "replay", () =>
          this.renderRWP(this.qaRunId, { qa: true }),
        )}
      </div>

      <article class="grid gap-x-4 gap-y-3">
        <header class="mainHeader flex items-center justify-between gap-1">
          <h1 class="text-base font-semibold leading-tight">
            ${msg("Reviewing")} ${itemName}
          </h1>
          <div class="flex items-center">
            <span class="font-medium text-neutral-400">${msg("QA run:")}</span>
            <btrix-qa-run-dropdown
              .items=${finishedQARuns}
              selectedId=${this.qaRunId || ""}
              @btrix-select=${(e: CustomEvent<SelectDetail>) => {
                const params = new URLSearchParams(searchParams);
                params.set("qaRunId", e.detail.item.id);
                this.navigate.to(`${window.location.pathname}?${params}`);
              }}
            ></btrix-qa-run-dropdown>
          </div>
        </header>
        <section class="main">
          <nav class="mb-3 flex flex-col-reverse">
            <div class="mt-3 flex gap-8 self-start">
              <btrix-navigation-button
                id="screenshot-tab"
                href=${`${crawlBaseUrl}/review/screenshots?${searchParams}`}
                ?active=${this.tab === "screenshots"}
                @click=${this.navigate.link}
              >
                ${msg("Screenshots")}
                ${when(currentPage, (page) => {
                  let variant: BadgeVariant = "neutral";
                  switch (severityFromMatch(currentPage.qa.screenshotMatch)) {
                    case "severe":
                      variant = "danger";
                      break;
                    case "moderate":
                      variant = "warning";
                      break;
                    case "good":
                      variant = "success";
                      break;
                    default:
                      break;
                  }

                  return html`
                    <btrix-badge variant=${variant}
                      >${formatPercentage(
                        page.qa.screenshotMatch,
                      )}%</btrix-badge
                    >
                  `;
                })}
              </btrix-navigation-button>
              <btrix-navigation-button
                id="text-tab"
                href=${`${crawlBaseUrl}/review/text?${searchParams}`}
                ?active=${this.tab === "text"}
                @click=${this.navigate.link}
              >
                ${msg("Text")}
              </btrix-navigation-button>
              <btrix-navigation-button
                id="text-tab"
                href=${`${crawlBaseUrl}/review/resources?${searchParams}`}
                ?active=${this.tab === "resources"}
                @click=${this.navigate.link}
              >
                ${msg("Resources")}
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
            <div class="flex gap-4 self-end">
              <sl-button
                size="small"
                @click=${this.navPrevPage}
                ?disabled=${!prevPage}
              >
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Previous Page")}
              </sl-button>
              <btrix-page-qa-toolbar
                .authState=${this.authState}
                .orgId=${this.orgId}
                .itemId=${this.itemId}
                .pageId=${this.itemPageId}
                .page=${this.page}
                @btrix-update-item-page=${this.onUpdateItemPage}
              ></btrix-page-qa-toolbar>
              <sl-button
                variant="primary"
                size="small"
                ?disabled=${!nextPage}
                @click=${this.navNextPage}
              >
                <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                ${msg("Next Page")}
              </sl-button>
            </div>
          </nav>
          ${this.renderToolbar()} ${this.renderSections()}
        </section>
        <div class="pageListHeader flex items-center justify-between">
          <h2 class="text-base font-semibold leading-none">${msg("Pages")}</h2>
          <sl-button
            size="small"
            href=${`${crawlBaseUrl}#qa`}
            @click=${this.navigate.link}
            >${msg("Done Reviewing")}</sl-button
          >
        </div>
        <section class="pageList">
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
            totalPages=${+(this.item?.stats?.found || 0)}
            @btrix-qa-pagination-change=${(
              e: CustomEvent<QaPaginationChangeDetail>,
            ) => {
              const { page } = e.detail;
              this.fetchPages({ page });
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
    `;
  }

  private renderToolbar() {
    return html`
      <div
        class="${this.tab === "replay"
          ? "rounded-t-lg m2-2"
          : "rounded-lg my-2"} flex h-12 items-center border bg-neutral-50 text-base"
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
      text: {
        render: this.renderText,
      },
      resources: {
        render: this.renderResources,
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
            aria-labelledby="${tab}-tab"
            aria-hidden=${!isActive}
          >
            ${section.render()}
          </section>
        `;
      })}
    `;
  }

  private readonly renderSpinner = () =>
    html`<div class="flex h-full w-full items-center justify-center text-2xl">
      <sl-spinner></sl-spinner>
    </div>`;

  private readonly renderScreenshots = () => {
    return html`
      <div class="mb-2 flex justify-between text-base font-medium">
        <h3 id="crawlScreenshotHeading">${msg("Crawl Screenshot")}</h3>
        <h3 id="replayScreenshotHeading">${msg("Replay Screenshot")}</h3>
      </div>
      <div class="aspect-video overflow-hidden rounded border bg-slate-50">
        ${when(
          this.crawlData.blobUrl && this.qaData.blobUrl,
          () => html`
            <sl-image-comparer>
              <img
                slot="before"
                src="${this.crawlData.blobUrl || ""}"
                class="h-full w-full"
                aria-labelledby="crawlScreenshotHeading"
              />
              <img
                slot="after"
                src="${this.qaData.blobUrl || ""}"
                class="h-full w-full"
                aria-labelledby="replayScreenshotHeading"
              />
            </sl-image-comparer>
          `,
          this.renderSpinner,
        )}
      </div>
    `;
  };

  private readonly renderText = () => {
    if (!this.page) return; // TODO loading indicator

    const renderSpinner = () =>
      html`<div class="flex h-full w-full items-center justify-center text-2xl">
        <sl-spinner></sl-spinner>
      </div>`;

    return html`
      <div class="mb-2 flex justify-between text-base font-medium">
        <h3 id="crawlTextHeading">${msg("Crawl Text")}</h3>
        <h3 id="replayTextHeading">${msg("Replay Text")}</h3>
      </div>
      <div class="flex rounded border bg-slate-50">
        <div
          class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-green-400"
          style="max-width: 50%"
          name="crawlText"
          aria-labelledby="crawlTextHeading"
        >
          ${this.crawlData ? this.crawlData.text : renderSpinner()}
        </div>
        <div
          class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-yellow-400"
          style="max-width: 50%"
          name="replayText"
          aria-labelledby="replayTextHeading"
        >
          ${this.qaData ? this.qaData.text : renderSpinner()}
        </div>
      </div>
    `;
  };

  private readonly renderResources = () => {
    if (!this.page) return; // TODO loading indicator

    const renderSpinner = () =>
      html`<div class="flex h-full w-full items-center justify-center text-2xl">
        <sl-spinner></sl-spinner>
      </div>`;

    return html`
      <div class="mb-2 flex justify-between text-base font-medium">
        <h3 id="crawlResourcesHeading">${msg("Crawl Resources")}</h3>
        <h3 id="replayResourcesHeading">${msg("Replay Resources")}</h3>
      </div>
      <div class="flex rounded border bg-slate-50">
        <div
          class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-green-400"
          style="max-width: 50%"
          name="crawlResources"
          aria-labelledby="crawlResourcesHeading"
        >
          ${this.crawlData ? this.crawlData.resources : renderSpinner()}
        </div>
        <div
          class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-yellow-400"
          style="max-width: 50%"
          name="replayResources"
          aria-labelledby="replayResourcesHeading"
        >
          ${this.qaData ? this.qaData.resources : renderSpinner()}
        </div>
      </div>
    `;
  };

  private readonly renderReplay = () => {
    return html`
      <div
        class="relative aspect-video overflow-hidden rounded-b-lg border-x border-b"
      >
        ${when(this.page?.url, (url) =>
          this.renderRWP(this.itemId, { qa: false, url }),
        )}
        ${when(
          !this.crawlSwAvail,
          () => html`
            <div class="absolute inset-0 bg-neutral-50">
              ${this.renderSpinner()}
            </div>
          `,
        )}
      </div>
    `;
  };

  private readonly renderRWP = (
    rwpId = this.itemId,
    { qa, url }: { qa: boolean; url?: string },
  ) => {
    if (!rwpId) return;

    const replaySource = `/api/orgs/${this.orgId}/crawls/${this.itemId}${qa ? `/qa/${rwpId}` : ""}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return guard(
      [replaySource, rwpId, config, url],
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

  private async onUpdateItemPage(e: CustomEvent<UpdateItemPageDetail>) {
    const updated = e.detail;

    if (!this.page || this.page.id !== updated.id) return;

    const reviewStatusChanged =
      this.page.approved !== updated.approved ||
      this.page.notes?.length !== updated.notes?.length;

    if (reviewStatusChanged) {
      this.fetchPages();
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

  private async resetData(dataType: "crawlData" | "qaData") {
    if (this[dataType].blobUrl) {
      URL.revokeObjectURL(this[dataType].blobUrl);
    }
    this[dataType] = initialReplayData;
  }

  private async fetchContent(): Promise<void> {
    if (!this.page) {
      return;
    }

    const frameWindow = this.replayFrame?.contentWindow;
    if (!frameWindow) {
      console.debug("no iframe found with id replayFrame");
      return;
    }

    const timestamp = this.page.ts?.split(".")[0].replace(/\D/g, "");
    const pageUrl = this.page.url;

    const doLoad = async <T = BlobPayload | TextPayload>(
      tab: QATab,
      replayId: string,
    ): Promise<T> => {
      const urlPart = `${timestamp}mp_/urn:${tabToPrefix[tab]}:${pageUrl}`;
      const url = `/replay/w/${replayId}/${urlPart}`;
      const resp = await frameWindow.fetch(url);

      if (tab === "screenshots") {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob) || "";
        return { blobUrl } as T;
      } else if (tab === "text") {
        const text = await resp.text();
        return { text } as T;
      } else if (tab === "resources") {
        const json = await resp.json();
        console.log(json);

        const typeMap = new Map<string, GoodBad>();
        resourceTypes.forEach((x) => typeMap.set(x, { good: 0, bad: 0 }));
        let good = 0,
          bad = 0;

        for (const entry of Object.values(json.urls)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { type: resType_, status } = entry as any;
          const resType = (resType_ || "").toLowerCase();

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

        const text = JSON.stringify(
          Object.fromEntries(typeMap.entries()),
          null,
          2,
        );

        return { text } as T;
      }
      return { text: "" } as T;
    };

    if (this.itemId && this.crawlSwAvail) {
      if (this.crawlData.blobUrl) {
        this.resetData("crawlData");
      }
      this.crawlData = {
        blobUrl: (await doLoad<BlobPayload>("screenshots", this.itemId))
          .blobUrl,
        text: (await doLoad<TextPayload>("text", this.itemId)).text,
        resources: (await doLoad<TextPayload>("resources", this.itemId)).text,
      };
    }
    if (this.qaRunId && this.qaSwAvail) {
      if (this.qaData.blobUrl) {
        this.resetData("qaData");
      }
      this.qaData = {
        blobUrl: (await doLoad<BlobPayload>("screenshots", this.qaRunId))
          .blobUrl,
        text: (await doLoad<TextPayload>("text", this.qaRunId)).text,
        resources: (await doLoad<TextPayload>("resources", this.qaRunId)).text,
      };
    }
  }

  private async getPage(pageId: string): Promise<ArchivedItemQAPage> {
    return this.api.fetch<ArchivedItemQAPage>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${pageId}`,
      this.authState!,
    );
  }

  private async fetchPages(params?: APIPaginationQuery): Promise<void> {
    try {
      this.pages = await this.getPages({
        page: params?.page ?? this.pages?.page ?? 1,
        pageSize: params?.pageSize ?? this.pages?.pageSize ?? DEFAULT_PAGE_SIZE,
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
  ): Promise<APIPaginatedList<ArchivedItemQAPage>> {
    const query = queryString.stringify(
      {
        sortBy: this.sortPagesBy.sortBy,
        sortDirection: this.sortPagesBy.sortDirection,
        ...(this.qaRunId ? this.filterPagesBy : {}),
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );
    return this.api.fetch<APIPaginatedList<ArchivedItemQAPage>>(
      this.qaRunId
        ? `/orgs/${this.orgId}/crawls/${this.itemId}/qa/${this.qaRunId}/pages?${query}`
        : `/orgs/${this.orgId}/crawls/${this.itemId}/pages?${query}`,
      this.authState!,
    );
  }
}
