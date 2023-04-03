import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import type {
  SlCheckbox,
  SlMenuItem,
  SlSelect,
} from "@shoelace-style/shoelace";
import debounce from "lodash/fp/debounce";
import flow from "lodash/fp/flow";
import map from "lodash/fp/map";
import orderBy from "lodash/fp/orderBy";
import Fuse from "fuse.js";
import queryString from "query-string";

import { CopyButton } from "../../components/copy-button";
import { CrawlStatus } from "../../components/crawl-status";
import type { PageChangeEvent } from "../../components/pagination";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, CrawlState, Workflow, WorkflowParams } from "./types";
import type { APIPaginatedList } from "../../types/api";
import { F } from "lodash/fp";

type Crawls = APIPaginatedList & {
  items: Crawl[];
};
type SearchFields = "name" | "firstSeed" | "cid";
type SearchResult = {
  item: {
    key: SearchFields;
    value: string;
  };
};
type QueryParams = {
  page?: number;
  size?: number;
};
type SortField = "started" | "finished" | "firstSeed" | "fileSize";
type SortDirection = "asc" | "desc";

const ABORT_REASON_THROTTLE = "throttled";
const INITIAL_PAGE_SIZE = 1;
const FILTER_BY_CURRENT_USER_STORAGE_KEY = "btrix.filterByCurrentUser.crawls";
const POLL_INTERVAL_SECONDS = 10;
const MIN_SEARCH_LENGTH = 2;
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  started: {
    label: msg("Date Created"),
    defaultDirection: "desc",
  },
  finished: {
    label: msg("Date Completed"),
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

const activeCrawlStates: CrawlState[] = ["starting", "running", "stopping"];
const inactiveCrawlStates: CrawlState[] = [
  "complete",
  "canceled",
  "partial_complete",
  "timed_out",
  "failed",
];

function isActive(crawl: Crawl) {
  return activeCrawlStates.includes(crawl.state);
}

/**
 * Usage:
 * ```ts
 * <btrix-crawls-list crawlsBaseUrl="/crawls"></btrix-crawls-list>
 * ```
 */
@localized()
export class CrawlsList extends LiteElement {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
    cid: msg("Workflow ID"),
  };
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  userId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  // e.g. `/org/${this.orgId}/crawls`
  @property({ type: String })
  crawlsBaseUrl!: string;

  // e.g. `/org/${this.orgId}/crawls`
  @property({ type: String })
  crawlsAPIBaseUrl?: string;

  /**
   * Fetch & refetch data when needed,
   * e.g. when component is visible
   **/
  @property({ type: Boolean })
  shouldFetch?: boolean;

  @state()
  private lastFetched?: number;

  @state()
  private crawls?: Crawls;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "started",
    direction: "desc",
  };

  @state()
  private filterByCurrentUser = false;

  @state()
  private filterBy: Partial<Record<keyof Crawl, any>> = {};

  @state()
  private searchByValue: string = "";

  @state()
  private searchResultsOpen = false;

  @state()
  private crawlToEdit: Crawl | null = null;

  @state()
  private isEditingCrawl = false;

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private timerId?: number;

  // Use to cancel requests
  private getCrawlsController: AbortController | null = null;

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  constructor() {
    super();
    this.filterByCurrentUser =
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
      "true";
  }

  protected willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("shouldFetch") ||
      changedProperties.get("crawlsBaseUrl") ||
      changedProperties.get("crawlsAPIBaseUrl") ||
      changedProperties.has("filterByCurrentUser") ||
      changedProperties.has("filterBy") ||
      changedProperties.has("orderBy")
    ) {
      if (this.shouldFetch) {
        if (!this.crawlsBaseUrl) {
          throw new Error("Crawls base URL not defined");
        }

        this.fetchCrawls({
          page: 1,
          size: INITIAL_PAGE_SIZE,
        });
      } else {
        this.cancelInProgressGetCrawls();
      }

      if (changedProperties.has("filterByCurrentUser")) {
        window.sessionStorage.setItem(
          FILTER_BY_CURRENT_USER_STORAGE_KEY,
          this.filterByCurrentUser.toString()
        );
      }
    }

    if (
      changedProperties.has("crawlsBaseUrl") ||
      changedProperties.has("crawlsAPIBaseUrl")
    ) {
      this.fetchConfigSearchValues();
    }
  }

  disconnectedCallback(): void {
    this.cancelInProgressGetCrawls();
    super.disconnectedCallback();
  }

  render() {
    if (!this.crawls) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-3xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <main>
        <header class="contents">
          <div class="flex w-full h-8 mb-4">
            <h1 class="text-xl font-semibold">${msg("Crawls")}</h1>
          </div>
          <div
            class="sticky z-10 mb-3 top-2 p-4 bg-neutral-50 border rounded-lg"
          >
            ${this.renderControls()}
          </div>
        </header>
        <section>
          ${this.crawls.items.length
            ? this.renderCrawlList()
            : this.renderEmptyState()}
        </section>

        <footer class="mt-6 flex justify-center">
          <btrix-pagination
            page=${this.crawls.page}
            totalCount=${this.crawls.total}
            size=${this.crawls.size}
            @page-change=${(e: PageChangeEvent) => {
              this.fetchCrawls({
                page: e.detail.page,
              });
            }}
          ></btrix-pagination>
        </footer>
      </main>
    `;
  }

  private renderControls() {
    console.log("this.filterBy.state:", this.filterBy.state);
    return html`
      <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,100%)_fit-content(100%)_fit-content(100%)] gap-x-2 gap-y-2 items-center"
      >
        <div class="col-span-1 md:col-span-2 lg:col-span-1">
          ${this.renderSearch()}
        </div>
        <div class="flex items-center">
          <div class="text-neutral-500 mx-2">${msg("View:")}</div>
          <sl-select
            class="flex-1 md:min-w-[14.5rem]"
            size="small"
            pill
            multiple
            max-tags-visible="1"
            placeholder=${msg("All Crawls")}
            @sl-change=${async (e: CustomEvent) => {
              const value = (e.target as SlSelect).value as CrawlState[];
              console.log("value:", value);
              await this.updateComplete;
              this.filterBy = {
                ...this.filterBy,
                state: value,
              };
            }}
          >
            ${activeCrawlStates.map(this.renderStatusMenuItem)}
            <sl-divider></sl-divider>
            ${inactiveCrawlStates.map(this.renderStatusMenuItem)}
          </sl-select>
        </div>

        <div class="flex items-center">
          <div class="whitespace-nowrap text-neutral-500 mx-2">
            ${msg("Sort by:")}
          </div>
          <div class="grow flex">
            <sl-select
              class="flex-1 md:min-w-[9.2rem]"
              size="small"
              pill
              value=${this.orderBy.field}
              @sl-select=${(e: any) => {
                const field = e.detail.item.value as SortField;
                this.orderBy = {
                  field: field,
                  direction:
                    sortableFields[field].defaultDirection ||
                    this.orderBy.direction,
                };
              }}
            >
              ${Object.entries(sortableFields).map(
                ([value, { label }]) => html`
                  <sl-menu-item value=${value}>${label}</sl-menu-item>
                `
              )}
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
          </div>
        </div>
      </div>

      ${this.userId
        ? html` <div class="h-6 mt-2 flex justify-end">
            <label>
              <span class="text-neutral-500 text-xs mr-1"
                >${msg("Show Only Mine")}</span
              >
              <sl-switch
                @sl-change=${(e: CustomEvent) =>
                  (this.filterByCurrentUser = (e.target as SlCheckbox).checked)}
                ?checked=${this.filterByCurrentUser}
              ></sl-switch>
            </label>
          </div>`
        : ""}
    `;
  }

  private renderSearch() {
    const selectedFilterKey = Object.keys(CrawlsList.FieldLabels).find((key) =>
      Boolean((this.filterBy as any)[key])
    );
    return html`
      <btrix-combobox
        ?open=${this.searchResultsOpen}
        @request-close=${() => {
          this.searchResultsOpen = false;
        }}
        @sl-select=${async (e: CustomEvent) => {
          this.searchResultsOpen = false;
          const item = e.detail.item as SlMenuItem;
          const key = item.dataset["key"] as SearchFields;
          this.searchByValue = item.value;
          await this.updateComplete;
          this.filterBy = {
            ...this.filterBy,
            [key]: item.value,
          };
        }}
      >
        <sl-input
          size="small"
          placeholder=${msg("Filter by name, Crawl Start URL, or Workflow ID")}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            const { name, firstSeed, cid, ...otherFilters } = this.filterBy;
            this.filterBy = otherFilters;
          }}
          @sl-input=${this.onSearchInput}
          @focus=${() => {
            if (this.hasSearchStr) {
              this.searchResultsOpen = true;
            }
          }}
        >
          ${when(
            selectedFilterKey,
            () =>
              html`<sl-tag
                slot="prefix"
                size="small"
                pill
                style="margin-left: var(--sl-spacing-3x-small)"
                >${CrawlsList.FieldLabels[
                  selectedFilterKey as SearchFields
                ]}</sl-tag
              >`,
            () => html`<sl-icon name="search" slot="prefix"></sl-icon>`
          )}
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("Start typing to view crawl filters.")}</sl-menu-item
        >
      `;
    }

    const searchResults = this.fuse.search(this.searchByValue).slice(0, 10);
    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching crawls found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${searchResults.map(
        ({ item }: SearchResult) => html`
          <sl-menu-item
            slot="menu-item"
            data-key=${item.key}
            value=${item.value}
          >
            <sl-tag slot="prefix" size="small" pill
              >${CrawlsList.FieldLabels[item.key]}</sl-tag
            >
            ${item.value}
          </sl-menu-item>
        `
      )}
    `;
  }

  private renderCrawlList() {
    if (!this.crawls) return;

    return html`
      <btrix-crawl-list>
        ${this.crawls.items.map(this.renderCrawlItem)}
      </btrix-crawl-list>

      <btrix-crawl-metadata-editor
        .authState=${this.authState}
        .crawl=${this.crawlToEdit}
        ?open=${this.isEditingCrawl}
        @request-close=${() => (this.isEditingCrawl = false)}
        @updated=${
          /* TODO fetch current page or single crawl */ this.fetchCrawls
        }
      ></btrix-crawl-metadata-editor>
    `;
  }

  private renderCrawlItem = (crawl: Crawl) =>
    html`
      <btrix-crawl-list-item .crawl=${crawl}>
        <sl-menu slot="menu">
          ${when(
            this.isCrawler,
            this.renderCrawlerMenuItemsRenderer(crawl),
            () => html`
              <sl-menu-item
                @click=${() =>
                  this.navTo(`/orgs/${crawl.oid}/crawls/crawl/${crawl.id}`)}
              >
                ${msg("View Crawl Details")}
              </sl-menu-item>
            `
          )}
        </sl-menu>
      </btrix-crawl-list-item>
    `;

  private renderCrawlerMenuItemsRenderer = (crawl: Crawl) => () =>
    html`
      ${when(
        isActive(crawl),
        // HACK shoelace doesn't current have a way to override non-hover
        // color without resetting the --sl-color-neutral-700 variable
        () => html`
          <sl-menu-item @click=${() => this.stop(crawl)}>
            <sl-icon name="dash-circle" slot="prefix"></sl-icon>
            ${msg("Stop Crawl")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.cancel(crawl)}
          >
            <sl-icon name="x-octagon" slot="prefix"></sl-icon>
            ${msg("Cancel Immediately")}
          </sl-menu-item>
        `,
        () => html`
          <sl-menu-item
            style="--sl-color-neutral-700: var(--success)"
            @click=${() => this.runNow(crawl)}
          >
            <sl-icon name="arrow-clockwise" slot="prefix"></sl-icon>
            ${msg("Re-Run Crawl")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() => {
              this.crawlToEdit = crawl;
              this.isEditingCrawl = true;
            }}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
        `
      )}
      <sl-divider></sl-divider>
      <sl-menu-item
        @click=${() =>
          this.navTo(`/orgs/${crawl.oid}/workflows/config/${crawl.cid}`)}
      >
        <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
        ${msg("Go to Workflow")}
      </sl-menu-item>
      <sl-menu-item @click=${() => CopyButton.copyToClipboard(crawl.cid)}>
        <sl-icon name="copy-code" library="app" slot="prefix"></sl-icon>
        ${msg("Copy Config ID")}
      </sl-menu-item>
      <sl-menu-item
        @click=${() => CopyButton.copyToClipboard(crawl.tags.join(","))}
        ?disabled=${!crawl.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      ${when(
        !isActive(crawl),
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.deleteCrawl(crawl)}
          >
            <sl-icon name="trash" slot="prefix"></sl-icon>
            ${msg("Delete Crawl")}
          </sl-menu-item>
        `
      )}
    `;

  private renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-menu-item value=${state}>${icon}${label}</sl-menu-item>`;
  };

  private renderEmptyState() {
    if (Object.keys(this.filterBy).length) {
      return html`
        <div class="border rounded-lg bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching crawls found.")}</span
            >
            <button
              class="text-neutral-500 font-medium underline hover:no-underline"
              @click=${() => {
                this.filterBy = {};
                this.onSearchInput.cancel();
                this.searchByValue = "";
              }}
            >
              ${msg("Clear all filters")}
            </button>
          </p>
        </div>
      `;
    }

    return html`
      <div class="border-t border-b py-5">
        <p class="text-center text-neutral-500">${msg("No crawls yet.")}</p>
      </div>
    `;
  }

  private onSearchInput = debounce(150)((e: any) => {
    this.searchByValue = e.target.value;

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }
  }) as any;

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(params?: QueryParams): Promise<void> {
    if (!this.shouldFetch) return;

    this.cancelInProgressGetCrawls();
    try {
      const crawls = await this.getCrawls(params);

      this.crawls = crawls;
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

    // Restart timer for next poll
    this.timerId = window.setTimeout(() => {
      this.fetchCrawls();
    }, 1000 * POLL_INTERVAL_SECONDS);
  }

  private cancelInProgressGetCrawls() {
    window.clearTimeout(this.timerId);
    if (this.getCrawlsController) {
      this.getCrawlsController.abort(ABORT_REASON_THROTTLE);
      this.getCrawlsController = null;
    }
  }

  private async getCrawls(queryParams?: QueryParams): Promise<Crawls> {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        page: queryParams?.page || this.crawls?.page || 1,
        size: queryParams?.size || this.crawls?.size || INITIAL_PAGE_SIZE,
        userid: this.filterByCurrentUser ? this.userId : undefined,
        sortBy: this.orderBy.field,
        // sortDirection: this.orderBy.direction === "desc" ? 0 : 1,
      },
      {
        arrayFormat: "comma",
      }
    );

    this.getCrawlsController = new AbortController();
    const data = await this.apiFetch(
      `${this.crawlsAPIBaseUrl || this.crawlsBaseUrl}?${query}`,
      this.authState!,
      {
        signal: this.getCrawlsController.signal,
      }
    );

    this.getCrawlsController = null;
    this.lastFetched = Date.now();

    return data;
  }

  private async fetchConfigSearchValues() {
    const oid = (this.crawlsAPIBaseUrl || this.crawlsBaseUrl)
      .split("/orgs/")[1]
      .split("/")[0];
    try {
      const { names, firstSeeds, workflowIds } = await this.apiFetch(
        `/orgs/${oid}/crawlconfigs/search-values`,
        this.authState!
      );

      // Update search/filter collection
      const toSearchItem =
        (key: SearchFields) =>
        (value: string): SearchResult["item"] => ({
          key,
          value,
        });
      this.fuse.setCollection([
        ...names.map(toSearchItem("name")),
        ...firstSeeds.map(toSearchItem("firstSeed")),
        ...workflowIds.map(toSearchItem("cid")),
      ] as any);
    } catch (e) {
      console.debug(e);
    }
  }

  private async cancel(crawl: Crawl) {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawls/${crawl.id}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawls();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't cancel crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop(crawl: Crawl) {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawls/${crawl.id}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawls();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't stop crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async runNow(crawl: Crawl) {
    // Get Workflow to check if crawl is already running
    const workflow = await this.getWorkflow(crawl);

    if (workflow?.currCrawlId) {
      this.notify({
        message: msg(
          html`Crawl of <strong>${crawl.name}</strong> is already running.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${crawl.oid}/crawls/crawl/${workflow.currCrawlId}"
              @click=${this.navLink.bind(this)}
              >View crawl</a
            >`
        ),
        variant: "warning",
        icon: "exclamation-triangle",
      });

      return;
    }

    try {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.started) {
        this.fetchCrawls();
      }

      this.notify({
        message: msg(
          html`Started crawl from <strong>${crawl.name}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${crawl.oid}/crawls/crawl/${data.started}#watch"
              @click=${this.navLink.bind(this)}
              >Watch crawl</a
            >`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
    } catch (e: any) {
      if (e.isApiError && e.statusCode === 404) {
        this.notify({
          message: msg(
            html`Sorry, cannot rerun crawl from a deactivated Workflow.
              <br />
              <button
                class="underline hover:no-underline"
                @click="${() => this.duplicateConfig(crawl, workflow)}"
              >
                Duplicate Workflow
              </button>`
          ),
          variant: "danger",
          icon: "exclamation-octagon",
          duration: 8000,
        });
      } else {
        this.notify({
          message: msg("Sorry, couldn't run crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async deleteCrawl(crawl: Crawl) {
    if (
      !window.confirm(
        msg(str`Are you sure you want to delete crawl of ${crawl.name}?`)
      )
    ) {
      return;
    }

    try {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawls/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [crawl.id],
          }),
        }
      );

      const { items, ...crawlsData } = this.crawls!;
      this.crawls = {
        ...crawlsData,
        items: items.filter((c) => c.id !== crawl.id),
      };
      this.notify({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
      });
      this.fetchCrawls();
    } catch (e: any) {
      this.notify({
        message:
          (e.isApiError && e.message) ||
          msg("Sorry, couldn't run crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getWorkflow(crawl: Crawl): Promise<Workflow> {
    const data: Workflow = await this.apiFetch(
      `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}`,
      this.authState!
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(crawl: Crawl, workflow: Workflow) {
    const workflowParams: WorkflowParams = {
      ...workflow,
      name: msg(str`${workflow.name} Copy`),
    };

    this.navTo(
      `/orgs/${crawl.oid}/workflows?new&jobType=${workflowParams.jobType}`,
      {
        workflow: workflowParams,
      }
    );

    this.notify({
      message: msg(str`Copied Workflow to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
