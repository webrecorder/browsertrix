import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlInput,
  SlSelect,
} from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
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

export type SelectSnapshotDetail = {
  item: Snapshot & { url: string };
};

const DEFAULT_PROTOCOL = "http";

const sortByTs = sortBy<Snapshot>("ts");

/**
 * @fires btrix-select
 */
@localized()
@customElement("btrix-select-collection-start-page")
export class SelectCollectionStartPage extends BtrixElement {
  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  homeUrl?: string | null = null;

  @property({ type: String })
  homeTs?: string | null = null;

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

  public get page() {
    return this.selectedPage;
  }

  public get snapshot() {
    return this.selectedSnapshot;
  }

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("homeUrl") && this.homeUrl) {
      if (this.input) {
        this.input.value = this.homeUrl;
      }
      this.searchQuery = this.homeUrl;
      void this.initSelection();
    }
  }

  private async initSelection() {
    await this.updateComplete;
    await this.searchResults.taskComplete;

    if (this.homeUrl && this.searchResults.value) {
      this.selectedPage = this.searchResults.value.items.find(
        ({ url }) => url === this.homeUrl,
      );

      if (this.selectedPage && this.homeTs) {
        this.selectedSnapshot = this.selectedPage.snapshots.find(
          ({ ts }) => ts === this.homeTs,
        );
      }
    }
  }

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
      <div class="flex flex-1 flex-col justify-between gap-3">
        ${this.renderPageSearch()}
        <sl-select
          label=${msg("Snapshot")}
          placeholder="--"
          value=${this.selectedSnapshot?.pageId || ""}
          ?disabled=${!this.selectedPage}
          @sl-change=${async (e: SlChangeEvent) => {
            const { value } = e.currentTarget as SlSelect;

            await this.updateComplete;

            this.selectedSnapshot = this.selectedPage?.snapshots.find(
              ({ pageId }) => pageId === value,
            );

            if (this.selectedSnapshot) {
              this.dispatchEvent(
                new CustomEvent<SelectSnapshotDetail>("btrix-select", {
                  detail: {
                    item: {
                      url: this.selectedPage!.url,
                      ...this.selectedSnapshot,
                    },
                  },
                }),
              );
            }
          }}
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
      </div>
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
          placeholder=${msg("Start typing a URL...")}
          clearable
          @sl-focus=${() => {
            this.combobox?.show();
          }}
          @sl-clear=${async () => {
            this.searchQuery = "";
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
              ${msg("No matching pages found.")}
            </sl-menu-item>
          `;
        }

        return html`
          ${items.map((item: Page) => {
            return html`
              <sl-menu-item
                slot="menu-item"
                @click=${async () => {
                  if (this.input) {
                    this.input.value = item.url;
                  }

                  this.selectedPage = {
                    ...item,
                    // TODO check if backend can sort
                    snapshots: sortByTs(item.snapshots).reverse(),
                  };

                  this.combobox?.hide();

                  this.selectedSnapshot = this.selectedPage.snapshots[0];

                  await this.updateComplete;
                  this.dispatchEvent(
                    new CustomEvent<SelectSnapshotDetail>("btrix-select", {
                      detail: {
                        item: {
                          url: this.selectedPage.url,
                          ...this.selectedSnapshot,
                        },
                      },
                    }),
                  );
                }}
                >${item.url}
              </sl-menu-item>
            `;
          })}
        `;
      },
    });
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
      pageSize = 5,
    }: {
      id: string;
      urlPrefix?: string;
    } & APIPaginationQuery,
    signal?: AbortSignal,
  ) {
    const query = queryString.stringify({
      page,
      pageSize,
      urlPrefix: urlPrefix ? window.encodeURIComponent(urlPrefix) : undefined,
    });
    return this.api.fetch<APIPaginatedList<Page>>(
      `/orgs/${this.orgId}/collections/${id}/urls?${query}`,
      { signal },
    );
  }
}
