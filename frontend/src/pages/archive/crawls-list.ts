import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import debounce from "lodash/fp/debounce";
import flow from "lodash/fp/flow";
import map from "lodash/fp/map";
import orderBy from "lodash/fp/orderBy";
import Fuse from "fuse.js";

import { CopyButton } from "../../components/copy-button";
import { RelativeDuration } from "../../components/relative-duration";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, CrawlTemplate } from "./types";

type CrawlSearchResult = {
  item: Crawl;
};

const POLL_INTERVAL_SECONDS = 10;
const MIN_SEARCH_LENGTH = 2;
const sortableFieldLabels = {
  started_desc: msg("Newest"),
  started_asc: msg("Oldest"),
  finished_desc: msg("Recently Updated"),
  finished_asc: msg("Oldest Finished"),
  state: msg("Status"),
  configName: msg("Crawl Template Name"),
  cid: msg("Crawl Template ID"),
  fileSize_asc: msg("Smallest Files"),
  fileSize_desc: msg("Largest Files"),
};

function isRunning(crawl: Crawl) {
  return crawl.state === "running" || crawl.state === "starting";
}

/**
 * Usage:
 * ```ts
 * <btrix-crawls-list crawlsBaseUrl="/crawls"></btrix-crawls-list>
 * ```
 */
@localized()
export class CrawlsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  // e.g. `/archive/${this.archiveId}/crawls`
  @property({ type: String })
  crawlsBaseUrl!: string;

  // e.g. `/archive/${this.archiveId}/crawls`
  @property({ type: String })
  crawlsAPIBaseUrl?: string;

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
  private fuse = new Fuse([], {
    keys: ["cid", "configName"],
    shouldSort: false,
  });

  // For long polling:
  private timerId?: number;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();

  private sortCrawls(crawls: CrawlSearchResult[]): CrawlSearchResult[] {
    return orderBy(({ item }) => item[this.orderBy.field])(
      this.orderBy.direction
    )(crawls) as CrawlSearchResult[];
  }

  protected updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("shouldFetch")) {
      if (this.shouldFetch) {
        if (!this.crawlsBaseUrl) {
          throw new Error("Crawls base URL not defined");
        }

        this.fetchCrawls();
      } else {
        this.stopPollTimer();
      }
    }
  }

  disconnectedCallback(): void {
    this.stopPollTimer();
    super.disconnectedCallback();
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
        <header class="mb-4">${this.renderControls()}</header>
        <section>
          ${this.crawls.length
            ? this.renderCrawlList()
            : html`
                <div class="border-t border-b py-5">
                  <p class="text-center text-0-500">${msg("No crawls yet.")}</p>
                </div>
              `}
        </section>
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
            size="small"
            class="w-full"
            slot="trigger"
            placeholder=${msg("Search by Crawl Template name or ID")}
            clearable
            ?disabled=${!this.crawls?.length}
            @sl-input=${this.onSearchInput}
          >
            <sl-icon name="search" slot="prefix"></sl-icon>
          </sl-input>
        </div>
        <div class="col-span-12 md:col-span-1 flex items-center justify-end">
          <div class="whitespace-nowrap text-sm text-0-500 mr-2">
            ${msg("Sort By")}
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
            <sl-button
              slot="trigger"
              size="small"
              pill
              caret
              ?disabled=${!this.crawls?.length}
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
      <ul class="border rounded text-sm md:text-base">
        ${flow(
          filterResults,
          this.sortCrawls.bind(this),
          map(this.renderCrawlItem)
        )(this.crawls as any)}
      </ul>
    `;
  }

  private renderCrawlItem = ({ item: crawl }: CrawlSearchResult) => {
    return html`<li class="border-t first:border-t-0">
      <a
        href=${`${this.crawlsBaseUrl}/crawl/${crawl.id}`}
        class="grid grid-cols-12 gap-4 p-4 leading-none hover:bg-zinc-50 hover:text-primary transition-colors"
        title=${crawl.configName}
        @click=${this.navLink}
      >
        <div class="col-span-11 md:col-span-5">
          <div class="font-medium mb-1">${crawl.configName || crawl.cid}</div>
          <div class="text-0-700 text-sm whitespace-nowrap truncate">
            <sl-format-date
              date=${`${crawl.started}Z` /** Z for UTC */}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="numeric"
              minute="numeric"
            ></sl-format-date>
          </div>
        </div>
        <div class="md:order-last col-span-1 flex justify-end">
          <sl-dropdown @click=${(e: Event) => e.preventDefault()}>
            <sl-icon-button
              slot="trigger"
              name="three-dots"
              label=${msg("More")}
              style="font-size: 1rem"
            ></sl-icon-button>

            <ul class="text-sm text-0-800 whitespace-nowrap" role="menu">
              ${isRunning(crawl)
                ? html`
                    <li
                      class="p-2 hover:bg-zinc-100 cursor-pointer"
                      role="menuitem"
                      @click=${(e: any) => {
                        this.stop(crawl);
                        e.target.closest("sl-dropdown").hide();
                      }}
                    >
                      <sl-icon
                        class="inline-block align-middle"
                        name="slash-circle"
                      ></sl-icon>
                      <span class="inline-block align-middle">
                        ${msg("Stop gracefully")}
                      </span>
                    </li>
                    <li
                      class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
                      role="menuitem"
                      @click=${(e: any) => {
                        this.cancel(crawl);
                        e.target.closest("sl-dropdown").hide();
                      }}
                    >
                      <sl-icon
                        class="inline-block align-middle"
                        name="trash"
                      ></sl-icon>
                      <span class="inline-block align-middle">
                        ${msg("Cancel immediately")}
                      </span>
                    </li>
                    <hr />
                  `
                : html`
                    <li
                      class="p-2 text-purple-500 hover:bg-purple-500 hover:text-white cursor-pointer"
                      role="menuitem"
                      @click=${(e: any) => {
                        this.runNow(crawl);
                        e.target.closest("sl-dropdown").hide();
                      }}
                    >
                      <sl-icon
                        class="inline-block align-middle"
                        name="arrow-clockwise"
                      ></sl-icon>
                      <span class="inline-block align-middle">
                        ${msg("Re-run crawl")}
                      </span>
                    </li>
                    <hr />
                  `}
              <li
                class="p-2 hover:bg-zinc-100 cursor-pointer"
                role="menuitem"
                @click=${(e: any) => {
                  CopyButton.copyToClipboard(crawl.id);
                  e.target.closest("sl-dropdown").hide();
                }}
              >
                ${msg("Copy Crawl ID")}
              </li>
              <li
                class="p-2 hover:bg-zinc-100 cursor-pointer"
                role="menuitem"
                @click=${(e: any) => {
                  CopyButton.copyToClipboard(crawl.cid);
                  e.target.closest("sl-dropdown").hide();
                }}
              >
                ${msg("Copy Crawl Template ID")}
              </li>
              <li
                class="p-2 hover:bg-zinc-100 cursor-pointer"
                role="menuitem"
                @click=${(e: any) => {
                  this.navTo(
                    `/archives/${crawl.aid}/crawl-templates/config/${crawl.cid}`
                  );
                }}
              >
                ${msg("View Crawl Template")}
              </li>
            </ul>
          </sl-dropdown>
        </div>
        <div class="col-span-12 md:col-span-2 flex items-start">
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
              class="whitespace-nowrap mb-1 capitalize${isRunning(crawl)
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
                    ></sl-relative-time>
                  `
                : html`<btrix-relative-duration
                    value=${`${crawl.started}Z`}
                  ></btrix-relative-duration>`}
            </div>
          </div>
        </div>
        <div class="col-span-6 md:col-span-2">
          ${crawl.finished
            ? html`
                <div class="whitespace-nowrap truncate text-sm">
                  <span class="font-mono text-0-800 tracking-tighter">
                    <sl-format-bytes
                      value=${crawl.fileSize || 0}
                      lang=${/* TODO localize: */ "en"}
                    ></sl-format-bytes>
                  </span>
                  <span class="text-0-500">
                    (${crawl.fileCount === 1
                      ? msg(str`${crawl.fileCount} file`)
                      : msg(str`${crawl.fileCount} files`)})
                  </span>
                </div>
                <div class="text-0-500 text-sm whitespace-nowrap truncate">
                  ${msg(
                    str`in ${RelativeDuration.humanize(
                      new Date(`${crawl.finished}Z`).valueOf() -
                        new Date(`${crawl.started}Z`).valueOf()
                    )}`
                  )}
                </div>
              `
            : crawl.stats
            ? html`
                <div
                  class="whitespace-nowrap truncate text-sm text-purple-600 font-mono tracking-tighter"
                >
                  ${this.numberFormatter.format(+crawl.stats.done)}
                  <span class="text-0-400">/</span>
                  ${this.numberFormatter.format(+crawl.stats.found)}
                </div>
                <div class="text-0-500 text-sm whitespace-nowrap truncate">
                  ${msg("pages crawled")}
                </div>
              `
            : ""}
        </div>
        <div class="col-span-6 md:col-span-2">
          ${crawl.manual
            ? html`
                <div class="whitespace-nowrap truncate mb-1">
                  <span
                    class="bg-fuchsia-50 text-fuchsia-700 text-sm rounded px-1 leading-4"
                    >${msg("Manual Start")}</span
                  >
                </div>
                <div class="ml-1 text-0-500 text-sm whitespace-nowrap truncate">
                  ${msg(str`by ${crawl.userName || crawl.userid}`)}
                </div>
              `
            : html`
                <div class="whitespace-nowrap truncate">
                  <span
                    class="bg-teal-50 text-teal-700 text-sm rounded px-1 leading-4"
                    >${msg("Scheduled Run")}</span
                  >
                </div>
              `}
        </div>
      </a>
    </li>`;
  };

  private onSearchInput = debounce(200)((e: any) => {
    this.filterBy = e.target.value;
  }) as any;

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(): Promise<void> {
    if (!this.shouldFetch) return;

    try {
      const { crawls } = await this.getCrawls();

      this.crawls = crawls;
      // Update search/filter collection
      this.fuse.setCollection(this.crawls as any);

      // Restart timer for next poll
      this.stopPollTimer();
      this.timerId = window.setTimeout(() => {
        this.fetchCrawls();
      }, 1000 * POLL_INTERVAL_SECONDS);
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawls at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private stopPollTimer() {
    window.clearTimeout(this.timerId);
  }

  private async getCrawls(): Promise<{ crawls: Crawl[] }> {
    // Mock to use in dev:
    // return import("../../__mocks__/api/archives/[id]/crawls").then(
    //   (module) => module.default
    // );

    const data = await this.apiFetch(
      this.crawlsAPIBaseUrl || this.crawlsBaseUrl,
      this.authState!
    );

    this.lastFetched = Date.now();

    return data;
  }

  private async cancel(crawl: Crawl) {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${crawl.aid}/crawls/${crawl.id}/cancel`,
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

  private async stop(crawl: Crawl) {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${crawl.aid}/crawls/${crawl.id}/stop`,
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

  private async runNow(crawl: Crawl) {
    try {
      // Get crawl config to check if crawl is already running
      const crawlTemplate = await this.getCrawlTemplate(crawl);

      if (crawlTemplate.currCrawlId) {
        this.notify({
          message: msg(
            html`Crawl of <strong>${crawl.configName}</strong> is already
              running.
              <br />
              <a
                class="underline hover:no-underline"
                href="/archives/${crawl.aid}/crawls/crawl/${crawlTemplate.currCrawlId}"
                @click=${this.navLink.bind(this)}
                >View crawl</a
              >`
          ),
          type: "warning",
          icon: "exclamation-triangle",
        });

        return;
      }

      const data = await this.apiFetch(
        `/archives/${crawl.aid}/crawlconfigs/${crawl.cid}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.started) {
        this.fetchCrawls();
      }

      this.notify({
        message: msg(
          html`Started crawl from <strong>${crawl.configName}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/archives/${crawl.aid}/crawls/crawl/${data.started}#watch"
              @click=${this.navLink.bind(this)}
              >Watch crawl</a
            >`
        ),
        type: "success",
        icon: "check2-circle",
        duration: 8000,
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't run crawl at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getCrawlTemplate(crawl: Crawl): Promise<CrawlTemplate> {
    const data: CrawlTemplate = await this.apiFetch(
      `/archives/${crawl.aid}/crawlconfigs/${crawl.cid}`,
      this.authState!
    );

    return data;
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
