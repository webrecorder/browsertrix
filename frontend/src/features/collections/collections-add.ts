import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlInput, SlMenuItem } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Combobox } from "@/components/ui/combobox";
import type { BtrixRemoveLinkedCollectionEvent } from "@/features/collections/linked-collections/types";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Collection } from "@/types/collection";
import type { UnderlyingFunction } from "@/types/utils";

const INITIAL_PAGE_SIZE = 10;
const MIN_SEARCH_LENGTH = 2;

export type CollectionsChangeEvent = CustomEvent<{
  collections: string[];
}>;

/**
 * Usage:
 * ```ts
 * <btrix-collections-add
 *   .initialCollections=${[]}
 *   .configId=${this.configId}
 *   @collections-change=${console.log}
 * ></btrix-collections-add>
 * ```
 * @events collections-change
 */
@customElement("btrix-collections-add")
@localized()
export class CollectionsAdd extends BtrixElement {
  @property({ type: Array })
  initialCollections?: string[];

  @property({ type: String })
  configId?: string;

  @property({ type: String })
  label?: string;

  /* Text to show on collection empty state */
  @property({ type: String })
  emptyText?: string;

  @state()
  private collectionIds: string[] = [];

  @query("sl-input")
  private readonly input?: SlInput | null;

  @query("btrix-combobox")
  private readonly combobox?: Combobox | null;

  private get searchByValue() {
    return this.input ? this.input.value.trim() : "";
  }

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  private readonly searchResultsTask = new Task(this, {
    task: async ([searchByValue, hasSearchStr], { signal }) => {
      if (!hasSearchStr) return [];
      const data = await this.fetchCollectionsByPrefix(searchByValue, signal);
      let searchResults: Collection[] = [];
      if (data?.items.length) {
        searchResults = this.filterOutSelectedCollections(data.items);
      }
      return searchResults;
    },
    args: () => [this.searchByValue, this.hasSearchStr] as const,
  });

  connectedCallback() {
    if (this.initialCollections) {
      this.collectionIds = this.initialCollections;
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  render() {
    return html`<div>
      <label class="form-label">
        ${this.label || msg("Add to Collection")}
      </label>
      <div class="mb-2 rounded-lg border bg-neutral-50 p-2">
        ${this.renderSearch()}
      </div>

      ${when(this.collectionIds, () =>
        this.collectionIds.length
          ? html`
              <div class="mb-2">
                <btrix-linked-collections
                  .collectionIds=${this.collectionIds}
                  removable
                  @btrix-remove=${(e: BtrixRemoveLinkedCollectionEvent) => {
                    const { id } = e.detail.item;

                    this.removeCollection(id);
                  }}
                ></btrix-linked-collections>
              </div>
            `
          : this.emptyText
            ? html`
                <div class="mb-2">
                  <p class="text-0-500 text-center">${this.emptyText}</p>
                </div>
              `
            : "",
      )}
    </div>`;
  }

  private renderSearch() {
    return html`
      <btrix-combobox
        @request-close=${() => {
          this.combobox?.hide();
          if (this.input) this.input.value = "";
        }}
        @sl-select=${async (e: CustomEvent<{ item: SlMenuItem }>) => {
          this.combobox?.hide();
          const item = e.detail.item;
          const collId = item.dataset["key"];
          if (collId && this.collectionIds.indexOf(collId) === -1) {
            const coll = this.searchResultsTask.value?.find(
              (collection) => collection.id === collId,
            );
            if (coll) {
              const { id } = coll;
              this.collectionIds = [...this.collectionIds, id];
              void this.dispatchChange();
            }
          }
        }}
      >
        <sl-input
          size="small"
          placeholder=${msg("Search by Collection name")}
          clearable
          @sl-clear=${() => {
            this.combobox?.hide();
          }}
          @keyup=${() => {
            if (this.combobox && !this.combobox.open && this.hasSearchStr) {
              this.combobox.show();
            }
          }}
          @sl-input=${this.onSearchInput as UnderlyingFunction<
            typeof this.onSearchInput
          >}
        >
          <sl-icon name="search" slot="prefix"></sl-icon>
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    return this.searchResultsTask.render({
      pending: () => html`
        <sl-menu-item slot="menu-item" disabled>
          <sl-spinner></sl-spinner>
        </sl-menu-item>
      `,
      complete: (searchResults) => {
        if (!this.hasSearchStr) {
          return html`
            <sl-menu-item slot="menu-item" disabled>
              ${msg("Start typing to search Collections.")}
            </sl-menu-item>
          `;
        }

        // Filter out stale search results from last debounce invocation
        const results = searchResults.filter((res) =>
          new RegExp(`^${this.searchByValue}`, "i").test(res.name),
        );

        if (!results.length) {
          return html`
            <sl-menu-item slot="menu-item" disabled>
              ${msg("No matching Collections found.")}
            </sl-menu-item>
          `;
        }

        return html`
          ${results.map((item: Collection) => {
            return html`
              <sl-menu-item slot="menu-item" data-key=${item.id}>
                ${item.name}
                <div
                  slot="suffix"
                  class="font-monostyle flex-auto text-right text-xs text-neutral-500"
                >
                  ${msg(str`${item.crawlCount} items`)}
                </div>
              </sl-menu-item>
            `;
          })}
        `;
      },
    });
  }

  private removeCollection(collectionId: string) {
    if (collectionId) {
      const collIdIndex = this.collectionIds.indexOf(collectionId);
      if (collIdIndex > -1) {
        this.collectionIds = [
          ...this.collectionIds.slice(0, collIdIndex),
          ...this.collectionIds.slice(collIdIndex + 1),
        ];
        void this.dispatchChange();
      }
    }
  }

  private readonly onSearchInput = debounce(400)(() => {
    void this.searchResultsTask.run();
  });

  private filterOutSelectedCollections(results: Collection[]) {
    return results.filter((result) => {
      return !this.collectionIds.some((id) => id === result.id);
    });
  }

  private async fetchCollectionsByPrefix(
    namePrefix: string,
    signal?: AbortSignal,
  ) {
    try {
      const results = await this.getCollections(
        {
          oid: this.orgId,
          namePrefix: namePrefix,
          sortBy: "name",
          pageSize: INITIAL_PAGE_SIZE,
        },
        signal,
      );
      return results;
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        console.debug("Fetch aborted to throttle");
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't retrieve Collections at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "collection-fetch-throttled",
        });
      }
    }
  }

  private async getCollections(
    params?: Partial<{
      oid?: string;
      namePrefix?: string;
    }> &
      APIPaginationQuery &
      APISortQuery,
    signal?: AbortSignal,
  ) {
    const query = queryString.stringify(params || {}, {
      arrayFormat: "comma",
    });
    const data = await this.api.fetch<APIPaginatedList<Collection>>(
      `/orgs/${this.orgId}/collections?${query}`,
      { signal },
    );

    return data;
  }

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent("collections-change", {
        detail: { collections: this.collectionIds },
      }) as CollectionsChangeEvent,
    );
  }
}
