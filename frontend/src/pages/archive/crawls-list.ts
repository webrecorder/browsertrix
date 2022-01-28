import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import humanizeDuration from "pretty-ms";
import debounce from "lodash/fp/debounce";
import flow from "lodash/fp/flow";
import map from "lodash/fp/map";
import orderBy from "lodash/fp/orderBy";
import Fuse from "fuse.js";

import { CopyButton } from "../../components/copy-button";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type Crawl = {
  id: string;
  user: string;
  aid: string;
  cid: string;
  schedule: string;
  manual: boolean;
  started: string; // UTC ISO date
  finished?: string; // UTC ISO date
  state: string; // "running" | "complete" | "failed" | "partial_complete"
  scale: number;
  stats: { done: number; found: number } | null;
  files?: { filename: string; hash: string; size: number }[];
  completions?: number;
};

type CrawlSearchResult = {
  item: Crawl;
};

const MIN_SEARCH_LENGTH = 2;
const sortableFieldLabels = {
  started_desc: msg("Newest"),
  started_asc: msg("Oldest"),
  state: msg("Status"),
  cid: msg("Crawl Template ID"),
};

function isRunning(crawl: Crawl) {
  return crawl.state === "running";
}

/**
 * Usage:
 * ```ts
 * <btrix-crawls-list></btrix-crawls-list>
 * ```
 */
@localized()
export class CrawlsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  /**
   * Fetch & refetch data when needed,
   * e.g. when component is visible
   **/
  @property({ type: Boolean })
  shouldFetch?: boolean;

  @state()
  private lastFetched?: number;

  @state()
  private crawls?: Crawl[];

  @state()
  private orderBy: {
    field: "started";
    direction: "asc" | "desc";
  } = {
    field: "started",
    direction: "desc",
  };

  @state()
  private filterBy: string = "";

  // For fuzzy search:
  private fuse = new Fuse([], { keys: ["cid"], shouldSort: false });

  private sortCrawls(crawls: CrawlSearchResult[]): CrawlSearchResult[] {
    return orderBy(({ item }) => item[this.orderBy.field])(
      this.orderBy.direction
    )(crawls) as CrawlSearchResult[];
  }

  protected updated(changedProperties: Map<string, any>) {
    if (this.shouldFetch && changedProperties.has("shouldFetch")) {
      this.fetchCrawls();
    }
  }

  render() {
    if (!this.crawls) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <main>
        <header class="pb-4">${this.renderControls()}</header>
        <section>${this.renderCrawlList()}</section>
        <footer class="mt-2">
          <span class="text-0-400 text-sm">
            ${this.lastFetched
              ? msg(html`Last updated:
                  <sl-format-date
                    date=${new Date(this.lastFetched).toString()}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    second="numeric"
                  ></sl-format-date>`)
              : ""}
          </span>
        </footer>
      </main>
    `;
  }

  private renderControls() {
    return html`
      <div class="grid grid-cols-2 gap-3 items-center">
        <div class="col-span-2 md:col-span-1">
          <sl-input
            class="w-full"
            slot="trigger"
            placeholder=${msg("Search by Crawl Template ID")}
            pill
            clearable
            @sl-input=${this.onSearchInput}
          >
            <sl-icon name="search" slot="prefix"></sl-icon>
          </sl-input>
        </div>
        <div class="col-span-2 md:col-span-1 flex items-center justify-end">
          <div class="whitespace-nowrap text-sm text-0-600 mr-2">
            ${msg("Sort by")}
          </div>
          <sl-dropdown
            placement="bottom-end"
            distance="4"
            @sl-select=${(e: any) => {
              const [field, direction] = e.detail.item.value.split("_");
              this.orderBy = {
                field: field,
                direction: direction,
              };
            }}
          >
            <sl-button slot="trigger" pill caret
              >${(sortableFieldLabels as any)[this.orderBy.field] ||
              sortableFieldLabels[
                `${this.orderBy.field}_${this.orderBy.direction}`
              ]}</sl-button
            >
            <sl-menu>
              ${Object.entries(sortableFieldLabels).map(
                ([value, label]) => html`
                  <sl-menu-item
                    value=${value}
                    ?checked=${value ===
                    `${this.orderBy.field}_${this.orderBy.direction}`}
                    >${label}</sl-menu-item
                  >
                `
              )}
            </sl-menu>
          </sl-dropdown>
          <sl-icon-button
            name="arrow-down-up"
            label=${msg("Reverse sort")}
            @click=${() => {
              this.orderBy = {
                ...this.orderBy,
                direction: this.orderBy.direction === "asc" ? "desc" : "asc",
              };
            }}
          ></sl-icon-button>
        </div>
      </div>
    `;
  }

  private renderCrawlList() {
    // Return search results if valid filter string is available,
    // otherwise format crawls list like search results
    const filterResults =
      this.filterBy.length >= MIN_SEARCH_LENGTH
        ? () => this.fuse.search(this.filterBy)
        : map((crawl) => ({ item: crawl }));

    return html`
      <ul class="border rounded">
        ${flow(
          filterResults,
          this.sortCrawls.bind(this),
          map(this.renderCrawlItem)
        )(this.crawls as any)}
      </ul>
    `;
  }

  private renderCrawlItem = ({ item: crawl }: CrawlSearchResult) => {
    return html`<li
      class="grid grid-cols-12 gap-4 md:gap-6 p-4 leading-none border-t first:border-t-0"
    >
      <div class="col-span-12 md:col-span-4">
        <div class="font-medium whitespace-nowrap truncate mb-1">
          ${crawl.id}
        </div>
        <div class="text-0-500 text-sm whitespace-nowrap truncate">
          <a
            class="hover:underline"
            href=${`/archives/${crawl.aid}/crawl-templates/${crawl.cid}`}
            @click=${this.navLink}
            >${crawl.cid}</a
          >
        </div>
      </div>
      <div class="col-span-6 md:col-span-3 flex items-start">
        <div class="mr-2">
          <!-- TODO switch case in lit template? needed for tailwindcss purging -->
          <span
            class="inline-block ${crawl.state === "failed"
              ? "text-red-500"
              : crawl.state === "complete"
              ? "text-emerald-500"
              : isRunning(crawl)
              ? "text-purple-500"
              : "text-zinc-300"}"
            style="font-size: 10px; vertical-align: 2px"
          >
            &#9679;
          </span>
        </div>
        <div>
          <div
            class="whitespace-nowrap mb-1 capitalize${crawl.state === "running"
              ? " motion-safe:animate-pulse"
              : ""}"
          >
            ${crawl.state.replace(/_/g, " ")}
          </div>
          <div class="text-0-500 text-sm whitespace-nowrap truncate">
            ${crawl.finished
              ? html`
                  <sl-relative-time
                    date=${`${crawl.finished}Z` /** Z for UTC */}
                    sync
                  ></sl-relative-time>
                `
              : humanizeDuration(
                  Date.now() - new Date(`${crawl.started}Z`).valueOf(),
                  {
                    secondsDecimalDigits: 0,
                  }
                )}
          </div>
        </div>
      </div>
      <div class="col-span-6 md:col-span-4">
        <div class="whitespace-nowrap truncate mb-1">
          ${crawl.manual
            ? msg(html`Manual start by <span>${crawl.user}</span>`)
            : msg(html`Scheduled run`)}
        </div>

        <div class="text-0-500 text-sm whitespace-nowrap truncate">
          <sl-format-date
            class="inline-block align-middle text-0-600"
            date=${`${crawl.started}Z` /** Z for UTC */}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="numeric"
            minute="numeric"
          ></sl-format-date>
        </div>
      </div>
      <div class="col-span-12 md:col-span-1 flex justify-end">
        <sl-dropdown>
          <sl-icon-button
            slot="trigger"
            name="three-dots"
            label="More"
            style="font-size: 1rem"
          ></sl-icon-button>

          <ul class="text-sm whitespace-nowrap" role="menu">
            ${isRunning(crawl)
              ? html`
                  <li
                    class="p-2 hover:bg-zinc-100 cursor-pointer"
                    role="menuitem"
                    @click=${(e: any) => {
                      e.stopPropagation();
                      this.cancel(crawl.id);
                      e.target.closest("sl-dropdown").hide();
                    }}
                  >
                    ${msg("Cancel immediately")}
                  </li>
                  <li
                    class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
                    role="menuitem"
                    @click=${(e: any) => {
                      e.stopPropagation();
                      this.stop(crawl.id);
                      e.target.closest("sl-dropdown").hide();
                    }}
                  >
                    ${msg("Stop gracefully")}
                  </li>
                `
              : ""}
            <li
              class="p-2 hover:bg-zinc-100 cursor-pointer"
              role="menuitem"
              @click=${(e: any) => {
                e.stopPropagation();
                CopyButton.copyToClipboard(crawl.cid);
                e.target.closest("sl-dropdown").hide();
              }}
            >
              ${msg("Copy Crawl Template ID")}
            </li>
          </ul>
        </sl-dropdown>
      </div>
    </li>`;
  };

  private onSearchInput = debounce(200)((e: any) => {
    this.filterBy = e.target.value;
  }) as any;

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(): Promise<void> {
    try {
      const { running, finished } = await this.getCrawls();

      this.crawls = [...running, ...finished];
      // Update search/filter collection
      this.fuse.setCollection(this.crawls as any);
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawls at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawls(): Promise<{ running: Crawl[]; finished: Crawl[] }> {
    // Mock to use in dev:
    // return import("../../__mocks__/api/archives/[id]/crawls").then(
    //   (module) => module.default
    // );

    const data = await this.apiFetch(
      `/archives/${this.archiveId}/crawls`,
      this.authState!
    );

    this.lastFetched = Date.now();

    return data;
  }

  private async cancel(id: string) {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${id}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.canceled === true) {
        this.fetchCrawls();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't cancel crawl."),
          type: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop(id: string) {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${id}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.stopped_gracefully === true) {
        this.fetchCrawls();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't stop crawl."),
          type: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
