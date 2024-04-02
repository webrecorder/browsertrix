import { localized, msg } from "@lit/localize";
import { merge } from "immutable";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { styles } from "./styles";
import type * as QATypes from "./types";
import { renderReplay } from "./ui/replay";
import { renderResources } from "./ui/resources";
import { renderScreenshots } from "./ui/screenshots";
import { renderText } from "./ui/text";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BadgeVariant } from "@/components/ui/badge";
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

const initialReplayData: QATypes.ReplayData = {
  blobUrl: "",
  text: "",
  replayUrl: "",
  resources: {},
};

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
  private qaRuns: QARun[] = [];

  @state()
  private pages?: APIPaginatedList<ArchivedItemQAPage>;

  @property({ type: Object })
  page?: ArchivedItemQAPage;

  @state()
  private crawlData = initialReplayData;

  @state()
  private qaData = initialReplayData;

  @state()
  hiddenIframeLoaded = false;

  @state()
  private crawlReplayPageReady = false;

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
      changedProperties.get("tab") ||
      (changedProperties.has("hiddenIframeLoaded") && this.hiddenIframeLoaded)
    ) {
      // TODO prefetch content for other tabs
      void this.fetchContentForTab();
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
      <iframe
        class="hidden"
        id="replayframe"
        src="/replay/"
        @load=${() => (this.hiddenIframeLoaded = true)}
      ></iframe>
      <div class="offscreen" aria-hidden="true">
        ${this.renderRWP(this.qaRunId, { qa: true })}
        ${this.renderRWP(this.itemId, { qa: false })}
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
    // cache DOM for faster switching between tabs
    const choosePanel = () => {
      switch (this.tab) {
        case "screenshots":
          return renderScreenshots(this.crawlData, this.qaData);
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
      <section aria-labelledby="${this.tab}-tab">
        ${cache(choosePanel())}
      </section>
    `;
  }

  private readonly renderRWP = (
    rwpId = this.itemId,
    { qa, url }: { qa: boolean; url?: string },
  ) => {
    if (!rwpId) return;

    const replaySource = `/api/orgs/${this.orgId}/crawls/${this.itemId}${qa ? `/qa/${rwpId}` : ""}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return guard(
      [this.itemId, this.page, this.authState],
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

  private async fetchContentForTab(): Promise<void> {
    if (!this.page || !this.hiddenIframeLoaded) {
      return;
    }

    const frameWindow = this.replayFrame?.contentWindow;
    if (!frameWindow) {
      console.debug("no iframe found with id replayFrame");
      return;
    }

    const timestamp = this.page.ts?.split(".")[0].replace(/\D/g, "");
    const pageUrl = this.page.url;

    const doLoad = async <
      T =
        | QATypes.BlobPayload
        | QATypes.TextPayload
        | QATypes.ReplayPayload
        | QATypes.ResourcesPayload,
    >(
      tab: QATypes.QATab,
      replayId: string,
    ): Promise<T> => {
      const urlPrefix = tabToPrefix[tab];
      const urlPart = `${timestamp}mp_/${urlPrefix ? `urn:${urlPrefix}:` : ""}${pageUrl}`;
      const url = `/replay/w/${replayId}/${urlPart}`;
      // TODO check status code
      const resp = await frameWindow.fetch(url);

      if (tab === "screenshots") {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob) || "";
        return { blobUrl } as T;
      } else if (tab === "text") {
        const text = await resp.text();
        return { text } as T;
      } else if (tab === "replay") {
        return { replayUrl: resp.url } as T;
      } else if (tab === "resources") {
        const json = await resp.json();
        // console.log(json);

        const typeMap = new Map<string, QATypes.GoodBad>();
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

        // const text = JSON.stringify(
        //   Object.fromEntries(typeMap.entries()),
        //   null,
        //   2,
        // );

        return { resources: Object.fromEntries(typeMap.entries()) } as T;
      }
      return { text: "" } as T;
    };

    if (this.itemId) {
      if (this.tab === "screenshots" && this.crawlData.blobUrl) {
        URL.revokeObjectURL(this.crawlData.blobUrl);
      }
      const content = await doLoad(this.tab, this.itemId);
      this.crawlData = {
        ...this.crawlData,
        ...content,
      };
    }
    if (this.qaRunId) {
      if (this.tab === "screenshots" && this.qaData.blobUrl) {
        URL.revokeObjectURL(this.qaData.blobUrl);
      }
      const content = await doLoad(this.tab, this.qaRunId);
      this.qaData = {
        ...this.qaData,
        ...content,
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
