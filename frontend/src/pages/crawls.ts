import { localized, msg } from "@lit/localize";
import type { SlSelect } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import needLogin from "@/decorators/needLogin";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { WorkflowTab } from "@/routes";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Crawl } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import { activeCrawlStates, isActive } from "@/utils/crawler";

type SortField = "started" | "firstSeed" | "fileSize";
type SortDirection = "asc" | "desc";
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  started: {
    label: msg("Date Started"),
    defaultDirection: "desc",
  },
  firstSeed: {
    label: msg("Crawl Start URL"),
    defaultDirection: "desc",
  },
  fileSize: {
    label: msg("File Size"),
    defaultDirection: "desc",
  },
};
const ABORT_REASON_THROTTLE = "throttled";
const POLL_INTERVAL_SECONDS = 30;

@customElement("btrix-crawls")
@localized()
@needLogin
export class Crawls extends BtrixElement {
  @property({ type: String })
  crawlId?: string;

  @state()
  private crawl?: Crawl;

  @state()
  private crawls?: APIPaginatedList<Crawl>;

  @state()
  private slugLookup: Record<string, string> = {};

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "started",
    direction: sortableFields["started"].defaultDirection!,
  };

  @state()
  private filterBy: Partial<Record<keyof Crawl, unknown>> = {
    state: activeCrawlStates,
  };

  private timerId?: number;

  // Use to cancel requests
  private getCrawlsController: AbortController | null = null;

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      // Redirect to org crawl page
      void this.fetchWorkflowId();
    } else {
      if (
        changedProperties.has("filterBy") ||
        changedProperties.has("orderBy")
      ) {
        void this.fetchCrawls();
      }
    }
    if (changedProperties.has("crawl") && this.crawl) {
      const slug = this.slugLookup[this.crawl.oid];
      if (isActive(this.crawl)) {
        this.navigate.to(`/orgs/${slug}/workflows/${this.crawl.cid}#cid`);
      } else {
        this.navigate.to(
          `/orgs/${slug}/workflows/${this.crawl.cid}/crawls/${this.crawlId}`,
        );
      }
    }
  }

  firstUpdated() {
    void this.fetchSlugLookup();
  }

  disconnectedCallback(): void {
    this.cancelInProgressGetCrawls();
    super.disconnectedCallback();

    window.clearTimeout(this.timerId);
  }

  render() {
    return html`<btrix-document-title
        title=${msg("Active Crawls – Admin")}
      ></btrix-document-title>

      <div class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4">
        ${this.crawlId
          ? // Render loading indicator while preparing to redirect
            this.renderLoading()
          : this.renderCrawls()}
      </div>`;
  }

  private renderCrawls() {
    return html`
      <main>
        <header class="contents">
          <div class="mb-3 flex w-full justify-between border-b pb-4">
            <h1 class="h-8 text-xl font-semibold">${msg("Active Crawls")}</h1>
          </div>
          <div
            class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4"
          >
            ${this.renderControls()}
          </div>
        </header>

        ${when(
          this.crawls,
          () => {
            const { items, page, total, pageSize } = this.crawls!;
            const hasCrawlItems = items.length;
            return html`
              <section>
                ${hasCrawlItems
                  ? this.renderCrawlList()
                  : this.renderEmptyState()}
              </section>
              ${when(
                hasCrawlItems || page > 1,
                () => html`
                  <footer class="mt-6 flex justify-center">
                    <btrix-pagination
                      page=${page}
                      totalCount=${total}
                      size=${pageSize}
                      @page-change=${async (e: PageChangeEvent) => {
                        await this.fetchCrawls({
                          page: e.detail.page,
                        });

                        // Scroll to top of list
                        // TODO once deep-linking is implemented, scroll to top of pushstate
                        this.scrollIntoView({ behavior: "smooth" });
                      }}
                    ></btrix-pagination>
                  </footer>
                `,
              )}
            `;
          },
          this.renderLoading,
        )}
      </main>
    `;
  }

  private readonly renderLoading = () => html`
    <div class="my-12 flex w-full items-center justify-center text-2xl">
      <sl-spinner></sl-spinner>
    </div>
  `;

  private renderControls() {
    const viewPlaceholder = msg("Any Active Status");
    const viewOptions = activeCrawlStates;
    return html`
      <div class="flex items-center justify-end gap-2">
        <div class="flex items-center">
          <div class="mx-2 text-neutral-500">${msg("View:")}</div>
          <sl-select
            id="stateSelect"
            class="flex-1 md:w-[14.5rem]"
            size="small"
            pill
            multiple
            max-options-visible="1"
            placeholder=${viewPlaceholder}
            @sl-change=${async (e: CustomEvent) => {
              const value = (e.target as SlSelect).value as CrawlState[];
              await this.updateComplete;
              this.filterBy = {
                ...this.filterBy,
                state: value,
              };
            }}
          >
            ${viewOptions.map(this.renderStatusMenuItem)}
          </sl-select>
        </div>

        <div class="flex items-center">
          <div class="mx-2 whitespace-nowrap text-neutral-500">
            ${msg("Sort by:")}
          </div>
          <div class="flex grow">${this.renderSortControl()}</div>
        </div>
      </div>
    `;
  }

  private renderSortControl() {
    const options = Object.entries(sortableFields).map(
      ([value, { label }]) => html`
        <sl-option value=${value}>${label}</sl-option>
      `,
    );
    return html`
      <sl-select
        class="flex-1 md:w-[10rem]"
        size="small"
        pill
        value=${this.orderBy.field}
        @sl-change=${(e: Event) => {
          const field = (e.target as HTMLSelectElement).value as SortField;
          this.orderBy = {
            field: field,
            direction:
              sortableFields[field].defaultDirection || this.orderBy.direction,
          };
        }}
      >
        ${options}
      </sl-select>
      <sl-icon-button
        name="arrow-down-up"
        label=${msg("Reverse sort")}
        @click=${() => {
          this.orderBy = {
            ...this.orderBy,
            direction: this.orderBy.direction === "asc" ? "desc" : "asc",
          };
        }}
      ></sl-icon-button>
    `;
  }

  private readonly renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent({ state });

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private renderCrawlList() {
    if (!this.crawls) return;

    return html`
      <btrix-crawl-list>
        ${this.crawls.items.map(this.renderCrawlItem)}
      </btrix-crawl-list>
    `;
  }

  private renderEmptyState() {
    if (this.crawls?.page && this.crawls.page > 1) {
      return html`
        <div class="border-b border-t py-5">
          <p class="text-center text-neutral-500">
            ${msg("Could not find page.")}
          </p>
        </div>
      `;
    }

    return html`
      <div class="border-b border-t py-5">
        <p class="text-center text-neutral-500">
          ${msg("No matching crawls found.")}
        </p>
      </div>
    `;
  }

  private readonly renderCrawlItem = (crawl: Crawl) => {
    const crawlPath = `/orgs/${this.slugLookup[crawl.oid]}/workflows/${crawl.cid}`;
    return html`
      <btrix-crawl-list-item
        href=${`${crawlPath}/${WorkflowTab.LatestCrawl}`}
        .crawl=${crawl}
      >
        <sl-menu slot="menu">
          <sl-menu-item
            @click=${() =>
              this.navigate.to(`${crawlPath}/${WorkflowTab.Settings}`)}
          >
            ${msg("View Workflow Settings")}
          </sl-menu-item>
        </sl-menu>
      </btrix-crawl-list-item>
    `;
  };

  private async fetchWorkflowId() {
    try {
      this.crawl = await this.getCrawl();
    } catch (e) {
      console.error(e);
    }
  }

  private async fetchSlugLookup() {
    try {
      this.slugLookup = await this.getSlugLookup();
    } catch (e) {
      console.debug(e);
    }
  }

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(params?: APIPaginationQuery): Promise<void> {
    this.cancelInProgressGetCrawls();
    window.clearTimeout(this.timerId);

    try {
      this.crawls = await this.getCrawls(params);

      // TODO Refactor to poll task
      // https://github.com/webrecorder/browsertrix/issues/1716
      this.timerId = window.setTimeout(() => {
        void this.fetchCrawls();
      }, POLL_INTERVAL_SECONDS * 1000);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        console.debug("Fetch crawls aborted to throttle");
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't retrieve crawls at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "fetch-crawls-throttled",
        });
      }
    }
  }

  private cancelInProgressGetCrawls() {
    if (this.getCrawlsController) {
      this.getCrawlsController.abort(ABORT_REASON_THROTTLE);
      this.getCrawlsController = null;
    }
  }

  private async getCrawls(
    queryParams?: APIPaginationQuery & { state?: CrawlState[] },
  ) {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        ...queryParams,
        page:
          queryParams?.page ||
          this.crawls?.page ||
          parsePage(new URLSearchParams(location.search).get("page")),
        pageSize: queryParams?.pageSize || this.crawls?.pageSize || 100,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      },
    );

    this.getCrawlsController = new AbortController();
    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/all/crawls?${query}`,
      {
        signal: this.getCrawlsController.signal,
      },
    );
    this.getCrawlsController = null;

    return data;
  }

  private async getCrawl() {
    const data: Crawl = await this.api.fetch<Crawl>(
      `/orgs/all/crawls/${this.crawlId}/replay.json`,
    );

    return data;
  }

  private async getSlugLookup() {
    const data =
      await this.api.fetch<Record<string, string>>(`/orgs/slug-lookup`);

    return data;
  }
}
