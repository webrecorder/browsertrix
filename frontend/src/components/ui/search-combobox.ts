import { localized, msg } from "@lit/localize";
import type {
  SlClearEvent,
  SlIcon,
  SlInput,
  SlMenuItem,
} from "@shoelace-style/shoelace";
import Fuse from "fuse.js";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import { TailwindElement } from "@/classes/TailwindElement";
import { defaultFuseOptions } from "@/context/search-org/connectFuse";
import type { BtrixSelectEvent } from "@/events/btrix-select";
import { type UnderlyingFunction } from "@/types/utils";
import { hasChanged } from "@/utils/hasChanged";

export type BtrixSearchComboboxSelectEvent = BtrixSelectEvent<{
  key: string | null;
  value: string;
}>;

const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 5;

/**
 * Fuzzy search through list of options
 *
 * @slot help-text
 * @fires btrix-select
 * @fires btrix-clear
 */
@customElement("btrix-search-combobox")
@localized()
export class SearchCombobox<T> extends TailwindElement {
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
  name?: string;

  @property({ type: Boolean })
  required?: boolean;

  @property({ type: String })
  size?: SlInput["size"];

  @property({ type: String })
  iconName?: SlIcon["name"];

  @property({ type: Boolean })
  createNew = false;

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  @state()
  private searchResultsOpen = false;

  @query("sl-input")
  private readonly input!: SlInput;

  protected fuse = new Fuse<T>(this.searchOptions, {
    ...defaultFuseOptions,
    keys: this.searchKeys,
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
          const value = item.value;
          this.searchByValue = value;
          await this.updateComplete;
          this.dispatchEvent(
            new CustomEvent<BtrixSearchComboboxSelectEvent["detail"]>(
              "btrix-select",
              {
                detail: {
                  item: { key: key ?? null, value: value },
                },
              },
            ),
          );
        }}
      >
        <sl-input
          placeholder=${this.placeholder}
          label=${ifDefined(this.label)}
          size=${ifDefined(this.size)}
          clearable
          value=${this.searchByValue}
          @sl-clear=${(e: SlClearEvent) => {
            e.stopPropagation();
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
            () =>
              html`<sl-icon
                name=${this.iconName || "search"}
                slot="prefix"
              ></sl-icon>`,
          )}
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
      <slot name="help-text"></slot>
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

    const match = ({ key, value }: Fuse.FuseResultMatch) => {
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
    };

    const newName = this.searchByValue.trim();
    // Hide "Add" if there's a result that matches the entire string (case insensitive)
    const showCreateNew =
      this.createNew &&
      !searchResults.some((res) =>
        res.matches?.some(
          ({ value }) =>
            value && value.toLocaleLowerCase() === newName.toLocaleLowerCase(),
        ),
      );

    return html`
      ${when(
        searchResults.length,
        () => html`
          ${searchResults.map(({ matches }) => matches?.map(match))}
          ${showCreateNew
            ? html`<sl-divider slot="menu-item"></sl-divider>`
            : nothing}
        `,
        () =>
          showCreateNew
            ? nothing
            : html`
                <sl-menu-item slot="menu-item" disabled
                  >${msg("No matches found.")}</sl-menu-item
                >
              `,
      )}
      ${when(showCreateNew, () => {
        return html`
          <sl-menu-item slot="menu-item" value=${newName}>
            <span class="text-neutral-500">${msg("Create")} “</span
            >${newName}<span class="text-neutral-500">”</span>
          </sl-menu-item>
        `;
      })}
    `;
  }

  private readonly onSearchInput = debounce(150)(() => {
    this.searchByValue = this.input.value;

    if (!this.searchResultsOpen && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue && this.selectedKey) {
      this.dispatchEvent(new CustomEvent("btrix-clear"));
    }
  });
}
