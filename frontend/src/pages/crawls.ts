import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import type { SlSelect } from "@shoelace-style/shoelace";
import queryString from "query-string";

import type { PageChangeEvent } from "../components/pagination";
import { CrawlStatus } from "../components/crawl-status";
import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { activeCrawlStates, inactiveCrawlStates } from "../utils/crawler";
import type { Crawl, CrawlState } from "../types/crawler";
import type { APIPaginationQuery, APIPaginatedList } from "../types/api";
import "./org/workflow-detail";
import "./org/crawls-list";
import { PropertyValueMap } from "lit";

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

@needLogin
@localized()
export class Crawls extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  crawlId?: string;

  @state()
  private crawl?: Crawl;

  @state()
  private crawls?: APIPaginatedList;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "started",
    direction: sortableFields["started"].defaultDirection!,
  };

  @state()
  private filterBy: Partial<Record<keyof Crawl, any>> = {
    state: activeCrawlStates,
  };

  // Use to cancel requests
  private getCrawlsController: AbortController | null = null;

  protected willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      this.fetchWorkflowId();
    } else {
      if (
        changedProperties.has("filterBy") ||
        changedProperties.has("orderBy")
      ) {
        this.fetchCrawls();
      }
    }
  }

  disconnectedCallback(): void {
    this.cancelInProgressGetCrawls();
    super.disconnectedCallback();
  }

  render() {
    return html` <div
      class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border"
    >
      ${this.crawlId ? this.renderDetail() : this.renderCrawls()}
    </div>`;
  }

  private renderDetail() {
    if (!this.crawl) return;

    return html`
      <btrix-workflow-detail
        .authState=${this.authState!}
        orgId=${this.crawl.oid}
        workflowId=${this.crawl.cid}
        initialActivePanel="watch"
        isCrawler
      ></btrix-workflow-detail>
    `;
  }

  private renderCrawls() {
    return html`
      <main>
        <header class="contents">
          <div class="flex justify-between w-full pb-4 mb-3 border-b">
            <h1 class="text-xl font-semibold h-8">
              ${msg("All Running Crawls")}
            </h1>
          </div>
          <div
            class="sticky z-10 mb-3 top-2 p-4 bg-neutral-50 border rounded-lg"
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
                `
              )}
            `;
          },
          () => html`
            <div class="w-full flex items-center justify-center my-12 text-2xl">
              <sl-spinner></sl-spinner>
            </div>
          `
        )}
      </main>
    `;
  }

  private renderControls() {
    const viewPlaceholder = msg("Any Active Status");
    const viewOptions = activeCrawlStates;
    return html`
      <div class="flex gap-2 items-center justify-end">
        <div class="flex items-center">
          <div class="text-neutral-500 mx-2">${msg("View:")}</div>
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
          <div class="whitespace-nowrap text-neutral-500 mx-2">
            ${msg("Sort by:")}
          </div>
          <div class="grow flex">${this.renderSortControl()}</div>
        </div>
      </div>
    `;
  }

  private renderSortControl() {
    const options = Object.entries(sortableFields).map(
      ([value, { label }]) => html`
        <sl-option value=${value}>${label}</sl-option>
      `
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

  private renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private renderCrawlList() {
    if (!this.crawls) return;

    return html`
      <btrix-crawl-list baseUrl=${"/crawls/crawl"} itemType="crawl">
        ${this.crawls.items.map(this.renderCrawlItem)}
      </btrix-crawl-list>
    `;
  }

  private renderEmptyState() {
    if (this.crawls?.page && this.crawls?.page > 1) {
      return html`
        <div class="border-t border-b py-5">
          <p class="text-center text-neutral-500">
            ${msg("Could not find page.")}
          </p>
        </div>
      `;
    }

    return html`
      <div class="border-t border-b py-5">
        <p class="text-center text-neutral-500">
          ${msg("No matching crawls found.")}
        </p>
      </div>
    `;
  }

  private renderCrawlItem = (crawl: Crawl) =>
    html`
      <btrix-crawl-list-item .crawl=${crawl}>
        <sl-menu slot="menu">
          <sl-menu-item
            @click=${() => this.navTo(`/crawls/crawl/${crawl.id}#settings`)}
          >
            ${msg("View Crawl Settings")}
          </sl-menu-item>
        </sl-menu>
      </btrix-crawl-list-item>
    `;

  private async fetchWorkflowId() {
    try {
      this.crawl = await this.getCrawl();
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(params?: APIPaginationQuery): Promise<void> {
    this.cancelInProgressGetCrawls();
    try {
      this.crawls = await this.getCrawls(params);
    } catch (e: any) {
      if (e === ABORT_REASON_THROTTLE) {
        console.debug("Fetch crawls aborted to throttle");
      } else {
        this.notify({
          message: msg("Sorry, couldn't retrieve crawls at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
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
    queryParams?: APIPaginationQuery & { state?: CrawlState[] }
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        ...queryParams,
        page: queryParams?.page || this.crawls?.page || 1,
        pageSize: queryParams?.pageSize || this.crawls?.pageSize || 100,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      }
    );

    this.getCrawlsController = new AbortController();
    const data = await this.apiFetch(
      `/orgs/all/crawls?${query}`,
      this.authState!,
      {
        signal: this.getCrawlsController.signal,
      }
    );
    this.getCrawlsController = null;

    return data;
  }

  private async getCrawl(): Promise<Crawl> {
    const data: Crawl = await this.apiFetch(
      `/orgs/all/crawls/${this.crawlId}/replay.json`,
      this.authState!
    );

    return data;
  }
}
