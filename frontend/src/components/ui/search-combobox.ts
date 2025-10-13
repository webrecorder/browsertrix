import { localized, msg } from "@lit/localize";
import type { SlInput, SlMenuItem } from "@shoelace-style/shoelace";
import Fuse from "fuse.js";
import { html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import { type UnderlyingFunction } from "@/types/utils";
import { hasChanged } from "@/utils/hasChanged";

type SelectEventDetail<T> = {
  key: string | null;
  value?: T;
};
export type SelectEvent<T> = CustomEvent<SelectEventDetail<T>>;

const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 5;

/**
 * Fuzzy search through list of options
 *
 * @event btrix-select
 * @event btrix-clear
 */
@customElement("btrix-search-combobox")
@localized()
export class SearchCombobox<T> extends LitElement {
  @property({ type: Array })
  searchOptions: T[] = [];

  @property({ type: Array, hasChanged })
  searchKeys: string[] = [];

  @property({ type: Object, hasChanged })
  keyLabels?: { [key: string]: string };

  @property({ type: String })
  selectedKey?: string;

  @property({ type: String })
  placeholder: string = msg("Start typing to search");

  @property({ type: String })
  searchByValue = "";

  @property({ type: String })
  label?: string;

  @property({ type: String })
  size: SlInput["size"] = "small";

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  @state()
  private searchResultsOpen = false;

  @query("sl-input")
  private readonly input!: SlInput;

  protected fuse = new Fuse<T>(this.searchOptions, {
    keys: this.searchKeys,
    threshold: 0.2, // stricter; default is 0.6
    includeMatches: true,
  });

  disconnectedCallback(): void {
    this.onSearchInput.cancel();
    super.disconnectedCallback();
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.get("selectedKey") && !this.selectedKey) {
      this.onSearchInput.cancel();
      this.searchByValue = "";
    }
    if (changedProperties.has("searchKeys")) {
      this.onSearchInput.cancel();
      this.fuse = new Fuse<T>(this.searchOptions, {
        ...(
          this.fuse as unknown as {
            options: ConstructorParameters<typeof Fuse>[1];
          }
        ).options,
        keys: this.searchKeys,
      });
    }
    if (
      changedProperties.has("searchOptions") &&
      Array.isArray(this.searchOptions)
    ) {
      this.onSearchInput.cancel();
      this.fuse.setCollection(this.searchOptions as never[]);
    }
  }

  render() {
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
          const key = item.dataset["key"];
          this.searchByValue = item.value;
          await this.updateComplete;
          this.dispatchEvent(
            new CustomEvent<SelectEventDetail<T>>("btrix-select", {
              detail: {
                key: key ?? null,
                value: item.value as T,
              },
            }),
          );
        }}
      >
        <sl-input
          size=${this.size}
          placeholder=${this.placeholder}
          label=${ifDefined(this.label)}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            this.dispatchEvent(new CustomEvent("btrix-clear"));
          }}
          @sl-input=${this.onSearchInput as UnderlyingFunction<
            typeof this.onSearchInput
          >}
        >
          ${when(
            this.selectedKey && this.keyLabels?.[this.selectedKey],
            () =>
              html`<sl-tag
                slot="prefix"
                size="small"
                pill
                style="margin-left: var(--sl-spacing-3x-small)"
                >${this.keyLabels![this.selectedKey!]}</sl-tag
              >`,
            () => html`<sl-icon name="search" slot="prefix"></sl-icon>`,
          )}
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("Keep typing to search.")}</sl-menu-item
        >
      `;
    }

    const searchResults = this.fuse.search(this.searchByValue, {
      limit: MAX_SEARCH_RESULTS,
    });

    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matches found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${searchResults.map(({ matches }) =>
        matches?.map(({ key, value }) => {
          if (!!key && !!value) {
            const keyLabel = this.keyLabels?.[key];
            return html`
              <sl-menu-item slot="menu-item" data-key=${key} value=${value}>
                ${keyLabel
                  ? html`<sl-tag slot="prefix" size="small" pill
                      >${keyLabel}</sl-tag
                    >`
                  : nothing}
                ${value}
              </sl-menu-item>
            `;
          }
          return nothing;
        }),
      )}
    `;
  }

  private readonly onSearchInput = debounce(150)(() => {
    this.searchByValue = this.input.value.trim();

    if (!this.searchResultsOpen && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue && this.selectedKey) {
      this.dispatchEvent(new CustomEvent("btrix-clear"));
    }
  });
}
