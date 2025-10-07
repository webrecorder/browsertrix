import { localized, msg } from "@lit/localize";
import type {
  SlInput,
  SlInputEvent,
  SlMenuItem,
} from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Combobox } from "@/components/ui/combobox";
import { WithSearchOrgContext } from "@/context/search-org/WithSearchOrgContext";
import type {
  BtrixLoadedLinkedCollectionEvent,
  BtrixRemoveLinkedCollectionEvent,
  CollectionLikeItem,
} from "@/features/collections/linked-collections/types";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Collection } from "@/types/collection";
import { TwoWayMap } from "@/utils/TwoWayMap";

const MIN_SEARCH_LENGTH = 1;

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
export class CollectionsAdd extends WithSearchOrgContext(BtrixElement) {
  @property({ type: Array })
  initialCollections?: string[];

  @property({ type: String })
  configId?: string;

  @property({ type: String })
  label?: string;

  @state()
  private collections: CollectionLikeItem[] = [];

  @state()
  private searchByValue = "";

  @query("#search-input")
  private readonly input?: SlInput | null;

  @query("btrix-combobox")
  private readonly combobox?: Combobox | null;

  // Map collection names to ID for managing search options
  private readonly nameSearchMap = new TwoWayMap<string, string>();

  private get collectionIds() {
    return this.collections.map(({ id }) => id);
  }

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  public focus() {
    // Move focus to search input
    this.input?.focus();
  }

  connectedCallback() {
    if (this.initialCollections) {
      this.collections = this.initialCollections.map((id) => ({ id }));
    }
    super.connectedCallback();
  }

  render() {
    return html`<div>
      <label class="form-label">
        ${this.label || msg("Add to Collection")}
      </label>
      <div class="rounded-lg border bg-neutral-50 p-2">
        ${this.renderSearch()}
      </div>

      ${when(this.collections, (collections) =>
        collections.length
          ? html`
              <div class="mt-2">
                <btrix-linked-collections
                  .collections=${collections}
                  removable
                  @btrix-loaded=${(e: BtrixLoadedLinkedCollectionEvent) => {
                    const { item } = e.detail;

                    if (item.name) {
                      this.nameSearchMap.set(item.name, item.id);
                    }
                  }}
                  @btrix-remove=${(e: BtrixRemoveLinkedCollectionEvent) => {
                    const { id } = e.detail.item;

                    this.removeCollection(id);

                    // Remove from search mapping
                    const name = this.nameSearchMap.getByValue(id);

                    if (name) {
                      this.nameSearchMap.delete(name);
                    }
                  }}
                ></btrix-linked-collections>
              </div>
            `
          : nothing,
      )}
    </div>`;
  }

  private renderSearch() {
    const collections = this.listSearchValuesFor("collections");
    const disabled = !collections?.length;

    return html`
      <btrix-combobox
        @request-close=${() => {
          this.combobox?.hide();
          if (this.input) this.input.value = "";
        }}
        @sl-select=${async (e: CustomEvent<{ item: SlMenuItem }>) => {
          this.combobox?.hide();
          const item = e.detail.item;
          const name = item.dataset["value"];

          const collections = await this.getCollections({ namePrefix: name });
          const coll = collections.items.find((c) => c.name === name);

          if (coll && this.findCollectionIndexById(coll.id) === -1) {
            this.collections = [...this.collections, coll];
            void this.dispatchChange();

            this.nameSearchMap.set(coll.name, coll.id);

            if (this.input) {
              this.input.value = "";
            }
          }
        }}
      >
        <sl-input
          id="search-input"
          size="small"
          placeholder=${msg("Search for collection by name")}
          clearable
          ?disabled=${disabled}
          @sl-clear=${() => {
            this.combobox?.hide();
          }}
          @keyup=${() => {
            if (this.combobox && !this.combobox.open && this.hasSearchStr) {
              this.combobox.show();
            }
          }}
          @sl-input=${(e: SlInputEvent) => {
            const input = e.target as SlInput;

            this.searchByValue = input.value.trim();
          }}
        >
          <sl-icon name="search" slot="prefix"></sl-icon>
          ${when(
            disabled && collections,
            () => html`
              <div slot="help-text">
                ${msg("No collections found.")}
                <btrix-link
                  href="${this.navigate.orgBasePath}/collections"
                  target="_blank"
                  >${msg("Manage Collections")}</btrix-link
                >
              </div>
            `,
          )}
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.searchOrg.collections) {
      html`
        <sl-menu-item slot="menu-item" disabled>
          <sl-spinner></sl-spinner>
        </sl-menu-item>
      `;
    }

    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled>
          ${msg("Start typing to search Collections.")}
        </sl-menu-item>
      `;
    }

    const results = this.searchOrg.collections
      ?.search(this.searchByValue)
      // Filter out items that have been selected
      .filter(({ item }) => !this.nameSearchMap.get(item.name))
      // Show first few results
      .slice(0, 5);

    if (!results?.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled>
          ${msg("No matching Collections found.")}
        </sl-menu-item>
      `;
    }

    return html`
      ${results.map(({ item }) => {
        return html`
          <sl-menu-item
            slot="menu-item"
            data-key="name"
            data-value=${item["name"]}
          >
            ${item["name"]}
          </sl-menu-item>
        `;
      })}
    `;
  }

  private removeCollection(collectionId: string) {
    if (collectionId) {
      const collIdIndex = this.findCollectionIndexById(collectionId);

      if (collIdIndex > -1) {
        this.collections = [
          ...this.collections.slice(0, collIdIndex),
          ...this.collections.slice(collIdIndex + 1),
        ];
        void this.dispatchChange();
      }
    }
  }

  private findCollectionIndexById(collectionId: string) {
    return this.collections.findIndex(({ id }) => id === collectionId);
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
      new CustomEvent<CollectionsChangeEvent["detail"]>("collections-change", {
        detail: { collections: this.collectionIds },
      }),
    );
  }
}
