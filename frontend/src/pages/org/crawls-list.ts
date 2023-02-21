import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import type {
  SlCheckbox,
  SlMenuItem,
  SlSelect,
} from "@shoelace-style/shoelace";
import debounce from "lodash/fp/debounce";
import flow from "lodash/fp/flow";
import map from "lodash/fp/map";
import orderBy from "lodash/fp/orderBy";
import Fuse from "fuse.js";

import { CopyButton } from "../../components/copy-button";
import { RelativeDuration } from "../../components/relative-duration";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type {
  Crawl,
  CrawlState,
  CrawlConfig,
  InitialCrawlConfig,
} from "./types";

type CrawlSearchResult = {
  item: Crawl;
};
type SortField = "started" | "finished" | "configName" | "fileSize";
type SortDirection = "asc" | "desc";

const POLL_INTERVAL_SECONDS = 10;
const MIN_SEARCH_LENGTH = 2;
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  started: {
    label: msg("Date Created"),
    defaultDirection: "desc",
  },
  finished: {
    label: msg("Date Completed"),
    defaultDirection: "desc",
  },
  configName: {
    label: msg("Crawl Name"),
    defaultDirection: "desc",
  },
  fileSize: {
    label: msg("File Size"),
    defaultDirection: "desc",
  },
};

const activeCrawlStates: CrawlState[] = ["starting", "running", "stopping"];
const inactiveCrawlStates: CrawlState[] = [
  "complete",
  "canceled",
  "partial_complete",
  "timed_out",
  "failed",
];
const crawlState: Record<CrawlState, { label: string; icon?: TemplateResult }> =
  {
    starting: {
      label: msg("Starting"),
      icon: html``,
    },
    running: {
      label: msg("Running"),
      icon: html``,
    },
    complete: {
      label: msg("Completed"),
      icon: html``,
    },
    failed: {
      label: msg("Failed"),
      icon: html``,
    },
    partial_complete: {
      label: msg("Partial Complete"),
      icon: html``,
    },
    timed_out: {
      label: msg("Timed Out"),
      icon: html``,
    },
    stopping: {
      label: msg("Stopping"),
      icon: html``,
    },
    canceled: {
      label: msg("Canceled"),
      icon: html``,
    },
  };

function isActive(crawl: Crawl) {
  return activeCrawlStates.includes(crawl.state);
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

  @property({ type: String })
  userId!: string;

  // e.g. `/org/${this.orgId}/crawls`
  @property({ type: String })
  crawlsBaseUrl!: string;

  // e.g. `/org/${this.orgId}/crawls`
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
    field: SortField;
    direction: SortDirection;
  } = {
    field: "started",
    direction: "desc",
  };

  @state()
  private filterByCurrentUser = true;

  @state()
  private filterByState: CrawlState[] = [];

  @state()
  private searchBy: string = "";

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["cid", "configName"],
    shouldSort: false,
    threshold: 0.4, // stricter; default is 0.6
  });

  private timerId?: number;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();

  private filterCrawls = (crawls: Crawl[]) =>
    this.filterByState.length
      ? crawls.filter((crawl) =>
          this.filterByState.some((state) => crawl.state === state)
        )
      : crawls;

  private sortCrawls = (
    crawlsResults: CrawlSearchResult[]
  ): CrawlSearchResult[] =>
    orderBy(({ item }) => item[this.orderBy.field])(this.orderBy.direction)(
      crawlsResults
    ) as CrawlSearchResult[];

  protected willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("shouldFetch") ||
      changedProperties.get("crawlsBaseUrl") ||
      changedProperties.get("crawlsAPIBaseUrl") ||
      changedProperties.has("filterByCurrentUser")
    ) {
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
        class="w-full flex items-center justify-center my-24 text-3xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <main>
        <header
          class="sticky z-10 mb-3 top-2 p-2 bg-neutral-50 border rounded-lg"
        >
          ${this.renderControls()}
        </header>
        <section>
          ${this.crawls.length
            ? this.renderCrawlList()
            : html`
                <div class="border-t border-b py-5">
                  <p class="text-center text-neutral-500">
                    ${msg("No crawls yet.")}
                  </p>
                </div>
              `}
        </section>
        <footer class="mt-2">
          <span class="text-0-400 text-xs">
            ${this.lastFetched
              ? msg(html`Last updated:
                  <sl-format-date
                    date="${new Date(this.lastFetched).toString()}"
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
      <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,100%)_fit-content(100%)_fit-content(100%)] gap-x-2 gap-y-2 items-center"
      >
        <div class="col-span-1 md:col-span-2 lg:col-span-1">
          <sl-input
            class="w-full"
            slot="trigger"
            placeholder=${msg("Search by Crawl Config name or ID")}
            clearable
            ?disabled=${!this.crawls?.length}
            value=${this.searchBy}
            @sl-clear=${() => {
              this.onSearchInput.cancel();
              this.searchBy = "";
            }}
            @sl-input=${this.onSearchInput}
          >
            <sl-icon name="search" slot="prefix"></sl-icon>
          </sl-input>
        </div>
        <div class="flex items-center">
          <div class="text-neutral-500 mx-2">${msg("View:")}</div>
          <sl-select
            class="flex-1 md:min-w-[14.5rem]"
            placement="bottom-end"
            distance="4"
            size="small"
            pill
            .value=${this.filterByState}
            multiple
            max-tags-visible="1"
            placeholder=${msg("All Crawls")}
            @sl-change=${(e: CustomEvent) => {
              const value = (e.target as SlSelect).value as CrawlState[];
              this.filterByState = value;
            }}
          >
            ${activeCrawlStates.map(
              (state) => html`
                <sl-menu-item value=${state}>
                  ${crawlState[state].label}</sl-menu-item
                >
              `
            )}
            <sl-divider></sl-divider>
            ${inactiveCrawlStates.map(
              (state) => html`
                <sl-menu-item value=${state}>
                  ${crawlState[state].label}</sl-menu-item
                >
              `
            )}
          </sl-select>
        </div>

        <div class="flex items-center">
          <div class="whitespace-nowrap text-neutral-500 mx-2">
            ${msg("Sort by:")}
          </div>
          <div class="grow flex">
            <sl-select
              class="flex-1 md:min-w-[9.2rem]"
              placement="bottom-end"
              distance="4"
              size="small"
              pill
              value=${this.orderBy.field}
              @sl-select=${(e: any) => {
                const field = e.detail.item.value as SortField;
                this.orderBy = {
                  field: field,
                  direction:
                    sortableFields[field].defaultDirection ||
                    this.orderBy.direction,
                };
              }}
            >
              ${Object.entries(sortableFields).map(
                ([value, { label }]) => html`
                  <sl-menu-item value=${value}>${label}</sl-menu-item>
                `
              )}
            </sl-select>
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
      </div>

      ${this.userId
        ? html` <div class="h-6 mt-2 flex justify-end">
            <label>
              <span class="text-neutral-500 text-xs mr-1"
                >${msg("Show Only Mine")}</span
              >
              <sl-switch
                @sl-change=${(e: CustomEvent) =>
                  (this.filterByCurrentUser = (e.target as SlCheckbox).checked)}
                ?checked=${this.filterByCurrentUser}
              ></sl-switch>
            </label>
          </div>`
        : ""}
    `;
  }

  private renderCrawlList() {
    // Return search results if valid filter string is available,
    // otherwise format crawls list like search results
    const searchResults =
      this.searchBy.length >= MIN_SEARCH_LENGTH
        ? () => this.fuse.search(this.searchBy)
        : map((crawl) => ({ item: crawl }));
    const filteredCrawls = flow(
      this.filterCrawls,
      searchResults
    )(this.crawls as Crawl[]);

    if (!filteredCrawls.length) {
      return html`
        <div class="border rounded-lg bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching crawls found.")}</span
            >
            <button
              class="text-neutral-500 font-medium underline hover:no-underline"
              @click=${() => {
                this.filterByState = [];
                this.onSearchInput.cancel();
                this.searchBy = "";
              }}
            >
              ${msg("Clear all filters")}
            </button>
          </p>

          <div></div>
        </div>
      `;
    }

    return html`
      <ul class="border rounded">
        ${flow(
          this.sortCrawls,
          map(this.renderCrawlItem)
        )(filteredCrawls as CrawlSearchResult[])}
      </ul>
    `;
  }

  private renderCrawlItem = ({ item: crawl }: CrawlSearchResult) => {
    return html`<li class="border-t first:border-t-0">
      <a
        href=${`${this.crawlsBaseUrl}/crawl/${crawl.id}`}
        class="grid grid-cols-12 gap-4 p-4 leading-none hover:bg-zinc-50 hover:text-primary transition-colors"
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
          <sl-dropdown @click=${(e: Event) => e.preventDefault()} hoist>
            <sl-icon-button
              slot="trigger"
              name="three-dots"
              label=${msg("More")}
              style="font-size: 1rem"
            ></sl-icon-button>

            <ul
              class="text-sm text-neutral-800 bg-white whitespace-nowrap"
              role="menu"
            >
              ${isActive(crawl)
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
                        name="trash3"
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
                ${msg("Copy Crawl Config ID")}
              </li>
              <li
                class="p-2 hover:bg-zinc-100 cursor-pointer"
                role="menuitem"
                @click=${(e: any) => {
                  this.navTo(`${this.crawlsBaseUrl}/crawl/${crawl.id}#config`);
                }}
              >
                ${msg("View Crawl Config")}
              </li>
              ${when(
                !isActive(crawl),
                () => html`
                  <li
                    class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
                    role="menuitem"
                    @click=${(e: any) => {
                      e.target.closest("sl-dropdown").hide();
                      this.deleteCrawl(crawl);
                    }}
                  >
                    ${msg("Delete Crawl")}
                  </li>
                `
              )}
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
                : isActive(crawl)
                ? "text-purple-500 motion-safe:animate-pulse"
                : "text-zinc-300"}"
              style="font-size: 10px; vertical-align: 2px"
            >
              &#9679;
            </span>
          </div>
          <div>
            <div
              class="whitespace-nowrap mb-1 capitalize${isActive(crawl)
                ? " motion-safe:animate-pulse"
                : ""}"
            >
              ${crawl.state.replace(/_/g, " ")}
            </div>
            <div class="text-neutral-500 text-sm whitespace-nowrap truncate">
              ${crawl.finished
                ? html`
                    <sl-relative-time
                      date=${`${crawl.finished}Z` /** Z for UTC */}
                    ></sl-relative-time>
                  `
                : ""}
              ${!crawl.finished
                ? html`
                    ${crawl.state === "canceled" ? msg("Unknown") : ""}
                    ${isActive(crawl) ? this.renderActiveDuration(crawl) : ""}
                  `
                : ""}
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
                    ></sl-format-bytes>
                  </span>
                  <span class="text-neutral-500">
                    (${crawl.fileCount === 1
                      ? msg(str`${crawl.fileCount} file`)
                      : msg(str`${crawl.fileCount} files`)})
                  </span>
                </div>
                <div
                  class="text-neutral-500 text-sm whitespace-nowrap truncate"
                >
                  ${msg(
                    str`in ${RelativeDuration.humanize(
                      new Date(`${crawl.finished}Z`).valueOf() -
                        new Date(`${crawl.started}Z`).valueOf(),
                      { compact: true }
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
                <div
                  class="text-neutral-500 text-sm whitespace-nowrap truncate"
                >
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
                <div
                  class="ml-1 text-neutral-500 text-sm whitespace-nowrap truncate"
                >
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

  private renderActiveDuration(crawl: Crawl) {
    const endTime = this.lastFetched || Date.now();
    const duration = endTime - new Date(`${crawl.started}Z`).valueOf();
    let unitCount: number;
    let tickSeconds: number | undefined = undefined;

    // Show second unit if showing seconds or greater than 1 hr
    const showSeconds = duration < 60 * 2 * 1000;
    if (showSeconds || duration > 60 * 60 * 1000) {
      unitCount = 2;
    } else {
      unitCount = 1;
    }
    // Tick if seconds are showing
    if (showSeconds) {
      tickSeconds = 1;
    } else {
      tickSeconds = undefined;
    }

    return html`
      <btrix-relative-duration
        class="text-purple-500"
        value=${`${crawl.started}Z`}
        endTime=${this.lastFetched || Date.now()}
        unitCount=${unitCount}
        tickSeconds=${ifDefined(tickSeconds)}
      ></btrix-relative-duration>
    `;
  }

  private onSearchInput = debounce(200)((e: any) => {
    this.searchBy = e.target.value;
  }) as any;

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(): Promise<void> {
    if (!this.shouldFetch) return;

    this.stopPollTimer();
    try {
      const { crawls } = await this.getCrawls();

      this.crawls = crawls;
      // Update search/filter collection
      this.fuse.setCollection(this.crawls as any);
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawls at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    // Restart timer for next poll
    this.timerId = window.setTimeout(() => {
      this.fetchCrawls();
    }, 1000 * POLL_INTERVAL_SECONDS);
  }

  private stopPollTimer() {
    window.clearTimeout(this.timerId);
  }

  private async getCrawls(): Promise<{ crawls: Crawl[] }> {
    const params =
      this.userId && this.filterByCurrentUser ? `?userid=${this.userId}` : "";

    const data = await this.apiFetch(
      `${this.crawlsAPIBaseUrl || this.crawlsBaseUrl}${params}`,
      this.authState!
    );

    this.lastFetched = Date.now();

    return data;
  }

  private async cancel(crawl: Crawl) {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawls/${crawl.id}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawls();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't cancel crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop(crawl: Crawl) {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawls/${crawl.id}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawls();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't stop crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async runNow(crawl: Crawl) {
    // Get crawl config to check if crawl is already running
    const crawlTemplate = await this.getCrawlTemplate(crawl);

    if (crawlTemplate?.currCrawlId) {
      this.notify({
        message: msg(
          html`Crawl of <strong>${crawl.configName}</strong> is already running.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${crawl.oid}/crawls/crawl/${crawlTemplate.currCrawlId}"
              @click=${this.navLink.bind(this)}
              >View crawl</a
            >`
        ),
        variant: "warning",
        icon: "exclamation-triangle",
      });

      return;
    }

    try {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}/run`,
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
              href="/orgs/${crawl.oid}/crawls/crawl/${data.started}#watch"
              @click=${this.navLink.bind(this)}
              >Watch crawl</a
            >`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
    } catch (e: any) {
      if (e.isApiError && e.statusCode === 404) {
        this.notify({
          message: msg(
            html`Sorry, cannot rerun crawl from a deactivated crawl config.
              <br />
              <button
                class="underline hover:no-underline"
                @click="${() => this.duplicateConfig(crawl, crawlTemplate)}"
              >
                Duplicate crawl config
              </button>`
          ),
          variant: "danger",
          icon: "exclamation-octagon",
          duration: 8000,
        });
      } else {
        this.notify({
          message: msg("Sorry, couldn't run crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async deleteCrawl(crawl: Crawl) {
    if (
      !window.confirm(
        msg(str`Are you sure you want to delete crawl of ${crawl.configName}?`)
      )
    ) {
      return;
    }

    try {
      const data = await this.apiFetch(
        `/orgs/${crawl.oid}/crawls/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [crawl.id],
          }),
        }
      );

      this.crawls = this.crawls!.filter((c) => c.id !== crawl.id);
      this.notify({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
      });
      this.fetchCrawls();
    } catch (e: any) {
      this.notify({
        message:
          (e.isApiError && e.message) ||
          msg("Sorry, couldn't run crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getCrawlTemplate(crawl: Crawl): Promise<CrawlConfig> {
    const data: CrawlConfig = await this.apiFetch(
      `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}`,
      this.authState!
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(crawl: Crawl, template: CrawlConfig) {
    const crawlTemplate: InitialCrawlConfig = {
      name: msg(str`${template.name} Copy`),
      config: template.config,
      profileid: template.profileid || null,
      jobType: template.jobType,
      schedule: template.schedule,
      tags: template.tags,
    };

    this.navTo(
      `/orgs/${crawl.oid}/crawl-configs?new&jobType=${crawlTemplate.jobType}`,
      {
        crawlTemplate,
      }
    );

    this.notify({
      message: msg(str`Copied crawl configuration to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
