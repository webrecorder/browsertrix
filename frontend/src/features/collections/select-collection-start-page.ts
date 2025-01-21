import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlInput,
  SlSelect,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import sortBy from "lodash/fp/sortBy";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Combobox } from "@/components/ui/combobox";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection } from "@/types/collection";
import type { UnderlyingFunction } from "@/types/utils";
import { tw } from "@/utils/tailwind";

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

type SnapshotItem = Snapshot & { url: string };

export type SelectSnapshotDetail = {
  item: SnapshotItem | null;
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

  @property({ type: Object })
  collection?: Collection;

  @state()
  private searchQuery = "";

  @state()
  private selectedPage?: Page;

  @state()
  public selectedSnapshot?: Snapshot;

  @state()
  private pageUrlError?: string;

  @query("btrix-combobox")
  private readonly combobox?: Combobox | null;

  @query("#pageUrlInput")
  private readonly input?: SlInput | null;

  public get page() {
    return this.selectedPage;
  }

  public get snapshot() {
    return this.selectedSnapshot;
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("collection") && this.collection) {
      if (this.input && this.collection.homeUrl) {
        this.input.value = this.collection.homeUrl;
        this.searchQuery = this.collection.homeUrl;
      }
      void this.initSelection();
    }
  }

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("selectedSnapshot")) {
      this.dispatchEvent(
        new CustomEvent<SelectSnapshotDetail>("btrix-select", {
          detail: {
            item: this.selectedPage?.url
              ? ({
                  url: this.selectedPage.url,
                  ...this.selectedSnapshot,
                } as SnapshotItem)
              : null,
          },
        }),
      );
    }
  }

  private async initSelection() {
    await this.updateComplete;
    await this.searchResults.taskComplete;

    const homeUrl = this.collection?.homeUrl;
    const homeTs = this.collection?.homeUrlTs;

    if (homeUrl && this.searchResults.value) {
      this.selectedPage = this.searchResults.value.items.find(
        ({ url }) => url === homeUrl,
      );

      if (this.selectedPage && homeTs) {
        this.selectedSnapshot = this.selectedPage.snapshots.find(
          ({ ts }) => ts === homeTs,
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
          placeholder=${this.selectedPage
            ? msg("Choose a snapshot")
            : msg("Enter a page URL to choose snapshot")}
          value=${this.selectedSnapshot?.pageId || ""}
          ?required=${this.selectedPage && !this.selectedSnapshot}
          ?disabled=${!this.selectedPage}
          @sl-change=${async (e: SlChangeEvent) => {
            const { value } = e.currentTarget as SlSelect;

            await this.updateComplete;

            this.selectedSnapshot = this.selectedPage?.snapshots.find(
              ({ pageId }) => pageId === value,
            );
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
    let prefix: {
      icon: string;
      tooltip: string;
      className?: string;
    } = {
      icon: "search",
      tooltip: msg("Search for a page in this collection"),
    };

    if (this.pageUrlError) {
      prefix = {
        icon: "exclamation-lg",
        tooltip: this.pageUrlError,
        className: tw`text-danger`,
      };
    } else if (this.selectedPage) {
      prefix = {
        icon: "check-lg",
        tooltip: msg("Page exists in collection"),
        className: tw`text-success`,
      };
    }

    return html`
      <btrix-combobox
        @request-close=${() => {
          this.combobox?.hide();
        }}
      >
        <sl-input
          id="pageUrlInput"
          label=${msg("Page URL")}
          placeholder=${msg("Start typing a URL...")}
          clearable
          @sl-focus=${() => {
            this.resetInputValidity();
            this.combobox?.show();
          }}
          @sl-clear=${async () => {
            this.resetInputValidity();

            this.searchQuery = "";
            this.selectedPage = undefined;
            this.selectedSnapshot = undefined;
          }}
          @sl-input=${this.onSearchInput as UnderlyingFunction<
            typeof this.onSearchInput
          >}
          @sl-blur=${this.pageUrlOnBlur}
        >
          <div slot="prefix" class="inline-flex items-center">
            <sl-tooltip
              hoist
              content=${prefix.tooltip}
              placement="bottom-start"
            >
              <sl-icon
                name=${prefix.icon}
                class=${clsx(tw`size-4 text-base`, prefix.className)}
              ></sl-icon>
            </sl-tooltip>
          </div>
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private resetInputValidity() {
    this.pageUrlError = undefined;
    this.input?.setCustomValidity("");
  }

  private readonly pageUrlOnBlur = async () => {
    if (!this.searchQuery) return;

    if (this.selectedPage) {
      // Ensure input value matches the URL, e.g. if the user pressed
      // backspace on an existing URL
      if (this.searchQuery !== this.selectedPage.url && this.input) {
        this.input.value = this.selectedPage.url;
      }

      return;
    }

    await this.searchResults.taskComplete;

    const results = this.searchResults.value;

    if (!results) return;

    if (results.total === 0) {
      if (this.input) {
        this.pageUrlError = msg(
          "Page not found in collection. Please check the URL and try again",
        );
        this.input.setCustomValidity(this.pageUrlError);
      }

      // Clear selection
      this.selectedPage = undefined;
      this.selectedSnapshot = undefined;
    } else if (results.total === 1) {
      // Choose only option, e.g. for copy-paste
      this.selectedPage = this.searchResults.value.items[0];
      this.selectedSnapshot = this.selectedPage.snapshots[0];
    }
  };

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
              ${msg("No matching page found.")}
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
