import { localized, msg } from "@lit/localize";
import type { SlInput, SlMenuItem } from "@shoelace-style/shoelace";
import Fuse from "fuse.js";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import queryString from "query-string";

import type { SelectNewDialogEvent } from ".";

import { BtrixElement } from "@/classes/BtrixElement";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import type { CollectionSavedEvent } from "@/features/collections/collection-metadata-dialog";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import { emptyMessage } from "@/layouts/emptyMessage";
import { pageHeader } from "@/layouts/pageHeader";
import { RouteNamespace } from "@/routes";
import { monthYearDateRange } from "@/strings/utils";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import {
  CollectionAccess,
  type Collection,
  type CollectionSearchValues,
} from "@/types/collection";
import { SortDirection, type UnderlyingFunction } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

type Collections = APIPaginatedList<Collection>;
type SearchFields = "name";
type SearchResult = {
  item: {
    key: SearchFields;
    value: string;
  };
};
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
    label: msg("Collection Period"),
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
    label: msg("Size"),
    defaultDirection: SortDirection.Descending,
  },
  modified: {
    label: msg("Last Modified"),
    defaultDirection: SortDirection.Descending,
  },
};
const MIN_SEARCH_LENGTH = 2;

@customElement("btrix-collections-list")
@localized()
export class CollectionsList extends BtrixElement {
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
  private filterBy: Partial<Record<keyof Collection, unknown>> = {};

  @state()
  private searchByValue = "";

  @state()
  private searchResultsOpen = false;

  @state()
  private openDialogName?: "create" | "delete" | "editMetadata";

  @state()
  private isDialogVisible = false;

  @state()
  private selectedCollection?: Collection;

  @state()
  private fetchErrorStatusCode?: number;

  @query("sl-input")
  private readonly input?: SlInput | null;

  // For fuzzy search:
  private readonly fuse = new Fuse<{ key: "name"; value: string }>([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

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

  protected firstUpdated() {
    void this.fetchSearchValues();
  }

  render() {
    return html`
      <div class="contents">
        ${pageHeader({
          title: msg("Collections"),
          actions: this.isCrawler
            ? html` <sl-button
                variant="primary"
                size="small"
                ?disabled=${!this.org || this.org.readOnly}
                @click=${() => (this.openDialogName = "create")}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Collection")}
              </sl-button>`
            : nothing,
          classNames: tw`border-b-transparent`,
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
              <div class="overflow-auto px-2 pb-1">
                ${guard([this.collections], this.renderList)}
              </div>
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
      <btrix-collection-metadata-dialog
        .collection=${
          this.openDialogName === "create" ? undefined : this.selectedCollection
        }
        ?open=${
          this.openDialogName === "create" ||
          this.openDialogName === "editMetadata"
        }
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
      </btrix-collection-metadata-dialog>
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
          </div>
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
          placeholder=${msg("Search by Name")}
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

    const searchResults = this.fuse.search(this.searchByValue).slice(0, 10);
    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching collections found.")}</sl-menu-item
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
            ${item.value}
          </sl-menu-item>
        `,
      )}
    `;
  }

  private readonly renderList = () => {
    if (this.collections?.items.length) {
      return html`
        <btrix-table
          class="[--btrix-column-gap:var(--sl-spacing-small)]"
          style="grid-template-columns: min-content [clickable-start] 45em repeat(4, 1fr) [clickable-end] min-content"
        >
          <btrix-table-head class="mb-2 whitespace-nowrap">
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

        ${when(
          this.collections.total > this.collections.pageSize ||
            this.collections.page > 1,
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
        )}
      `;
    }

    const message = msg("Your org doesn’t have any collections yet.");

    return html`
      ${when(
        this.isCrawler,
        () =>
          emptyMessage({
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
            message,
          }),
      )}
    `;
  };

  private readonly renderItem = (col: Collection) => html`
    <btrix-table-row
      class="cursor-pointer select-none whitespace-nowrap rounded border shadow transition-all focus-within:bg-neutral-50 hover:bg-neutral-50 hover:shadow-none"
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
                  class="inline-block align-middle text-neutral-600"
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
                  class="inline-block align-middle text-neutral-600"
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
                  class="inline-block align-middle text-success-600"
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
          <div class="text-xs leading-4 text-neutral-500">
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
      <btrix-table-cell>
        ${this.localize.bytes(col.totalSize || 0, {
          unitDisplay: "narrow",
        })}
      </btrix-table-cell>
      <btrix-table-cell>
        <btrix-format-date
          date=${col.modified}
          month="2-digit"
          day="2-digit"
          year="2-digit"
        ></btrix-format-date>
      </btrix-table-cell>
      <btrix-table-cell class="p-0">
        ${this.isCrawler ? this.renderActions(col) : ""}
      </btrix-table-cell>
    </btrix-table-row>
  `;

  private readonly renderActions = (col: Collection) => {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    return html`
      <btrix-overflow-dropdown>
        <sl-menu>
          <sl-menu-item
            @click=${() => void this.manageCollection(col, "editMetadata")}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          ${col.access === CollectionAccess.Private
            ? html`
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--success)"
                  @click=${() =>
                    void this.updateAccess(col, CollectionAccess.Unlisted)}
                >
                  <sl-icon
                    name=${SelectCollectionAccess.Options.unlisted.icon}
                    slot="prefix"
                  ></sl-icon>
                  ${msg("Enable Share Link")}
                </sl-menu-item>
              `
            : html`
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--success)"
                  @click=${() => {
                    ClipboardController.copyToClipboard(this.getShareLink(col));
                    this.notify.toast({
                      message: msg("Link copied"),
                    });
                  }}
                >
                  <sl-icon name="copy" slot="prefix"></sl-icon>
                  ${msg("Copy Share Link")}
                </sl-menu-item>
                ${col.access === CollectionAccess.Public
                  ? html`
                      <sl-menu-item
                        @click=${() =>
                          void this.updateAccess(
                            col,
                            CollectionAccess.Unlisted,
                          )}
                      >
                        <sl-icon
                          name=${SelectCollectionAccess.Options.unlisted.icon}
                          slot="prefix"
                        ></sl-icon>
                        ${msg("Make Unlisted")}
                      </sl-menu-item>
                    `
                  : this.org?.enablePublicProfile
                    ? html`
                        <sl-menu-item
                          @click=${() =>
                            void this.updateAccess(
                              col,
                              CollectionAccess.Public,
                            )}
                        >
                          <sl-icon
                            name=${SelectCollectionAccess.Options.public.icon}
                            slot="prefix"
                          ></sl-icon>
                          ${msg("Make Public")}
                        </sl-menu-item>
                      `
                    : nothing}
                <sl-menu-item
                  @click=${() =>
                    void this.updateAccess(col, CollectionAccess.Private)}
                >
                  <sl-icon
                    name=${SelectCollectionAccess.Options.private.icon}
                    slot="prefix"
                  ></sl-icon>
                  ${msg("Make Private")}
                </sl-menu-item>
              `}

          <btrix-menu-item-link
            href=${`/api/orgs/${this.orgId}/collections/${col.id}/download?auth_bearer=${authToken}`}
            download
            ?disabled=${!col.totalSize}
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download")}
            <btrix-badge
              slot="suffix"
              class="font-monostyle text-xs text-neutral-500"
              >${this.localize.bytes(col.totalSize)}</btrix-badge
            >
          </btrix-menu-item-link>
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

  private async fetchSearchValues() {
    try {
      const searchValues: CollectionSearchValues = await this.api.fetch(
        `/orgs/${this.orgId}/collections/search-values`,
      );
      const names = searchValues.names;

      // Update search/filter collection
      const toSearchItem =
        (key: SearchFields) =>
        (value: string): SearchResult["item"] => ({
          key,
          value,
        });
      this.fuse.setCollection([...names.map(toSearchItem("name"))]);
    } catch (e) {
      console.debug(e);
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
        page: queryParams?.page || this.collections?.page || 1,
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
