import { localized, msg } from "@lit/localize";
import type {
  SlChangeEvent,
  SlInput,
  SlMenuItem,
  SlRadioGroup,
} from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import queryString from "query-string";

import type { SelectNewDialogEvent } from ".";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { WithSearchOrgContext } from "@/context/search-org/WithSearchOrgContext";
import { ClipboardController } from "@/controllers/clipboard";
import type { CollectionSavedEvent } from "@/features/collections/collection-create-dialog";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import { emptyMessage } from "@/layouts/emptyMessage";
import { pageHeader } from "@/layouts/pageHeader";
import { RouteNamespace } from "@/routes";
import { metadata } from "@/strings/collections/metadata";
import { monthYearDateRange } from "@/strings/utils";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import { CollectionAccess, type Collection } from "@/types/collection";
import { SortDirection, type UnderlyingFunction } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

type Collections = APIPaginatedList<Collection>;
type SearchFields = "name";
type SortField =
  | "modified"
  | "dateLatest"
  | "name"
  | "totalSize"
  | "pageCount"
  | "crawlCount";
const INITIAL_PAGE_SIZE = 20;
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  name: {
    label: msg("Name"),
    defaultDirection: SortDirection.Ascending,
  },
  dateLatest: {
    label: metadata.dateLatest,
    defaultDirection: SortDirection.Descending,
  },
  crawlCount: {
    label: msg("Archived Items"),
    defaultDirection: SortDirection.Descending,
  },
  pageCount: {
    label: msg("Total Pages"),
    defaultDirection: SortDirection.Descending,
  },
  totalSize: {
    label: msg("Total Size"),
    defaultDirection: SortDirection.Descending,
  },
  modified: {
    label: msg("Last Modified"),
    defaultDirection: SortDirection.Descending,
  },
};
const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 5;

enum ListView {
  List = "list",
  Grid = "grid",
}

@customElement("btrix-collections-list")
@localized()
export class CollectionsList extends WithSearchOrgContext(BtrixElement) {
  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private collections?: Collections;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "modified",
    direction: sortableFields["modified"].defaultDirection!,
  };

  @state()
  private listView = ListView.List;

  @state()
  private filterBy: Partial<Record<keyof Collection, unknown>> = {};

  @state()
  private searchByValue = "";

  @state()
  private searchResultsOpen = false;

  @state()
  private openDialogName?: "create" | "delete" | "edit";

  @state()
  private isDialogVisible = false;

  @state()
  private selectedCollection?: Collection;

  /** ID of the collection currently being refreshed */
  @state()
  private collectionRefreshing: string | null = null;

  @state()
  private fetchErrorStatusCode?: number;

  @query("sl-input")
  private readonly input?: SlInput | null;

  private getShareLink(collection: Collection) {
    return `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}/${collection.access === CollectionAccess.Private ? `${RouteNamespace.PrivateOrgs}/${this.orgSlugState}/collections/view` : `${RouteNamespace.PublicOrgs}/${this.orgSlugState}/collections`}/${collection.slug}`;
  }

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  protected async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("filterBy") || changedProperties.has("orderBy")) {
      void this.fetchCollections();
    }
  }

  render() {
    return html`
      <div class="contents">
        ${pageHeader({
          title: msg("Collections"),
          border: false,
          actions: this.isCrawler
            ? html` <sl-button
                variant="primary"
                size="small"
                ?disabled=${!this.org || this.org.readOnly}
                @click=${() => {
                  this.openDialogName = "create";
                }}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Collection")}
              </sl-button>`
            : nothing,
        })}
      </div>

      ${when(this.fetchErrorStatusCode, this.renderFetchError, () =>
        this.collections
          ? html`
              <div
                class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4"
              >
                ${this.renderControls()}
              </div>
              <btrix-overflow-scroll class="-mx-3 pb-1 part-[content]:px-3">
                ${guard(
                  [this.collections, this.listView, this.collectionRefreshing],
                  this.listView === ListView.List
                    ? this.renderList
                    : this.renderGrid,
                )}
              </btrix-overflow-scroll>
              ${when(this.listView === ListView.List, () =>
                when(
                  (this.collections &&
                    this.collections.total > this.collections.pageSize) ||
                    (this.collections && this.collections.page > 1),
                  () => html`
                    <footer class="mt-6 flex justify-center">
                      <btrix-pagination
                        page=${this.collections!.page}
                        totalCount=${this.collections!.total}
                        size=${this.collections!.pageSize}
                        @page-change=${async (e: PageChangeEvent) => {
                          await this.fetchCollections({
                            page: e.detail.page,
                          });

                          // Scroll to top of list
                          // TODO once deep-linking is implemented, scroll to top of pushstate
                          this.scrollIntoView({ behavior: "smooth" });
                        }}
                      ></btrix-pagination>
                    </footer>
                  `,
                ),
              )}
            `
          : this.renderLoading(),
      )}

      <btrix-dialog
        .label=${msg("Delete Collection?")}
        ?open=${this.openDialogName === "delete"}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => {
          this.isDialogVisible = false;
          this.selectedCollection = undefined;
        }}
      >
        ${when(
          this.isDialogVisible,
          () => html`
            ${msg(
              html`Are you sure you want to delete
                <strong>${this.selectedCollection?.name}</strong>?`,
            )}
            <div slot="footer" class="flex justify-between">
              <sl-button
                size="small"
                @click=${() => (this.openDialogName = undefined)}
                >${msg("Cancel")}</sl-button
              >
              <sl-button
                size="small"
                variant="danger"
                @click=${async () => {
                  await this.deleteCollection(this.selectedCollection!);
                  this.openDialogName = undefined;
                }}
                >${msg("Delete Collection")}</sl-button
              >
            </div>
          `,
        )}
        </div>
      </btrix-dialog>
      <btrix-collection-create-dialog
        ?open=${this.openDialogName === "create"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => (this.selectedCollection = undefined)}
        @btrix-collection-saved=${(e: CollectionSavedEvent) => {
          if (this.openDialogName === "create") {
            this.navigate.to(
              `${this.navigate.orgBasePath}/collections/view/${e.detail.id}/items`,
            );
          } else {
            void this.fetchCollections();
          }
        }}
      >
      </btrix-collection-create-dialog>
      <btrix-collection-edit-dialog
            .collection=${this.selectedCollection}
            ?open=${this.openDialogName === "edit"}
            @sl-hide=${() => {
              this.openDialogName = undefined;
            }}
            @sl-after-hide=${() => {
              this.selectedCollection = undefined;
            }}
            @btrix-collection-saved=${() => {
              void this.fetchCollections();
            }}
          ></btrix-collection-edit-dialog>
    `;
  }

  private readonly renderLoading = () =>
    html`<div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>`;

  private renderControls() {
    return html`
      <div
        class="grid grid-cols-1 items-center gap-x-2 gap-y-2 lg:grid-cols-[minmax(0,100%)_fit-content(100%)]"
      >
        <div class="col-span-1">${this.renderSearch()}</div>
        <div class="col-span-1 flex items-center">
          <div class="mx-2 whitespace-nowrap text-neutral-500">
            ${msg("Sort by:")}
          </div>
          <div class="flex grow">
            <sl-select
              class="flex-1 md:min-w-[9.2rem]"
              size="small"
              pill
              value=${this.orderBy.field}
              @sl-change=${(e: Event) => {
                const field = (e.target as HTMLSelectElement)
                  .value as SortField;
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
                  <sl-option value=${value}>${label}</sl-option>
                `,
              )}
            </sl-select>
            <sl-tooltip content=${msg("Reverse sort")}>
              <sl-icon-button
                name="arrow-down-up"
                label=${msg("Reverse sort")}
                @click=${() => {
                  this.orderBy = {
                    ...this.orderBy,
                    direction: -1 * this.orderBy.direction,
                  };
                }}
              ></sl-icon-button>
            </sl-tooltip>
          </div>
          <label for="viewStyle" class="mx-2 whitespace-nowrap text-neutral-500"
            >${msg("View:")}</label
          >
          <sl-radio-group
            id="viewStyle"
            value=${this.listView}
            size="small"
            @sl-change=${(e: SlChangeEvent) => {
              this.listView = (e.target as SlRadioGroup).value as ListView;
            }}
          >
            <sl-tooltip content=${msg("View as List")}>
              <sl-radio-button pill value=${ListView.List}>
                <sl-icon
                  name="view-list"
                  label=${msg("List")}
                ></sl-icon> </sl-radio-button
            ></sl-tooltip>
            <sl-tooltip content=${msg("View as Grid")}>
              <sl-radio-button pill value=${ListView.Grid}>
                <sl-icon
                  name="grid"
                  label=${msg("Grid")}
                ></sl-icon> </sl-radio-button
            ></sl-tooltip>
          </sl-radio-group>
        </div>
      </div>
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
          placeholder=${msg("Search by name")}
          clearable
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            const { name: _, ...otherFilters } = this.filterBy;
            this.filterBy = otherFilters;
          }}
          @sl-input=${this.onSearchInput as UnderlyingFunction<
            typeof this.onSearchInput
          >}
        >
          <sl-icon
            name="search"
            slot="prefix"
            aria-hidden="true"
            library="default"
          ></sl-icon>
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("Start typing to view collection filters.")}</sl-menu-item
        >
      `;
    }

    const searchResults =
      this.searchOrg.collections?.search(this.searchByValue, {
        limit: MAX_SEARCH_RESULTS,
      }) || [];
    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching collections found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${searchResults.map(
        ({ item }) => html`
          <sl-menu-item slot="menu-item" data-key="name" value=${item.name}>
            ${item.name}
          </sl-menu-item>
        `,
      )}
    `;
  }

  private readonly renderGrid = () => {
    return html`<btrix-collections-grid
      slug=${this.orgSlugState || ""}
      .collections=${this.collections?.items}
      .collectionRefreshing=${this.collectionRefreshing}
      .renderActions=${(col: Collection) =>
        this.renderActions(col, { renderOnGridItem: true })}
      showVisibility
      class="mt-8 block"
      @btrix-collection-saved=${async ({ detail }: CollectionSavedEvent) => {
        this.collectionRefreshing = detail.id;
        await this.fetchCollections();
        this.collectionRefreshing = null;
      }}
    >
      ${this.collections &&
      this.collections.total > this.collections.items.length
        ? html`
            <btrix-pagination
              page=${this.collections.page}
              totalCount=${this.collections.total}
              size=${this.collections.pageSize}
              @page-change=${async (e: PageChangeEvent) => {
                await this.fetchCollections({
                  page: e.detail.page,
                });

                // Scroll to top of list
                // TODO once deep-linking is implemented, scroll to top of pushstate
                this.scrollIntoView({ behavior: "smooth" });
              }}
              slot="pagination"
            >
            </btrix-pagination>
          `
        : nothing}
    </btrix-collections-grid>`;
  };

  private readonly renderList = () => {
    if (this.collections?.items.length) {
      return html`
        <btrix-table
          class="[--btrix-table-column-gap:var(--sl-spacing-small)]"
          style="--btrix-table-grid-template-columns: min-content [clickable-start] minmax(min-content, 60ch) repeat(4, 1fr) [clickable-end] min-content"
        >
          <btrix-table-head class="mb-2 mt-1 whitespace-nowrap">
            <btrix-table-header-cell>
              <span class="sr-only">${msg("Collection Access")}</span>
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg(html`Name & Collection Period`)}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Archived Items")}
            </btrix-table-header-cell>
            <btrix-table-header-cell
              >${msg("Total Pages")}</btrix-table-header-cell
            >
            <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Last Modified")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              <span class="sr-only">${msg("Row Actions")}</span>
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body class="[--btrix-row-gap:var(--sl-spacing-x-small)]">
            ${this.collections.items.map(this.renderItem)}
          </btrix-table-body>
        </btrix-table>
      `;
    }

    const message = msg("Your org doesn’t have any collections yet.");

    return html`
      ${when(
        this.isCrawler,
        () =>
          emptyMessage({
            classNames: tw`border-y`,
            message,
            detail: msg(
              "Collections let you easily organize, replay, and share multiple crawls.",
            ),
            actions: html`
              <sl-button
                @click=${() => {
                  this.dispatchEvent(
                    new CustomEvent("select-new-dialog", {
                      detail: "collection",
                    }) as SelectNewDialogEvent,
                  );
                }}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("Create Collection")}
              </sl-button>
            `,
          }),
        () =>
          emptyMessage({
            classNames: tw`border-y`,
            message,
          }),
      )}
    `;
  };

  private readonly renderItem = (col: Collection) => html`
    <btrix-table-row
      class="cursor-pointer select-none whitespace-nowrap rounded border shadow transition-all duration-fast focus-within:bg-neutral-50 hover:bg-neutral-50 hover:shadow-none"
    >
      <btrix-table-cell class="p-3">
        ${choose(col.access, [
          [
            CollectionAccess.Private,
            () => html`
              <sl-tooltip
                content=${SelectCollectionAccess.Options[
                  CollectionAccess.Private
                ].label}
              >
                <sl-icon
                  class="inline-block align-middle text-base text-neutral-600"
                  name=${SelectCollectionAccess.Options[
                    CollectionAccess.Private
                  ].icon}
                ></sl-icon>
              </sl-tooltip>
            `,
          ],
          [
            CollectionAccess.Unlisted,
            () => html`
              <sl-tooltip
                content=${SelectCollectionAccess.Options[
                  CollectionAccess.Unlisted
                ].label}
              >
                <sl-icon
                  class="inline-block align-middle text-base text-neutral-600"
                  name=${SelectCollectionAccess.Options[
                    CollectionAccess.Unlisted
                  ].icon}
                ></sl-icon>
              </sl-tooltip>
            `,
          ],
          [
            CollectionAccess.Public,
            () => html`
              <sl-tooltip
                content=${SelectCollectionAccess.Options[
                  CollectionAccess.Public
                ].label}
              >
                <sl-icon
                  class="inline-block align-middle text-base text-success-600"
                  name=${SelectCollectionAccess.Options[CollectionAccess.Public]
                    .icon}
                ></sl-icon>
              </sl-tooltip>
            `,
          ],
        ])}
      </btrix-table-cell>
      <btrix-table-cell rowClickTarget="a">
        <a
          class="block truncate py-2"
          href=${`${this.navigate.orgBasePath}/collections/view/${col.id}`}
          @click=${this.navigate.link}
        >
          <div class="mb-0.5 truncate">${col.name}</div>
          <div class="font-monostyle text-xs leading-4 text-neutral-500">
            ${monthYearDateRange(col.dateEarliest, col.dateLatest)}
          </div>
        </a>
      </btrix-table-cell>
      <btrix-table-cell>
        ${this.localize.number(col.crawlCount, { notation: "compact" })}
        ${pluralOf("items", col.crawlCount)}
      </btrix-table-cell>
      <btrix-table-cell>
        ${this.localize.number(col.pageCount, { notation: "compact" })}
        ${pluralOf("pages", col.pageCount)}
      </btrix-table-cell>
      <btrix-table-cell class="gap-2">
        ${this.localize.bytes(col.totalSize || 0)}
        ${col.hasDedupeIndex
          ? html`<sl-tooltip content=${msg("Deduplicated")}>
              <btrix-badge variant="success" pill
                >${msg("Deduped")}</btrix-badge
              >
            </sl-tooltip>`
          : nothing}
      </btrix-table-cell>
      <btrix-table-cell>
        <btrix-format-date
          date=${col.modified}
          month="2-digit"
          day="2-digit"
          year="numeric"
        ></btrix-format-date>
      </btrix-table-cell>
      <btrix-table-cell class="p-0">
        ${this.isCrawler ? this.renderActions(col) : ""}
      </btrix-table-cell>
    </btrix-table-row>
  `;

  private readonly renderActions = (
    col: Collection,
    { renderOnGridItem } = { renderOnGridItem: false },
  ) => {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    return html`
      <btrix-overflow-dropdown
        ?raised=${renderOnGridItem}
        size=${renderOnGridItem ? "small" : "medium"}
      >
        <sl-menu>
          <sl-menu-item @click=${() => void this.manageCollection(col, "edit")}>
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Collection Settings")}
          </sl-menu-item>
          ${col.access === CollectionAccess.Public ||
          col.access === CollectionAccess.Unlisted
            ? html`
                <sl-menu-item
                  @click=${() => {
                    ClipboardController.copyToClipboard(this.getShareLink(col));
                    this.notify.toast({
                      message: msg("Link copied"),
                      variant: "success",
                      icon: "check2-circle",
                    });
                  }}
                >
                  <sl-icon name="copy" slot="prefix"></sl-icon>
                  ${msg("Copy Share Link")}
                </sl-menu-item>
              `
            : nothing}
          <sl-divider></sl-divider>
          <btrix-menu-item-link
            href=${`/api/orgs/${this.orgId}/collections/${col.id}/download?auth_bearer=${authToken}`}
            download
            ?disabled=${!col.totalSize}
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Collection")}
            <btrix-badge slot="suffix"
              >${this.localize.bytes(col.totalSize)}</btrix-badge
            >
          </btrix-menu-item-link>
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() => ClipboardController.copyToClipboard(col.id)}
          >
            <sl-icon name="copy" slot="prefix"></sl-icon>
            ${msg("Copy Collection ID")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => void this.manageCollection(col, "delete")}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
          </sl-menu-item>
        </sl-menu>
      </btrix-overflow-dropdown>
    `;
  };

  private readonly renderFetchError = () => html`
    <div>
      <btrix-alert variant="danger">
        ${msg(`Something unexpected went wrong while retrieving Collections.`)}
      </btrix-alert>
    </div>
  `;

  private readonly onSearchInput = debounce(150)(() => {
    this.searchByValue = this.input?.value.trim() || "";

    if (!this.searchResultsOpen && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue) {
      const { name: _, ...otherFilters } = this.filterBy;
      this.filterBy = {
        ...otherFilters,
      };
    }
  });

  private async updateAccess(coll: Collection, access: CollectionAccess) {
    await this.api.fetch(`/orgs/${this.orgId}/collections/${coll.id}`, {
      method: "PATCH",
      body: JSON.stringify({ access }),
    });

    void this.fetchCollections();
  }

  private getPublicReplayURL(col: Collection) {
    return new URL(
      `/api/orgs/${this.orgId}/collections/${col.id}/public/replay.json`,
      window.location.href,
    ).href;
  }

  private readonly manageCollection = async (
    collection: Collection,
    dialogName: CollectionsList["openDialogName"],
  ) => {
    this.selectedCollection = collection;
    await this.updateComplete;
    this.openDialogName = dialogName;
  };

  private async deleteCollection(collection: Collection): Promise<void> {
    try {
      const name = collection.name;
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${collection.id}`,
        // FIXME API method is GET right now
        {
          method: "DELETE",
        },
      );

      void this.fetchCollections();

      this.notify.toast({
        message: msg(html`Deleted <strong>${name}</strong> Collection.`),
        variant: "success",
        icon: "check2-circle",
        id: "collection-delete-status",
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "collection-delete-status",
      });
    }
  }

  private async fetchCollections(params?: APIPaginationQuery) {
    this.fetchErrorStatusCode = undefined;

    try {
      this.collections = await this.getCollections(params);
    } catch (e) {
      if (isApiError(e)) {
        this.fetchErrorStatusCode = e.statusCode;
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't retrieve Collections at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "collection-retrieve-status",
        });
      }
    }
  }

  private async getCollections(queryParams?: APIPaginationQuery) {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        page:
          queryParams?.page ||
          this.collections?.page ||
          parsePage(new URLSearchParams(location.search).get("page")),
        pageSize:
          queryParams?.pageSize ||
          this.collections?.pageSize ||
          INITIAL_PAGE_SIZE,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction,
      },
      {
        arrayFormat: "comma",
      },
    );

    const data = await this.api.fetch<APIPaginatedList<Collection>>(
      `/orgs/${this.orgId}/collections?${query}`,
    );

    return data;
  }
}
