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
  SelectionChangeDetail,
  SelectionLoadDetail,
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
import { finishedCrawlStates } from "@/utils/crawler";
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

  @state()
  private selectedItemsSet = new Set<string>();

  @state()
  private selectedWorkflowsSet = new Set<string>();

  @query("btrix-dialog")
  private readonly dialog!: Dialog;

  private crawlCidMap = new Map<
    /* crawl.id */ string,
    /* crawl.cid */ string
  >();

  private omitCrawlsFromRemoveSet = new Set<string>();
  private omitCrawlsFromAddSet = new Set<string>();
  private savedItemsSet = new Set<string>();
  private savedWorkflowsSet = new Set<string>();

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
          @btrix-selection-load=${(e: CustomEvent<SelectionLoadDetail>) => {
            this.selectedWorkflowsSet = new Set(e.detail.selectedWorkflows);
            this.savedWorkflowsSet = new Set(this.selectedWorkflowsSet);
          }}
          @btrix-selection-change=${(e: CustomEvent<SelectionChangeDetail>) => {
            const { addCrawls, removeCrawls, addWorkflows, removeWorkflows } =
              e.detail;

            this.selectedWorkflowsSet = this.selectedWorkflowsSet
              .difference(removeWorkflows)
              .union(addWorkflows);

            const diff = this.difference;

            addCrawls.forEach(({ id, cid }) => {
              this.crawlCidMap.set(id, cid);

              if (diff.removeWorkflows.has(cid)) {
                this.omitCrawlsFromRemoveSet.add(id);
              } else {
                this.selectedItemsSet.add(id);
              }
            });

            removeCrawls.forEach(({ id, cid }) => {
              this.crawlCidMap.set(id, cid);

              if (diff.addWorkflows.has(cid)) {
                this.omitCrawlsFromAddSet.add(id);
              } else {
                this.selectedItemsSet.delete(id);
              }
            });

            diff.addItems.forEach((id) => {
              const workflowId = this.crawlCidMap.get(id);
              if (workflowId && removeWorkflows.has(workflowId)) {
                // Reset to remove all
                this.omitCrawlsFromRemoveSet.delete(id);
                this.selectedItemsSet.delete(id);
              }
            });

            diff.removeItems.forEach((id) => {
              const workflowId = this.crawlCidMap.get(id);
              if (workflowId && addWorkflows.has(workflowId)) {
                // Reset to add all
                this.omitCrawlsFromAddSet.delete(id);
                this.selectedItemsSet.add(id);
              }
            });
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
          if (e.detail.value.checked) {
            this.selectedItemsSet.add(item.id);
          } else {
            this.selectedItemsSet.add(item.id);
          }
        }}
      >
      </btrix-archived-item-list-item>
    `;
  };

  private readonly renderSave = () => {
    const { addItems, removeItems, addWorkflows, removeWorkflows } =
      this.difference;
    const addItemCount = addItems.size;
    const removeItemCount = removeItems.size;
    const addWorkflowCount = addWorkflows.size;
    const removeWorkflowCount = removeWorkflows.size;

    const hasChange =
      addItemCount ||
      removeItemCount ||
      addWorkflowCount ||
      removeWorkflowCount;
    let selectionMessage = "";

    if (hasChange) {
      const messages: string[] = [];

      if (this.showOnlyInCollection || this.activeTab === "upload") {
        if (removeItemCount) {
          messages.push(
            msg(
              str`Removing ${this.localize.number(removeItemCount)} ${pluralOf("items", removeItemCount)}`,
            ),
          );
        }
        if (addItemCount) {
          messages.push(
            msg(
              str`Adding ${this.localize.number(addItemCount)} ${pluralOf("items", addItemCount)}`,
            ),
          );
        }

        selectionMessage = messages.join(" / ");
      } else {
        selectionMessage = msg("Unsaved changes.");

        // TODO more detailed message

        // if (removeWorkflowCount) {
        //   const number_of_workflows = this.localize.number(removeWorkflowCount);
        //   const plural_of_workflows = pluralOf(
        //     "workflows",
        //     removeWorkflowCount,
        //   );

        //   console.log(removeItemCount);

        //   messages.push(
        //     msg(
        //       str`Removing all crawls of ${number_of_workflows} ${plural_of_workflows}`,
        //     ),
        //   );
        // }
        // if (addWorkflowCount) {
        //   const number_of_workflows = this.localize.number(addWorkflowCount);
        //   const plural_of_workflows = pluralOf("workflows", addWorkflowCount);

        //   console.log(addItemCount);

        //   messages.push(
        //     msg(
        //       str`Adding all crawls of ${number_of_workflows} ${plural_of_workflows}`,
        //     ),
        //   );
        // }
      }
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
    this.selectedItemsSet = new Set();
    this.savedItemsSet = new Set();
    this.omitCrawlsFromRemoveSet = new Set();
    this.omitCrawlsFromAddSet = new Set();
    this.selectedWorkflowsSet = new Set();
    this.savedWorkflowsSet = new Set();
    this.crawlCidMap = new Map();
  }

  private get difference() {
    return {
      addItems: this.selectedItemsSet
        .difference(this.savedItemsSet)
        .union(this.omitCrawlsFromRemoveSet),
      removeItems: this.savedItemsSet
        .difference(this.selectedItemsSet)
        .union(this.omitCrawlsFromAddSet),
      addWorkflows: this.selectedWorkflowsSet.difference(
        this.savedWorkflowsSet,
      ),
      removeWorkflows: this.savedWorkflowsSet.difference(
        this.selectedWorkflowsSet,
      ),
    };
  }

  private async save() {
    await this.updateComplete;
    const { addItems, removeItems, addWorkflows, removeWorkflows } =
      this.difference;

    const workflowRequests = [];
    const itemRequests = [];

    if (addWorkflows.size) {
      workflowRequests.push(
        this.api.fetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/add`,
          {
            method: "POST",
            body: JSON.stringify({
              crawlconfigIds: [...addWorkflows],
            }),
          },
        ),
      );
    }
    if (removeWorkflows.size) {
      workflowRequests.push(
        this.api.fetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
          {
            method: "POST",
            body: JSON.stringify({
              crawlconfigIds: [...removeWorkflows],
            }),
          },
        ),
      );
    }
    if (addItems.size) {
      itemRequests.push(
        this.api.fetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/add`,
          {
            method: "POST",
            body: JSON.stringify({
              crawlIds: [...addItems],
            }),
          },
        ),
      );
    }
    if (removeItems.size) {
      itemRequests.push(
        this.api.fetch(
          `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
          {
            method: "POST",
            body: JSON.stringify({
              crawlIds: [...removeItems],
            }),
          },
        ),
      );
    }

    this.isSubmitting = true;

    try {
      // await Promise.all(workflowRequests);
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
    this.selectedItemsSet.clear();
    this.savedItemsSet.clear();
    this.selectedWorkflowsSet.clear();
    this.savedWorkflowsSet.clear();
    this.omitCrawlsFromRemoveSet.clear();
    this.omitCrawlsFromAddSet.clear();

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

    const [crawls, uploads] = await Promise.all([
      this.getCrawls({
        pageSize: COLLECTION_ITEMS_MAX,
        collectionId: this.collectionId,
      }).then(({ items }) => items),
      this.getUploads({
        pageSize: COLLECTION_ITEMS_MAX,
        collectionId: this.collectionId,
      }).then(({ items }) => items),
    ]);

    crawls.forEach(({ id }) => this.selectedItemsSet.add(id));
    uploads.forEach(({ id }) => this.selectedItemsSet.add(id));

    this.omitCrawlsFromRemoveSet = new Set(this.omitCrawlsFromRemoveSet);
    this.omitCrawlsFromAddSet = new Set(this.omitCrawlsFromAddSet);
    this.savedItemsSet = new Set(this.selectedItemsSet);
    this.selectedItemsSet = new Set(this.selectedItemsSet);
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
      this.workflows = await this.getWorkflows({
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
