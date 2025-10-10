import { localized, msg } from "@lit/localize";
import type {
  SlInput,
  SlInputEvent,
  SlMenuItem,
} from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import difference from "lodash/fp/difference";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Combobox } from "@/components/ui/combobox";
import { WithSearchOrgContext } from "@/context/search-org/WithSearchOrgContext";
import type {
  BtrixLoadedLinkedCollectionEvent,
  BtrixRemoveLinkedCollectionEvent,
  CollectionLikeItem,
} from "@/features/collections/linked-collections/types";
import type { APIPaginatedList } from "@/types/api";
import type { Collection } from "@/types/collection";
import { isNotEqual } from "@/utils/is-not-equal";

const MIN_SEARCH_LENGTH = 1;
const MAX_SEARCH_RESULTS = 5;

export type CollectionsChangeEvent = CustomEvent<{
  collections: string[];
}>;

/**
 * Usage:
 * ```ts
 * <btrix-collections-add
 *   .collectionIds=${[]}
 *   @collections-change=${console.log}
 * ></btrix-collections-add>
 * ```
 * @events collections-change
 */
@customElement("btrix-collections-add")
@localized()
export class CollectionsAdd extends WithSearchOrgContext(BtrixElement) {
  @property({ type: Array, hasChanged: isNotEqual })
  collectionIds?: string[];

  /**
   * ID of collection that is used for deduplication
   */
  @property({ type: String })
  dedupeId?: string;

  @property({ type: String })
  label?: string;

  @state({ hasChanged: isNotEqual })
  private collections: CollectionLikeItem[] = [];

  @state()
  private searchByValue = "";

  @query("#search-input")
  private readonly input?: SlInput | null;

  @query("btrix-combobox")
  private readonly combobox?: Combobox | null;

  // Map collection names to ID for managing search options
  private readonly nameSearchMap = new Map<
    /* ID: */ string,
    /* name: */ string
  >();

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  public focus() {
    // Move focus to search input
    this.input?.focus();
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("collectionIds") && this.collectionIds) {
      this.collections = this.collectionIds.map((id) => ({
        id,
        name: this.nameSearchMap.get(id) || "",
      }));
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("collectionIds") && this.collectionIds) {
      const removedIds = difference(
        changedProperties.get("collectionIds"),
        this.collectionIds,
      );

      if (removedIds.length) {
        removedIds.forEach((id) => {
          this.nameSearchMap.delete(id);
        });
      }
    }
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
                  .dedupeId=${this.dedupeId}
                  removable
                  @btrix-loaded=${(e: BtrixLoadedLinkedCollectionEvent) => {
                    const { item } = e.detail;

                    if (item.name) {
                      this.nameSearchMap.set(item.id, item.name);
                    }
                  }}
                  @btrix-remove=${(e: BtrixRemoveLinkedCollectionEvent) => {
                    const { id } = e.detail.item;

                    this.removeCollection(id);

                    // Remove from search mapping
                    this.nameSearchMap.delete(id);
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

          if (!name) return;

          const coll = await this.getCollectionByName(name);

          if (coll && this.findCollectionIndexById(coll.id) === -1) {
            this.collections = [...this.collections, coll];
            void this.dispatchChange();

            this.nameSearchMap.set(coll.id, coll.name);

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

    // Use search pattern that excludes selected names
    const includePattern = `"${this.searchByValue}"`;
    // Fuse doesn't support escaping quotes or operators in expressions yet,
    // so we still need to manually filter out collection names with quotes
    // from the search results
    // https://github.com/krisk/Fuse/issues/765
    const excludeWithQuotes: string[] = [];
    const excludeWithoutQuotes: string[] = [];

    for (const name in this.nameSearchMap.values()) {
      if (name.includes('"')) {
        excludeWithQuotes.push(name);
      } else {
        excludeWithoutQuotes.push(`!"${name}"`);
      }
    }

    const excludePattern = excludeWithoutQuotes.join(" ");
    const pattern =
      includePattern + (excludePattern ? ` ${excludePattern}` : "");

    // TODO Evaluate performance of searching in render, which will block the main thread
    const results = this.searchOrg.collections
      ?.search(pattern, {
        limit: MAX_SEARCH_RESULTS + excludeWithQuotes.length,
      })
      .filter(({ item }) => !excludeWithQuotes.includes(item["name"]))
      .slice(0, MAX_SEARCH_RESULTS);

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

  private async getCollectionByName(name: string, signal?: AbortSignal) {
    const query = queryString.stringify({ name, page: 1, pageSize: 1 });
    const data = await this.api.fetch<APIPaginatedList<Collection | undefined>>(
      `/orgs/${this.orgId}/collections?${query}`,
      { signal },
    );

    return data.items[0];
  }

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<CollectionsChangeEvent["detail"]>("collections-change", {
        detail: { collections: this.collections.map(({ id }) => id) },
      }),
    );
  }
}
