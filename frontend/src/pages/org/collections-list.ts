import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { guard } from "lit/directives/guard.js";
import queryString from "query-string";
import Fuse from "fuse.js";
import debounce from "lodash/fp/debounce";
import type { SlMenuItem } from "@shoelace-style/shoelace";

import type { PageChangeEvent } from "../../components/pagination";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { APIPaginatedList, APIPaginationQuery } from "../../types/api";
import type {
  Collection,
  CollectionSearchValues,
} from "../../types/collection";
import noCollectionsImg from "../../assets/images/no-collections-found.webp";

type Collections = APIPaginatedList & {
  items: Collection[];
};
type SearchFields = "name";
type SearchResult = {
  item: {
    key: SearchFields;
    value: string;
  };
};
type SortField = "modified" | "name" | "totalSize";
type SortDirection = "asc" | "desc";
const INITIAL_PAGE_SIZE = 10;
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  modified: {
    label: msg("Last Updated"),
    defaultDirection: "desc",
  },
  name: {
    label: msg("Name"),
    defaultDirection: "asc",
  },
  totalSize: {
    label: msg("Size"),
    defaultDirection: "desc",
  },
};
const MIN_SEARCH_LENGTH = 2;

@localized()
export class CollectionsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

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
  private filterBy: Partial<Record<keyof Collection, any>> = {};

  @state()
  private searchByValue: string = "";

  @state()
  private searchResultsOpen = false;

  @state()
  private openDialogName?: "delete";

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private collectionToDelete?: Collection;

  @state()
  private fetchErrorStatusCode?: number;

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId")) {
      this.collections = undefined;
      this.fetchSearchValues();
    }
    if (
      changedProperties.has("orgId") ||
      changedProperties.has("filterBy") ||
      changedProperties.has("orderBy")
    ) {
      this.fetchCollections();
    }
  }

  render() {
    return html`
      <header class="contents">
        <div class="flex justify-between w-full h-8 mb-4">
          <h1 class="text-xl font-semibold">${msg("Collections")}</h1>
          ${when(
            this.isCrawler,
            () => html`
              <sl-button
                href=${`/orgs/${this.orgId}/collections/new`}
                variant="primary"
                size="small"
                @click=${this.navLink}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("Create Collection")}
              </sl-button>
            `
          )}
        </div>
      </header>

      <link rel="preload" as="image" href=${noCollectionsImg} />
      ${when(this.fetchErrorStatusCode, this.renderFetchError, () =>
        this.collections
          ? html`
              <div
                class="sticky z-10 mb-3 top-2 p-4 bg-neutral-50 border rounded-lg"
              >
                ${this.renderControls()}
              </div>
              ${guard([this.collections], this.renderList)}
            `
          : this.renderLoading()
      )}

      <btrix-dialog
        label=${msg("Delete Collection?")}
        ?open=${this.openDialogName === "delete"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          html`Are you sure you want to delete
            <strong>${this.collectionToDelete?.name}</strong>?`
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >Cancel</sl-button
          >
          <sl-button
            size="small"
            variant="primary"
            @click=${async () => {
              await this.deleteCollection(this.collectionToDelete!);
              this.openDialogName = undefined;
            }}
            >Delete Collection</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderLoading = () => html`<div
    class="w-full flex items-center justify-center my-24 text-3xl"
  >
    <sl-spinner></sl-spinner>
  </div>`;

  private renderEmpty = () => html`
    <div
      class="grid grid-cols-[max-content] gap-3 justify-center justify-items-center text-center"
    >
      <figure>
        <div class="w-[27rem] max-w-[100vw] aspect-square">
          <img src=${noCollectionsImg} />
        </div>
        <figcaption class="text-lg text-primary font-semibold">
          ${this.isCrawler
            ? msg("Start building your Collection.")
            : msg("No Collections Found")}
        </figcaption>
      </figure>
      ${when(
        this.isCrawler,
        () => html`
          <p class="max-w-[18em]">
            ${msg(
              "Organize your crawls into a Collection to easily replay them together."
            )}
          </p>
          <div>
            <sl-button
              href=${`/orgs/${this.orgId}/collections/new`}
              variant="primary"
              @click=${this.navLink}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${msg("Create Collection")}
            </sl-button>
          </div>
        `,
        () => html`
          <p class="max-w-[18em]">
            ${msg("Your organization doesn't have any Collections, yet.")}
          </p>
        `
      )}
    </div>
  `;

  private renderControls() {
    return html`
      <div
        class="grid grid-cols-1 lg:grid-cols-[minmax(0,100%)_fit-content(100%)] gap-x-2 gap-y-2 items-center"
      >
        <div class="col-span-1">${this.renderSearch()}</div>
        <div class="col-span-1 flex items-center">
          <div class="whitespace-nowrap text-neutral-500 mx-2">
            ${msg("Sort by:")}
          </div>
          <div class="grow flex">
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
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            const { name, ...otherFilters } = this.filterBy;
            this.filterBy = otherFilters;
          }}
          @sl-input=${this.onSearchInput}
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
        `
      )}
    `;
  }

  private renderList = () => {
    if (this.collections?.items.length) {
      return html`
        <header class="py-2 text-neutral-600 leading-none">
          <div
            class="hidden md:grid md:grid-cols-[2rem_1fr_repeat(3,12ch)_18ch_2.5rem] gap-3"
          >
            <div class="col-span-1 pl-3 text-center">
              <sl-icon
                class="block text-[15px]"
                name="eye"
                label=${msg("Collection share access")}
              ></sl-icon>
            </div>
            <div class="col-span-1 text-xs">${msg("Name")}</div>
            <div class="col-span-1 text-xs">${msg("Archived Items")}</div>
            <div class="col-span-1 text-xs">${msg("Total Size")}</div>
            <div class="col-span-1 text-xs">${msg("Total Pages")}</div>
            <div class="col-span-2 text-xs">${msg("Last Updated")}</div>
          </div>
        </header>
        <ul class="contents">
          ${this.collections.items.map(this.renderItem)}
        </ul>

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
          `
        )}
      `;
    }

    return html`
      <div class="border rounded-lg bg-neutral-50 p-4 text-center">
        <p class="text-center">
          <span class="text-neutral-400">${msg("No Collections Yet.")}</span>
        </p>
        ${when(
          this.isCrawler,
          () => html`
            <p class="p-4 text-center">
              ${msg(
                "Organize your crawls into a Collection to easily replay them together."
              )}
            </p>
            <div>
              <sl-button
                href=${`/orgs/${this.orgId}/collections/new`}
                variant="primary"
                @click=${this.navLink}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("Create Collection")}
              </sl-button>
            </div>
          `,
          () => html`
            <p class="max-w-[18em] text-center">
              ${msg("Your organization doesn't have any Collections, yet.")}
            </p>
          `
        )}
      </div>
    `;
  };

  private renderItem = (col: Collection) =>
    html`<li class="mb-2 last:mb-0">
      <div class="block border rounded leading-none">
        <div
          class="relative p-3 md:p-0 grid grid-cols-1 md:grid-cols-[2rem_1fr_repeat(3,12ch)_18ch_2.5rem] gap-3 lg:h-10 items-center"
        >
          <div class="col-span-1 md:pl-3 text-base text-neutral-500">
            ${col?.isPublic
              ? html`
                  <sl-tooltip content=${msg("Shareable")}>
                    <sl-icon
                      class="inline-block align-middle"
                      name="people-fill"
                      label=${msg("Shareable Collection")}
                    ></sl-icon>
                  </sl-tooltip>
                `
              : html`
                  <sl-tooltip content=${msg("Private")}>
                    <sl-icon
                      class="inline-block align-middle"
                      name="eye-slash-fill"
                      label=${msg("Private Collection")}
                    ></sl-icon>
                  </sl-tooltip>
                `}
          </div>
          <div class="col-span-1 truncate font-semibold">
            <a
              href=${`/orgs/${this.orgId}/collections/view/${col.id}`}
              class="block text-primary hover:text-indigo-500"
              @click=${this.navLink}
            >
              ${col.name}
            </a>
          </div>
          <div
            class="col-span-1 truncate text-xs text-neutral-500 font-monostyle"
          >
            ${col.crawlCount === 1
              ? msg("1 item")
              : msg(str`${this.numberFormatter.format(col.crawlCount)} items`)}
          </div>
          <div
            class="col-span-1 truncate text-xs text-neutral-500 font-monostyle"
          >
            <sl-format-bytes
              value=${col.totalSize || 0}
              display="narrow"
            ></sl-format-bytes>
          </div>
          <div
            class="col-span-1 truncate text-xs text-neutral-500 font-monostyle"
          >
            ${col.pageCount === 1
              ? msg("1 page")
              : msg(str`${this.numberFormatter.format(col.pageCount)} pages`)}
          </div>
          <div class="col-span-1 text-xs text-neutral-500 font-monostyle">
            <sl-format-date
              date=${`${col.modified}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          </div>
          <div
            class="actionsCol absolute top-0 right-0 md:relative col-span-1 flex items-center justify-center"
          >
            ${this.isCrawler ? this.renderActions(col) : ""}
          </div>
        </div>
      </div>
    </li>`;

  private renderActions = (col: Collection) => {
    const authToken = this.authState!.headers.Authorization.split(" ")[1];

    return html`
      <sl-dropdown distance="4">
        <btrix-button class="p-2" slot="trigger" label=${msg("Actions")} icon>
          <sl-icon class="font-base" name="three-dots-vertical"></sl-icon>
        </btrix-button>
        <sl-menu>
          <sl-menu-item
            @click=${() =>
              this.navTo(`/orgs/${this.orgId}/collections/edit/${col.id}`)}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Collection")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          ${!col?.isPublic
            ? html`
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--success)"
                  @click=${() => this.onTogglePublic(col, true)}
                >
                  <sl-icon name="people-fill" slot="prefix"></sl-icon>
                  ${msg("Make Shareable")}
                </sl-menu-item>
              `
            : html`
                <sl-menu-item style="--sl-color-neutral-700: var(--success)">
                  <sl-icon name="box-arrow-up-right" slot="prefix"></sl-icon>
                  <a
                    target="_blank"
                    slot="prefix"
                    href="https://replayweb.page?source=${this.getPublicReplayURL(
                      col
                    )}"
                  >
                    Visit Shareable URL
                  </a>
                </sl-menu-item>
                <sl-menu-item
                  style="--sl-color-neutral-700: var(--warning)"
                  @click=${() => this.onTogglePublic(col, false)}
                >
                  <sl-icon name="eye-slash" slot="prefix"></sl-icon>
                  ${msg("Make Private")}
                </sl-menu-item>
              `}
          <!-- Shoelace doesn't allow "href" on menu items,
              see https://github.com/shoelace-style/shoelace/issues/1351 -->
          <a
            href=${`/api/orgs/${this.orgId}/collections/${col.id}/download?auth_bearer=${authToken}`}
            class="px-6 py-[0.6rem] flex gap-2 items-center whitespace-nowrap hover:bg-neutral-100"
            download
            @click=${(e: MouseEvent) => {
              (e.target as HTMLAnchorElement).closest("sl-dropdown")?.hide();
            }}
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Collection")}
          </a>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.confirmDelete(col)}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderFetchError = () => html`
    <div>
      <btrix-alert variant="danger">
        ${msg(`Something unexpected went wrong while retrieving Collections.`)}
      </btrix-alert>
    </div>
  `;

  private onSearchInput = debounce(150)((e: any) => {
    this.searchByValue = e.target.value.trim();

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue) {
      const { name, ...otherFilters } = this.filterBy;
      this.filterBy = {
        ...otherFilters,
      };
    }
  }) as any;

  private async onTogglePublic(coll: Collection, isPublic: boolean) {
    const res = await this.apiFetch(
      `/orgs/${this.orgId}/collections/${coll.id}`,
      this.authState!,
      {
        method: "PATCH",
        body: JSON.stringify({ isPublic }),
      }
    );

    this.fetchCollections();
  }

  private getPublicReplayURL(col: Collection) {
    return new URL(
      `/api/orgs/${this.orgId}/collections/${col.id}/public/replay.json`,
      window.location.href
    ).href;
  }

  private confirmDelete = (collection: Collection) => {
    this.collectionToDelete = collection;
    this.openDialogName = "delete";
  };

  private async deleteCollection(collection: Collection): Promise<void> {
    try {
      const name = collection.name;
      await this.apiFetch(
        `/orgs/${this.orgId}/collections/${collection.id}`,
        this.authState!,
        // FIXME API method is GET right now
        {
          method: "DELETE",
        }
      );

      this.collectionToDelete = undefined;
      this.fetchCollections();

      this.notify({
        message: msg(html`Deleted <strong>${name}</strong> Collection.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchSearchValues() {
    try {
      const searchValues: CollectionSearchValues = await this.apiFetch(
        `/orgs/${this.orgId}/collections/search-values`,
        this.authState!
      );
      const names = searchValues.names;

      // Update search/filter collection
      const toSearchItem =
        (key: SearchFields) =>
        (value: string): SearchResult["item"] => ({
          key,
          value,
        });
      this.fuse.setCollection([...names.map(toSearchItem("name"))] as any);
    } catch (e) {
      console.debug(e);
    }
  }

  private async fetchCollections(params?: APIPaginationQuery) {
    this.fetchErrorStatusCode = undefined;

    try {
      this.collections = await this.getCollections(params);
    } catch (e: any) {
      if (e.isApiError) {
        this.fetchErrorStatusCode = e.statusCode;
      } else {
        this.notify({
          message: msg("Sorry, couldn't retrieve Collections at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async getCollections(
    queryParams?: APIPaginationQuery
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        page: queryParams?.page || this.collections?.page || 1,
        pageSize:
          queryParams?.pageSize ||
          this.collections?.pageSize ||
          INITIAL_PAGE_SIZE,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      }
    );

    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/collections?${query}`,
      this.authState!
    );

    return data;
  }
}
customElements.define("btrix-collections-list", CollectionsList);
