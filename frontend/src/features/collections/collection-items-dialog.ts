import { type PropertyValues, css, html } from "lit";
import { state, property, query, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import difference from "lodash/fp/difference";
import queryString from "query-string";

import type { AuthState } from "@/utils/AuthService";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { ArchivedItem, Crawl, Upload, Workflow } from "@/types/crawler";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { finishedCrawlStates } from "@/utils/crawler";
import type { Dialog } from "@/components/ui/dialog";
import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { type SelectionChangeDetail } from "@/features/collections/collection-item-list";
import { NotifyController } from "@/controllers/notify";
import type {
  SortChangeEventDetail,
  FilterChangeEventDetail,
  SearchValues,
  SortOptions,
  SortBy,
} from "@/features/archived-items/item-list-controls";

const TABS = ["crawl", "upload"] as const;
type Tab = (typeof TABS)[number];
const searchKeys = ["name", "firstSeed"];
const workflowSortOptions: SortOptions = [
  {
    field: "lastRun",
    label: msg("Latest Crawl"),
    defaultDirection: -1,
  },
  {
    field: "firstSeed",
    label: msg("Crawl Start URL"),
    defaultDirection: 1,
  },
];
const itemSortOptions: SortOptions = [
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
const ORG_ITEMS_PAGE_SIZE = 10;

@localized()
@customElement("btrix-collection-items-dialog")
export class CollectionItemsDialog extends TailwindElement {
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

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  userId!: string;

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
  private collectionCrawls?: APIPaginatedList<Crawl>;

  @state()
  private collectionUploads?: APIPaginatedList<Upload>;

  @state()
  private orgUploads?: APIPaginatedList<Upload>;

  @state()
  private orgWorkflows?: APIPaginatedList<Workflow>;

  @state()
  showOnlyInCollection = false;

  @state()
  showOnlyMine = false;

  @state()
  sortWorkflowsBy: SortBy = {
    field: "lastRun",
    direction: -1,
  };

  @state()
  sortUploadsBy: SortBy = {
    field: "finished",
    direction: -1,
  };

  @state()
  private workflowSearchValues?: SearchValues;

  @state()
  private uploadSearchValues?: SearchValues;

  /**
   * Whether item is selected or not, keyed by ID
   */
  @state()
  private selection: { [itemID: string]: boolean } = {};

  @query("btrix-dialog")
  private dialog!: Dialog;

  private api = new APIController(this);
  private notify = new NotifyController(this);

  private readonly tabLabels: Record<Tab, { icon: string; label: string }> = {
    crawl: {
      icon: "gear-wide-connected",
      label: msg("Crawls"),
    },
    upload: {
      icon: "upload",
      label: msg("Uploads"),
    },
  };

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (
      changedProperties.has("orgId") ||
      changedProperties.has("showOnlyMine")
    ) {
      this.fetchOrgWorkflows();
      this.fetchOrgUploads();
      this.fetchSearchValues();
    } else {
      if (changedProperties.has("sortWorkflowsBy")) {
        this.fetchOrgWorkflows();
      }
      if (
        changedProperties.has("sortUploadsBy") ||
        changedProperties.has("showOnlyInCollection")
      ) {
        this.fetchOrgUploads();
      }
    }
    if (changedProperties.has("open") && this.open) {
      this.fetchCollectionCrawls();
      this.fetchCollectionUploads();
    }
  }

  render() {
    return html`
      <btrix-dialog ?open=${this.open} @sl-after-hide=${() => this.reset()}>
        <span slot="label">
          ${msg("Select Archived Items")}
          <span class="text-neutral-500 font-normal"
            >${msg(str`in ${this.collectionName}`)}</span
          >
        </span>
        <div class="dialogContent flex flex-col">
          <div class="flex items-center justify-between">
            <div class="flex gap-3 px-4 py-3" role="tablist">
              ${TABS.map(this.renderTab)}
            </div>
            <div class="flex gap-3 px-4 py-3">
              ${this.renderCollectionToggle()} ${this.renderMineToggle()}
            </div>
          </div>
          <div
            id="tabPanel-crawls"
            class="flex-1${this.activeTab === "crawl" ? " flex flex-col" : ""}"
            role="tabpanel"
            tabindex="0"
            aria-labelledby="tab-crawls"
            ?hidden=${this.activeTab !== "crawl"}
          >
            ${this.renderCrawls()}
          </div>

          <div
            id="tabPanel-uploads"
            class="flex-1${this.activeTab === "upload" ? " flex flex-col" : ""}"
            role="tabpanel"
            tabindex="0"
            aria-labelledby="tab-uploads"
            ?hidden=${this.activeTab !== "upload"}
          >
            ${this.renderUploads()}
          </div>
        </div>
        <div slot="footer" class="flex gap-3 items-center justify-end">
          <sl-button class="mr-auto" size="small" @click=${() => this.close()}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            size="small"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
            @click=${() => this.save()}
            >${msg("Save Selection")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
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
        role="tab"
        aria-controls="tabPanel-${tab}"
        id="tab-${tab}"
        tabindex="-1"
      >
        <sl-icon name=${icon}></sl-icon>
        <span>${label}</span>
      </btrix-button>
    `;
  };

  private renderCrawls = () => {
    if (this.showOnlyInCollection) {
      return html`TODO`;
    }

    return html`
      <div class="border-y bg-neutral-50 p-3 z-20">
        <btrix-item-list-controls
          .searchKeys=${searchKeys}
          .searchValues=${this.workflowSearchValues}
          .sortOptions=${workflowSortOptions}
          .sortBy=${this.sortWorkflowsBy}
          @btrix-filter-change=${(e: CustomEvent<FilterChangeEventDetail>) => {
            this.fetchOrgWorkflows({
              name: e.detail.name,
              firstSeed: e.detail.firstSeed,
              page: 1,
            });
          }}
          @btrix-sort-change=${(e: CustomEvent<SortChangeEventDetail>) => {
            this.sortWorkflowsBy = {
              ...this.sortWorkflowsBy,
              ...e.detail,
            };
          }}
        ></btrix-item-list-controls>
      </div>
      <section class="flex-1 p-3">
        ${when(
          this.orgWorkflows,
          () => html`
            <btrix-collection-workflow-list
              .authState=${this.authState}
              orgId=${this.orgId}
              .workflows=${this.orgWorkflows!.items || []}
              .selection=${this.selection}
              @btrix-selection-change=${(
                e: CustomEvent<SelectionChangeDetail>
              ) => {
                this.selection = {
                  ...this.selection,
                  ...e.detail.selection,
                };
              }}
            >
            </btrix-collection-workflow-list>
          `,
          this.renderLoading
        )}
      </section>
      <footer class="flex justify-center pb-3">
        ${when(
          this.orgWorkflows &&
            this.orgWorkflows.total > this.orgWorkflows.pageSize,
          () => html`
            <btrix-pagination
              page=${this.orgWorkflows!.page}
              size=${this.orgWorkflows!.pageSize}
              totalCount=${this.orgWorkflows!.total}
              @page-change=${(e: PageChangeEvent) => {
                this.fetchOrgWorkflows({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `
        )}
      </footer>
    `;
  };

  private renderUploads = () => {
    return html`
      <div class="border-y bg-neutral-50 p-3 z-20">
        <btrix-item-list-controls
          .searchKeys=${searchKeys}
          .searchValues=${this.uploadSearchValues}
          .sortOptions=${itemSortOptions}
          .sortBy=${this.sortUploadsBy}
          @btrix-filter-change=${(e: CustomEvent<FilterChangeEventDetail>) => {
            this.fetchOrgUploads({
              name: e.detail.name,
              page: 1,
            });
          }}
          @btrix-sort-change=${(e: CustomEvent<SortChangeEventDetail>) => {
            this.sortUploadsBy = {
              ...this.sortUploadsBy,
              ...e.detail,
            };
          }}
        ></btrix-item-list-controls>
      </div>
      <section class="flex-1 p-3">
        <btrix-collection-item-list
          collectionId=${this.collectionId}
          .items=${this.orgUploads?.items || []}
          @btrix-selection-change=${(e: CustomEvent<SelectionChangeDetail>) => {
            this.selection = {
              ...this.selection,
              ...e.detail.selection,
            };
          }}
        ></btrix-collection-item-list>
      </section>
      <footer class="flex justify-center pb-3">
        ${when(
          this.orgUploads && this.orgUploads.total > this.orgUploads.pageSize,
          () => html`
            <btrix-pagination
              page=${this.orgUploads!.page}
              size=${this.orgUploads!.pageSize}
              totalCount=${this.orgUploads!.total}
              @page-change=${(e: PageChangeEvent) => {
                this.fetchOrgUploads({
                  page: e.detail.page,
                });
              }}
            >
            </btrix-pagination>
          `
        )}
      </footer>
    `;
  };

  private renderCollectionToggle() {
    return html`
      <label class="flex items-center gap-2">
        <div class="text-neutral-500">${msg("Only in Collection")}</div>
        <sl-switch
          class="flex"
          size="small"
          ?checked=${this.showOnlyInCollection}
          @sl-change=${() =>
            (this.showOnlyInCollection = !this.showOnlyInCollection)}
        ></sl-switch>
      </label>
    `;
  }

  private renderMineToggle() {
    return html`
      <label class="flex items-center gap-2">
        <div class="text-neutral-500">${msg("Only mine")}</div>
        <sl-switch
          class="flex"
          size="small"
          ?checked=${this.showOnlyMine}
          @sl-change=${() => (this.showOnlyMine = !this.showOnlyMine)}
        ></sl-switch>
      </label>
    `;
  }

  private renderLoading = () => html`
    <div class="w-full flex items-center justify-center my-24 text-3xl">
      <sl-spinner></sl-spinner>
    </div>
  `;

  private close() {
    this.dialog.hide();
  }

  private reset() {
    this.activeTab = TABS[0];
  }

  private selectAllItems(items: ArchivedItem[]) {
    const selection = { ...this.selection };
    items.forEach((item) => {
      if (!selection.hasOwnProperty(item.id)) {
        selection[item.id] = true;
      }
    });
    this.selection = selection;
  }

  private async save() {
    await this.updateComplete;
    const itemIds = Object.entries(this.selection)
      .filter(([, isSelected]) => isSelected)
      .map(([id]) => id);
    const oldItemIds = [
      ...this.collectionCrawls!.items.map(({ id }) => id),
      ...this.collectionUploads!.items.map(({ id }) => id),
    ];
    const remove = difference(oldItemIds)(itemIds);
    const add = difference(itemIds)(oldItemIds);
    const requests = [];
    if (add.length) {
      requests.push(
        this.api.fetch(
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
        this.api.fetch(
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

      this.close();
      this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
      this.notify.toast({
        message: msg(str`Successfully saved archived item selection.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      this.notify.toast({
        message: e.isApiError
          ? (e.message as string)
          : msg("Something unexpected went wrong"),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmitting = false;
  }

  private async fetchOrgUploads(
    params: { name?: string } & APIPaginationQuery = {}
  ) {
    try {
      this.orgUploads = await this.getUploads({
        ...params,
        page: params.page || this.orgUploads?.page || 1,
        pageSize: ORG_ITEMS_PAGE_SIZE,
        sortBy: this.sortUploadsBy.field,
        sortDirection: this.sortUploadsBy.direction,
        userid: this.showOnlyMine ? this.userId : undefined,
        collectionId: this.showOnlyInCollection ? this.collectionId : undefined,
      });
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async fetchOrgWorkflows(
    params: { name?: string; firstSeed?: string } & APIPaginationQuery = {}
  ) {
    try {
      this.orgWorkflows = await this.getWorkflows({
        ...params,
        page: params.page || this.orgWorkflows?.page || 1,
        pageSize: ORG_ITEMS_PAGE_SIZE,
        sortBy: this.sortWorkflowsBy.field,
        sortDirection: this.sortWorkflowsBy.direction,
      });
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async fetchCollectionCrawls(
    params: { name?: string; firstSeed?: string } = {}
  ) {
    try {
      this.collectionCrawls = await this.getCrawls({
        ...params,
        collectionId: this.collectionId,
        page: 1,
        pageSize: COLLECTION_ITEMS_MAX,
      });
      this.selectAllItems(this.collectionCrawls.items);
      if (this.collectionCrawls.total > this.collectionCrawls.pageSize) {
        // TODO show warning in UI
        console.warn(`more than ${COLLECTION_ITEMS_MAX} crawls in collection`);
      }
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async fetchCollectionUploads(params: { name?: string } = {}) {
    try {
      this.collectionUploads = await this.getUploads({
        ...params,
        collectionId: this.collectionId,
        page: 1,
        pageSize: COLLECTION_ITEMS_MAX,
      });
      this.selectAllItems(this.collectionUploads.items);
      if (this.collectionUploads.total > this.collectionUploads.pageSize) {
        // TODO show warning in UI
        console.warn(`more than ${COLLECTION_ITEMS_MAX} crawls in collection`);
      }
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async fetchSearchValues() {
    try {
      const [workflowValues, uploadValues] = await Promise.all([
        this.getSearchValues("crawl"),
        this.getSearchValues("upload"),
      ]);
      this.workflowSearchValues = workflowValues;
      this.uploadSearchValues = uploadValues;
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async getCrawls(
    params: {
      collectionId?: string;
    } & APIPaginationQuery = {}
  ) {
    const query = queryString.stringify(
      {
        state: finishedCrawlStates,
        ...params,
      },
      {
        arrayFormat: "comma",
      }
    );
    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
      this.authState!
    );

    return data;
  }

  private async getWorkflows(
    params: { name?: string; firstSeed?: string } & APIPaginationQuery &
      APISortQuery = {}
  ) {
    const query = queryString.stringify({
      ...params,
    });
    const data = await this.api.fetch<APIPaginatedList<Workflow>>(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      this.authState!
    );

    return data;
  }

  private async getUploads(
    params: {
      collectionId?: string;
      userid?: string;
      name?: string;
    } & APIPaginationQuery &
      APISortQuery = {}
  ) {
    const query = queryString.stringify({
      state: "complete",
      ...params,
    });
    const data = await this.api.fetch<APIPaginatedList<Upload>>(
      `/orgs/${this.orgId}/uploads?${query}`,
      this.authState!
    );

    return data;
  }

  private async getSearchValues(itemType: ArchivedItem["type"]) {
    if (itemType === "upload") {
      return this.api.fetch<SearchValues>(
        `/orgs/${this.orgId}/all-crawls/search-values?crawlType=upload`,
        this.authState!
      );
    }
    return this.api.fetch<SearchValues>(
      `/orgs/${this.orgId}/crawlconfigs/search-values`,
      this.authState!
    );
  }
}
