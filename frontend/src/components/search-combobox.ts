import { LitElement, html } from "lit";
import { property, state, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import Fuse from "fuse.js";
import type { SlInput, SlMenuItem } from "@shoelace-style/shoelace";

export type SelectEvent = CustomEvent<{
  key: string | null;
  value?: any;
}>;
type SearchResult = {
  item: any;
  matches: {
    key: string;
    value: string;
  }[];
};

const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 10;

/**
 * Fuzzy search through list of options
 *
 * @event on-select
 * @event on-clear
 */
@localized()
export class SearchCombobox extends LitElement {
  @property({ type: Array })
  searchOptions: any[] = [];

  @property({ type: Array })
  searchKeys: string[] = [];

  @property({ type: Array })
  keyLabels: { [key: string]: string } = {};

  @property({ type: String })
  selectedKey?: string;

  @property({ type: String })
  placeholder: string = msg("Start typing to search");

  @state()
  private searchByValue: string = "";

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  @state()
  private searchResultsOpen = false;

  @query("sl-input")
  private input!: SlInput;

  private fuse = new Fuse([], {
    keys: [],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
    includeMatches: true,
  });

  disconnectedCallback(): void {
    this.onSearchInput.cancel();
    super.disconnectedCallback();
  }

  protected willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.get("selectedKey") && !this.selectedKey) {
      this.onSearchInput.cancel();
      this.searchByValue = "";
    }
    if (changedProperties.has("searchKeys") && this.searchKeys) {
      this.onSearchInput.cancel();
      this.fuse = new Fuse([], {
        ...(this.fuse as any).options,
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
            <SelectEvent>new CustomEvent("on-select", {
              detail: {
                key: key,
                value: item.value,
              },
            })
          );
        }}
      >
        <sl-input
          size="small"
          placeholder=${this.placeholder}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            this.dispatchEvent(new CustomEvent("on-clear"));
          }}
          @sl-input=${this.onSearchInput}
        >
          ${when(
            this.selectedKey,
            () =>
              html`<sl-tag
                slot="prefix"
                size="small"
                pill
                style="margin-left: var(--sl-spacing-3x-small)"
                >${this.keyLabels[this.selectedKey as string]}</sl-tag
              >`,
            () => html`<sl-icon name="search" slot="prefix"></sl-icon>`
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

    const searchResults = this.fuse
      .search(this.searchByValue)
      .slice(0, MAX_SEARCH_RESULTS) as any;
    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matches found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${searchResults.map(({ matches }: SearchResult) =>
        matches.map(
          ({ key, value }) => html`
            <sl-menu-item slot="menu-item" data-key=${key} value=${value}>
              <sl-tag slot="prefix" size="small" pill
                >${this.keyLabels[key]}</sl-tag
              >
              ${value}
            </sl-menu-item>
          `
        )
      )}
    `;
  }

  private onSearchInput = debounce(150)((e: any) => {
    this.searchByValue = this.input.value?.trim();

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue && this.selectedKey) {
      this.dispatchEvent(new CustomEvent("on-clear"));
    }
  }) as any;
}
