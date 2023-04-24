import type { HTMLTemplateResult, PropertyValueMap } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import flow from "lodash/fp/flow";
import map from "lodash/fp/map";
import orderBy from "lodash/fp/orderBy";
import filter from "lodash/fp/filter";
import Fuse from "fuse.js";
import queryString from "query-string";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, Workflow, WorkflowParams } from "./types";
import { CopyButton } from "../../components/copy-button";
import { SlCheckbox } from "@shoelace-style/shoelace";
import type { APIPaginatedList } from "../../types/api";

type SortField = "_lastUpdated" | "_name";
type SortDirection = "asc" | "desc";

const FILTER_BY_CURRENT_USER_STORAGE_KEY =
  "btrix.filterByCurrentUser.crawlConfigs";
const INITIAL_PAGE_SIZE = 30;
const POLL_INTERVAL_SECONDS = 10;
const MIN_SEARCH_LENGTH = 2;
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  _lastUpdated: {
    label: msg("Last Updated"),
    defaultDirection: "desc",
  },
  _name: {
    label: msg("Name"),
    defaultDirection: "asc",
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
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  userId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @state()
  private workflows?: Workflow[];

  @state()
  private fetchErrorStatusCode?: number;

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "_lastUpdated",
    direction: sortableFields["_lastUpdated"].defaultDirection!,
  };

  @state()
  private filterByCurrentUser = false;

  @state()
  private searchBy: string = "";

  @state()
  private filterByScheduled: boolean | null = null;

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["name", "config.seeds", "config.seeds.url"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private timerId?: number;

  constructor() {
    super();
    this.filterByCurrentUser =
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
      "true";
  }

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("orgId") ||
      changedProperties.has("filterByCurrentUser")
    ) {
      this.fetchWorkflows();
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

  private async fetchWorkflows() {
    this.fetchErrorStatusCode = undefined;

    this.cancelInProgressGetWorkflows();

    try {
      const workflows = await this.getWorkflows();
      this.workflows = workflows;

      // Update search/filter collection
      this.fuse.setCollection(this.workflows as any);
    } catch (e: any) {
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

    // Restart timer for next poll
    this.timerId = window.setTimeout(() => {
      this.fetchWorkflows();
    }, 1000 * POLL_INTERVAL_SECONDS);
  }

  private cancelInProgressGetWorkflows() {
    window.clearTimeout(this.timerId);
  }

  render() {
    return html`
      <header class="contents">
        <div class="flex justify-between w-full h-8 mb-4">
          <h1 class="text-xl font-semibold">${msg("Crawling")}</h1>
          ${when(
            this.isCrawler,
            () => html`
              <sl-button
                href=${`/orgs/${this.orgId}/workflows?new&jobType=`}
                variant="primary"
                size="small"
                @click=${this.navLink}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Crawl Workflow")}
              </sl-button>
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
            ? this.workflows.length
              ? this.renderWorkflowList()
              : html`
                  <div class="border-t border-b py-5">
                    <p class="text-center text-0-500">
                      ${msg("No Workflows yet.")}
                    </p>
                  </div>
                `
            : html`<div
                class="w-full flex items-center justify-center my-24 text-3xl"
              >
                <sl-spinner></sl-spinner>
              </div>`
      )}
    `;
  }

  private renderControls() {
    return html`
      <div class="flex flex-wrap items-center">
        <div class="grow mr-4 mb-4">
          <sl-input
            class="w-full"
            slot="trigger"
            size="small"
            placeholder=${msg("Search by Crawl Workflow name or Crawl URL")}
            clearable
            ?disabled=${!this.workflows?.length}
            @sl-input=${this.onSearchInput}
          >
            <sl-icon name="search" slot="prefix"></sl-icon>
          </sl-input>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between">
        <div class="text-sm">
          <button
            class="inline-block font-medium border-2 border-transparent ${this
              .filterByScheduled === null
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3"
            aria-selected=${this.filterByScheduled === null}
            @click=${() => (this.filterByScheduled = null)}
          >
            ${msg("All")}
          </button>
          <button
            class="inline-block font-medium border-2 border-transparent ${this
              .filterByScheduled === true
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3"
            aria-selected=${this.filterByScheduled === true}
            @click=${() => (this.filterByScheduled = true)}
          >
            ${msg("Scheduled")}
          </button>
          <button
            class="inline-block font-medium border-2 border-transparent ${this
              .filterByScheduled === false
              ? "border-b-current text-primary"
              : "text-neutral-500"} mr-3"
            aria-selected=${this.filterByScheduled === false}
            @click=${() => (this.filterByScheduled = false)}
          >
            ${msg("No schedule")}
          </button>
        </div>
        <div class="flex items-center justify-end">
          <label class="mr-3">
            <span class="text-neutral-500 mr-1">${msg("Show Only Mine")}</span>
            <sl-switch
              @sl-change=${(e: CustomEvent) =>
                (this.filterByCurrentUser = (e.target as SlCheckbox).checked)}
              ?checked=${this.filterByCurrentUser}
            ></sl-switch>
          </label>

          <div class="whitespace-nowrap text-sm text-0-500 mr-2">
            ${msg("Sort by:")}
          </div>
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
    `;
  }

  private renderWorkflowList() {
    if (!this.workflows) return;

    const flowFns = [
      map((workflow: Workflow) => ({
        ...workflow,
        _lastUpdated: this.workflowLastUpdated(workflow),
        _name: workflow.name || workflow.firstSeed,
      })),
      orderBy(this.orderBy.field, this.orderBy.direction),
      map(this.renderWorkflowItem),
    ];

    if (this.filterByScheduled === true) {
      flowFns.unshift(filter(({ schedule }: any) => Boolean(schedule)));
    } else if (this.filterByScheduled === false) {
      flowFns.unshift(filter(({ schedule }: any) => !schedule));
    }

    if (this.searchBy.length >= MIN_SEARCH_LENGTH) {
      flowFns.unshift(this.filterResults);
    }

    return html`
      <btrix-workflow-list>
        ${flow(...flowFns)(this.workflows)}
      </btrix-workflow-list>
    `;
  }

  private renderWorkflowItem = (workflow: Workflow) =>
    html`
      <btrix-workflow-list-item
        .workflow=${workflow}
        lastUpdated=${this.workflowLastUpdated(workflow)}
      >
        <sl-menu slot="menu">${this.renderMenuItems(workflow)}</sl-menu>
      </btrix-workflow-list-item>
    `;

  private renderMenuItems(workflow: Workflow) {
    return html`
      ${when(
        workflow.currCrawlId,
        // HACK shoelace doesn't current have a way to override non-hover
        // color without resetting the --sl-color-neutral-700 variable
        () => html`
          <sl-menu-item
            @click=${() => this.stop(workflow.currCrawlId)}
            ?disabled=${workflow.currCrawlState === "stopping"}
          >
            <sl-icon name="dash-circle" slot="prefix"></sl-icon>
            ${msg("Stop Crawl")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.cancel(workflow.currCrawlId)}
          >
            <sl-icon name="x-octagon" slot="prefix"></sl-icon>
            ${msg("Cancel Immediately")}
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
        workflow.currCrawlState === "running",
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
        @click=${() => CopyButton.copyToClipboard(workflow.tags.join(","))}
        ?disabled=${!workflow.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      <sl-menu-item @click=${() => this.duplicateConfig(workflow)}>
        <sl-icon name="files" slot="prefix"></sl-icon>
        ${msg("Duplicate Workflow")}
      </sl-menu-item>
      ${when(!workflow.currCrawlId, () => {
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
            <sl-icon name="trash" slot="prefix"></sl-icon>
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

  private workflowLastUpdated(workflow: Workflow): Date {
    return new Date(
      Math.max(
        ...[
          workflow.currCrawlStartTime,
          workflow.lastCrawlTime,
          workflow.lastCrawlStartTime,
          workflow.modified,
          workflow.created,
        ]
          .filter((date) => date)
          .map((date) => new Date(`${date}Z`).getTime())
      )
    );
  }

  private onSearchInput = debounce(200)((e: any) => {
    this.searchBy = e.target.value;
  }) as any;

  private filterResults = () => {
    const results = this.fuse.search(this.searchBy);

    return results.map(({ item }) => item);
  };

  /**
   * Fetch Workflows and update state
   **/
  private async getWorkflows(): Promise<Workflow[]> {
    const params = this.filterByCurrentUser ? `?userid=${this.userId}` : "";

    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs${params}`,
      this.authState!
    );

    return data.items;
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

      this.notify({
        message: msg(
          html`Deactivated <strong>${this.renderName(workflow)}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
      });

      this.workflows = this.workflows!.filter((t) => t.id !== workflow.id);
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

      this.notify({
        message: msg(
          html`Deleted <strong>${this.renderName(workflow)}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
      });

      this.workflows = this.workflows!.filter((t) => t.id !== workflow.id);
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async cancel(crawlId: Workflow["currCrawlId"]) {
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

  private async stop(crawlId: Workflow["currCrawlId"]) {
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
              href="/orgs/${this.orgId}/workflows/crawl/${workflow.id}"
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
}

customElements.define("btrix-workflows-list", WorkflowsList);
