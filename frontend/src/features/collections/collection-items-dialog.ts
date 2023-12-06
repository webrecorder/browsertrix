import { state, property, query, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { guard } from "lit/directives/guard.js";
import { choose } from "lit/directives/choose.js";
import { ref } from "lit/directives/ref.js";
import debounce from "lodash/fp/debounce";
import { mergeDeep } from "immutable";
import omit from "lodash/fp/omit";
import groupBy from "lodash/fp/groupBy";
import keyBy from "lodash/fp/keyBy";
import orderBy from "lodash/fp/orderBy";
import uniqBy from "lodash/fp/uniqBy";
import difference from "lodash/fp/difference";
import Fuse from "fuse.js";
import queryString from "query-string";
import type { SlMenuItem } from "@shoelace-style/shoelace";

import type { CheckboxChangeEvent } from "@/components/ui/checkbox-list";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Collection } from "@/types/collection";
import type { Crawl, CrawlState, Upload, Workflow } from "@/types/crawler";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { finishedCrawlStates } from "@/utils/crawler";
import type { Dialog } from "@/components/ui/dialog";

const TABS = ["crawls", "uploads"] as const;
type Tab = (typeof TABS)[number];
type SearchFields = "name" | "firstSeed";
type SearchResult = {
  item: {
    key: SearchFields;
    value: string;
  };
};
type SortField = "lastRun" | "modified" | "created" | "firstSeed";
type SortDirection = "asc" | "desc";
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  lastRun: {
    label: msg("Latest Crawl"),
    defaultDirection: "desc",
  },
  modified: {
    label: msg("Last Modified"),
    defaultDirection: "desc",
  },
  created: {
    label: msg("Created At"),
    defaultDirection: "desc",
  },
  firstSeed: {
    label: msg("Crawl Start URL"),
    defaultDirection: "asc",
  },
};
const WORKFLOW_CRAWL_LIMIT = 100;
const WORKFLOW_PAGE_SIZE = 10;
const CRAWL_PAGE_SIZE = 5;
const MIN_SEARCH_LENGTH = 2;

@localized()
@customElement("btrix-collection-items-dialog")
export class CollectionEditor extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @property({ type: String })
  collectionId!: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @state()
  private collectionCrawls?: Crawl[];

  @state()
  private collectionUploads?: Upload[];

  // Store crawl IDs to compare later
  private savedCollectionCrawlIds: string[] = [];

  // Store upload IDs to compare later
  private savedCollectionUploadIds: string[] = [];

  @state()
  private workflows?: APIPaginatedList<Workflow>;

  @state()
  private workflowPagination: {
    [workflowId: string]: APIPaginationQuery & {
      items: Workflow[];
    };
  } = {};

  @state()
  private workflowIsLoading: {
    [workflowId: string]: boolean;
  } = {};

  @state()
  private uploads?: APIPaginatedList<Upload>;

  @state()
  private selectedCrawls: {
    [crawlId: string]: Crawl;
  } = {};

  @state()
  private selectedUploads: {
    [uploadId: string]: Upload;
  } = {};
  @state()
  private activeTab: Tab = TABS[0];

  @state()
  private orderWorkflowsBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "lastRun",
    direction: sortableFields["lastRun"].defaultDirection!,
  };

  @state()
  private filterWorkflowsBy: Partial<Record<keyof Crawl, any>> = {};

  @state()
  private searchByValue: string = "";

  @state()
  private searchResultsOpen = false;

  @query("btrix-dialog")
  private dialog!: Dialog;

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  private get selectedSearchFilterKey() {
    return Object.keys(this.fieldLabels).find((key) =>
      Boolean((this.filterWorkflowsBy as any)[key])
    );
  }

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  // For fuzzy search:
  private fuse = new Fuse<SearchResult["item"]>([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private readonly fieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  private readonly tabLabels: Record<Tab, { icon: string; label: string }> = {
    crawls: {
      icon: "gear-wide-connected",
      label: msg("Crawls"),
    },
    uploads: {
      icon: "upload",
      label: msg("Uploads"),
    },
  };

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      this.fetchSearchValues();
      this.fetchUploads();
    }
    if (
      (changedProperties.has("orgId") && this.orgId) ||
      changedProperties.has("filterWorkflowsBy") ||
      changedProperties.has("orderWorkflowsBy")
    ) {
      this.fetchWorkflows();
    }
    if (
      (changedProperties.has("collectionId") && this.collectionId) ||
      (changedProperties.has("open") && this.open)
    ) {
      this.fetchCollectionCrawlsAndUploads();
    }
  }

  render() {
    return html`<btrix-dialog
      label=${msg("Select Archived Items")}
      ?open=${this.open}
      style="--width: var(--btrix-screen-lg); --body-spacing: 0;"
    >
      <div class="flex flex-col min-h-[50vh]">
        <div class="flex gap-3 px-4 py-3">${TABS.map(this.renderTab)}</div>
        <hr />
        ${choose(this.activeTab, [
          ["crawls", this.renderSelectCrawls],
          ["uploads", this.renderSelectUploads],
        ])}
      </div>
      <div slot="footer" class="flex gap-3 items-center justify-end">
        <sl-button
          class="mr-auto"
          size="small"
          @click=${() => this.dialog.hide()}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          variant="primary"
          size="small"
          ?disabled=${this.isSubmitting ||
          Object.values(this.workflowIsLoading).some(
            (isLoading) => isLoading === true
          )}
          ?loading=${this.isSubmitting}
          @click=${() => this.save()}
          >${msg("Save Selection")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private renderTab = (tab: Tab) => {
    const isSelected = tab === this.activeTab;
    const { icon, label } = this.tabLabels[tab];

    return html`
      <btrix-button
        @click=${() => (this.activeTab = tab)}
        variant=${isSelected ? "primary" : "neutral"}
        ?raised=${isSelected}
        aria-selected="${isSelected}"
      >
        <sl-icon name=${icon}></sl-icon>
        <span
          >${label}
          (${Object.keys(
            tab === "crawls" ? this.selectedCrawls : this.selectedUploads
          ).length})</span
        >
      </btrix-button>
    `;
  };

  private renderSelectCrawls = () => {
    return html`
      <section class="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <section class="col-span-1 flex flex-col">
          <h4 class="font-semibold leading-none mb-3">
            ${msg("In Collection")}
          </h4>
          <div class="border rounded-lg py-2 flex-1">
            ${guard(
              [
                this.activeTab === "crawls",
                this.isCrawler,
                this.collectionCrawls,
                this.selectedCrawls,
                this.workflowPagination,
              ],
              this.renderCollectionWorkflowList
            )}
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="font-semibold leading-none mb-3">
            ${msg("All Workflows")}
          </h4>
          ${when(
            this.workflows?.total,
            () =>
              html`
                <div class="flex-0 border rounded bg-neutral-50 p-2 mb-2">
                  ${guard(
                    [
                      this.searchResultsOpen,
                      this.searchByValue,
                      this.filterWorkflowsBy,
                      this.orderWorkflowsBy,
                    ],
                    this.renderWorkflowListControls
                  )}
                </div>
              `
          )}
          <div class="flex-1">
            ${guard(
              [
                this.isCrawler,
                this.workflows,
                this.collectionCrawls,
                this.selectedCrawls,
                this.workflowIsLoading,
              ],
              this.renderWorkflowList
            )}
          </div>
          <footer class="mt-4 flex justify-center">
            ${when(
              this.workflows?.total,
              () => html`
                <btrix-pagination
                  page=${this.workflows!.page}
                  totalCount=${this.workflows!.total}
                  size=${this.workflows!.pageSize}
                  @page-change=${async (e: PageChangeEvent) => {
                    await this.fetchWorkflows({
                      page: e.detail.page,
                    });

                    // Scroll to top of list
                    this.scrollIntoView({ behavior: "smooth" });
                  }}
                ></btrix-pagination>
              `
            )}
          </footer>
        </section>
      </section>
    `;
  };

  private renderSelectUploads = () => {
    return html`
      <section class="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <section class="col-span-1 flex flex-col">
          <h4 class="font-semibold leading-none mb-3">
            ${msg("In Collection")}
          </h4>
          <div class="border rounded-lg py-2 flex-1">
            ${guard(
              [this.collectionUploads, this.selectedUploads],
              this.renderCollectionUploadList
            )}
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="font-semibold leading-none mb-3">${msg("All Uploads")}</h4>
          <div class="flex-1">
            ${guard(
              [this.isCrawler, this.uploads, this.selectedUploads],
              this.renderUploadList
            )}
          </div>
          <footer class="mt-4 flex justify-center">
            ${when(
              this.uploads?.total,
              () => html`
                <btrix-pagination
                  page=${this.uploads!.page}
                  totalCount=${this.uploads!.total}
                  size=${this.uploads!.pageSize}
                  @page-change=${async (e: PageChangeEvent) => {
                    await this.fetchUploads({
                      page: e.detail.page,
                    });

                    // Scroll to top of list
                    this.scrollIntoView({ behavior: "smooth" });
                  }}
                ></btrix-pagination>
              `
            )}
          </footer>
        </section>
      </section>
    `;
  };

  private renderCollectionWorkflowList = () => {
    if (this.activeTab !== "crawls") {
      // Prevent rendering workflow list when tab isn't visible
      // in order to accurately calculate visible item size
      return;
    }

    if (!this.collectionCrawls) {
      return this.renderLoading();
    }

    const crawlsInCollection = this.collectionCrawls || [];

    if (!crawlsInCollection.length) {
      return html`
        <div
          class="flex flex-col items-center justify-center text-center p-4 my-12"
        >
          <span class="text-base font-semibold text-primary"
            >${msg("No Crawls in this Collection, yet")}</span
          >
          <p class="max-w-[24em] mx-auto mt-4">
            ${(this.workflows && !this.workflows.total) || !this.isCrawler
              ? msg(
                  "Select Workflows or individual Crawls. You can always come back and add Crawls later."
                )
              : msg(
                  "Create a Workflow to select Crawls. You can always come back and add Crawls later."
                )}
          </p>
        </div>
      `;
    }
    const groupedByWorkflow = groupBy("cid")(crawlsInCollection) as any;

    return html`
      <btrix-checkbox-list>
        ${Object.keys(groupedByWorkflow).map((workflowId) =>
          this.renderWorkflowCrawls(
            workflowId,
            orderBy(["finished"])(["desc"])(
              groupedByWorkflow[workflowId]
            ) as any
          )
        )}
      </btrix-checkbox-list>
    `;
  };

  private renderCollectionUploadList = () => {
    if (!this.collectionUploads) {
      return this.renderLoading();
    }

    const uploadsInCollection = this.collectionUploads || [];

    if (!uploadsInCollection.length) {
      return html`
        <div
          class="flex flex-col items-center justify-center text-center p-4 my-12"
        >
          <span class="text-base font-semibold text-primary"
            >${msg("No uploads in this Collection, yet")}</span
          >
        </div>
      `;
    }

    return html`
      <btrix-checkbox-list>
        ${uploadsInCollection.map(this.renderUpload)}
      </btrix-checkbox-list>
    `;
  };

  private renderWorkflowCrawls(workflowId: string, crawls: Crawl[]) {
    const selectedCrawlIds = crawls
      .filter(({ id }) => this.selectedCrawls[id])
      .map(({ id }) => id);
    const allChecked = crawls.length === selectedCrawlIds.length;
    // Use latest crawl for workflow information, since we
    // may not have access to workflow details
    const firstCrawl = crawls[0];

    return html`
      <btrix-checkbox-list-item
        ?checked=${!!selectedCrawlIds.length}
        ?allChecked=${allChecked}
        group
        aria-controls=${selectedCrawlIds.join(" ")}
        @on-change=${(e: CheckboxChangeEvent) => {
          if (e.detail.checked || !allChecked) {
            this.selectItems(crawls, "crawl");
          } else {
            this.deselectItems(crawls, "crawl");
          }
        }}
      >
        <div class="grid grid-cols-[1fr_4.6rem_2.5rem] gap-3 items-center">
          <div class="col-span-1 min-w-0 truncate">
            ${this.renderCrawlName(firstCrawl)}
          </div>
          <div
            class="col-span-1 text-neutral-500 text-xs font-monostyle truncate h-4"
          >
            ${crawls.length === 1
              ? msg("1 crawl")
              : msg(str`${this.numberFormatter.format(crawls.length)} crawls`)}
          </div>
          <div class="col-span-1 border-l flex items-center justify-center">
            <btrix-button
              class="expandBtn p-2 text-base transition-transform"
              aria-label=${msg("Expand row")}
              aria-expanded="false"
              aria-controls=${`workflow-${workflowId}`}
              @click=${(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleWorkflow(workflowId);
              }}
              icon
            >
              <sl-icon name="chevron-double-down"></sl-icon>
            </btrix-button>
          </div>
        </div>
        <section
          id=${`workflow-${workflowId}-group`}
          slot="group"
          class="checkboxGroup overflow-hidden offscreen"
          ${ref(this.checkboxGroupUpdated)}
        >
          ${guard(
            [this.selectedCrawls, this.workflowPagination[workflowId]],
            () => this.renderWorkflowCrawlList(workflowId, crawls)
          )}
        </section>
      </btrix-checkbox-list-item>
    `;
  }

  private renderWorkflowCrawlList = (workflowId: string, crawls: Crawl[]) => {
    const { page = 1 } = this.workflowPagination[workflowId] || {};
    return html`
      <btrix-checkbox-group-list>
        ${crawls
          .slice((page - 1) * CRAWL_PAGE_SIZE, page * CRAWL_PAGE_SIZE)
          .map((crawl) => this.renderCrawl(crawl, workflowId))}
      </btrix-checkbox-group-list>

      ${when(
        crawls.length > CRAWL_PAGE_SIZE,
        () => html`
          <footer class="flex justify-center">
            <btrix-pagination
              page=${page}
              totalCount=${crawls.length}
              size=${CRAWL_PAGE_SIZE}
              compact
              @page-change=${async (e: PageChangeEvent) => {
                this.workflowPagination = mergeDeep(this.workflowPagination, {
                  [workflowId]: { page: e.detail.page },
                });
              }}
            ></btrix-pagination>
          </footer>
        `
      )}
    `;
  };

  private renderCrawl(item: Crawl, workflowId?: string) {
    return html`
      <btrix-checkbox-list-item
        id=${item.id}
        ?checked=${!!this.selectedCrawls[item.id]}
        @on-change=${(e: CheckboxChangeEvent) => {
          if (e.detail.checked) {
            this.selectedCrawls = mergeDeep(this.selectedCrawls, {
              [item.id]: item,
            });
          } else {
            this.selectedCrawls = omit([item.id])(this.selectedCrawls) as any;
          }
        }}
      >
        <div class="flex items-center">
          <btrix-crawl-status
            state=${item.state}
            hideLabel
          ></btrix-crawl-status>
          <div class="flex-1">
            ${workflowId
              ? html`<sl-format-date
                  date=${`${item.finished}Z`}
                  month="2-digit"
                  day="2-digit"
                  year="2-digit"
                  hour="2-digit"
                  minute="2-digit"
                ></sl-format-date>`
              : this.renderSeedsLabel(item.firstSeed, item.seedCount)}
          </div>
          <div class="w-16 font-monostyle truncate">
            <sl-tooltip content=${msg("Pages in crawl")}>
              <div class="flex items-center">
                <sl-icon
                  class="text-base"
                  name="file-earmark-richtext"
                ></sl-icon>
                <div class="ml-1 text-xs">
                  ${this.numberFormatter.format(+(item.stats?.done || 0))}
                </div>
              </div>
            </sl-tooltip>
          </div>
          <div class="w-14">
            <sl-format-bytes
              class="text-neutral-500 text-xs font-monostyle"
              value=${item.fileSize || 0}
              display="narrow"
            ></sl-format-bytes>
          </div>
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderUpload = (item: Upload) => {
    return html`
      <btrix-checkbox-list-item
        id=${item.id}
        ?checked=${!!this.selectedUploads[item.id]}
        @on-change=${(e: CheckboxChangeEvent) => {
          if (e.detail.checked) {
            this.selectedUploads = mergeDeep(this.selectedUploads, {
              [item.id]: item,
            });
          } else {
            this.selectedUploads = omit([item.id])(this.selectedUploads) as any;
          }
        }}
      >
        <div class="flex items-center">
          <div class="flex-1">${item.name}</div>
          <div class="w-14">
            <sl-format-bytes
              class="text-neutral-500 text-xs font-monostyle"
              value=${item.fileSize || 0}
              display="narrow"
            ></sl-format-bytes>
          </div>
        </div>
      </btrix-checkbox-list-item>
    `;
  };

  private renderWorkflowListControls = () => {
    return html`
      <div>
        <div class="mb-2">${this.renderSearch()}</div>
        <div class="flex items-center">
          <div class="whitespace-nowrap text-neutral-500 mx-2">
            ${msg("Sort by:")}
          </div>
          <sl-select
            class="flex-1"
            size="small"
            pill
            value=${this.orderWorkflowsBy.field}
            @sl-change=${(e: Event) => {
              const field = (e.target as HTMLSelectElement).value as SortField;
              this.orderWorkflowsBy = {
                field: field,
                direction:
                  sortableFields[field].defaultDirection ||
                  this.orderWorkflowsBy.direction,
              };
            }}
          >
            ${Object.entries(sortableFields).map(
              ([value, { label }]) => html`
                <sl-option value=${value}>${label}</sl-option>
              `
            )}
          </sl-select>
          <sl-icon-button
            name="arrow-down-up"
            label=${msg("Reverse sort")}
            @click=${() => {
              this.orderWorkflowsBy = {
                ...this.orderWorkflowsBy,
                direction:
                  this.orderWorkflowsBy.direction === "asc" ? "desc" : "asc",
              };
            }}
          ></sl-icon-button>
        </div>
      </div>
    `;
  };

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
          this.filterWorkflowsBy = {
            ...this.filterWorkflowsBy,
            [key]: item.value,
          };
        }}
      >
        <sl-input
          size="small"
          placeholder=${msg("Search by Name or Crawl Start URL")}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { name, firstSeed, ...otherFilters } = this.filterWorkflowsBy;
            this.filterWorkflowsBy = otherFilters;
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
                >${this.fieldLabels[
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
              >${this.fieldLabels[item.key]}</sl-tag
            >
            ${item.value}
          </sl-menu-item>
        `
      )}
    `;
  }

  private renderWorkflowList = () => {
    if (!this.workflows) {
      return this.renderLoading();
    }

    if (!this.workflows.total) {
      return html`
        <div class="h-full flex justify-center items-center">
          ${when(
            this.isCrawler,
            () => html`
              <sl-button
                href=${`${this.orgBasePath}/workflows?new&jobType=`}
                variant="primary"
                @click=${this.navLink}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Crawl Workflow")}
              </sl-button>
            `,
            () =>
              html`
                <p class="text-neutral-400 text-center max-w-[24em]">
                  ${msg("Your organization doesn't have any Crawl Workflows.")}
                </p>
              `
          )}
        </div>
      `;
    }

    const groupedByWorkflow = groupBy("cid")(this.collectionCrawls) as any;

    return html`
      <btrix-checkbox-list>
        ${this.workflows.items.map((workflow) =>
          this.renderWorkflowItem(workflow, groupedByWorkflow[workflow.id])
        )}
      </btrix-checkbox-list>
    `;
  };

  private renderWorkflowItem(workflow: Workflow, crawls: Crawl[] = []) {
    const selectedCrawls = crawls.filter(({ id }) => this.selectedCrawls[id]);
    const allChecked = workflow.crawlSuccessfulCount === selectedCrawls.length;
    return html`
      <btrix-checkbox-list-item
        ?checked=${!!selectedCrawls.length}
        ?allChecked=${allChecked}
        ?disabled=${!this.collectionCrawls}
        group
        @on-change=${(e: CheckboxChangeEvent) => {
          if (e.detail.checked || !allChecked) {
            this.selectWorkflow(workflow.id);
          } else {
            this.deselectItems(crawls, "crawl");
          }
        }}
      >
        <div class="relative">
          <div class="grid grid-cols-[1fr_12ch] gap-3">
            ${this.renderWorkflowDetails(workflow)}
          </div>
          ${this.workflowIsLoading[workflow.id]
            ? html`<div
                class="absolute top-0 left-0 right-0 bottom-0 bg-white bg-opacity-50 flex items-center justify-center text-lg -ml-11"
              >
                <sl-spinner></sl-spinner>
              </div>`
            : ""}
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderWorkflowDetails(workflow: Workflow) {
    return html`
      <div class="col-span-1 py-3 whitespace-nowrap truncate">
        <div class="text-neutral-700 h-6 truncate">
          ${this.renderCrawlName(workflow)}
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          <sl-format-date
            date=${workflow.lastCrawlTime || workflow.modified}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </div>
      </div>
      <div class="col-span-1 py-3">
        <div class="text-neutral-700 truncate h-6">
          <sl-format-bytes
            value=${workflow.totalSize === null ? 0 : +workflow.totalSize}
            display="narrow"
          ></sl-format-bytes>
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          ${this.renderCrawlCount(workflow)}
        </div>
      </div>
    `;
  }

  private renderUploadList = () => {
    if (!this.uploads) {
      return this.renderLoading();
    }

    if (!this.uploads.total) {
      return html`<div
        class="flex flex-col items-center justify-center text-center p-4 my-12"
      >
        <p class="text-neutral-400 text-center max-w-[24em]">
          ${msg("Your organization doesn't have any uploads.")}
        </p>
      </div>`;
    }

    return html`
      <btrix-checkbox-list>
        ${this.uploads.items.map(this.renderUploadItem)}
      </btrix-checkbox-list>
    `;
  };

  private renderUploadItem = (upload: Upload) => {
    return html`
      <btrix-checkbox-list-item
        ?checked=${!!this.selectedUploads[upload.id]}
        @on-change=${(e: CheckboxChangeEvent) => {
          if (e.detail.checked) {
            this.collectionUploads = uniqBy("id")([
              ...(this.collectionUploads || []),
              ...[upload],
            ] as any) as any;
            this.selectItems([upload], "upload");
          } else {
            this.deselectItems([upload], "upload");
          }
        }}
      >
        <div class="flex items-center">
          <div class="flex-1">${upload.name}</div>
          <div class="w-14">
            <sl-format-bytes
              class="text-neutral-500 text-xs font-monostyle"
              value=${upload.fileSize || 0}
              display="narrow"
            ></sl-format-bytes>
          </div>
        </div>
      </btrix-checkbox-list-item>
    `;
  };

  private renderCrawlCount(workflow: Workflow) {
    const count = Math.min(WORKFLOW_CRAWL_LIMIT, workflow.crawlSuccessfulCount);
    let message = "";
    if (count === 1) {
      message = msg("1 crawl");
    } else {
      message = msg(str`${this.numberFormatter.format(count)} crawls`);
    }
    return html`<span class="inline-block align-middle">${message}</span
      >${workflow.crawlSuccessfulCount > count
        ? html`<sl-tooltip
            content=${msg(
              str`Only showing latest ${WORKFLOW_CRAWL_LIMIT} crawls`
            )}
          >
            <sl-icon
              class="inline-block align-middle"
              name="exclamation-triangle"
            ></sl-icon>
          </sl-tooltip>`
        : ""}`;
  }

  private renderCrawlName(item: Workflow | Crawl) {
    if (item.name) return html`<span class="min-w-0">${item.name}</span>`;
    if (!item.firstSeed) return html`<span class="min-w-0">${item.id}</span>`;
    return this.renderSeedsLabel(item.firstSeed, (item as Crawl).seedCount);
  }

  private renderSeedsLabel(firstSeed: string, seedCount: number) {
    let nameSuffix: any = "";
    const remainder = seedCount - 1;
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${this.numberFormatter.format(remainder)} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${this.numberFormatter.format(remainder)} URLs`)}</span
        >`;
      }
    }
    return html`
      <div class="flex">
        <span class="min-w-0 truncate">${firstSeed}</span>${nameSuffix}
      </div>
    `;
  }

  private renderLoading = () => html`
    <div class="w-full flex items-center justify-center my-24 text-3xl">
      <sl-spinner></sl-spinner>
    </div>
  `;

  private selectItems(items: (Crawl | Upload)[], itemType: Crawl["type"]) {
    const allItems = keyBy("id")(items);
    if (itemType === "upload") {
      this.selectedUploads = mergeDeep(this.selectedUploads, allItems);
    } else {
      this.selectedCrawls = mergeDeep(this.selectedCrawls, allItems);
    }
  }

  private deselectItems(items: (Crawl | Upload)[], itemType: Crawl["type"]) {
    const omitter = omit(items.map(({ id }) => id));
    if (itemType === "upload") {
      this.selectedUploads = omitter(this.selectedUploads) as any;
    } else {
      this.selectedCrawls = omitter(this.selectedCrawls) as any;
    }
  }

  private async selectWorkflow(workflowId: string) {
    const crawls = await this.fetchWorkflowCrawls(workflowId);
    this.selectItems(crawls, "crawl");
  }

  private checkboxGroupUpdated = async (el: any) => {
    await this.updateComplete;
    if (el) {
      await el.updateComplete;
      if (el.classList.contains("offscreen")) {
        // Set up initial position for expand/contract toggle
        el.style.marginTop = `-${el.clientHeight}px`;
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.classList.remove("offscreen");
      }
    }
  };

  private toggleWorkflow = async (workflowId: string) => {
    const checkboxGroup = this.querySelector(
      `#workflow-${workflowId}-group`
    ) as HTMLElement;
    const listItem = checkboxGroup.closest(
      "btrix-checkbox-list-item"
    ) as HTMLElement;
    const expandBtn = listItem.querySelector(".expandBtn") as HTMLElement;
    const expand = !(expandBtn.getAttribute("aria-expanded") === "true");
    expandBtn.setAttribute("aria-expanded", expand.toString());
    checkboxGroup.classList.add("transition-all");

    if (expand) {
      expandBtn.classList.add("rotate-180");
      checkboxGroup.style.marginTop = "0px";
      checkboxGroup.style.opacity = "100%";
      checkboxGroup.style.pointerEvents = "auto";
    } else {
      expandBtn.classList.remove("rotate-180");
      checkboxGroup.style.marginTop = `-${checkboxGroup.clientHeight}px`;
      checkboxGroup.style.opacity = "0";
      checkboxGroup.style.pointerEvents = "none";
    }
  };

  private onSearchInput = debounce(150)((e: any) => {
    this.searchByValue = e.target.value.trim();

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue && this.selectedSearchFilterKey) {
      const {
        [this.selectedSearchFilterKey as SearchFields]: _,
        ...otherFilters
      } = this.filterWorkflowsBy;
      this.filterWorkflowsBy = {
        ...otherFilters,
      };
    }
  }) as any;

  private async save() {
    await this.updateComplete;
    const crawlIds = [
      ...Object.keys(this.selectedCrawls),
      ...Object.keys(this.selectedUploads),
    ];
    const oldCrawlIds = [
      ...this.savedCollectionCrawlIds,
      ...this.savedCollectionUploadIds,
    ];
    const remove = difference(oldCrawlIds)(crawlIds);
    const add = difference(crawlIds)(oldCrawlIds);
    const requests = [];
    if (add.length) {
      requests.push(
        this.apiFetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/add`,
          this.authState!,
          {
            method: "POST",
            body: JSON.stringify({ crawlIds: add }),
          }
        )
      );
    }
    if (remove.length) {
      requests.push(
        this.apiFetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
          this.authState!,
          {
            method: "POST",
            body: JSON.stringify({ crawlIds: remove }),
          }
        )
      );
    }

    this.isSubmitting = true;

    try {
      await Promise.all(requests);

      this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
      this.notify({
        message: msg(str`Successfully saved archived item selection.`),
        variant: "success",
        icon: "check2-circle",
      });
      this.dialog.hide();
    } catch (e: any) {
      this.notify({
        message: e.isApiError
          ? (e.message as string)
          : msg("Something unexpected went wrong"),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmitting = false;
  }

  private async fetchWorkflows(params: APIPaginationQuery = {}) {
    try {
      this.workflows = await this.getWorkflows({
        page: params.page || this.workflows?.page || 1,
        pageSize:
          params.pageSize || this.workflows?.pageSize || WORKFLOW_PAGE_SIZE,
      });
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve Workflows at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getWorkflows(params: APIPaginationQuery) {
    const query = queryString.stringify({
      ...params,
      ...this.filterWorkflowsBy,
      sortBy: this.orderWorkflowsBy.field,
      sortDirection: this.orderWorkflowsBy.direction === "desc" ? -1 : 1,
    });
    const data = await this.apiFetch<APIPaginatedList<Workflow>>(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      this.authState!
    );

    return data;
  }

  private async fetchUploads(params: APIPaginationQuery = {}) {
    try {
      this.uploads = await this.getUploads({
        page: params.page || this.uploads?.page || 1,
        pageSize:
          params.pageSize || this.uploads?.pageSize || WORKFLOW_PAGE_SIZE,
      });
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve uploads at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getUploads(
    params: Partial<{
      collectionId?: string;
      state: CrawlState[];
    }> &
      APIPaginationQuery &
      APISortQuery
  ) {
    const query = queryString.stringify({
      state: "complete",
      ...params,
    });
    const data = await this.apiFetch<APIPaginatedList<Upload>>(
      `/orgs/${this.orgId}/uploads?${query}`,
      this.authState!
    );

    return data;
  }

  private async fetchCollectionCrawlsAndUploads() {
    try {
      const [crawlsRes, uploadsRes] = await Promise.allSettled([
        this.getCrawls({
          collectionId: this.collectionId,
          sortBy: "finished",
          pageSize: WORKFLOW_CRAWL_LIMIT,
        }),
        this.getUploads({
          collectionId: this.collectionId,
          sortBy: "finished",
          pageSize: WORKFLOW_CRAWL_LIMIT,
        }),
      ]);
      const crawls =
        crawlsRes.status === "fulfilled" ? crawlsRes.value.items : [];
      const uploads =
        uploadsRes.status === "fulfilled" ? uploadsRes.value.items : [];

      this.selectedCrawls = mergeDeep(this.selectedCrawls, keyBy("id")(crawls));
      this.selectedUploads = mergeDeep(
        this.selectedUploads,
        keyBy("id")(uploads)
      );

      // TODO remove omit once API removes errors
      this.collectionCrawls = crawls.map(omit("errors")) as Crawl[];
      this.collectionUploads = uploads;
      // Store crawl IDs to compare later
      this.savedCollectionCrawlIds = this.collectionCrawls.map(({ id }) => id);
      this.savedCollectionUploadIds = this.collectionUploads.map(
        ({ id }) => id
      );
    } catch {
      this.notify({
        message: msg(
          "Sorry, couldn't retrieve Crawls in Collection at this time."
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchWorkflowCrawls(workflowId: string): Promise<Crawl[]> {
    this.workflowIsLoading = mergeDeep(this.workflowIsLoading, {
      [workflowId]: true,
    });

    let workflowCrawls: Crawl[] = [];

    try {
      const { items } = await this.getCrawls({
        cid: workflowId,
        state: finishedCrawlStates,
        sortBy: "finished",
        pageSize: WORKFLOW_CRAWL_LIMIT,
      });
      // TODO remove omit once API removes errors
      const crawls = items.map(omit("errors")) as Crawl[];
      this.collectionCrawls = uniqBy("id")([
        ...(this.collectionCrawls || []),
        ...crawls,
      ] as any) as any;

      workflowCrawls = crawls;
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve Crawl Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.workflowIsLoading = mergeDeep(this.workflowIsLoading, {
      [workflowId]: false,
    });

    return workflowCrawls;
  }

  private async getCrawls(
    params: Partial<{
      cid?: string;
      collectionId?: string;
      state: CrawlState[];
    }> &
      APIPaginationQuery &
      APISortQuery
  ) {
    const query = queryString.stringify(params || {}, {
      arrayFormat: "comma",
    });
    const data = await this.apiFetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
      this.authState!
    );

    return data;
  }

  private async fetchSearchValues() {
    try {
      const { names, firstSeeds } = await this.apiFetch<{
        names: string[];
        firstSeeds: string[];
      }>(`/orgs/${this.orgId}/crawlconfigs/search-values`, this.authState!);

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
      ]);
    } catch (e) {
      console.debug(e);
    }
  }
}
