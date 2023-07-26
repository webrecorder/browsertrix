import { state, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import type {
  SlCheckbox,
  SlMenuItem,
  SlSelect,
} from "@shoelace-style/shoelace";
import debounce from "lodash/fp/debounce";
import Fuse from "fuse.js";
import queryString from "query-string";

import { CopyButton } from "../../components/copy-button";
import { CrawlStatus } from "../../components/crawl-status";
import type { PageChangeEvent } from "../../components/pagination";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, CrawlState, Workflow, WorkflowParams } from "./types";
import type { APIPaginatedList, APIPaginationQuery } from "../../types/api";
import { isActive, activeCrawlStates } from "../../utils/crawler";

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
type SortField = "started" | "finished" | "firstSeed" | "fileSize";
type SortDirection = "asc" | "desc";

const ABORT_REASON_THROTTLE = "throttled";
const INITIAL_PAGE_SIZE = 20;
const FILTER_BY_CURRENT_USER_STORAGE_KEY = "btrix.filterByCurrentUser.crawls";
const POLL_INTERVAL_SECONDS = 10;
const MIN_SEARCH_LENGTH = 2;
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  finished: {
    label: msg("Date Finished"),
    defaultDirection: "desc",
  },
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
const finishedCrawlStates: CrawlState[] = [
  "complete",
  "partial_complete",
  "timed_out",
];

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

  @property({ type: String })
  orgId?: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  // e.g. `/org/${this.orgId}/crawls`
  @property({ type: String })
  crawlsBaseUrl!: string;

  // e.g. `/org/${this.orgId}/crawls`
  @property({ type: String })
  crawlsAPIBaseUrl?: string;

  @property({ type: String })
  artifactType: Crawl["type"] = null;

  /**
   * Fetch & refetch data when needed,
   * e.g. when component is visible
   **/
  @property({ type: Boolean })
  shouldFetch?: boolean;

  @state()
  private crawls?: Crawls;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "finished",
    direction: sortableFields["finished"].defaultDirection!,
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

  @state()
  private isUploadingArchive = false;

  @query("#stateSelect")
  stateSelect?: SlSelect;

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  // Use to cancel requests
  private getCrawlsController: AbortController | null = null;

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  private get selectedSearchFilterKey() {
    return Object.keys(CrawlsList.FieldLabels).find((key) =>
      Boolean((this.filterBy as any)[key])
    );
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
      changedProperties.has("orderBy") ||
      changedProperties.has("artifactType")
    ) {
      if (this.shouldFetch) {
        if (!this.crawlsBaseUrl) {
          throw new Error("Crawls base URL not defined");
        }
        if (changedProperties.has("artifactType")) {
          this.filterBy = {};
          this.orderBy = {
            field: "finished",
            direction: sortableFields["finished"].defaultDirection!,
          };
          this.crawls = undefined;
        }

        this.fetchCrawls({
          page: 1,
          pageSize: INITIAL_PAGE_SIZE,
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
    const listTypes: {
      artifactType: Crawl["type"];
      label: string;
      icon?: string;
    }[] = [
      {
        artifactType: null,
        label: msg("All"),
      },
      {
        artifactType: "crawl",
        icon: "gear-wide-connected",
        label: msg("Crawls"),
      },
      {
        artifactType: "upload",
        icon: "upload",
        label: msg("Uploads"),
      },
    ];

    return html`
      <main>
        <header class="contents">
          <div class="flex justify-between w-full pb-4 mb-3 border-b">
            <h1 class="text-xl font-semibold h-8">
              ${msg("All Archived Data")}
            </h1>
            ${when(
              this.isCrawler,
              () => html`
                <sl-button
                  size="small"
                  @click=${() => (this.isUploadingArchive = true)}
                >
                  <sl-icon slot="prefix" name="upload"></sl-icon>
                  ${msg("Upload Archive")}
                </sl-button>
              `
            )}
          </div>
          <div class="flex gap-2 mb-3">
            ${listTypes.map(({ label, artifactType, icon }) => {
              const isSelected = artifactType === this.artifactType;
              return html` <btrix-button
                variant=${isSelected ? "primary" : "neutral"}
                ?raised=${isSelected}
                aria-selected="${isSelected}"
                href=${`${this.crawlsBaseUrl}?artifactType=${
                  artifactType || ""
                }`}
                @click=${this.navLink}
              >
                ${icon ? html`<sl-icon name=${icon}></sl-icon>` : ""}
                <span>${label}</span>
              </btrix-button>`;
            })}
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
      ${when(
        this.isCrawler && this.orgId,
        () => html`
          <btrix-file-uploader
            orgId=${this.orgId!}
            .authState=${this.authState}
            ?open=${this.isUploadingArchive}
            @request-close=${() => (this.isUploadingArchive = false)}
            @uploaded=${() => {
              if (this.artifactType !== "crawl") {
                this.fetchCrawls({
                  page: 1,
                });
              }
            }}
          ></btrix-file-uploader>
        `
      )}
    `;
  }

  private renderControls() {
    const viewPlaceholder =
      this.artifactType === "upload"
        ? msg("All Uploaded")
        : msg("All Finished");
    const viewOptions = finishedCrawlStates;

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

  private renderSortControl() {
    let options: any;
    if (this.artifactType === "upload") {
      options = html`
        <sl-option value="finished">${msg("Date Uploaded")}</sl-option>
      `;
    } else if (this.artifactType === "crawl") {
      options = Object.entries(sortableFields).map(
        ([value, { label }]) => html`
          <sl-option value=${value}>${label}</sl-option>
        `
      );
    } else {
      options = html`
        <sl-option value="finished">${sortableFields.finished.label}</sl-option>
        <sl-option value="started">${sortableFields.started.label}</sl-option>
      `;
    }
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

  private renderSearch() {
    return html`
      <btrix-combobox
        ?open=${this.searchResultsOpen}
        @request-close=${() => {
          this.searchResultsOpen = false;
          this.searchByValue = "";
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
          placeholder=${msg("Filter by Name, Crawl Start URL, or Workflow ID")}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            const { name, firstSeed, cid, ...otherFilters } = this.filterBy;
            this.filterBy = otherFilters;
          }}
          @sl-input=${this.onSearchInput}
        >
          ${when(
            this.selectedSearchFilterKey,
            () =>
              html`<sl-tag
                slot="prefix"
                size="small"
                pill
                style="margin-left: var(--sl-spacing-3x-small)"
                >${CrawlsList.FieldLabels[
                  this.selectedSearchFilterKey as SearchFields
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
      <btrix-crawl-list
        baseUrl=""
        artifactType=${ifDefined(this.artifactType || undefined)}
      >
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
            this.crawlerMenuItemsRenderer(crawl),
            () => html`
              <sl-menu-item
                @click=${() =>
                  this.navTo(
                    `/orgs/${crawl.oid}/artifacts/${
                      crawl.type === "upload" ? "upload" : "crawl"
                    }/${crawl.id}`
                  )}
              >
                ${msg("View Crawl Details")}
              </sl-menu-item>
            `
          )}
        </sl-menu>
      </btrix-crawl-list-item>
    `;

  private crawlerMenuItemsRenderer = (crawl: Crawl) => () =>
    // HACK shoelace doesn't current have a way to override non-hover
    // color without resetting the --sl-color-neutral-700 variable
    html`
      ${when(
        this.isCrawler,
        () => html`
          <sl-menu-item
            @click=${() => {
              this.crawlToEdit = crawl;
              this.isEditingCrawl = true;
            }}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-divider></sl-divider>
        `
      )}
      ${when(
        crawl.type === "crawl",
        () => html`
          <sl-menu-item
            @click=${() =>
              this.navTo(`/orgs/${crawl.oid}/workflows/crawl/${crawl.cid}`)}
          >
            <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
            ${msg("Go to Workflow")}
          </sl-menu-item>
          <sl-menu-item @click=${() => CopyButton.copyToClipboard(crawl.cid)}>
            <sl-icon name="copy-code" library="app" slot="prefix"></sl-icon>
            ${msg("Copy Workflow ID")}
          </sl-menu-item>
          <sl-menu-item @click=${() => CopyButton.copyToClipboard(crawl.id)}>
            <sl-icon name="copy-code" library="app" slot="prefix"></sl-icon>
            ${msg("Copy Crawl ID")}
          </sl-menu-item>
        `
      )}
      <sl-menu-item
        @click=${() => CopyButton.copyToClipboard(crawl.tags.join(", "))}
        ?disabled=${!crawl.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      ${when(
        this.isCrawler && !isActive(crawl.state),
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.deleteCrawl(crawl)}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${crawl.type === "upload"
              ? msg("Delete Upload")
              : msg("Delete Crawl")}
          </sl-menu-item>
        `
      )}
    `;

  private renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
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
                if (this.stateSelect) {
                  // TODO pass in value to sl-select after upgrading
                  // shoelace to >=2.0.0-beta.88. Passing an array value
                  // using beta.85 is currently buggy.
                  this.stateSelect.value = [];
                }
              }}
            >
              ${msg("Clear all filters")}
            </button>
          </p>
        </div>
      `;
    }

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
          ${this.artifactType === "upload"
            ? msg("No uploads yet.")
            : msg("No crawls yet.")}
        </p>
      </div>
    `;
  }

  private onSearchInput = debounce(150)((e: any) => {
    this.searchByValue = e.target.value.trim();

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue && this.selectedSearchFilterKey) {
      const {
        [this.selectedSearchFilterKey as SearchFields]: _,
        ...otherFilters
      } = this.filterBy;
      this.filterBy = {
        ...otherFilters,
      };
    }
  }) as any;

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(params?: APIPaginationQuery): Promise<void> {
    if (!this.shouldFetch) return;

    this.cancelInProgressGetCrawls();
    try {
      let crawls = this.crawls;
      switch (this.artifactType) {
        case "crawl":
          crawls = await this.getCrawls({
            ...params,
            state: this.filterBy.state || finishedCrawlStates,
          });
          break;
        case "upload":
          crawls = await this.getUploads(params);
          break;
        default:
          crawls = await this.getAllCrawls(params);
          break;
          break;
      }

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
  }

  private cancelInProgressGetCrawls() {
    if (this.getCrawlsController) {
      this.getCrawlsController.abort(ABORT_REASON_THROTTLE);
      this.getCrawlsController = null;
    }
  }

  private async getCrawls(
    queryParams?: APIPaginationQuery & { state?: CrawlState[] }
  ): Promise<Crawls> {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        state: queryParams?.state,
        page: queryParams?.page || this.crawls?.page || 1,
        pageSize:
          queryParams?.pageSize || this.crawls?.pageSize || INITIAL_PAGE_SIZE,
        userid: this.filterByCurrentUser ? this.userId : undefined,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
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

    return data;
  }

  private async getAllCrawls(
    queryParams?: APIPaginationQuery
  ): Promise<Crawls> {
    const query = queryString.stringify(
      {
        state: this.filterBy.state || finishedCrawlStates,
        name: this.filterBy.name,
        page: queryParams?.page || this.crawls?.page || 1,
        pageSize:
          queryParams?.pageSize || this.crawls?.pageSize || INITIAL_PAGE_SIZE,
        userid: this.filterByCurrentUser ? this.userId : undefined,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      }
    );

    this.getCrawlsController = new AbortController();
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/all-crawls?${query}`,
      this.authState!,
      {
        signal: this.getCrawlsController.signal,
      }
    );

    this.getCrawlsController = null;

    return data;
  }

  private async getUploads(queryParams?: APIPaginationQuery): Promise<Crawls> {
    const query = queryString.stringify(
      {
        name: this.filterBy.name,
        page: queryParams?.page || this.crawls?.page || 1,
        pageSize:
          queryParams?.pageSize || this.crawls?.pageSize || INITIAL_PAGE_SIZE,
        userid: this.filterByCurrentUser ? this.userId : undefined,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      }
    );

    this.getCrawlsController = new AbortController();
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/uploads?${query}`,
      this.authState!,
      {
        signal: this.getCrawlsController.signal,
      }
    );

    this.getCrawlsController = null;

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

  private async deleteCrawl(crawl: Crawl) {
    // TODO check if this makes translating entire string difficult:
    const typeName = crawl.type === "upload" ? msg("upload") : msg("crawl");

    if (
      !window.confirm(
        msg(str`Are you sure you want to delete ${typeName} of ${crawl.name}?`)
      )
    ) {
      return;
    }

    let apiPath;

    switch (this.artifactType) {
      case "crawl":
        apiPath = "crawls";
        break;
      case "upload":
        apiPath = "uploads";
        break;
      default:
        apiPath = "all-crawls";
        break;
    }

    try {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/${apiPath}/delete`,
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
        message: msg(str`Successfully deleted ${typeName}`),
        variant: "success",
        icon: "check2-circle",
      });
      this.fetchCrawls();
    } catch (e: any) {
      this.notify({
        message:
          (e.isApiError && e.message) ||
          msg(str`Sorry, couldn't run ${typeName} at this time.`),
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
