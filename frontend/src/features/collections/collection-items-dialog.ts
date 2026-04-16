import { localized, msg, str } from "@lit/localize";
import clsx from "clsx";
import { merge } from "immutable";
import { css, html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import union from "lodash/fp/union";
import without from "lodash/fp/without";
import queryString from "query-string";

import type {
  AutoAddChangeDetail,
  CrawlsPageChangeDetail,
  SelectionChangeDetail,
} from "./collection-workflow-list";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import type { ArchivedItemCheckedEvent } from "@/features/archived-items/archived-item-list/types";
import type {
  FilterBy,
  FilterChangeEventDetail,
  SearchValues,
  SortBy,
  SortChangeEventDetail,
  SortOptions,
} from "@/features/archived-items/item-list-controls";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { ArchivedItem, Crawl, Upload, Workflow } from "@/types/crawler";
import { SortDirection } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { finishedCrawlStates, isCrawl } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const TABS = ["crawl", "upload"] as const;
type Tab = (typeof TABS)[number];
const searchKeys = ["name", "firstSeed"] as const;
const crawlSortOptions: SortOptions = [
  {
    // NOTE "finished" field doesn't exist in crawlconfigs,
    // `lastRun` is used instead
    field: "finished",
    label: msg("Crawl Finished"),
    defaultDirection: -1,
  },
  {
    field: "firstSeed",
    label: msg("Crawl Start URL"),
    defaultDirection: 1,
  },
];
const uploadSortOptions: SortOptions = [
  {
    field: "finished",
    label: msg("Date Created"),
    defaultDirection: -1,
  },
  {
    field: "fileSize",
    label: msg("File Size"),
    defaultDirection: -1,
  },
];
const COLLECTION_ITEMS_MAX = 1000;
const DEFAULT_PAGE_SIZE = 10;

const isID = (v: string | Symbol): v is string => typeof v === "string";
const unpackSymbolID = (v: string | Symbol) =>
  isID(v) ? v : v.description || "";

@customElement("btrix-collection-items-dialog")
@localized()
export class CollectionItemsDialog extends BtrixElement {
  static styles = css`
    btrix-dialog {
      --width: var(--btrix-screen-lg);
      --body-spacing: 0;
    }

    .dialogContent {
      /**
       * Fill height of viewport
       * FIXME dynamically calculate height of dialog controls?
       */
      min-height: calc(100vh - 8.6rem);
    }
  `;

  @property({ type: Boolean })
  isCrawler?: boolean;

  @property({ type: String })
  collectionId!: string;

  @property({ type: String })
  collectionName = "";

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @state()
  private activeTab: Tab = TABS[0];

  @state()
  private crawls?: APIPaginatedList<Crawl>;

  @state()
  private uploads?: APIPaginatedList<Upload>;

  @state()
  private workflows?: APIPaginatedList<Workflow>;

  @state()
  showOnlyInCollection = false;

  @state()
  showOnlyMine = false;

  @state()
  sortCrawlsBy: SortBy = {
    field: "finished",
    direction: -1,
  };

  @state()
  sortUploadsBy: SortBy = {
    field: "finished",
    direction: -1,
  };

  @state()
  filterCrawlsBy: FilterBy = {};

  @state()
  filterUploadsBy: FilterBy = {};

  @state()
  private crawlSearchValues?: SearchValues;

  @state()
  private uploadSearchValues?: SearchValues;

  @state()
  private isReady = false;

  /**
   * Selection state for individual archived items by ID
   */
  @state()
  private selectedItems = new Set<string | Symbol>();

  /**
   * Selection state for workflows
   */
  @state()
  private workflowSelection = new Map<
    string,
    {
      checked: boolean | "indeterminate";
      selectionCount: number;
    }
  >();

  @state()
  private workflowCrawls = new Map<
    string,
    {
      selectedCrawls: APIPaginatedList<Crawl> | null;
      paginatedCrawls: APIPaginatedList<Crawl> | null;
    }
  >();

  @query("btrix-dialog")
  private readonly dialog!: Dialog;

  /**
   * Workflow batch operations to apply on save
   */
  private batchWorkflows = new Map<
    string,
    {
      operation: "add" | "remove";
      omitCrawls: Set<string>;
    }
  >();

  /**
   * Map crawl IDs to workflow IDs to look up
   */
  private readonly crawlToWorkflow = new Map<string, string>();

  /**
   * Store previously saved selection to compare
   */
  private savedSelectedItems: CollectionItemsDialog["selectedItems"] =
    new Set();
  private savedWorkflowSelection: CollectionItemsDialog["workflowSelection"] =
    new Map();

  private readonly tabLabels: Record<Tab, { icon: string; label: string }> = {
    crawl: {
      icon: "gear-wide-connected",
      label: msg("Crawled Items"),
    },
    upload: {
      icon: "upload",
      label: msg("Uploaded Items"),
    },
  };

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (!this.open) {
      // Don't perform any updates if dialog isn't open
      return;
    }
    if (changedProperties.has("open")) {
      void this.initSelection();
    } else if (
      changedProperties.has("showOnlyMine") ||
      changedProperties.has("showOnlyInCollection")
    ) {
      if (this.showOnlyInCollection) {
        void this.fetchCrawls({ page: 1 });
      } else {
        void this.fetchWorkflows({ page: 1 });
      }

      void this.fetchUploads({ page: 1 });
    } else {
      if (changedProperties.has("sortCrawlsBy")) {
        if (this.showOnlyInCollection) {
          void this.fetchCrawls({ page: 1 });
        } else {
          void this.fetchWorkflows({ page: 1 });
        }
      } else if (changedProperties.has("filterCrawlsBy")) {
        if (this.showOnlyInCollection) {
          void this.fetchCrawls({ page: 1 });
        } else {
          void this.fetchWorkflows({ page: 1 });
        }
      }

      if (changedProperties.has("sortUploadsBy")) {
        void this.fetchUploads({ page: 1 });
      } else if (changedProperties.has("filterUploadsBy")) {
        void this.fetchUploads({ page: 1 });
      }
    }
  }

  render() {
    return html` <btrix-dialog
      ?open=${this.open}
      class="part-[title]:overflow-hidden"
      style="--width: var(--btrix-screen-desktop); --body-spacing: 0;"
      @sl-show=${() => (this.isReady = true)}
      @sl-after-hide=${() => this.reset()}
    >
      <div slot="label" class="flex items-center gap-3 divide-x">
        <div class="whitespace-nowrap">${msg("Configure Items")}</div>
        <div class="truncate px-3 text-sm leading-none text-neutral-500">
          ${this.collectionName}
        </div>
      </div>
      <div class="dialogContent flex flex-col">
        ${when(this.isReady, this.renderContent)}
      </div>
      <div slot="footer" class="flex items-center justify-end gap-3">
        <sl-button class="mr-auto" size="small" @click=${() => this.close()}
          >${msg("Cancel")}</sl-button
        >
        ${this.renderSave()}
      </div>
    </btrix-dialog>`;
  }

  private readonly renderContent = () => {
    return html`
      <div class="flex flex-wrap items-center justify-between">
        <div class="flex gap-3 px-4 py-3" role="tablist">
          ${TABS.map(this.renderTab)}
        </div>
        <div class="flex gap-3 px-4 py-3">
          ${this.renderCollectionToggle()} ${this.renderMineToggle()}
        </div>
      </div>
      <div
        id="tabPanel-crawls"
        class=${clsx(
          tw`flex-1 overflow-hidden`,
          this.activeTab === "crawl" && tw`flex flex-col`,
        )}
        role="tabpanel"
        tabindex="0"
        aria-labelledby="tab-crawls"
        ?hidden=${this.activeTab !== "crawl"}
      >
        ${this.renderCrawls()}
      </div>

      <div
        id="tabPanel-uploads"
        class=${clsx(
          tw`flex-1`,
          this.activeTab === "upload" && tw`flex flex-col`,
        )}
        role="tabpanel"
        tabindex="0"
        aria-labelledby="tab-uploads"
        ?hidden=${this.activeTab !== "upload"}
      >
        ${this.renderUploads()}
      </div>
    `;
  };

  private readonly renderTab = (tab: Tab) => {
    const isSelected = tab === this.activeTab;
    const { icon, label } = this.tabLabels[tab];

    return html`
      <btrix-navigation-button
        @click=${() => (this.activeTab = tab)}
        .active=${isSelected}
        size="small"
        aria-selected="${isSelected}"
        role="tab"
        aria-controls="tabPanel-${tab}"
        id="tab-${tab}"
        tabindex="-1"
      >
        <sl-icon name=${icon}></sl-icon>
        <span>${label}</span>
      </btrix-navigation-button>
    `;
  };

  private readonly renderCrawls = () => {
    return html`
      <header class="sticky top-0 z-20 bg-white">
        <div class="border-y bg-neutral-50 p-3">
          <btrix-item-list-controls
            .searchKeys=${searchKeys}
            .searchValues=${this.crawlSearchValues}
            .sortOptions=${crawlSortOptions}
            .sortBy=${this.sortCrawlsBy}
            @btrix-filter-change=${(
              e: CustomEvent<FilterChangeEventDetail>,
            ) => {
              this.filterCrawlsBy = e.detail;
            }}
            @btrix-sort-change=${(e: CustomEvent<SortChangeEventDetail>) => {
              this.sortCrawlsBy = {
                ...this.sortCrawlsBy,
                ...e.detail,
              };
            }}
          ></btrix-item-list-controls>
        </div>
        ${when(
          !this.showOnlyInCollection,
          () =>
            html`<btrix-section-heading>
              <h3 class="px-3">${msg("By Workflow")}</h3>
            </btrix-section-heading>`,
        )}
      </header>
      ${cache(
        this.showOnlyInCollection
          ? this.renderCollectionCrawls()
          : this.renderOrgWorkflows(),
      )}
    `;
  };

  private readonly renderUploads = () => {
    if (!this.uploads) {
      return this.renderLoading();
    }

    return html`
      <header class="sticky top-0 z-20 bg-white">
        <div class="border-y bg-neutral-50 p-3">
          <btrix-item-list-controls
            .searchKeys=${searchKeys}
            .searchValues=${this.uploadSearchValues}
            .sortOptions=${uploadSortOptions}
            .sortBy=${this.sortUploadsBy}
            @btrix-filter-change=${(
              e: CustomEvent<FilterChangeEventDetail>,
            ) => {
              this.filterUploadsBy = e.detail;
            }}
            @btrix-sort-change=${(e: CustomEvent<SortChangeEventDetail>) => {
              this.sortUploadsBy = {
                ...this.sortUploadsBy,
                ...e.detail,
              };
            }}
          ></btrix-item-list-controls>
        </div>
      </header>
      <section class="flex-1 overflow-hidden px-3 pb-3 pt-2">
        <btrix-archived-item-list listType="upload">
          <btrix-table-header-cell slot="checkboxCell" class="pr-0">
            <span class="sr-only">${msg("In Collection?")}</span>
          </btrix-table-header-cell>
          ${repeat(this.uploads.items, ({ id }) => id, this.renderArchivedItem)}
        </btrix-archived-item-list>
        ${when(
          !this.uploads.total,
          () =>
            html`<p class="p-5 text-center text-neutral-500">
              ${msg("No matching uploads found.")}
            </p>`,
        )}
      </section>
      <footer class="flex justify-center pb-3">
        ${when(
          this.uploads.total > this.uploads.pageSize,
          () => html`
            <btrix-pagination
              name="uploadsPage"
              page=${this.uploads!.page}
              size=${this.uploads!.pageSize}
              totalCount=${this.uploads!.total}
              @page-change=${(e: PageChangeEvent) => {
                void this.fetchUploads({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `,
        )}
      </footer>
    `;
  };

  private readonly renderCollectionCrawls = () => {
    if (!this.crawls) {
      return this.renderLoading();
    }

    return html`
      <section class="flex-1 px-3 pb-3 pt-2">
        <btrix-archived-item-list>
          <btrix-table-header-cell slot="checkboxCell" class="pr-0">
            <span class="sr-only">${msg("In Collection?")}</span>
          </btrix-table-header-cell>
          ${repeat(this.crawls.items, ({ id }) => id, this.renderArchivedItem)}
        </btrix-archived-item-list>

        ${when(
          !this.crawls.total,
          () =>
            html`<p class="p-5 text-center text-neutral-500">
              ${msg("No matching crawls found.")}
            </p>`,
        )}
      </section>

      <footer class="flex justify-center pb-3">
        ${when(
          this.crawls.total > this.crawls.pageSize,
          () => html`
            <btrix-pagination
              name="crawlsPage"
              page=${this.crawls!.page}
              size=${this.crawls!.pageSize}
              totalCount=${this.crawls!.total}
              @page-change=${(e: PageChangeEvent) => {
                void this.fetchCrawls({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `,
        )}
      </footer>
    `;
  };

  private readonly renderOrgWorkflows = () => {
    if (!this.workflows) {
      return this.renderLoading();
    }

    return html`<section class="flex-1 p-3">
        <btrix-collection-workflow-list
          collectionId=${this.collectionId}
          .workflows=${this.workflows.items}
          .selectedItems=${this.selectedItems}
          .workflowSelection=${this.workflowSelection}
          .workflowCrawls=${this.workflowCrawls}
          @btrix-crawls-page-change=${async (
            e: CustomEvent<CrawlsPageChangeDetail>,
          ) => {
            const { workflowId, page } = e.detail;

            const workflowCrawls = this.workflowCrawls.get(workflowId);
            const workflowSelection = this.workflowSelection.get(workflowId);
            if (!workflowCrawls || !workflowSelection) {
              console.debug("no workflowCrawls or workflowSelection");
              return;
            }

            const { paginatedCrawls, selectedCrawls } = workflowCrawls;
            const nextPaginatedCrawls = await this.getCrawls({
              pageSize:
                workflowCrawls.paginatedCrawls?.pageSize || DEFAULT_PAGE_SIZE,
              cid: workflowId,
              page,
            });

            nextPaginatedCrawls.items.forEach(({ id, cid }) => {
              this.crawlToWorkflow.set(id, cid);
            });

            // Update selection if totals have changed
            if (
              paginatedCrawls &&
              selectedCrawls &&
              nextPaginatedCrawls.total !== paginatedCrawls.total
            ) {
              this.workflowSelection.set(workflowId, {
                ...workflowSelection,
                checked:
                  nextPaginatedCrawls.total && selectedCrawls.total
                    ? selectedCrawls.total === nextPaginatedCrawls.total
                      ? true
                      : "indeterminate"
                    : false,
              });
            }

            this.workflowCrawls.set(workflowId, {
              selectedCrawls: workflowCrawls.selectedCrawls,
              paginatedCrawls: nextPaginatedCrawls,
            });
            this.workflowCrawls = new Map(this.workflowCrawls);
          }}
          @btrix-selection-change=${(e: CustomEvent<SelectionChangeDetail>) => {
            const { workflowSelection } = e.detail;

            for (const [workflowId, selection] of workflowSelection) {
              const savedSelection =
                this.savedWorkflowSelection.get(workflowId);

              if (selection.checked === true) {
                if (savedSelection?.checked === true) {
                  this.batchWorkflows.delete(workflowId);
                } else {
                  // Create placeholder crawls for correct add/remove counts
                  const existingCrawls = new Set<string>();

                  this.savedSelectedItems.forEach((v) => {
                    const id = unpackSymbolID(v);
                    if (this.crawlToWorkflow.get(id) === workflowId) {
                      existingCrawls.add(id);
                    }
                  });

                  const paginatedCrawls =
                    this.workflowCrawls.get(workflowId)?.paginatedCrawls;
                  const total = paginatedCrawls?.total || 0;

                  const placeholderCrawlIds = Array.from({
                    length: total - existingCrawls.size,
                  }).map(
                    (_, i) =>
                      paginatedCrawls?.items[i]?.id || Symbol(workflowId),
                  );

                  this.batchWorkflows.set(workflowId, {
                    operation: "add",
                    omitCrawls: new Set(),
                  });

                  this.selectedItems = this.selectedItems.union(
                    new Set(placeholderCrawlIds),
                  );
                }
              } else if (selection.checked === false) {
                if (savedSelection?.checked) {
                  this.savedSelectedItems.forEach((v) => {
                    const id = unpackSymbolID(v);
                    if (this.crawlToWorkflow.get(id) === workflowId) {
                      this.selectedItems.delete(id);
                    }
                  });

                  // Remove all placeholders
                  this.selectedItems.forEach((v) => {
                    if (typeof v === "symbol") {
                      this.selectedItems.delete(v);
                    }
                  });

                  this.batchWorkflows.set(workflowId, {
                    operation: "remove",
                    omitCrawls: new Set(),
                  });
                } else {
                  this.batchWorkflows.delete(workflowId);
                }
              }

              if (selection.addCrawls || selection.removeCrawls) {
                const addCrawls = selection.addCrawls || new Set();
                const removeCrawls = selection.removeCrawls || new Set();

                this.selectedItems = this.selectedItems
                  .difference(removeCrawls)
                  .union(addCrawls);

                const batchWorkflow = this.batchWorkflows.get(workflowId);

                if (batchWorkflow) {
                  this.batchWorkflows.set(workflowId, {
                    operation: batchWorkflow.operation,
                    omitCrawls:
                      batchWorkflow.operation === "add"
                        ? batchWorkflow.omitCrawls
                            .difference(addCrawls)
                            .union(removeCrawls)
                        : batchWorkflow.omitCrawls
                            .difference(removeCrawls)
                            .union(addCrawls),
                  });
                }
              }

              if (
                this.workflowSelection.get(workflowId)?.selectionCount !==
                selection.selectionCount
              ) {
                this.workflowSelection.set(workflowId, {
                  checked: selection.checked,
                  selectionCount: selection.selectionCount,
                });
              }
            }

            this.workflowSelection = new Map(this.workflowSelection);
            this.selectedItems = new Set(this.selectedItems);
          }}
          @btrix-auto-add-change=${(e: CustomEvent<AutoAddChangeDetail>) => {
            const { id, checked, dedupe } = e.detail;
            const workflow = this.workflows?.items.find(
              (workflow) => workflow.id === id,
            );
            if (workflow) {
              void this.saveAutoAdd({
                id,
                autoAddCollections: checked
                  ? union([this.collectionId], workflow.autoAddCollections)
                  : without([this.collectionId], workflow.autoAddCollections),
                dedupe,
              });
            }
          }}
        >
        </btrix-collection-workflow-list>
      </section>
      <footer class="flex justify-center pb-3">
        ${when(
          this.workflows.total > this.workflows.pageSize,
          () => html`
            <btrix-pagination
              name="workflowsPage"
              page=${this.workflows!.page}
              size=${this.workflows!.pageSize}
              totalCount=${this.workflows!.total}
              @page-change=${(e: PageChangeEvent) => {
                void this.fetchWorkflows({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `,
        )}
      </footer> `;
  };

  private renderCollectionToggle() {
    return html`
      <sl-switch
        size="small"
        ?checked=${this.showOnlyInCollection}
        @sl-change=${() =>
          (this.showOnlyInCollection = !this.showOnlyInCollection)}
      >
        ${msg("Only items in collection")}
      </sl-switch>
    `;
  }

  private renderMineToggle() {
    return html`
      <sl-switch
        size="small"
        ?checked=${this.showOnlyMine}
        @sl-change=${() => (this.showOnlyMine = !this.showOnlyMine)}
      >
        ${msg("Only mine")}
      </sl-switch>
    `;
  }

  renderArchivedItem = (item: ArchivedItem) => {
    const isInCollection = item.collectionIds.includes(this.collectionId);
    return html`
      <btrix-archived-item-list-item
        .item=${item}
        checkbox
        showStatus
        ?checked=${isInCollection}
        @btrix-change=${(e: ArchivedItemCheckedEvent) => {
          const { checked } = e.detail.value;

          if (checked) {
            this.selectedItems.add(item.id);
          } else {
            this.selectedItems.delete(item.id);
          }

          if (isCrawl(item)) {
            const workflowSelection = this.workflowSelection.get(item.cid);
            const workflowCrawls = this.workflowCrawls.get(item.cid);

            if (workflowSelection && workflowCrawls) {
              const selectionCount = checked
                ? workflowSelection.selectionCount + 1
                : workflowSelection.selectionCount - 1;
              this.workflowSelection.set(item.cid, {
                checked: selectionCount
                  ? selectionCount === workflowCrawls.paginatedCrawls?.total
                    ? true
                    : "indeterminate"
                  : false,
                selectionCount,
              });
            } else {
              console.debug("no workflowSelection or workflowCrawls");
            }
          }

          this.selectedItems = new Set(this.selectedItems);
          this.workflowSelection = new Map(this.workflowSelection);
        }}
      >
      </btrix-archived-item-list-item>
    `;
  };

  private readonly renderSave = () => {
    const { addItems, removeItems } = this.difference;

    const addCount = addItems.size;
    const removeCount = removeItems.size;
    const hasChange = addCount || removeCount;
    let selectionMessage = "";

    if (hasChange) {
      const messages: string[] = [];
      if (addCount) {
        messages.push(
          msg(
            str`Adding ${this.localize.number(addCount)} ${pluralOf("items", addCount)}`,
          ),
        );
      }
      if (removeCount) {
        messages.push(
          msg(
            str`Removing ${this.localize.number(removeCount)} ${pluralOf("items", removeCount)}`,
          ),
        );
      }

      selectionMessage = messages.join(" / ");
    }

    return html`
      <span class="text-warning">${selectionMessage}</span>
      <sl-button
        variant="primary"
        size="small"
        ?disabled=${this.isSubmitting}
        ?loading=${this.isSubmitting}
        @click=${hasChange ? () => void this.save() : () => this.close()}
      >
        ${hasChange ? msg("Save Selection") : msg("Done")}
      </sl-button>
    `;
  };

  private readonly renderLoading = () => html`
    <div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>
  `;

  private close() {
    void this.dialog.hide();
  }

  private reset() {
    this.isReady = false;
    // Reset selection and filters
    this.activeTab = TABS[0];
    this.crawls = undefined;
    this.workflows = undefined;
    this.uploads = undefined;
    this.showOnlyInCollection = false;
    this.showOnlyMine = false;
    this.sortCrawlsBy = {
      field: "finished",
      direction: -1,
    };
    this.sortUploadsBy = {
      field: "finished",
      direction: -1,
    };
    this.filterCrawlsBy = {};
    this.filterUploadsBy = {};
    this.selectedItems = new Set();
    this.savedSelectedItems = new Set();
    this.workflowSelection = new Map();
    this.savedWorkflowSelection = new Map();
    this.batchWorkflows = new Map();
  }

  private get difference() {
    const addItems = this.selectedItems.difference(this.savedSelectedItems);
    const removeItems = this.savedSelectedItems.difference(this.selectedItems);
    const addWorkflows = new Set<string>();
    const removeWorkflows = new Set<string>();

    for (const [workflowId, { operation }] of this.batchWorkflows) {
      if (operation === "add") {
        addWorkflows.add(workflowId);
      } else {
        removeWorkflows.add(workflowId);
      }
    }

    return {
      addItems,
      removeItems,
      addWorkflows,
      removeWorkflows,
    };
  }

  private async save() {
    await this.updateComplete;

    this.isSubmitting = true;

    try {
      const diff = this.difference;

      let omitFromBatchAdd = new Set<string>();
      let omitFromBatchRemove = new Set<string>();

      const workflowRequests = [];
      const itemRequests = [];

      if (diff.addWorkflows.size) {
        diff.addWorkflows.forEach((id) => {
          const batch = this.batchWorkflows.get(id);

          if (batch?.omitCrawls) {
            omitFromBatchAdd = omitFromBatchAdd.union(batch.omitCrawls);
          }
        });

        workflowRequests.push(
          this.api.fetch(
            `/orgs/${this.orgId}/collections/${this.collectionId}/add`,
            {
              method: "POST",
              body: JSON.stringify({
                crawlconfigIds: [...diff.addWorkflows],
              }),
            },
          ),
        );
      }
      if (diff.removeWorkflows.size) {
        diff.removeWorkflows.forEach((id) => {
          const batch = this.batchWorkflows.get(id);

          if (batch?.omitCrawls) {
            omitFromBatchRemove = omitFromBatchRemove.union(batch.omitCrawls);
          }
        });

        workflowRequests.push(
          this.api.fetch(
            `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
            {
              method: "POST",
              body: JSON.stringify({
                crawlconfigIds: [...diff.removeWorkflows],
              }),
            },
          ),
        );
      }

      await Promise.all(workflowRequests);

      const addItems = Array.from(
        diff.addItems.union(omitFromBatchRemove),
      ).filter((v) => {
        if (!isID(v)) return;
        const workflowId = this.crawlToWorkflow.get(v);
        if (workflowId) return !diff.addWorkflows.has(workflowId);
        return true;
      });
      const removeItems = Array.from(
        diff.removeItems.union(omitFromBatchAdd),
      ).filter((v) => {
        if (!isID(v)) return;
        const workflowId = this.crawlToWorkflow.get(v);
        if (workflowId) return !diff.removeWorkflows.has(workflowId);
        return true;
      });

      if (addItems.length) {
        itemRequests.push(
          this.api.fetch(
            `/orgs/${this.orgId}/collections/${this.collectionId}/add`,
            {
              method: "POST",
              body: JSON.stringify({
                crawlIds: addItems,
              }),
            },
          ),
        );
      }
      if (removeItems.length) {
        itemRequests.push(
          this.api.fetch(
            `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
            {
              method: "POST",
              body: JSON.stringify({
                crawlIds: removeItems,
              }),
            },
          ),
        );
      }

      await Promise.all(itemRequests);

      this.close();
      this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
      this.notify.toast({
        message: msg(str`Archived item selection updated.`),
        variant: "success",
        icon: "check2-circle",
        id: "archived-item-selection-status",
      });
    } catch (e) {
      this.notify.toast({
        message: isApiError(e)
          ? e.message
          : msg("Sorry, couldn't save archived item selection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-selection-status",
      });
    }

    this.isSubmitting = false;
  }

  private async initSelection() {
    this.workflowCrawls = new Map();
    this.workflowSelection = new Map();
    this.savedWorkflowSelection = new Map();
    this.selectedItems.clear();
    this.savedSelectedItems.clear();

    void this.fetchWorkflows({
      page: parsePage(
        new URLSearchParams(location.search).get("workflowsPage"),
      ),
      pageSize: DEFAULT_PAGE_SIZE,
    });
    void this.fetchCrawls({
      page: parsePage(new URLSearchParams(location.search).get("crawlsPage")),
      pageSize: DEFAULT_PAGE_SIZE,
    });
    void this.fetchUploads({
      page: parsePage(new URLSearchParams(location.search).get("crawlsPage")),
      pageSize: DEFAULT_PAGE_SIZE,
    });
    void this.fetchSearchValues();

    // FIXME Better handling of collections with more than 1,000 uploads
    const { items } = await this.getUploads({
      pageSize: COLLECTION_ITEMS_MAX,
      collectionId: this.collectionId,
    });

    items.forEach(({ id }) => this.selectedItems.add(id));

    this.savedSelectedItems = new Set(this.selectedItems);
    this.selectedItems = new Set(this.selectedItems);
  }

  private async fetchCrawls(pageParams: APIPaginationQuery = {}) {
    const userId = this.userInfo!.id;

    try {
      this.crawls = await this.getCrawls({
        userid: this.showOnlyMine ? userId : undefined,
        collectionId: this.collectionId,
        sortBy: this.sortCrawlsBy.field,
        sortDirection: this.sortCrawlsBy.direction,
        page: this.crawls?.page ?? 1,
        pageSize: this.crawls?.pageSize ?? DEFAULT_PAGE_SIZE,
        ...pageParams,
        ...this.filterCrawlsBy,
      });
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async fetchWorkflows(pageParams: APIPaginationQuery = {}) {
    const userId = this.userInfo!.id;

    try {
      const workflows = await this.getWorkflows({
        userid: this.showOnlyMine ? userId : undefined,
        sortBy:
          // NOTE "finished" field doesn't exist in crawlconfigs,
          // `lastRun` is used instead
          this.sortCrawlsBy.field === "finished"
            ? "lastRun"
            : this.sortCrawlsBy.field,
        sortDirection: this.sortCrawlsBy.direction,
        page: this.workflows?.page ?? 1,
        pageSize: this.workflows?.pageSize ?? DEFAULT_PAGE_SIZE,
        ...pageParams,
        ...this.filterCrawlsBy,
      });

      await Promise.all(
        workflows.items.map(async (workflow) => {
          if (this.workflowCrawls.has(workflow.id)) return;

          // FIXME Better handling of collections with more than 1,000
          // crawls per workflow
          const selectedCrawls = workflow.crawlSuccessfulCount
            ? await this.getCrawls({
                pageSize: COLLECTION_ITEMS_MAX,
                cid: workflow.id,
                collectionId: this.collectionId,
              })
            : null;
          const paginatedCrawls = workflow.crawlSuccessfulCount
            ? await this.getCrawls({
                pageSize: DEFAULT_PAGE_SIZE,
                cid: workflow.id,
              })
            : null;

          const selection: {
            checked: boolean | "indeterminate";
            selectionCount: number;
          } = {
            checked: false,
            selectionCount: selectedCrawls?.total || 0,
          };

          if (paginatedCrawls?.total && selectedCrawls?.total) {
            if (selectedCrawls.total === paginatedCrawls.total) {
              selection.checked = true;
            } else {
              selection.checked = "indeterminate";
            }
          }

          selectedCrawls?.items.forEach(({ id, cid }) => {
            this.crawlToWorkflow.set(id, cid);
            this.selectedItems.add(id);
            this.savedSelectedItems.add(id);
          });

          paginatedCrawls?.items.forEach(({ id, cid }) => {
            this.crawlToWorkflow.set(id, cid);
          });

          this.workflowSelection.set(workflow.id, selection);
          this.savedWorkflowSelection.set(workflow.id, selection);
          this.workflowCrawls.set(workflow.id, {
            selectedCrawls,
            paginatedCrawls,
          });
        }),
      );

      this.workflows = workflows;
      this.workflowCrawls = new Map(this.workflowCrawls);
      this.selectedItems = new Set(this.selectedItems);
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async fetchUploads(pageParams: APIPaginationQuery = {}) {
    const userId = this.userInfo!.id;

    try {
      this.uploads = await this.getUploads({
        userid: this.showOnlyMine ? userId : undefined,
        collectionId: this.showOnlyInCollection ? this.collectionId : undefined,
        sortBy: this.sortUploadsBy.field,
        sortDirection: this.sortUploadsBy.direction,
        page: this.uploads?.page,
        pageSize: this.uploads?.pageSize,
        ...pageParams,
        ...this.filterUploadsBy,
      });
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async fetchSearchValues() {
    try {
      const [crawlValues, workflowValues, uploadValues] = await Promise.all([
        this.getSearchValues("crawl"),
        this.getSearchValues("workflow"),
        this.getSearchValues("upload"),
      ]);
      this.crawlSearchValues = merge(crawlValues, workflowValues);
      this.uploadSearchValues = uploadValues;
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async getCrawls(
    params: {
      userid?: string;
      collectionId?: string;
      cid?: string;
      firstSeed?: string;
    } & APIPaginationQuery &
      APISortQuery = {},
  ) {
    const query = queryString.stringify(
      {
        state: finishedCrawlStates,
        sortBy: "started",
        sortDirection: SortDirection.Descending,
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );
    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
    );

    return data;
  }

  private async getWorkflows(
    params: {
      userid?: string;
      name?: string;
      firstSeed?: string;
    } & APIPaginationQuery &
      APISortQuery = {},
  ) {
    const query = queryString.stringify({
      ...params,
    });
    const data = await this.api.fetch<APIPaginatedList<Workflow>>(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
    );

    return data;
  }

  private async getUploads(
    params: {
      userid?: string;
      collectionId?: string;
      name?: string;
    } & APIPaginationQuery &
      APISortQuery = {},
  ) {
    const query = queryString.stringify({
      state: "complete",
      ...params,
    });
    const data = await this.api.fetch<APIPaginatedList<Upload>>(
      `/orgs/${this.orgId}/uploads?${query}`,
    );

    return data;
  }

  private async getSearchValues(searchType: "crawl" | "upload" | "workflow") {
    if (searchType === "workflow") {
      return this.api.fetch<SearchValues>(
        `/orgs/${this.orgId}/crawlconfigs/search-values`,
      );
    }
    return this.api.fetch<SearchValues>(
      `/orgs/${this.orgId}/all-crawls/search-values?crawlType=${searchType}`,
    );
  }

  private async saveAutoAdd({
    id,
    autoAddCollections,
    dedupe,
  }: Pick<Workflow, "id" | "autoAddCollections"> & { dedupe?: boolean }) {
    const params: Pick<Workflow, "autoAddCollections" | "dedupeCollId"> = {
      autoAddCollections: autoAddCollections,
    };

    if (dedupe === true) {
      params.dedupeCollId = this.collectionId;
    } else if (dedupe === false) {
      params.dedupeCollId = "";
    }

    try {
      await this.api.fetch(`/orgs/${this.orgId}/crawlconfigs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(params),
      });
      await this.fetchWorkflows();
      this.dispatchEvent(new CustomEvent("btrix-collection-saved"));

      this.notify.toast({
        message:
          dedupe === true || dedupe === false
            ? msg("Deduplication settings updated.")
            : msg("Auto-add settings updated."),
        variant: "success",
        icon: "check2-circle",
        duration: 1000,
        id: "auto-add-status",
      });
    } catch (e: unknown) {
      console.debug(e);
      this.notify.toast({
        message: msg(
          "Something unexpected went wrong, couldn't save auto-add setting.",
        ),
        variant: "warning",
        icon: "exclamation-circle",
        id: "auto-add-status",
      });
    }
  }
}
