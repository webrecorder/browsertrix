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
import { isEqual } from "lodash";
import debounce from "lodash/fp/debounce";
import filter from "lodash/fp/filter";
import flow from "lodash/fp/flow";
import orderBy from "lodash/fp/orderBy";
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

export type SnapshotItem = Snapshot & { url: string };

export type SelectSnapshotDetail = {
  item: SnapshotItem | null;
};

const DEFAULT_PROTOCOL = "http";

// TODO Check if backend can sort and filter snapshots instead
const sortByTs = flow(
  filter<Snapshot>(({ status }) => status < 300),
  orderBy<Snapshot>("ts")("desc"),
) as (snapshots: Snapshot[]) => Snapshot[];

/**
 * @fires btrix-select
 */
@localized()
@customElement("btrix-select-collection-page")
export class SelectCollectionPage extends BtrixElement {
  @property({ type: String })
  collectionId?: string;

  @property({ type: Object })
  collection?: Collection;

  @property({ type: String })
  mode: "homepage" | "thumbnail" = "homepage";

  @state()
  private searchQuery = "";

  @state()
  private selectedPage?: Page;

  @property({ type: Object, hasChanged: (a, b) => !isEqual(a, b) })
  public selectedSnapshot?: Snapshot;

  @state()
  private pageUrlError?: string;

  @query("btrix-combobox")
  private readonly combobox?: Combobox | null;

  @query("#pageUrlInput")
  readonly input?: SlInput | null;

  // not actually a nodejs timeout, but since node types are install this is what typescript likes
  timer?: NodeJS.Timeout;

  private get url() {
    return this.mode === "homepage"
      ? this.collection?.homeUrl
      : this.collection?.thumbnailSource?.url;
  }

  private get ts() {
    return this.mode === "homepage"
      ? this.collection?.homeUrlTs
      : this.collection?.thumbnailSource?.urlTs;
  }

  public get page() {
    return this.selectedPage;
  }

  public get snapshot() {
    return this.selectedSnapshot;
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("collection") && this.collection) {
      void this.initSelection(this.collection);
    }
  }

  public async resetFormState() {
    if (!this.collection) return;
    await this.initSelection(this.collection);
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

  private async initSelection(collection: Collection) {
    if (!this.url && collection.pageCount !== 1) {
      return;
    }

    const pageUrls = await this.getPageUrls({
      id: collection.id,
      urlPrefix: this.url || "",
      pageSize: 1,
    });

    if (!pageUrls.total) {
      return;
    }

    const startPage = pageUrls.items[0];

    if (this.input) {
      this.input.value = this.url ?? startPage.url;
    }

    this.selectedPage = this.formatPage(startPage);

    const homeTs = this.ts;

    this.selectedSnapshot = homeTs
      ? this.selectedPage.snapshots.find(({ ts }) => ts === homeTs)
      : this.selectedPage.snapshots[0];
  }

  /**
   * Format page for display
   * @TODO Check if backend can sort and filter snapshots instead
   */
  private formatPage(page: Page) {
    return {
      ...page,
      snapshots: sortByTs(page.snapshots),
    };
  }

  private readonly searchResults = new Task(this, {
    task: async ([searchValue], { signal }) => {
      const pageUrls = await this.getPageUrls(
        {
          id: this.collectionId!,
          urlPrefix: searchValue,
        },
        signal,
      );

      return pageUrls;
    },
    args: () => [this.searchQuery] as const,
  });

  render() {
    return html`
      <div class="flex flex-1 flex-col justify-between gap-3">
        ${this.renderPageSearch()}
        <sl-select
          label=${msg("Page Timestamp")}
          placeholder=${this.selectedPage
            ? msg("Choose a timestamp")
            : msg("Enter a page URL to choose timestamp")}
          value=${this.selectedSnapshot?.pageId || ""}
          ?required=${this.selectedPage && !this.selectedSnapshot}
          ?disabled=${!this.selectedPage}
          size=${this.mode === "thumbnail" ? "small" : "medium"}
          hoist
          @sl-change=${async (e: SlChangeEvent) => {
            const { value } = e.currentTarget as SlSelect;

            await this.updateComplete;

            this.selectedSnapshot = this.selectedPage?.snapshots.find(
              ({ pageId }) => pageId === value,
            );
          }}
        >
          ${when(this.selectedPage, this.renderSnapshotOptions)}
        </sl-select>
      </div>
    `;
  }

  private readonly renderSnapshotOptions = ({ snapshots }: Page) => {
    return html`
      ${snapshots.map(
        ({ pageId, ts }) => html`
          <sl-option value=${pageId}> ${this.localize.date(ts)} </sl-option>
        `,
      )}
    `;
  };

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
          // Because there are situations where the input might be blurred and
          // then immediate refocused (e.g. clicking on the thumbnail preview in
          // the collection settings dialog), a delay here prevents issues from
          // the order of events being wrong — for some reason sometimes the
          // blur event occurs after the focus event. This also prevents the
          // combobox from disappearing and then appearing again, instead it
          // just stays open.
          this.timer = setTimeout(() => {
            this.combobox?.hide();
          }, 150);
        }}
      >
        <sl-input
          id="pageUrlInput"
          label=${msg("Page URL")}
          placeholder=${msg("Start typing a URL...")}
          ?clearable=${this.collection && this.collection.pageCount > 1}
          ?disabled=${!this.collection?.pageCount}
          size=${this.mode === "thumbnail" ? "small" : "medium"}
          autocomplete="off"
          @sl-focus=${async () => {
            if (this.timer) clearTimeout(this.timer);
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
            <slot name="prefix">
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
            </slot>
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
      this.selectedPage = this.formatPage(this.searchResults.value.items[0]);
      this.selectedSnapshot = this.selectedPage.snapshots[0];
    }
  };

  private renderSearchResults() {
    return this.searchResults.render({
      pending: () =>
        this.renderItems(
          // Render previous value so that dropdown doesn't shift while typing
          this.searchResults.value,
        ),
      complete: this.renderItems,
    });
  }

  private readonly renderItems = (
    results: SelectCollectionPage["searchResults"]["value"],
  ) => {
    if (!results) return;

    const { items } = results;

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

              this.selectedPage = this.formatPage(item);

              this.combobox?.hide();

              this.selectedSnapshot = this.selectedPage.snapshots[0];
            }}
            >${item.url}
          </sl-menu-item>
        `;
      })}
    `;
  };

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
