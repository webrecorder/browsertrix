import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlInput } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import debounce from "lodash/fp/debounce";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Combobox } from "@/components/ui/combobox";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { UnderlyingFunction } from "@/types/utils";

type Page = {
  url: string;
  count: number;
  snapshots: unknown[];
};
const DEFAULT_PROTOCOL = "http";

@localized()
@customElement("btrix-collection-start-page-dialog")
export class CollectionStartPageDialog extends BtrixElement {
  @property({ type: String })
  collectionId?: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private searchQuery = "";

  @state()
  private selectedItem?: Page;

  @query("btrix-combobox")
  private readonly combobox?: Combobox | null;

  @query("sl-input")
  private readonly input?: SlInput | null;

  private readonly searchResults = new Task(this, {
    task: async ([searchValue], { signal }) => {
      const searchResults = await this.getPageUrls(
        {
          id: this.collectionId!,
          urlPrefix: searchValue,
        },
        signal,
      );

      return searchResults;
    },
    args: () => [this.searchQuery] as const,
  });

  render() {
    return html`
      <btrix-dialog
        .label=${msg("Select Start Page")}
        .open=${this.open}
        class="[--width:40rem]"
      >
        ${this.renderPageSearch()} ${this.renderSelectedItem()}
      </btrix-dialog>
    `;
  }

  private renderPageSearch() {
    return html`
      <btrix-combobox
        @request-close=${() => {
          this.combobox?.hide();
        }}
      >
        <sl-input
          label=${msg("Page URL")}
          placeholder=${msg("https://example.com")}
          help-text=${msg("Enter a URL starting with http")}
          clearable
          @sl-clear=${() => {
            this.combobox?.hide();
            void this.searchResults.run();
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
    return this.searchResults.render({
      pending: () => html`
        <sl-menu-item slot="menu-item" disabled>
          <sl-spinner></sl-spinner>
        </sl-menu-item>
      `,
      complete: ({ items }) => {
        if (!items.length) {
          return html`
            <sl-menu-item slot="menu-item" disabled>
              ${msg("No matching Collections found.")}
            </sl-menu-item>
          `;
        }

        return html`
          ${items.map((item: Page) => {
            return html`
              <sl-menu-item
                slot="menu-item"
                @click=${() => {
                  this.selectedItem = item;
                  this.combobox?.hide();
                }}
                >${item.url}
              </sl-menu-item>
            `;
          })}
        `;
      },
    });
  }

  private renderSelectedItem() {
    return html`
      <div class="mt-5 flex gap-3">
        <sl-select class="flex-1" label=${msg("Snapshot")}>
          <sl-option value="option-1">Option 1</sl-option>
          <sl-option value="option-2">Option 2</sl-option>
          <sl-option value="option-3">Option 3</sl-option>
        </sl-select>
        <div>
          <div class="form-label">${msg("Thumbnail")}</div>
          <div class="aspect-video w-64 rounded border bg-slate-50"></div>
        </div>
      </div>
    `;
  }

  private readonly onSearchInput = debounce(400)(() => {
    const value = this.input?.value;

    if (!value) {
      return;
    }

    let error = "";

    if (value.startsWith(DEFAULT_PROTOCOL)) {
      this.searchQuery = value;

      this.combobox?.show();
    } else {
      if (value !== DEFAULT_PROTOCOL.slice(0, value.length))
        error = msg("Please enter a URL that starts with 'http' or 'https'");

      this.combobox?.hide();
    }

    this.input.setCustomValidity(error);
    this.input.setAttribute("help-text", error);
  });

  private async getPageUrls(
    {
      id,
      urlPrefix,
      page = 1,
      pageSize = 10,
    }: {
      id: string;
      urlPrefix?: string;
    } & APIPaginationQuery,
    signal?: AbortSignal,
  ) {
    const query = queryString.stringify({
      page,
      pageSize,
      urlPrefix,
    });
    return this.api.fetch<APIPaginatedList<Page>>(
      `/orgs/${this.orgId}/collections/${id}/urls?${query}`,
      { signal },
    );
  }
}
