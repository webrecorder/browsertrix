import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import Fuse from "fuse.js";
import type { SlMenuItem } from "@shoelace-style/shoelace";
import queryString from "query-string";

import type { AuthState } from "../../utils/AuthService";
import type { Collection, CollectionList } from "../../types/collection";
import LiteElement, { html } from "../../utils/LiteElement";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "../../types/api";

type SortField = "_lastUpdated" | "_name";
type SortDirection = "asc" | "desc";

const INITIAL_PAGE_SIZE = 10;
const MIN_SEARCH_LENGTH = 2;

type SearchFields = "name";
type SearchResult = {
  item: {
    key: SearchFields;
    value: string;
  };
};

type CollectionSearchResults = APIPaginatedList & {
  items: CollectionList;
}

const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  _lastUpdated: {
    label: msg("Last Updated"),
    defaultDirection: "desc",
  },
  _name: {
    label: msg("Name"),
    defaultDirection: "asc",
  },
};

export type CollectionsChangeEvent = CustomEvent<{
  collections: string[];
}>;

/**
 * Usage:
 * ```ts
 * <btrix-collections-add
 *   .authState=${this.authState}
 *   .initialCollections=${[]}
 *   .orgId=${this.orgId}
 *   .configId=${this.configId}
 *   @collections-change=${console.log}
 * ></btrix-collections-add>
 * ```
 * @events collections-change
 */
@localized()
export class CollectionsAdd extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Array })
  initialCollections?: CollectionList;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  configId!: string;

  @state()
  private collections: CollectionList = [];

  @state()
  private collectionIds: string[] = [];

  @state()
  private searchByValue: string = "";

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  private get selectedSearchFilterKey() {
    return Object.keys(this.fieldLabels).find((key) =>
      Boolean((this.searchByValue as any)[key])
    );
  }

  private readonly fieldLabels: Record<SearchFields, string> = {
    name: msg("Name")
  };

  @state()
  private verifiedSearchName: string = "";

  @state()
  private searchResultsOpen = false;

  @state()
  private orderCollectionsBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "_name",
    direction: sortableFields["_name"].defaultDirection!,
  };

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  connectedCallback() {
    if (this.initialCollections) {
      this.collections = this.initialCollections;
    }
    super.connectedCallback();
  }

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      this.fetchSearchValues();
    }
  }

  render() {
    return html`
      <div class="form-control form-control--has-label">
        <label
          class="form-control__label"
          part="form-control-label"
          for="input"
        >
          <slot name="label">${msg("Collection Auto-Add")}</slot>
        </label>
        <div class="mb-2 mt-2 p-2 bg-neutral-50 border rounded-lg">
          ${this.renderSearch()}
        </div>

        ${when(
          this.collections,
          () =>
            this.collections.length
              ? html`
                  <div class="mb-2">
                    <ul class="contents">
                      ${this.collections.map(this.renderCollectionItem)}
                    </ul>
                  </div>
                `
              : html`
                  <div class="mb-2">
                    <p class="text-center text-0-500">
                      ${msg("Search for a Collection to auto-add crawls")}
                    </p>
                  </div>
                `)}
      </div>`;
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
          const coll = await this.fetchCollection(item.value);
          if (coll && this.collectionIds.indexOf(coll.id) === -1) {
            this.collections.push(coll);
            this.collectionIds.push(coll.id);
            await this.dispatchChange();
          }
          await this.updateComplete;
        }}
      >
        <sl-input
          size="small"
          placeholder=${msg("Search by Collection name")}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
          }}
          @sl-input=${this.onSearchInput}
        >
          <sl-icon name="search" slot="prefix"></sl-icon>
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("Start typing to search Collections.")}</sl-menu-item
        >
      `;
    }

    const searchResults = this.fuse.search(this.searchByValue).slice(0, 10);
    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching Collections found.")}</sl-menu-item
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

  private renderCollectionItem(collection: Collection) {
    // TODO: Make X icon functional
    const crawlCountMessage = msg(str`${collection.crawlCount} Crawls`);
    return html`<li class="mt-1 p-2 pl-5 pr-5 border rounded-sm">
        ${collection.name}
        <span class="float-right">
          <span class="text-neutral-500 text-xs font-monostyle">${crawlCountMessage}</span>
          <sl-icon
            class="ml-3"
            name="x-lg"
            @click=${() => {
              // TODO: Implement removal from this.collections and this.collectionIds
              console.log(`Will remove ${collection.id}`);
            }}></sl-icon>
        </span>
      </li>`;
  }

  private onSearchInput = debounce(200)((e: any) => {
    this.searchByValue = e.target.value.trim();

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }
  }) as any;

  private async fetchSearchValues() {
    try {
      const { names } = await this.apiFetch(
        `/orgs/${this.orgId}/collections/search-values`,
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
      ] as any);
    } catch (e) {
      console.debug(e);
    }
  }

  private async fetchCollection(name: string) {
    if (!this.configId) return;

    try {
      const results: CollectionSearchResults = await this.getCollections({
        oid: this.orgId,
        name: name,
        sortBy: "name",
        pageSize: INITIAL_PAGE_SIZE,
      });
      if (results?.items) {
        return results.items[0];
      }
    } catch {
      this.notify({
        message: msg(
          "Sorry, couldn't retrieve Collections at this time."
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCollections(
    params: Partial<{
      oid?: string;
      name?: string;
    }> &
      APIPaginationQuery &
      APISortQuery
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(params || {}, {
      arrayFormat: "comma",
    });
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/collections?${query}`,
      this.authState!
    );

    return data;
  }

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      <CollectionsChangeEvent>new CustomEvent("collections-change", {
        detail: { collections: this.collectionIds },
      })
    );
  }
}
customElements.define("btrix-collections-add", CollectionsAdd);
