import { type PropertyValues, css } from "lit";
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
import type { SlMenuItem, SlTreeItem } from "@shoelace-style/shoelace";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Collection } from "@/types/collection";
import type {
  ArchivedItem,
  Crawl,
  CrawlState,
  Upload,
  Workflow,
} from "@/types/crawler";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { finishedCrawlStates } from "@/utils/crawler";
import type { Dialog } from "@/components/ui/dialog";
import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { type SelectionChangeDetail } from "@/features/collections/collection-upload-list";
import { NotifyController } from "@/controllers/notify";

const TABS = ["crawl", "upload"] as const;
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

const COLLECTION_ITEMS_PAGE_SIZE = 100;
const WORKFLOW_PAGE_SIZE = 10;
const UPLOADS_PAGE_SIZE = 10;
const MIN_SEARCH_LENGTH = 2;

@localized()
@customElement("btrix-collection-items-dialog")
export class CollectionEditor extends TailwindElement {
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
      changedProperties.has("collectionId")
    ) {
      this.fetchOrgUploads();
      this.fetchOrgWorkflows();
    }
    if (changedProperties.has("open") && this.open) {
      this.fetchCollectionCrawls();
      this.fetchCollectionUploads();
    }
  }

  render() {
    return html`
      <btrix-dialog
        label=${msg(str`Select Archived Items for ${this.collectionName}`)}
        ?open=${this.open}
        @sl-after-hide=${() => this.reset()}
      >
        <div class="dialogContent flex flex-col">
          <div class="flex gap-3 px-4 py-3" role="tablist">
            ${TABS.map(this.renderTab)}
          </div>
          <div class="border-y bg-neutral-50 p-3 z-20">
            <btrix-item-list-controls
              .authState=${this.authState}
              orgId=${this.orgId}
              itemType=${this.activeTab}
            ></btrix-item-list-controls>
          </div>
          <div
            id="tabPanel-crawls"
            role="tabpanel"
            tabindex="0"
            aria-labelledby="tab-crawls"
            ?hidden=${this.activeTab !== "crawl"}
          >
            ${this.renderSelectCrawls()}
          </div>

          <div
            id="tabPanel-uploads"
            role="tabpanel"
            tabindex="0"
            aria-labelledby="tab-uploads"
            ?hidden=${this.activeTab !== "upload"}
          >
            ${this.renderSelectUploads()}
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

  private renderSelectCrawls = () => {
    return html`
      <div class="sticky top-0 bg-white z-10">
        <btrix-section-heading>
          <div class="flex-1 flex items-center justify-between">
            <div class="px-3">${msg("Crawl Workflows")}</div>
            ${when(
              this.orgWorkflows &&
                this.orgWorkflows.total > this.orgWorkflows.pageSize,
              () => html`
                <btrix-pagination
                  page=${this.orgWorkflows!.page}
                  size=${this.orgWorkflows!.pageSize}
                  totalCount=${this.orgWorkflows!.total}
                  compact
                  @page-change=${(e: PageChangeEvent) => {
                    this.fetchOrgWorkflows({
                      page: e.detail.page,
                    });
                  }}
                >
                </btrix-pagination>
              `
            )}
          </div>
        </btrix-section-heading>
      </div>
      <section class="p-3">
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
    `;
  };

  private renderSelectUploads = () => {
    return html`
      <section class="p-3">
        <btrix-collection-upload-list
          collectionId=${this.collectionId}
          .items=${this.orgUploads?.items || []}
          @btrix-selection-change=${(e: CustomEvent<SelectionChangeDetail>) => {
            this.selection = {
              ...this.selection,
              ...e.detail.selection,
            };
          }}
        ></btrix-collection-upload-list>
      </section>
    `;
  };

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

  private async fetchOrgUploads() {
    try {
      this.orgUploads = await this.getUploads({
        pageSize: UPLOADS_PAGE_SIZE,
      });
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async fetchOrgWorkflows(params: { page?: number } = {}) {
    try {
      this.orgWorkflows = await this.getWorkflows({
        page: params.page || this.orgWorkflows?.page || 1,
        pageSize: WORKFLOW_PAGE_SIZE,
      });
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async fetchCollectionCrawls() {
    try {
      this.collectionCrawls = await this.getCrawls({
        collectionId: this.collectionId,
        pageSize: COLLECTION_ITEMS_PAGE_SIZE,
      });
      this.selectAllItems(this.collectionCrawls.items);
      if (this.collectionCrawls.total > this.collectionCrawls.pageSize) {
        // TODO show warning in UI
        console.warn(
          `more than ${COLLECTION_ITEMS_PAGE_SIZE} crawls in collection`
        );
      }
    } catch (e: any) {
      console.debug(e);
    }
  }

  private async fetchCollectionUploads() {
    try {
      this.collectionUploads = await this.getUploads({
        collectionId: this.collectionId,
        pageSize: COLLECTION_ITEMS_PAGE_SIZE,
      });
      this.selectAllItems(this.collectionUploads.items);
      if (this.collectionUploads.total > this.collectionUploads.pageSize) {
        // TODO show warning in UI
        console.warn(
          `more than ${COLLECTION_ITEMS_PAGE_SIZE} crawls in collection`
        );
      }
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

  private async getWorkflows(params: APIPaginationQuery = {}) {
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
    } & APIPaginationQuery = {}
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
}
