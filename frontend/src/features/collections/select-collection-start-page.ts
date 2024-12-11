import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlInput } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import sortBy from "lodash/fp/sortBy";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Combobox } from "@/components/ui/combobox";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { UnderlyingFunction } from "@/types/utils";

type Snapshot = {
  pageId: string;
  ts: string;
  status: number;
};

type Page = {
  url: string;
  count: number;
  snapshots: Snapshot[];
};

const DEFAULT_PROTOCOL = "http";

const sortByTs = sortBy<Snapshot>("ts");

@localized()
@customElement("btrix-select-collection-start-page")
export class SelectCollectionStartPage extends BtrixElement {
  @property({ type: String })
  collectionId?: string;

  @state()
  private searchQuery = "";

  @state()
  private selectedPage?: Page;

  @state()
  private selectedSnapshot?: Snapshot;

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
    return html` ${this.renderPageSearch()} ${this.renderSelectedItem()} `;
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
                  if (this.input) {
                    this.input.value = item.url;
                  }

                  this.selectedPage = {
                    ...item,
                    // TODO check if backend can sort
                    snapshots: sortByTs(item.snapshots).reverse(),
                  };
                  this.selectedSnapshot = this.selectedPage.snapshots[0];

                  console.log(
                    `/replay/w/${this.selectedSnapshot.pageId}/${this.selectedSnapshot.ts.split(".")[0].replace(/\D/g, "")}id_/urn:thumbnail:${item.url}`,
                  );

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
        <sl-select
          class="flex-1"
          label=${msg("Snapshot")}
          value=${this.selectedSnapshot?.pageId || ""}
          ?disabled=${!this.selectedPage}
        >
          ${when(
            this.selectedSnapshot,
            (snapshot) => html`
              <btrix-badge
                slot="suffix"
                variant=${snapshot.status < 300 ? "success" : "danger"}
                >${snapshot.status}</btrix-badge
              >
            `,
          )}
          ${when(this.selectedPage, (item) =>
            item.snapshots.map(
              ({ pageId, ts, status }) => html`
                <sl-option value=${pageId}>
                  ${this.localize.date(ts)}
                  <btrix-badge
                    slot="suffix"
                    variant=${status < 300 ? "success" : "danger"}
                    >${status}</btrix-badge
                  >
                </sl-option>
              `,
            ),
          )}
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

    if (value.startsWith(DEFAULT_PROTOCOL)) {
      this.combobox?.show();
    } else {
      if (value !== DEFAULT_PROTOCOL.slice(0, value.length)) {
        this.input.value = `https://${value}`;

        this.combobox?.show();
      }
    }

    this.searchQuery = this.input.value;
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
