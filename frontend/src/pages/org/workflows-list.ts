import type { HTMLTemplateResult, PropertyValueMap } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";
import queryString from "query-string";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, Workflow, WorkflowParams } from "./types";
import { CopyButton } from "../../components/copy-button";
import { SlCheckbox } from "@shoelace-style/shoelace";
import type { APIPaginatedList, APIPaginationQuery } from "../../types/api";
import type { PageChangeEvent } from "../../components/pagination";

type SearchFields = "name" | "firstSeed";
type SortField = "lastRun" | "name" | "firstSeed" | "created" | "modified";
type SortDirection = "asc" | "desc";

const FILTER_BY_CURRENT_USER_STORAGE_KEY =
  "btrix.filterByCurrentUser.crawlConfigs";
const INITIAL_PAGE_SIZE = 10;
const POLL_INTERVAL_SECONDS = 10;
const ABORT_REASON_THROTTLE = "throttled";

const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  lastRun: {
    label: msg("Latest Crawl"),
    defaultDirection: "desc",
  },
  modified: {
    label: msg("Last Modified"),
    defaultDirection: "desc",
  },
  name: {
    label: msg("Name"),
    defaultDirection: "asc",
  },
  firstSeed: {
    label: msg("Crawl Start URL"),
    defaultDirection: "asc",
  },
  created: {
    label: msg("Created"),
    defaultDirection: "desc",
  },
};

/**
 * Usage:
 * ```ts
 * <btrix-workflows-list></btrix-workflows-list>
 * ```
 */
@localized()
export class WorkflowsList extends LiteElement {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  orgStorageQuotaReached!: boolean;

  @property({ type: String })
  userId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @state()
  private workflows?: APIPaginatedList & {
    items: Workflow[];
  };

  @state()
  private searchOptions: any[] = [];

  @state()
  private isFetching = false;

  @state()
  private fetchErrorStatusCode?: number;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "lastRun",
    direction: sortableFields["lastRun"].defaultDirection!,
  };

  @state()
  private filterBy: Partial<Record<keyof Workflow, any>> = {};

  @state()
  private filterByCurrentUser = false;

  // For fuzzy search:
  private searchKeys = ["name", "firstSeed"];

  // Use to cancel requests
  private getWorkflowsController: AbortController | null = null;
  private timerId?: number;

  private get selectedSearchFilterKey() {
    return Object.keys(WorkflowsList.FieldLabels).find((key) =>
      Boolean((this.filterBy as any)[key])
    );
  }

  constructor() {
    super();
    this.filterByCurrentUser =
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
      "true";
  }

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId")) {
      this.fetchConfigSearchValues();
    }
    if (
      changedProperties.has("orgId") ||
      changedProperties.has("orderBy") ||
      changedProperties.has("filterByCurrentUser") ||
      changedProperties.has("filterByScheduled") ||
      changedProperties.has("filterBy")
    ) {
      this.fetchWorkflows({
        page: changedProperties.has("orgId") ? 1 : undefined,
      });
    }
    if (changedProperties.has("filterByCurrentUser")) {
      window.sessionStorage.setItem(
        FILTER_BY_CURRENT_USER_STORAGE_KEY,
        this.filterByCurrentUser.toString()
      );
    }
  }

  disconnectedCallback(): void {
    this.cancelInProgressGetWorkflows();
    super.disconnectedCallback();
  }

  private async fetchWorkflows(params?: APIPaginationQuery) {
    this.fetchErrorStatusCode = undefined;

    this.cancelInProgressGetWorkflows();
    this.isFetching = true;
    try {
      const workflows = await this.getWorkflows(params);
      this.workflows = workflows;
    } catch (e: any) {
      if (e === ABORT_REASON_THROTTLE) {
        console.debug("Fetch archived items aborted to throttle");
      } else {
        if (e.isApiError) {
          this.fetchErrorStatusCode = e.statusCode;
        } else {
          this.notify({
            message: msg("Sorry, couldn't retrieve Workflows at this time."),
            variant: "danger",
            icon: "exclamation-octagon",
          });
        }
      }
    }
    this.isFetching = false;

    // Restart timer for next poll
    this.timerId = window.setTimeout(() => {
      this.fetchWorkflows();
    }, 1000 * POLL_INTERVAL_SECONDS);
  }

  private cancelInProgressGetWorkflows() {
    window.clearTimeout(this.timerId);
    if (this.getWorkflowsController) {
      this.getWorkflowsController.abort(ABORT_REASON_THROTTLE);
      this.getWorkflowsController = null;
    }
  }

  render() {
    return html`
      <header class="contents">
        <div class="flex justify-between w-full h-8 mb-4">
          <h1 class="text-xl font-semibold">${msg("Crawl Workflows")}</h1>
          ${when(
            this.isCrawler,
            () => html`
              <sl-tooltip
                content=${msg("Org Storage Full")}
                ?disabled=${this.orgStorageQuotaReached === false}
              >
                <sl-button
                  href=${`/orgs/${this.orgId}/workflows?new&jobType=`}
                  variant="primary"
                  size="small"
                  ?disabled=${this.orgStorageQuotaReached === true}
                  @click=${this.navLink}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${msg("New Workflow")}
                </sl-button>
              </sl-tooltip>
            `
          )}
        </div>
        <div class="sticky z-10 mb-3 top-2 p-4 bg-neutral-50 border rounded-lg">
          ${this.renderControls()}
        </div>
      </header>

      ${when(
        this.fetchErrorStatusCode,
        () => html`
          <div>
            <btrix-alert variant="danger">
              ${msg(
                `Something unexpected went wrong while retrieving Workflows.`
              )}
            </btrix-alert>
          </div>
        `,
        () =>
          this.workflows
            ? this.workflows.total
              ? this.renderWorkflowList()
              : this.renderEmptyState()
            : this.renderLoading()
      )}
    `;
  }

  private renderControls() {
    return html`
      <div class="flex flex-wrap mb-2 items-center md:gap-4 gap-2">
        <div class="grow">${this.renderSearch()}</div>

        <div class="flex items-center w-full md:w-fit">
          <div class="whitespace-nowrap text-sm text-0-500 mr-2">
            ${msg("Sort by:")}
          </div>
          <sl-select
            class="flex-1 md:min-w-[9.2rem]"
            size="small"
            pill
            value=${this.orderBy.field}
            @sl-change=${(e: Event) => {
              const field = (e.target as HTMLSelectElement).value as SortField;
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
                <sl-option value=${value}>${label}</sl-option>
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

      <div class="flex flex-wrap items-center justify-between">
        <div class="text-sm">
          <button
            class="inline-block font-medium border-2 border-transparent ${this
              .filterBy.schedule === undefined
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3"
            aria-selected=${this.filterBy.schedule === undefined}
            @click=${() =>
              (this.filterBy = {
                ...this.filterBy,
                schedule: undefined,
              })}
          >
            ${msg("All")}
          </button>
          <button
            class="inline-block font-medium border-2 border-transparent ${this
              .filterBy.schedule === true
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3"
            aria-selected=${this.filterBy.schedule === true}
            @click=${() =>
              (this.filterBy = {
                ...this.filterBy,
                schedule: true,
              })}
          >
            ${msg("Scheduled")}
          </button>
          <button
            class="inline-block font-medium border-2 border-transparent ${this
              .filterBy.schedule === false
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3"
            aria-selected=${this.filterBy.schedule === false}
            @click=${() =>
              (this.filterBy = {
                ...this.filterBy,
                schedule: false,
              })}
          >
            ${msg("No schedule")}
          </button>
        </div>
        <div class="flex items-center justify-end">
          <label>
            <span class="text-neutral-500 mr-1 text-xs"
              >${msg("Show Only Mine")}</span
            >
            <sl-switch
              @sl-change=${(e: CustomEvent) =>
                (this.filterByCurrentUser = (e.target as SlCheckbox).checked)}
              ?checked=${this.filterByCurrentUser}
            ></sl-switch>
          </label>
        </div>
      </div>
    `;
  }

  private renderSearch() {
    return html`
      <btrix-search-combobox
        .searchKeys=${this.searchKeys}
        .searchOptions=${this.searchOptions}
        .keyLabels=${WorkflowsList.FieldLabels}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        placeholder=${msg("Search all Workflows by name or Crawl Start URL")}
        @on-select=${(e: CustomEvent) => {
          const { key, value } = e.detail;
          this.filterBy = {
            [key]: value,
          };
        }}
        @on-clear=${() => {
          const { name, firstSeed, ...otherFilters } = this.filterBy;
          this.filterBy = otherFilters;
        }}
      >
      </btrix-search-combobox>
    `;
  }

  private renderWorkflowList() {
    if (!this.workflows) return;
    const { page, total, pageSize } = this.workflows;

    return html`
      <btrix-workflow-list>
        ${this.workflows.items.map(this.renderWorkflowItem)}
      </btrix-workflow-list>
      ${when(
        total > pageSize,
        () => html`
          <footer class="mt-6 flex justify-center">
            <btrix-pagination
              page=${page}
              totalCount=${total}
              size=${pageSize}
              @page-change=${async (e: PageChangeEvent) => {
                await this.fetchWorkflows({
                  page: e.detail.page,
                });

                // Scroll to top of list
                // TODO once deep-linking is implemented, scroll to top of pushstate
                this.scrollIntoView({ behavior: "smooth" });
              }}
            ></btrix-pagination>
          </footer>
        `
      )}
    `;
  }

  private renderWorkflowItem = (workflow: Workflow) =>
    html`
      <btrix-workflow-list-item .workflow=${workflow}>
        <sl-menu slot="menu">${this.renderMenuItems(workflow)}</sl-menu>
      </btrix-workflow-list-item>
    `;

  private renderMenuItems(workflow: Workflow) {
    return html`
      ${when(
        workflow.isCrawlRunning,
        // HACK shoelace doesn't current have a way to override non-hover
        // color without resetting the --sl-color-neutral-700 variable
        () => html`
          <sl-menu-item
            @click=${() => this.stop(workflow.lastCrawlId)}
            ?disabled=${workflow.lastCrawlStopping}
          >
            <sl-icon name="dash-circle" slot="prefix"></sl-icon>
            ${msg("Stop Crawl")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.cancel(workflow.lastCrawlId)}
          >
            <sl-icon name="x-octagon" slot="prefix"></sl-icon>
            ${msg("Cancel & Discard Crawl")}
          </sl-menu-item>
        `,
        () => html`
          <sl-menu-item
            style="--sl-color-neutral-700: var(--success)"
            @click=${() => this.runNow(workflow)}
          >
            <sl-icon name="play" slot="prefix"></sl-icon>
            ${msg("Run Crawl")}
          </sl-menu-item>
        `
      )}
      ${when(
        workflow.isCrawlRunning,
        // HACK shoelace doesn't current have a way to override non-hover
        // color without resetting the --sl-color-neutral-700 variable
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `/orgs/${workflow.oid}/workflows/crawl/${workflow.id}#watch`,
                {
                  dialog: "scale",
                }
              )}
          >
            <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
            ${msg("Edit Crawler Instances")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `/orgs/${workflow.oid}/workflows/crawl/${workflow.id}#watch`,
                {
                  dialog: "exclusions",
                }
              )}
          >
            <sl-icon name="table" slot="prefix"></sl-icon>
            ${msg("Edit Exclusions")}
          </sl-menu-item>
          <sl-divider></sl-divider>
        `
      )}
      <sl-divider></sl-divider>
      <sl-menu-item
        @click=${() =>
          this.navTo(
            `/orgs/${workflow.oid}/workflows/crawl/${workflow.id}?edit`
          )}
      >
        <sl-icon name="gear" slot="prefix"></sl-icon>
        ${msg("Edit Workflow Settings")}
      </sl-menu-item>
      <sl-menu-item
        @click=${() => CopyButton.copyToClipboard(workflow.tags.join(", "))}
        ?disabled=${!workflow.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      <sl-menu-item @click=${() => this.duplicateConfig(workflow)}>
        <sl-icon name="files" slot="prefix"></sl-icon>
        ${msg("Duplicate Workflow")}
      </sl-menu-item>
      ${when(workflow.isCrawlRunning, () => {
        const shouldDeactivate = workflow.crawlCount && !workflow.inactive;
        return html`
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() =>
              shouldDeactivate
                ? this.deactivate(workflow)
                : this.delete(workflow)}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${shouldDeactivate
              ? msg("Deactivate Workflow")
              : msg("Delete Workflow")}
          </sl-menu-item>
        `;
      })}
    `;
  }

  private renderName(crawlConfig: Workflow) {
    if (crawlConfig.name) return crawlConfig.name;
    const { config } = crawlConfig;
    const firstSeed = config.seeds[0];
    let firstSeedURL = firstSeed.url;
    if (config.seeds.length === 1) {
      return firstSeedURL;
    }
    const remainderCount = config.seeds.length - 1;
    if (remainderCount === 1) {
      return msg(
        html`${firstSeedURL}
          <span class="text-neutral-500">+${remainderCount} URL</span>`
      );
    }
    return msg(
      html`${firstSeedURL}
        <span class="text-neutral-500">+${remainderCount} URLs</span>`
    );
  }

  private renderEmptyState() {
    if (Object.keys(this.filterBy).length) {
      return html`
        <div class="border rounded-lg bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching Workflows found.")}</span
            >
            <button
              class="text-neutral-500 font-medium underline hover:no-underline"
              @click=${() => {
                this.filterBy = {};
              }}
            >
              ${msg("Clear search and filters")}
            </button>
          </p>
        </div>
      `;
    }

    if (this.workflows?.page && this.workflows?.page > 1) {
      return html`
        <div class="border-t border-b py-5">
          <p class="text-center text-neutral-500">
            ${msg("Could not find page.")}
          </p>
        </div>
      `;
    }

    if (this.isFetching) {
      return this.renderLoading();
    }

    return html`
      <div class="border-t border-b py-5">
        <p class="text-center text-neutral-500">${msg("No Workflows yet.")}</p>
      </div>
    `;
  }

  private renderLoading() {
    return html`<div
      class="w-full flex items-center justify-center my-24 text-3xl"
    >
      <sl-spinner></sl-spinner>
    </div>`;
  }

  /**
   * Fetch Workflows and update state
   **/
  private async getWorkflows(
    queryParams?: APIPaginationQuery & {}
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(
      {
        ...this.filterBy,
        page: queryParams?.page || this.workflows?.page || 1,
        pageSize:
          queryParams?.pageSize ||
          this.workflows?.pageSize ||
          INITIAL_PAGE_SIZE,
        userid: this.filterByCurrentUser ? this.userId : undefined,
        sortBy: this.orderBy.field,
        sortDirection: this.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "comma",
      }
    );

    this.getWorkflowsController = new AbortController();
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      this.authState!,
      {
        signal: this.getWorkflowsController.signal,
      }
    );
    this.getWorkflowsController = null;

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(workflow: Workflow) {
    const workflowParams: WorkflowParams = {
      ...workflow,
      name: msg(str`${this.renderName(workflow)} Copy`),
    };

    this.navTo(
      `/orgs/${this.orgId}/workflows?new&jobType=${workflowParams.jobType}`,
      {
        workflow: workflowParams,
      }
    );

    this.notify({
      message: msg(str`Copied Workflow to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }

  private async deactivate(workflow: Workflow): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.fetchWorkflows();
      this.notify({
        message: msg(
          html`Deactivated <strong>${this.renderName(workflow)}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't deactivate Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async delete(workflow: Workflow): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.fetchWorkflows();
      this.notify({
        message: msg(
          html`Deleted <strong>${this.renderName(workflow)}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async cancel(crawlId: Workflow["lastCrawlId"]) {
    if (!crawlId) return;
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${crawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.fetchWorkflows();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't cancel crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop(crawlId: Workflow["lastCrawlId"]) {
    if (!crawlId) return;
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${crawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.fetchWorkflows();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't stop crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async runNow(workflow: Workflow): Promise<void> {
    if (this.orgStorageQuotaReached === true) {
      this.notify({
        message: msg(
          "The org has reached its storage limit. Delete any archived items that are un-needed to free up space, or contact us to purchase a plan with more storage."
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
      return;
    }

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${workflow.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.renderName(workflow)}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${this.orgId}/workflows/crawl/${workflow.id}#watch"
              @click=${this.navLink.bind(this)}
              >Watch crawl</a
            >`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      await this.fetchWorkflows();
      // Scroll to top of list
      this.scrollIntoView({ behavior: "smooth" });
    } catch (e: any) {
      this.notify({
        message:
          (e.isApiError &&
            e.statusCode === 403 &&
            msg("You do not have permission to run crawls.")) ||
          msg("Sorry, couldn't run crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchConfigSearchValues() {
    try {
      const data: {
        crawlIds: string[];
        names: string[];
        descriptions: string[];
        firstSeeds: string[];
      } = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/search-values`,
        this.authState!
      );

      // Update search/filter collection
      const toSearchItem = (key: SearchFields) => (value: string) => ({
        [key]: value,
      });
      this.searchOptions = [
        ...data.names.map(toSearchItem("name")),
        ...data.firstSeeds.map(toSearchItem("firstSeed")),
      ];
    } catch (e) {
      console.debug(e);
    }
  }
}

customElements.define("btrix-workflows-list", WorkflowsList);
