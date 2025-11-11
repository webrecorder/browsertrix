import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlDialog } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { type ListWorkflow, type Seed, type Workflow } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  BtrixFilterChipChangeEvent,
  FilterChip,
} from "@/components/ui/filter-chip";
import {
  parsePage,
  type PageChangeEvent,
  type Pagination,
} from "@/components/ui/pagination";
import { type SelectEvent } from "@/components/ui/search-combobox";
import type { BtrixChangeTagFilterEvent } from "@/components/ui/tag-filter/types";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import {
  Action,
  type BtrixSelectActionEvent,
} from "@/features/crawl-workflows/workflow-action-menu/types";
import { type BtrixChangeWorkflowLastCrawlStateFilterEvent } from "@/features/crawl-workflows/workflow-last-crawl-state-filter";
import { type BtrixChangeWorkflowProfileFilterEvent } from "@/features/crawl-workflows/workflow-profile-filter";
import type { BtrixChangeWorkflowScheduleFilterEvent } from "@/features/crawl-workflows/workflow-schedule-filter";
import {
  WorkflowSearch,
  type SearchFields,
} from "@/features/crawl-workflows/workflow-search";
import { WorkflowTab } from "@/routes";
import { deleteConfirmation } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import { type CrawlState } from "@/types/crawlState";
import { type StorageSeedFile } from "@/types/workflow";
import { isApiError } from "@/utils/api";
import { settingsForDuplicate } from "@/utils/crawl-workflows/settingsForDuplicate";
import { renderName } from "@/utils/crawler";
import { isNotEqual } from "@/utils/is-not-equal";
import { tw } from "@/utils/tailwind";

type SortField = "lastRun" | "name" | "firstSeed" | "created" | "modified";
const SORT_DIRECTIONS = ["asc", "desc"] as const;
type SortDirection = (typeof SORT_DIRECTIONS)[number];
type SortBy = {
  field: SortField;
  direction: SortDirection;
};

type Keys<T> = (keyof T)[];

const FILTER_BY_CURRENT_USER_STORAGE_KEY =
  "btrix.filterByCurrentUser.crawlConfigs";
const INITIAL_PAGE_SIZE = 10;
const POLL_INTERVAL_SECONDS = 10;

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
    label: msg("Date Created"),
    defaultDirection: "desc",
  },
};

const DEFAULT_SORT_BY = {
  field: "lastRun",
  direction: sortableFields["lastRun"].defaultDirection!,
} as const;

type FilterBy = {
  name?: string;
  firstSeed?: string;
  schedule?: boolean;
  isCrawlRunning?: true;
  lastCrawlState?: CrawlState[];
};

/**
 * Usage:
 * ```ts
 * <btrix-workflows-list></btrix-workflows-list>
 * ```
 */
@customElement("btrix-workflows-list")
@localized()
export class WorkflowsList extends BtrixElement {
  @state({ hasChanged: isNotEqual })
  private pagination: Required<APIPaginationQuery> = {
    page: parsePage(new URLSearchParams(location.search).get("page")),
    pageSize: INITIAL_PAGE_SIZE,
  };

  @query("btrix-pagination")
  private readonly paginationElement?: Pagination;

  @state()
  private searchOptions: { [x: string]: string }[] = [];

  @state()
  private readonly fetchErrorStatusCode?: number;

  @state()
  private workflowToDelete?: ListWorkflow;

  private readonly orderBy = new SearchParamsValue<SortBy>(
    this,
    (value, params) => {
      if (value.field === DEFAULT_SORT_BY.field) {
        params.delete("sortBy");
      } else {
        params.set("sortBy", value.field);
      }
      if (value.direction === sortableFields[value.field].defaultDirection) {
        params.delete("sortDir");
      } else {
        params.set("sortDir", value.direction);
      }
      return params;
    },
    (params) => {
      const field = params.get("sortBy") as SortBy["field"] | null;
      if (!field) {
        return DEFAULT_SORT_BY;
      }
      let direction = params.get("sortDir");
      if (
        !direction ||
        (SORT_DIRECTIONS as readonly string[]).includes(direction)
      ) {
        direction =
          sortableFields[field].defaultDirection || DEFAULT_SORT_BY.direction;
      }
      return { field, direction: direction as SortDirection };
    },
  );

  private readonly filterBy = new SearchParamsValue<FilterBy>(
    this,
    (value, params) => {
      const keys = [
        "name",
        "firstSeed",
        "schedule",
        "isCrawlRunning",
        "lastCrawlState",
      ] as (keyof FilterBy)[];
      keys.forEach((key) => {
        if (value[key] == null) {
          params.delete(key);
        } else {
          switch (key) {
            case "firstSeed":
            case "name":
              params.set(key, value[key]);
              break;
            case "schedule":
              params.set(key, value[key] ? "true" : "false");
              break;
            case "isCrawlRunning":
              if (value[key] as true | undefined) {
                params.set(key, "true");
              } else {
                params.delete(key);
              }
              break;
            case "lastCrawlState":
              params.delete("lastCrawlStatus");
              value[key].forEach((state) => {
                params.append("lastCrawlStatus", state);
              });
              break;
          }
        }
      });
      return params;
    },
    (params) => {
      const status = params.getAll("lastCrawlStatus") as CrawlState[];
      return {
        name: params.get("name") ?? undefined,
        firstSeed: params.get("firstSeed") ?? undefined,
        schedule: params.has("schedule")
          ? params.get("schedule") === "true"
          : undefined,
        isCrawlRunning: params.get("isCrawlRunning") === "true" || undefined,
        lastCrawlState: status.length ? status : undefined,
      };
    },
  );

  private readonly filterByCurrentUser = new SearchParamsValue<boolean>(
    this,
    (value, params) => {
      if (value) {
        params.set("mine", "true");
      } else {
        params.delete("mine");
      }
      return params;
    },
    (params) => params.get("mine") === "true",
    {
      initial: (initialValue) =>
        window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
          "true" ||
        initialValue ||
        false,
    },
  );

  private readonly filterByTags = new SearchParamsValue<string[] | undefined>(
    this,
    (value, params) => {
      params.delete("tags");
      value?.forEach((v) => {
        params.append("tags", v);
      });
      return params;
    },
    (params) => params.getAll("tags"),
  );

  private readonly filterByTagsType = new SearchParamsValue<"and" | "or">(
    this,
    (value, params) => {
      if (value === "and") {
        params.set("tagsType", value);
      } else {
        params.delete("tagsType");
      }
      return params;
    },
    (params) => (params.get("tagsType") === "and" ? "and" : "or"),
  );

  private readonly filterByProfiles = new SearchParamsValue<string[]>(
    this,
    (value, params) => {
      params.delete("profiles");
      value.forEach((v) => {
        params.append("profiles", v);
      });
      return params;
    },
    (params) => params.getAll("profiles"),
  );

  @query("#deleteDialog")
  private readonly deleteDialog?: SlDialog | null;

  private get selectedSearchFilterKey() {
    return (
      Object.keys(WorkflowSearch.FieldLabels) as Keys<
        typeof WorkflowSearch.FieldLabels
      >
    ).find((key) => Boolean(this.filterBy.value[key]));
  }

  private get hasFiltersSet() {
    return [
      this.filterBy.value.firstSeed || undefined,
      this.filterBy.value.name || undefined,
      this.filterBy.value.isCrawlRunning || undefined,
      this.filterBy.value.schedule,
      this.filterByProfiles.value.length || undefined,
      this.filterByCurrentUser.value || undefined,
      this.filterByTags.value?.length || undefined,
    ].some((v) => v !== undefined);
  }

  private clearFilters() {
    this.filterBy.setValue({});
    this.filterByCurrentUser.setValue(false);
    this.filterByTags.setValue(undefined);
    this.filterByProfiles.setValue([]);
    this.filterByTagsType.setValue("or");
  }

  private getWorkflowsTimeout?: number;

  private readonly workflowsTask = new Task(this, {
    task: async (
      [
        pagination,
        orderBy,
        filterBy,
        filterByCurrentUser,
        filterByTags,
        filterByTagsType,
        filterByProfiles,
      ],
      { signal },
    ) => {
      if (this.getWorkflowsTimeout) {
        window.clearTimeout(this.getWorkflowsTimeout);
      }

      try {
        const data = await this.getWorkflows(
          {
            pagination,
            orderBy,
            filterBy,
            filterByCurrentUser,
            filterByTags,
            filterByTagsType,
            filterByProfiles,
          },
          signal,
        );

        this.getWorkflowsTimeout = window.setTimeout(() => {
          void this.workflowsTask.run();
        }, POLL_INTERVAL_SECONDS * 1000);

        return data;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          console.debug("Fetch workflows aborted to throttle");
        } else {
          this.notify.toast({
            message: msg("Sorry, couldn’t retrieve workflows at this time."),
            variant: "danger",
            icon: "exclamation-octagon",
            id: "workflow-fetch-error",
          });
        }
        throw e;
      }
    },
    args: () =>
      // TODO consolidate filters into single fetch params
      [
        this.pagination,
        this.orderBy.value,
        this.filterBy.value,
        this.filterByCurrentUser.value,
        this.filterByTags.value,
        this.filterByTagsType.value,
        this.filterByProfiles.value,
      ] as const,
  });

  protected async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (
      changedProperties.has("filterByCurrentUser.internalValue") ||
      changedProperties.has("filterByTags.internalValue") ||
      changedProperties.has("filterByTagsType.internalValue") ||
      changedProperties.has("filterByProfiles.internalValue") ||
      changedProperties.has("filterByScheduled.internalValue") ||
      changedProperties.has("filterBy.internalValue") ||
      changedProperties.has("orderBy.internalValue")
    ) {
      this.pagination = {
        ...this.pagination,
        page: 1,
      };
      this.paginationElement?.setPage(1, { dispatch: false, replace: true });
    }
    if (changedProperties.has("filterByCurrentUser")) {
      window.sessionStorage.setItem(
        FILTER_BY_CURRENT_USER_STORAGE_KEY,
        this.filterByCurrentUser.value.toString(),
      );
    }
  }

  protected firstUpdated() {
    void this.fetchConfigSearchValues();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  render() {
    return html`
      <div class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4">
        ${this.renderControls()}
      </div>

      ${when(
        this.fetchErrorStatusCode,
        () => html`
          <div>
            <btrix-alert variant="danger">
              ${msg(
                `Something unexpected went wrong while retrieving Workflows.`,
              )}
            </btrix-alert>
          </div>
        `,
        () => html`
          <div class="pb-10">
            ${this.workflowsTask.render({
              initial: this.renderLoading,
              pending: () =>
                // TODO differentiate between pending between poll and
                // pending from user action, in order to show loading indicator
                this.workflowsTask.value
                  ? // Render previous value while latest is loading
                    this.workflowsTask.value.total
                    ? this.renderWorkflowList()
                    : this.renderEmptyState()
                  : null,
              complete: ({ total }) =>
                total ? this.renderWorkflowList() : this.renderEmptyState(),
            })}
          </div>
        `,
      )}
      ${this.renderDialogs()}
    `;
  }

  private renderDialogs() {
    return html`
      ${when(
        this.workflowToDelete,
        (workflow) => html`
          <btrix-dialog id="deleteDialog" .label=${msg("Delete Workflow?")}>
            ${deleteConfirmation(renderName(workflow))}
            <div slot="footer" class="flex justify-between">
              <sl-button
                size="small"
                .autofocus=${true}
                @click=${() => void this.deleteDialog?.hide()}
                >${msg("Cancel")}</sl-button
              >
              <sl-button
                size="small"
                variant="danger"
                @click=${async () => {
                  void this.deleteDialog?.hide();

                  try {
                    await this.delete(workflow);
                    this.workflowToDelete = undefined;
                  } catch {
                    void this.deleteDialog?.show();
                  }
                }}
                >${msg("Delete Workflow")}</sl-button
              >
            </div>
          </btrix-dialog>
        `,
      )}
    `;
  }

  private renderControls() {
    return html`
      <div class="flex flex-wrap items-center gap-2 md:gap-4">
        <div class="grow basis-2/3">${this.renderSearch()}</div>

        <div class="flex items-center">
          <label
            class="mr-2 whitespace-nowrap text-sm text-neutral-500"
            for="sort-select"
          >
            ${msg("Sort by:")}
          </label>
          <sl-select
            id="sort-select"
            class="flex-1 md:min-w-[9.2rem]"
            size="small"
            pill
            value=${this.orderBy.value.field}
            @sl-change=${(e: Event) => {
              const field = (e.target as HTMLSelectElement).value as SortField;
              this.orderBy.setValue({
                field: field,
                direction:
                  sortableFields[field].defaultDirection ||
                  this.orderBy.value.direction,
              });
            }}
          >
            ${Object.entries(sortableFields).map(
              ([value, { label }]) => html`
                <sl-option value=${value}>${label}</sl-option>
              `,
            )}
          </sl-select>
          <sl-tooltip
            content=${this.orderBy.value.direction === "asc"
              ? msg("Sort in descending order")
              : msg("Sort in ascending order")}
          >
            <sl-icon-button
              name=${this.orderBy.value.direction === "asc"
                ? "sort-up-alt"
                : "sort-down"}
              class="text-base"
              label=${this.orderBy.value.direction === "asc"
                ? msg("Sort Descending")
                : msg("Sort Ascending")}
              @click=${() => {
                this.orderBy.setValue({
                  ...this.orderBy.value,
                  direction:
                    this.orderBy.value.direction === "asc" ? "desc" : "asc",
                });
              }}
            ></sl-icon-button>
          </sl-tooltip>
        </div>

        ${this.renderFilters()}
      </div>
    `;
  }

  private renderFilters() {
    return html`<div class="flex flex-wrap items-center gap-2">
      <span class="whitespace-nowrap text-sm text-neutral-500">
        ${msg("Filter by:")}
      </span>

      <btrix-workflow-schedule-filter
        .schedule=${this.filterBy.value.schedule}
        @btrix-change=${(e: BtrixChangeWorkflowScheduleFilterEvent) => {
          this.filterBy.setValue({
            ...this.filterBy.value,
            schedule: e.detail.value,
          });
        }}
      ></btrix-workflow-schedule-filter>

      <btrix-tag-filter
        tagType="workflow"
        .tags=${this.filterByTags.value}
        .type=${this.filterByTagsType.value}
        @btrix-change=${(e: BtrixChangeTagFilterEvent) => {
          this.filterByTags.setValue(e.detail.value?.tags || []);
          this.filterByTagsType.setValue(e.detail.value?.type || "or");
        }}
      ></btrix-tag-filter>

      <btrix-workflow-profile-filter
        .profiles=${this.filterByProfiles.value}
        @btrix-change=${(e: BtrixChangeWorkflowProfileFilterEvent) => {
          this.filterByProfiles.setValue(e.detail.value ?? []);
        }}
      ></btrix-workflow-profile-filter>

      <btrix-workflow-last-crawl-state-filter
        .states=${this.filterBy.value.lastCrawlState}
        @btrix-change=${(e: BtrixChangeWorkflowLastCrawlStateFilterEvent) => {
          this.filterBy.setValue({
            ...this.filterBy.value,
            lastCrawlState: e.detail.value,
          });
        }}
      ></btrix-workflow-last-crawl-state-filter>

      <btrix-filter-chip
        ?checked=${this.filterBy.value.isCrawlRunning === true}
        @btrix-change=${(e: BtrixFilterChipChangeEvent) => {
          const { checked } = e.target as FilterChip;

          this.filterBy.setValue({
            ...this.filterBy.value,
            isCrawlRunning: checked ? true : undefined,
          });
        }}
      >
        ${msg("Running")}
      </btrix-filter-chip>

      <btrix-filter-chip
        ?checked=${this.filterByCurrentUser.value}
        @btrix-change=${(e: BtrixFilterChipChangeEvent) => {
          const { checked } = e.target as FilterChip;

          this.filterByCurrentUser.setValue(Boolean(checked));
        }}
      >
        ${msg("Mine")}
      </btrix-filter-chip>

      ${when(
        this.hasFiltersSet,
        () => html`
          <sl-button
            class="[--sl-color-primary-600:var(--sl-color-neutral-500)] part-[label]:font-medium"
            size="small"
            variant="text"
            @click=${this.clearFilters}
          >
            <sl-icon slot="prefix" name="x-lg"></sl-icon>
            ${msg("Clear All")}
          </sl-button>
        `,
      )}
    </div>`;
  }

  private renderSearch() {
    return html`
      <btrix-workflow-search
        .searchOptions=${this.searchOptions}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        searchByValue=${ifDefined(
          this.selectedSearchFilterKey &&
            this.filterBy.value[this.selectedSearchFilterKey],
        )}
        @btrix-select=${(e: SelectEvent<WorkflowSearch["searchKeys"]>) => {
          const { key, value } = e.detail;
          if (key == null) return;
          this.filterBy.setValue({
            ...this.filterBy.value,
            [key]: value,
          });
        }}
        @btrix-clear=${() => {
          const {
            name: _name,
            firstSeed: _firstSeed,
            ...otherFilters
          } = this.filterBy.value;
          this.filterBy.setValue(otherFilters);
        }}
      >
      </btrix-workflow-search>
    `;
  }

  private renderWorkflowList() {
    if (!this.workflowsTask.value) return;
    const { page, total, pageSize } = this.workflowsTask.value;
    return html`
      <btrix-workflow-list>
        ${this.workflowsTask.value.items.map(this.renderWorkflowItem)}
      </btrix-workflow-list>
      <footer
        class=${clsx(
          tw`mt-6 flex justify-center`,
          total <= pageSize && tw`hidden`,
        )}
      >
        <btrix-pagination
          page=${page}
          totalCount=${total}
          size=${pageSize}
          @page-change=${async (e: PageChangeEvent) => {
            this.pagination = {
              ...this.pagination,
              page: e.detail.page,
            };
            await this.updateComplete;

            // Scroll to top of list
            // TODO once deep-linking is implemented, scroll to top of pushstate
            this.scrollIntoView({ behavior: "smooth" });
          }}
        ></btrix-pagination>
      </footer>
    `;
  }

  private readonly renderWorkflowItem = (workflow: ListWorkflow) => html`
    <btrix-workflow-list-item .workflow=${workflow}>
      <btrix-workflow-action-menu
        slot="menu"
        .workflow=${workflow}
        hidePauseResume
        @btrix-select=${async (e: BtrixSelectActionEvent) => {
          switch (e.detail.item.action) {
            case Action.Run:
              void this.runNow(workflow);
              break;
            case Action.TogglePauseResume:
              // TODO
              break;
            case Action.Stop:
              void this.stop(workflow.lastCrawlId);
              break;
            case Action.Cancel:
              void this.cancel(workflow.lastCrawlId);
              break;
            case Action.EditBrowserWindows:
              this.navigate.to(
                `${this.navigate.orgBasePath}/workflows/${workflow.id}/${WorkflowTab.LatestCrawl}`,
                {
                  dialog: "scale",
                },
              );
              break;
            case Action.EditExclusions:
              this.navigate.to(
                `${this.navigate.orgBasePath}/workflows/${workflow.id}/${WorkflowTab.LatestCrawl}`,
                {
                  dialog: "exclusions",
                },
              );
              break;
            case Action.Duplicate:
              void this.duplicateConfig(workflow);
              break;
            case Action.Delete: {
              this.workflowToDelete = workflow;
              await this.updateComplete;
              void this.deleteDialog?.show();
              break;
            }
            default:
              console.debug("unknown workflow action:", e.detail.item.action);
              break;
          }
        }}
      ></btrix-workflow-action-menu>
    </btrix-workflow-list-item>
  `;

  private renderEmptyState() {
    if (this.hasFiltersSet) {
      return html`
        <div class="rounded-lg border bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching Workflows found.")}</span
            >
            <button
              class="font-medium text-neutral-500 underline hover:no-underline"
              @click=${this.clearFilters}
            >
              ${msg("Clear search and filters")}
            </button>
          </p>
        </div>
      `;
    }

    if (this.workflowsTask.value?.page && this.workflowsTask.value.page > 1) {
      return html`
        <div class="border-b border-t py-5">
          <p class="text-center text-neutral-500">
            ${msg("Could not find page.")}
          </p>
        </div>
      `;
    }

    return html`
      <div class="border-b border-t py-5">
        <p class="text-center text-neutral-500">${msg("No Workflows yet.")}</p>
      </div>
    `;
  }

  private renderLoading() {
    return html`<div
      class="my-24 flex w-full items-center justify-center text-3xl"
    >
      <sl-spinner></sl-spinner>
    </div>`;
  }

  /**
   * Fetch Workflows and update state
   **/
  private async getWorkflows(
    params: {
      pagination: Required<APIPaginationQuery>;
      orderBy: WorkflowsList["orderBy"]["value"];
      filterBy: WorkflowsList["filterBy"]["value"];
      filterByCurrentUser: WorkflowsList["filterByCurrentUser"]["value"];
      filterByTags: WorkflowsList["filterByTags"]["value"];
      filterByTagsType: WorkflowsList["filterByTagsType"]["value"];
      filterByProfiles: WorkflowsList["filterByProfiles"]["value"];
    },
    signal: AbortSignal,
  ) {
    const query = queryString.stringify(
      {
        ...params.filterBy,
        page: params.pagination.page,
        pageSize: params.pagination.pageSize,
        userid: params.filterByCurrentUser ? this.userInfo?.id : undefined,
        tag: params.filterByTags || undefined,
        tagMatch: params.filterByTagsType,
        profileIds: params.filterByProfiles,
        sortBy: params.orderBy.field,
        sortDirection: params.orderBy.direction === "desc" ? -1 : 1,
      },
      {
        arrayFormat: "none", // For tags
      },
    );
    return await this.api.fetch<APIPaginatedList<Workflow>>(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      {
        signal: signal,
      },
    );
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(workflow: ListWorkflow) {
    const fullWorkflow = await this.getWorkflow(workflow);
    let seeds;
    let seedFile;

    if (fullWorkflow.config.seedFileId) {
      seedFile = await this.getSeedFile(fullWorkflow.config.seedFileId);
    } else {
      seeds = await this.getSeeds(workflow);
    }

    const settings = settingsForDuplicate({
      workflow: fullWorkflow,
      seeds,
      seedFile,
    });

    this.navigate.to(`${this.navigate.orgBasePath}/workflows/new`, settings);

    if (seeds && seeds.total > seeds.items.length) {
      const urlCount = this.localize.number(seeds.items.length);

      // This is likely an edge case for old workflows with >1,000 seeds
      // or URL list workflows created via API.
      this.notify.toast({
        title: msg(str`Partially copied workflow settings`),
        message: msg(str`The first ${urlCount} URLs were copied.`),
        variant: "warning",
        id: "workflow-copied-status",
      });
    } else {
      this.notify.toast({
        message: msg("Copied settings to new workflow."),
        variant: "success",
        icon: "check2-circle",
        id: "workflow-copied-status",
      });
    }
  }

  private async delete(workflow: ListWorkflow): Promise<void> {
    try {
      await this.api.fetch(`/orgs/${this.orgId}/crawlconfigs/${workflow.id}`, {
        method: "DELETE",
      });

      void this.workflowsTask.run();

      const workflow_name = html`<strong class="inline-flex"
        >${renderName(workflow)}</strong
      >`;
      this.notify.toast({
        message: msg(html`Deleted ${workflow_name} Workflow.`),
        variant: "success",
        icon: "check2-circle",
        id: "workflow-delete-status",
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't delete Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "workflow-delete-status",
      });
    }
  }

  private async cancel(crawlId: ListWorkflow["lastCrawlId"]) {
    if (!crawlId) return;
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${crawlId}/cancel`,
        {
          method: "POST",
        },
      );
      if (data.success) {
        void this.workflowsTask.run();
      } else {
        this.notify.toast({
          message: msg("Something went wrong, couldn't cancel crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "crawl-stop-error",
        });
      }
    }
  }

  private async stop(crawlId: ListWorkflow["lastCrawlId"]) {
    if (!crawlId) return;
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${crawlId}/stop`,
        {
          method: "POST",
        },
      );
      if (data.success) {
        void this.workflowsTask.run();
      } else {
        this.notify.toast({
          message: msg("Something went wrong, couldn't stop crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "crawl-stop-error",
        });
      }
    }
  }

  private async runNow(workflow: ListWorkflow): Promise<void> {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawlconfigs/${workflow.id}/run`,
        {
          method: "POST",
        },
      );

      this.notify.toast({
        message: msg(
          html`Started crawl from <strong>${renderName(workflow)}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="${this.navigate
                .orgBasePath}/workflows/${workflow.id}/${WorkflowTab.LatestCrawl}"
              @click=${this.navigate.link.bind(this)}
              >Watch crawl</a
            >`,
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      void this.workflowsTask.run();
      // Scroll to top of list
      this.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      let message = msg("Sorry, couldn't run crawl at this time.");
      if (isApiError(e) && e.statusCode === 403) {
        if (e.details === "storage_quota_reached") {
          message = msg("Your org does not have enough storage to run crawls.");
        } else if (e.details === "exec_minutes_quota_reached") {
          message = msg(
            "Your org has used all of its execution minutes for this month.",
          );
        } else {
          message = msg("You do not have permission to run crawls.");
        }
      } else if (isApiError(e) && e.details == "proxy_not_found") {
        message = msg(
          "Your org doesn't have permission to use the proxy configured for this crawl.",
        );
      }
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-start-error",
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
      } = await this.api.fetch(
        `/orgs/${this.orgId}/crawlconfigs/search-values`,
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

  private async getWorkflow(workflow: ListWorkflow): Promise<Workflow> {
    const data: Workflow = await this.api.fetch(
      `/orgs/${this.orgId}/crawlconfigs/${workflow.id}`,
    );
    return data;
  }

  private async getSeeds(workflow: ListWorkflow) {
    // NOTE Returns first 1000 seeds (backend pagination max)
    const data = await this.api.fetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawlconfigs/${workflow.id}/seeds`,
    );
    return data;
  }

  private async getSeedFile(seedFileId: string) {
    const data = await this.api.fetch<StorageSeedFile>(
      `/orgs/${this.orgId}/files/${seedFileId}`,
    );
    return data;
  }
}
