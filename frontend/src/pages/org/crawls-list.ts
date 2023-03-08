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
import { CrawlStatus } from "../../components/crawl-status";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, CrawlState, Workflow, WorkflowParams } from "./types";
import type { APIPaginatedList } from "../../types/api";

type CrawlSearchResult = {
  item: Crawl;
};
type SortField = "started" | "finished" | "configName" | "fileSize";
type SortDirection = "asc" | "desc";

const FILTER_BY_CURRENT_USER_STORAGE_KEY = "btrix.filterByCurrentUser.crawls";
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
  private filterByCurrentUser = false;

  @state()
  private filterByState: CrawlState[] = [];

  @state()
  private searchBy: string = "";

  @state()
  private crawlToEdit: Crawl | null = null;

  @state()
  private isEditingCrawl = false;

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["cid", "configName", "firstSeed"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private timerId?: number;

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

  constructor() {
    super();
    this.filterByCurrentUser =
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
      "true";
  }

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

      if (changedProperties.has("filterByCurrentUser")) {
        window.sessionStorage.setItem(
          FILTER_BY_CURRENT_USER_STORAGE_KEY,
          this.filterByCurrentUser.toString()
        );
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
        <header class="contents">
          <div class="flex w-full h-8 mb-4">
            <h1 class="text-xl font-semibold">${msg("Crawls")}</h1>
          </div>
          <div
            class="sticky z-10 mb-3 top-2 p-4 bg-neutral-50 border rounded-lg"
          >
            ${this.renderControls()}
          </div>
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
        <footer class="m-2">
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
            size="small"
            slot="trigger"
            placeholder=${msg(
              "Search by name, Crawl Start URL, or Workflow ID"
            )}
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
            ${activeCrawlStates.map(this.renderStatusMenuItem)}
            <sl-divider></sl-divider>
            ${inactiveCrawlStates.map(this.renderStatusMenuItem)}
          </sl-select>
        </div>

        <div class="flex items-center">
          <div class="whitespace-nowrap text-neutral-500 mx-2">
            ${msg("Sort by:")}
          </div>
          <div class="grow flex">
            <sl-select
              class="flex-1 md:min-w-[9.2rem]"
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
      <btrix-crawl-list>
        ${flow(
          this.sortCrawls,
          map(this.renderCrawlItem)
        )(filteredCrawls as CrawlSearchResult[])}
      </btrix-crawl-list>

      <btrix-crawl-metadata-editor
        .authState=${this.authState}
        .crawl=${this.crawlToEdit}
        ?open=${this.isEditingCrawl}
        @request-close=${() => (this.isEditingCrawl = false)}
        @updated=${
          /* TODO fetch current page or single crawl */ this.fetchCrawls
        }
      ></btrix-crawl-metadata-editor>
    `;
  }

  private renderCrawlItem = ({ item: crawl }: CrawlSearchResult) =>
    html`
      <btrix-crawl-list-item .crawl=${crawl}>
        <sl-menu slot="menu">
          ${when(
            isActive(crawl),
            // HACK shoelace doesn't current have a way to override non-hover
            // color without resetting the --sl-color-neutral-700 variable
            () => html`
              <sl-menu-item @click=${() => this.stop(crawl)}>
                <sl-icon name="dash-circle" slot="prefix"></sl-icon>
                ${msg("Stop Crawl")}
              </sl-menu-item>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => this.cancel(crawl)}
              >
                <sl-icon name="x-octagon" slot="prefix"></sl-icon>
                ${msg("Cancel Immediately")}
              </sl-menu-item>
            `,
            () => html`
              <sl-menu-item
                style="--sl-color-neutral-700: var(--success)"
                @click=${() => this.runNow(crawl)}
              >
                <sl-icon name="arrow-clockwise" slot="prefix"></sl-icon>
                ${msg("Re-Run Crawl")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => {
                  this.crawlToEdit = crawl;
                  this.isEditingCrawl = true;
                }}
              >
                <sl-icon name="pencil" slot="prefix"></sl-icon>
                ${msg("Edit Metadata")}
              </sl-menu-item>
            `
          )}
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              this.navTo(`/orgs/${crawl.oid}/workflows/config/${crawl.cid}`)}
          >
            <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
            ${msg("Go to Workflow")}
          </sl-menu-item>
          <sl-menu-item @click=${() => CopyButton.copyToClipboard(crawl.cid)}>
            <sl-icon name="copy-code" library="app" slot="prefix"></sl-icon>
            ${msg("Copy Config ID")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() => CopyButton.copyToClipboard(crawl.tags.join(","))}
          >
            <sl-icon name="tags" slot="prefix"></sl-icon>
            ${msg("Copy Tags")}
          </sl-menu-item>
          ${when(
            !isActive(crawl),
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => this.deleteCrawl(crawl)}
              >
                <sl-icon name="trash" slot="prefix"></sl-icon>
                ${msg("Delete Crawl")}
              </sl-menu-item>
            `
          )}
        </sl-menu>
      </btrix-crawl-list-item>
    `;

  private renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-menu-item value=${state}>${icon}${label}</sl-menu-item>`;
  };

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
      const crawls = await this.getCrawls();

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

  private async getCrawls(): Promise<Crawl[]> {
    const params =
      this.userId && this.filterByCurrentUser ? `?userid=${this.userId}` : "";

    const data: APIPaginatedList = await this.apiFetch(
      `${this.crawlsAPIBaseUrl || this.crawlsBaseUrl}${params}`,
      this.authState!
    );

    this.lastFetched = Date.now();

    return data.items;
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
    // Get Workflow to check if crawl is already running
    const workflow = await this.getWorkflow(crawl);

    if (workflow?.currCrawlId) {
      this.notify({
        message: msg(
          html`Crawl of <strong>${crawl.name}</strong> is already running.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${crawl.oid}/crawls/crawl/${workflow.currCrawlId}"
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
          html`Started crawl from <strong>${crawl.name}</strong>.
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
            html`Sorry, cannot rerun crawl from a deactivated Workflow.
              <br />
              <button
                class="underline hover:no-underline"
                @click="${() => this.duplicateConfig(crawl, workflow)}"
              >
                Duplicate Workflow
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
        msg(str`Are you sure you want to delete crawl of ${crawl.name}?`)
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

  async getWorkflow(crawl: Crawl): Promise<Workflow> {
    const data: Workflow = await this.apiFetch(
      `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}`,
      this.authState!
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(crawl: Crawl, workflow: Workflow) {
    const workflowParams: WorkflowParams = {
      ...workflow,
      name: msg(str`${workflow.name} Copy`),
    };

    this.navTo(
      `/orgs/${crawl.oid}/workflows?new&jobType=${workflowParams.jobType}`,
      {
        workflow: workflowParams,
      }
    );

    this.notify({
      message: msg(str`Copied Workflowuration to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
