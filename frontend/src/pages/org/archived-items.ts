import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlCheckbox, SlSelect } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { ArchivedItem, Crawl, Workflow } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { pageHeader } from "@/layouts/pageHeader";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { CrawlState } from "@/types/crawlState";
import { isApiError } from "@/utils/api";
import {
  finishedCrawlStates,
  isActive,
  isSuccessfullyFinished,
} from "@/utils/crawler";
import { isArchivingDisabled } from "@/utils/orgs";
import { tw } from "@/utils/tailwind";

type ArchivedItems = APIPaginatedList<ArchivedItem>;
type SearchFields = "name" | "firstSeed";
type SortField =
  | "finished"
  | "fileSize"
  | "reviewStatus"
  | "qaRunCount"
  | "lastQAState"
  | "lastQAStarted";
type SortDirection = "asc" | "desc";

const POLL_INTERVAL_SECONDS = 5;
const INITIAL_PAGE_SIZE = 20;
const FILTER_BY_CURRENT_USER_STORAGE_KEY = "btrix.filterByCurrentUser.crawls";
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  finished: {
    label: msg("Date Created"),
    defaultDirection: "desc",
  },
  fileSize: {
    label: msg("Size"),
    defaultDirection: "desc",
  },
  reviewStatus: {
    label: msg("QA Rating"),
    defaultDirection: "desc",
  },
  lastQAState: {
    label: msg("Latest Analysis Status"),
    defaultDirection: "desc",
  },
  lastQAStarted: {
    label: msg("Last Analysis Run"),
    defaultDirection: "desc",
  },
  qaRunCount: {
    label: msg("# of Analysis Runs"),
    defaultDirection: "desc",
  },
};

/**
 * Usage:
 * ```ts
 * <btrix-archived-items></btrix-archived-items>
 * ```
 */
@customElement("btrix-archived-items")
@localized()
export class CrawlsList extends BtrixElement {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: String })
  itemType: ArchivedItem["type"] | null = null;

  @state()
  private pagination: Required<APIPaginationQuery> = {
    page: 1,
    pageSize: INITIAL_PAGE_SIZE,
  };

  @state()
  private searchOptions: Record<string, string>[] = [];

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
  private filterBy: Partial<Record<keyof ArchivedItem, string | CrawlState[]>> =
    {};

  @state()
  private itemToEdit: ArchivedItem | null = null;

  @state()
  private isEditingItem = false;

  @state()
  private itemToDelete: ArchivedItem | null = null;

  @state()
  private isDeletingItem = false;

  @state()
  private isUploadingArchive = false;

  @query("#stateSelect")
  stateSelect?: SlSelect;

  private readonly archivedItemsTask = new Task(this, {
    task: async (
      [itemType, pagination, orderBy, filterBy, filterByCurrentUser],
      { signal },
    ) => {
      try {
        const data = await this.getArchivedItems(
          {
            itemType,
            pagination,
            orderBy,
            filterBy,
            filterByCurrentUser,
          },
          signal,
        );

        this.getArchivedItemsTimeout = window.setTimeout(() => {
          void this.archivedItemsTask.run();
        }, POLL_INTERVAL_SECONDS * 1000);

        return data;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          console.debug("Fetch archived items aborted to throttle");
        } else {
          this.notify.toast({
            message: msg(
              "Sorry, couldn't retrieve archived items at this time.",
            ),
            variant: "danger",
            icon: "exclamation-octagon",
            id: "archived-item-fetch-error",
          });
        }
        throw e;
      }
    },
    args: () =>
      // TODO consolidate filters into single fetch params
      [
        this.itemType,
        this.pagination,
        this.orderBy,
        this.filterBy,
        this.filterByCurrentUser,
      ] as const,
  });

  private getArchivedItemsTimeout?: number;

  // For fuzzy search:
  private readonly searchKeys = ["name", "firstSeed"];

  private get selectedSearchFilterKey() {
    return Object.keys(CrawlsList.FieldLabels).find((key) =>
      Boolean((this.filterBy as Record<string, unknown>)[key]),
    );
  }

  constructor() {
    super();
    this.filterByCurrentUser =
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
      "true";
  }

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (
      changedProperties.has("filterByCurrentUser") ||
      changedProperties.has("filterBy") ||
      changedProperties.has("orderBy") ||
      changedProperties.has("itemType")
    ) {
      if (changedProperties.has("itemType")) {
        this.filterBy = {};
        this.orderBy = {
          field: "finished",
          direction: sortableFields["finished"].defaultDirection!,
        };
      }
      this.pagination = {
        page: 1,
        pageSize: INITIAL_PAGE_SIZE,
      };

      if (changedProperties.has("filterByCurrentUser")) {
        window.sessionStorage.setItem(
          FILTER_BY_CURRENT_USER_STORAGE_KEY,
          this.filterByCurrentUser.toString(),
        );
      }
    }

    if (changedProperties.has("itemType")) {
      void this.fetchConfigSearchValues();
    }
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.getArchivedItemsTimeout);
    super.disconnectedCallback();
  }

  render() {
    const listTypes: {
      itemType: ArchivedItem["type"] | null;
      label: string;
      icon?: string;
    }[] = [
      {
        itemType: null,
        label: msg("All"),
      },
      {
        itemType: "crawl",
        icon: "gear-wide-connected",
        label: msg("Crawls"),
      },
      {
        itemType: "upload",
        icon: "upload",
        label: msg("Uploads"),
      },
    ];

    return html`
      <main>
        <div class="contents">
          ${pageHeader({
            title: msg("Archived Items"),
            actions: this.isCrawler
              ? html`
                  <sl-tooltip
                    content=${msg("Org Storage Full")}
                    ?disabled=${!this.org?.storageQuotaReached}
                  >
                    <sl-button
                      size="small"
                      variant="primary"
                      @click=${() => (this.isUploadingArchive = true)}
                      ?disabled=${isArchivingDisabled(this.org)}
                    >
                      <sl-icon slot="prefix" name="upload"></sl-icon>
                      ${msg("Upload WACZ")}
                    </sl-button>
                  </sl-tooltip>
                `
              : nothing,
            classNames: tw`mb-3`,
          })}
          <div class="mb-3 flex gap-2">
            ${listTypes.map(({ label, itemType, icon }) => {
              const isSelected = itemType === this.itemType;
              return html` <btrix-navigation-button
                .active=${isSelected}
                aria-selected="${isSelected}"
                href=${`${this.navigate.orgBasePath}/items${
                  itemType ? `/${itemType}` : ""
                }`}
                @click=${this.navigate.link}
                size="small"
              >
                ${icon ? html`<sl-icon name=${icon}></sl-icon>` : ""}
                <span>${label}</span>
              </btrix-navigation-button>`;
            })}
          </div>
          <div
            class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4"
          >
            ${this.renderControls()}
          </div>
        </div>

        ${this.archivedItemsTask.render({
          initial: () => html`
            <div class="my-12 flex w-full items-center justify-center text-2xl">
              <sl-spinner></sl-spinner>
            </div>
          `,
          pending: () =>
            // TODO differentiate between pending between poll and
            // pending from user action, in order to show loading indicator
            this.archivedItemsTask.value
              ? // Render previous value while latest is loading
                this.renderArchivedItems(this.archivedItemsTask.value)
              : nothing,
          complete: this.renderArchivedItems,
        })}
      </main>
      ${when(
        this.isCrawler && this.orgId,
        () => html`
          <btrix-file-uploader
            ?open=${this.isUploadingArchive}
            @request-close=${() => (this.isUploadingArchive = false)}
            @uploaded=${() => {
              if (this.itemType !== "crawl") {
                this.pagination = {
                  ...this.pagination,
                  page: 1,
                };
              }
            }}
          ></btrix-file-uploader>
        `,
      )}
    `;
  }

  private readonly renderArchivedItems = ({
    items,
    page,
    total,
    pageSize,
  }: APIPaginatedList<ArchivedItem>) => html`
    <section class="mx-2">
      ${items.length
        ? html`
            <btrix-archived-item-list .listType=${this.itemType}>
              <btrix-table-header-cell slot="actionCell" class="p-0">
                <span class="sr-only">${msg("Row actions")}</span>
              </btrix-table-header-cell>
              ${repeat(items, ({ id }) => id, this.renderArchivedItem)}
            </btrix-archived-item-list>
          `
        : this.renderEmptyState()}
    </section>
    ${when(
      total > pageSize,
      () => html`
        <footer class="mt-6 flex justify-center">
          <btrix-pagination
            page=${page}
            totalCount=${total}
            size=${pageSize}
            @page-change=${async (e: PageChangeEvent) => {
              this.pagination = {
                ...this.pagination,
                page: e.detail.page,
              };
              await this.updateComplete;

              // Scroll to top of list
              // TODO once deep-linking is implemented, scroll to top of pushstate
              this.scrollIntoView({ behavior: "smooth" });
            }}
          ></btrix-pagination>
        </footer>
      `,
    )}
    ${this.itemToEdit
      ? html`
          <btrix-item-metadata-editor
            .crawl=${this.itemToEdit}
            ?open=${this.isEditingItem}
            @request-close=${() => (this.isEditingItem = false)}
            @updated=${() => {
              /* TODO fetch current page or single crawl */
              void this.archivedItemsTask.run();
            }}
          ></btrix-item-metadata-editor>
        `
      : nothing}

    <btrix-dialog
      .label=${msg("Delete Archived Item?")}
      .open=${this.isDeletingItem}
      @sl-after-hide=${() => (this.isDeletingItem = false)}
    >
      ${msg("This item will be removed from any Collection it is a part of.")}
      ${when(this.itemToDelete?.type === "crawl", () =>
        msg(
          "All files and logs associated with this item will also be deleted, and the crawl will no longer be visible in its associated Workflow.",
        ),
      )}
      <div slot="footer" class="flex justify-between">
        <sl-button size="small" .autofocus=${true}>${msg("Cancel")}</sl-button>
        <sl-button
          size="small"
          variant="danger"
          @click=${async () => {
            this.isDeletingItem = false;
            if (this.itemToDelete) {
              await this.deleteItem(this.itemToDelete);
            }
          }}
          >${msg(
            str`Delete ${
              this.itemToDelete?.type === "upload"
                ? msg("Upload")
                : msg("Crawl")
            }`,
          )}</sl-button
        >
      </div>
    </btrix-dialog>
  `;

  private renderControls() {
    const viewPlaceholder = msg("Any");
    const viewOptions = finishedCrawlStates;

    return html`
      <div
        class="grid grid-cols-1 items-center gap-x-2 gap-y-2 md:grid-cols-2 lg:grid-cols-[minmax(0,100%)_fit-content(100%)_fit-content(100%)]"
      >
        <div class="col-span-1 md:col-span-2 lg:col-span-1">
          ${this.renderSearch()}
        </div>
        <div class="flex items-center">
          <div class="mx-2 text-neutral-500">${msg("Status:")}</div>
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

      ${this.userInfo?.id
        ? html` <div class="mt-2 flex h-6 justify-end">
            <label>
              <span class="mr-1 text-xs text-neutral-500"
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
    const options = Object.entries(sortableFields).map(
      ([value, { label }]) => html`
        <sl-option value=${value}>${label}</sl-option>
      `,
    );
    return html`
      <sl-select
        class="flex-1 md:w-[24ch]"
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
      <btrix-search-combobox
        .searchKeys=${this.searchKeys}
        .searchOptions=${this.searchOptions}
        .keyLabels=${CrawlsList.FieldLabels}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        placeholder=${this.itemType === "upload"
          ? msg("Search all uploads by name")
          : this.itemType === "crawl"
            ? msg("Search all crawls by name or Crawl Start URL")
            : msg("Search all items by name or Crawl Start URL")}
        @btrix-select=${(e: CustomEvent) => {
          const { key, value } = e.detail;
          this.filterBy = {
            ...this.filterBy,
            [key]: value,
          };
        }}
        @btrix-clear=${() => {
          const {
            name: _name,
            firstSeed: _firstSeed,
            ...otherFilters
          } = this.filterBy;
          this.filterBy = otherFilters;
        }}
      >
      </btrix-search-combobox>
    `;
  }

  private readonly renderArchivedItem = (item: ArchivedItem) => html`
    <btrix-archived-item-list-item
      href=${`${this.navigate.orgBasePath}/${item.type === "crawl" ? `workflows/${item.cid}/crawls` : `items/${item.type}`}/${item.id}`}
      .item=${item}
      ?showStatus=${this.itemType !== null}
    >
      <btrix-table-cell slot="actionCell" class="p-0">
        <btrix-overflow-dropdown>
          <sl-menu>${this.renderMenuItems(item)}</sl-menu>
        </btrix-overflow-dropdown>
      </btrix-table-cell>
    </btrix-archived-item-list-item>
  `;

  private readonly renderMenuItems = (item: ArchivedItem) => {
    // HACK shoelace doesn't current have a way to override non-hover
    // color without resetting the --sl-color-neutral-700 variable
    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    return html`
      ${when(
        this.isCrawler,
        () => html`
          <sl-menu-item
            @click=${async () => {
              this.itemToEdit = item;
              await this.updateComplete;
              this.isEditingItem = true;
            }}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-divider></sl-divider>
        `,
      )}
      ${item.type === "crawl"
        ? html`
            <sl-menu-item
              @click=${() =>
                this.navigate.to(
                  `${this.navigate.orgBasePath}/workflows/${item.cid}`,
                )}
            >
              <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
              ${msg("Go to Workflow")}
            </sl-menu-item>
            <sl-menu-item
              @click=${() => ClipboardController.copyToClipboard(item.cid)}
            >
              <sl-icon name="copy" slot="prefix"></sl-icon>
              ${msg("Copy Workflow ID")}
            </sl-menu-item>
          `
        : nothing}
      <sl-menu-item
        @click=${() => ClipboardController.copyToClipboard(item.id)}
      >
        <sl-icon name="copy" slot="prefix"></sl-icon>
        ${msg("Copy Item ID")}
      </sl-menu-item>
      <sl-menu-item
        @click=${() =>
          ClipboardController.copyToClipboard(item.tags.join(", "))}
        ?disabled=${!item.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      ${when(
        isSuccessfullyFinished(item),
        () => html`
          <sl-divider></sl-divider>
          <btrix-menu-item-link
            href=${`/api/orgs/${this.orgId}/all-crawls/${item.id}/download?auth_bearer=${authToken}`}
            download
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Item")}
            ${item.fileSize
              ? html` <btrix-badge
                  slot="suffix"
                  class="font-monostyle text-xs text-neutral-500"
                  >${this.localize.bytes(item.fileSize)}</btrix-badge
                >`
              : nothing}
          </btrix-menu-item-link>
        `,
      )}
      ${when(
        this.isCrawler && (item.type !== "crawl" || !isActive(item)),
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.confirmDeleteItem(item)}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Item")}
          </sl-menu-item>
        `,
      )}
    `;
  };

  private readonly renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private renderEmptyState() {
    if (Object.keys(this.filterBy).length) {
      return html`
        <div class="rounded-lg border bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching items found.")}</span
            >
            <button
              class="font-medium text-neutral-500 underline hover:no-underline"
              @click=${() => {
                this.filterBy = {};
                if (this.stateSelect) {
                  // TODO pass in value to sl-select after upgrading
                  // shoelace to >=2.0.0-beta.88. Passing an array value
                  // using beta.85 is currently buggy.
                  this.stateSelect.value = [];
                }
              }}
            >
              ${msg("Clear search and filters")}
            </button>
          </p>
        </div>
      `;
    }

    if (this.pagination.page && this.pagination.page > 1) {
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
          ${msg("No archived items yet.")}
        </p>
      </div>
    `;
  }

  private async getArchivedItems(
    params: {
      itemType: CrawlsList["itemType"];
      pagination: CrawlsList["pagination"];
      orderBy: CrawlsList["orderBy"];
      filterBy: CrawlsList["filterBy"];
      filterByCurrentUser: CrawlsList["filterByCurrentUser"];
    },
    signal: AbortSignal,
  ) {
    const query = queryString.stringify(
      {
        ...params.filterBy,
        state: params.filterBy.state?.length
          ? params.filterBy.state
          : finishedCrawlStates,
        page: params.pagination.page,
        pageSize: params.pagination.pageSize,
        userid: params.filterByCurrentUser ? this.userInfo!.id : undefined,
        sortBy: params.orderBy.field,
        sortDirection: params.orderBy.direction === "desc" ? -1 : 1,
        crawlType: params.itemType,
      },
      {
        arrayFormat: "comma",
      },
    );

    return this.api.fetch<ArchivedItems>(
      `/orgs/${this.orgId}/all-crawls?${query}`,
      { signal },
    );
  }

  private async fetchConfigSearchValues() {
    try {
      const query = queryString.stringify({
        crawlType: this.itemType,
      });
      const data: {
        crawlIds: string[];
        names: string[];
        descriptions: string[];
        firstSeeds: string[];
      } = await this.api.fetch(
        `/orgs/${this.orgId}/all-crawls/search-values?${query}`,
      );

      // Update search/filter collection
      const toSearchItem = (key: SearchFields) => (value: string) => ({
        [key]: value,
      });
      this.searchOptions = [
        ...data.names.map(toSearchItem("name")),
        ...data.firstSeeds.map(toSearchItem("firstSeed")),
      ];
    } catch (e) {
      console.debug(e);
    }
  }

  private readonly confirmDeleteItem = (item: ArchivedItem) => {
    this.itemToDelete = item;
    this.isDeletingItem = true;
  };

  private async deleteItem(item: ArchivedItem) {
    let apiPath;

    switch (this.itemType) {
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
      const _data = await this.api.fetch(
        `/orgs/${item.oid}/${apiPath}/delete`,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [item.id],
          }),
        },
      );
      // TODO eager list update before server response
      void this.archivedItemsTask.run();
      // const { items, ...crawlsData } = this.archivedItems!;
      this.itemToDelete = null;
      // this.archivedItems = {
      //   ...crawlsData,
      //   items: items.filter((c) => c.id !== item.id),
      // };
      this.notify.toast({
        message: msg(str`Successfully deleted archived item.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      if (this.itemToDelete) {
        this.confirmDeleteItem(this.itemToDelete);
      }
      let message = msg(
        str`Sorry, couldn't delete archived item at this time.`,
      );
      if (isApiError(e)) {
        if (e.details == "not_allowed") {
          message = msg(
            str`Only org owners can delete other users' archived items.`,
          );
        } else if (e.message) {
          message = e.message;
        }
      }
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getWorkflow(crawl: Crawl): Promise<Workflow> {
    const data: Workflow = await this.api.fetch(
      `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}`,
    );

    return data;
  }
}
