import type { HTMLTemplateResult, PropertyValueMap } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import flow from "lodash/fp/flow";
import map from "lodash/fp/map";
import orderBy from "lodash/fp/orderBy";
import filter from "lodash/fp/filter";
import Fuse from "fuse.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Workflow, InitialCrawlConfig } from "./types";
import {
  getUTCSchedule,
  humanizeNextDate,
  humanizeSchedule,
} from "../../utils/cron";
import "../../components/crawl-scheduler";
import { SlCheckbox } from "@shoelace-style/shoelace";
import type { APIPaginatedList } from "../../types/api";
import type { CurrentUser } from "../../types/user";

type RunningCrawlsMap = {
  /** Map of configId: crawlId */
  [configId: string]: string;
};

const FILTER_BY_CURRENT_USER_STORAGE_KEY =
  "btrix.filterByCurrentUser.crawlConfigs";
const MIN_SEARCH_LENGTH = 2;
const sortableFieldLabels = {
  created_desc: msg("Newest"),
  created_asc: msg("Oldest"),
  lastCrawlTime_desc: msg("Newest Crawl"),
  lastCrawlTime_asc: msg("Oldest Crawl"),
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

  @property({ type: Object })
  userInfo!: CurrentUser;

  @state()
  crawlConfigs?: Workflow[];

  @state()
  runningCrawlsMap: RunningCrawlsMap = {};

  @state()
  showEditDialog?: boolean = false;

  @state()
  selectedTemplateForEdit?: Workflow;

  @state()
  fetchErrorStatusCode?: number;

  @state()
  private orderBy: {
    field: "created";
    direction: "asc" | "desc";
  } = {
    field: "created",
    direction: "desc",
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
      this.crawlConfigs = await this.fetchWorkflows();

      // Update search/filter collection
      this.fuse.setCollection(this.crawlConfigs as any);
    }
    if (changedProperties.has("filterByCurrentUser")) {
      window.sessionStorage.setItem(
        FILTER_BY_CURRENT_USER_STORAGE_KEY,
        this.filterByCurrentUser.toString()
      );
    }
  }

  private async fetchWorkflows() {
    this.fetchErrorStatusCode = undefined;
    try {
      return await this.getWorkflows();
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
  }

  render() {
    return html`
      <header class="contents">
        <div class="flex justify-between w-full h-8 mb-4">
          <h1 class="text-xl font-semibold">${msg("Workflows")}</h1>
          <sl-button
            href=${`/orgs/${this.orgId}/workflows?new&jobType=`}
            variant="primary"
            size="small"
            @click=${this.navLink}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${msg("New Workflow")}
          </sl-button>
        </div>
        <div class="sticky z-10 mb-3 top-2 p-4 bg-neutral-50 border rounded-lg">
          ${this.renderControls()}
        </div>
      </header>

      ${when(
        this.fetchErrorStatusCode,
        () => html`
          <div>
            <btrix-alert variant="danger"
              >${this.fetchErrorStatusCode === 403
                ? msg(`You don't have access to Workflows.`)
                : msg(
                    `Something unexpected went wrong while retrieving Workflows.`
                  )}</btrix-alert
            >
          </div>
        `,
        () =>
          this.crawlConfigs
            ? this.crawlConfigs.length
              ? this.renderTemplateList()
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

      <sl-dialog
        label=${msg(str`Edit Crawl Schedule`)}
        ?open=${this.showEditDialog}
        @sl-request-close=${() => (this.showEditDialog = false)}
        @sl-after-hide=${() => (this.selectedTemplateForEdit = undefined)}
      >
        <h2 class="text-lg font-medium mb-4">
          ${this.selectedTemplateForEdit?.name}
        </h2>

        ${this.selectedTemplateForEdit
          ? html`
              <btrix-crawl-scheduler
                .schedule=${this.selectedTemplateForEdit.schedule}
                @submit=${this.onSubmitSchedule}
              ></btrix-crawl-scheduler>
            `
          : ""}
      </sl-dialog>
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
            placeholder=${msg("Search by name or Crawl URL")}
            clearable
            ?disabled=${!this.crawlConfigs?.length}
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
              ?disabled=${!this.crawlConfigs?.length}
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

  private renderTemplateList() {
    const flowFns = [
      orderBy(this.orderBy.field, this.orderBy.direction),
      map(this.renderTemplateItem.bind(this)),
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
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${flow(...flowFns)(this.crawlConfigs)}
      </div>
    `;
  }

  private renderTemplateItem(crawlConfig: Workflow) {
    const name = this.renderName(crawlConfig);
    return html`<a
      class="block col-span-1 p-1 border shadow hover:shadow-sm hover:bg-zinc-50/50 hover:text-primary rounded text-sm transition-colors"
      aria-label=${name}
      href=${`/orgs/${this.orgId}/workflows/config/${crawlConfig.id}`}
      @click=${this.navLink}
    >
      <header class="flex">
        <div
          class="flex-1 px-3 pt-3 font-medium whitespace-nowrap truncate mb-1"
          title=${name}
        >
          ${name}
        </div>

        ${this.renderCardMenu(crawlConfig)}
      </header>

      <div class="px-3 pb-3 flex justify-between items-end text-0-800">
        <div class="grid gap-2 text-xs leading-none">
          <div class="overflow-hidden">
            <sl-tooltip
              content=${crawlConfig.config.seeds
                .map((seed) => (typeof seed === "string" ? seed : seed.url))
                .join(", ")}
            >
              <div class="font-mono whitespace-nowrap truncate text-0-500">
                <span class="underline decoration-dashed"
                  >${crawlConfig.config.seeds
                    .map((seed) => (typeof seed === "string" ? seed : seed.url))
                    .join(", ")}</span
                >
              </div>
            </sl-tooltip>
          </div>
          <div class="font-mono text-purple-500">
            ${crawlConfig.crawlCount === 1
              ? msg(str`${crawlConfig.crawlCount} crawl`)
              : msg(
                  str`${(crawlConfig.crawlCount || 0).toLocaleString()} crawls`
                )}
          </div>
          <div>
            ${crawlConfig.crawlCount
              ? html`<sl-tooltip>
                  <span slot="content" class="capitalize">
                    ${msg(
                      str`Last Crawl: ${
                        crawlConfig.lastCrawlState &&
                        crawlConfig.lastCrawlState.replace(/_/g, " ")
                      }`
                    )}
                  </span>
                  <a
                    class="font-medium hover:underline"
                    href=${`/orgs/${this.orgId}/crawls/crawl/${crawlConfig.lastCrawlId}`}
                    @click=${(e: any) => {
                      e.stopPropagation();
                      this.navLink(e);
                    }}
                  >
                    <sl-icon
                      class="inline-block align-middle mr-1 ${crawlConfig.lastCrawlState ===
                      "failed"
                        ? "text-neutral-400"
                        : "text-purple-400"}"
                      name=${crawlConfig.lastCrawlState === "complete"
                        ? "check-circle-fill"
                        : crawlConfig.lastCrawlState === "failed"
                        ? "x-circle-fill"
                        : "exclamation-circle-fill"}
                    ></sl-icon
                    ><sl-format-date
                      class="inline-block align-middle text-neutral-600"
                      date=${`${crawlConfig.lastCrawlTime}Z` /** Z for UTC */}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="numeric"
                      minute="numeric"
                    ></sl-format-date>
                  </a>
                </sl-tooltip>`
              : html`
                  <sl-icon
                    class="inline-block align-middle mr-1 text-0-400"
                    name="slash-circle"
                  ></sl-icon
                  ><span class="inline-block align-middle text-0-400"
                    >${msg("No finished crawls")}</span
                  >
                `}
          </div>
          <div>
            ${crawlConfig.schedule
              ? html`
                  <sl-tooltip
                    content=${msg(
                      str`Next scheduled crawl: ${humanizeNextDate(
                        crawlConfig.schedule
                      )}`
                    )}
                  >
                    <span>
                      <sl-icon
                        class="inline-block align-middle mr-1"
                        name="clock-history"
                      ></sl-icon
                      ><span class="inline-block align-middle text-0-600"
                        >${humanizeSchedule(crawlConfig.schedule, {
                          length: "short",
                        })}</span
                      >
                    </span>
                  </sl-tooltip>
                `
              : html`<sl-icon
                    class="inline-block align-middle mr-1 text-0-400"
                    name="slash-circle"
                  ></sl-icon
                  ><span class="inline-block align-middle text-0-400"
                    >${msg("No schedule")}</span
                  >`}
          </div>
        </div>
        ${this.renderCardFooter(crawlConfig)}
      </div>
    </a>`;
  }

  private renderCardMenu(t: Workflow) {
    const menuItems: HTMLTemplateResult[] = [
      html`
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${() => this.duplicateConfig(t)}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="files"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Duplicate Workflow")}</span
          >
        </li>
      `,
    ];

    if (!t.inactive && !this.runningCrawlsMap[t.id]) {
      menuItems.unshift(html`
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            e.target.closest("sl-dropdown").hide();
            this.navTo(`/orgs/${this.orgId}/workflows/config/${t.id}?edit`);
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="pencil-square"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Edit Workflow")}</span
          >
        </li>
      `);
    }

    if (t.crawlCount && !t.inactive) {
      menuItems.push(html`
        <li
          class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            // Close dropdown before deleting template
            e.target.closest("sl-dropdown").hide();

            this.deactivateTemplate(t);
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="file-earmark-minus"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Deactivate")}</span
          >
        </li>
      `);
    }

    if (!t.crawlCount) {
      menuItems.push(html`
        <li
          class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            // Close dropdown before deleting template
            e.target.closest("sl-dropdown").hide();

            this.deleteTemplate(t);
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="file-earmark-x"
          ></sl-icon>
          <span class="inline-block align-middle pr-2">${msg("Delete")}</span>
        </li>
      `);
    }

    return html`
      <sl-dropdown @click=${(e: any) => e.preventDefault()}>
        <sl-icon-button
          slot="trigger"
          name="three-dots-vertical"
          label=${msg("More")}
          style="font-size: 1rem"
        ></sl-icon-button>

        <ul
          class="text-sm text-neutral-800 bg-white whitespace-nowrap"
          role="menu"
        >
          ${menuItems.map((item: HTMLTemplateResult) => item)}
        </ul>
      </sl-dropdown>
    `;
  }

  private renderCardFooter(t: Workflow) {
    if (t.inactive) {
      return "";
    }

    return html`
      <div>
        <button
          class="text-xs border rounded px-2 h-7 ${this.runningCrawlsMap[t.id]
            ? "bg-purple-50"
            : "bg-white"} border-purple-200 hover:border-purple-500 text-purple-600 transition-colors"
          @click=${(e: any) => {
            e.preventDefault();
            this.runningCrawlsMap[t.id]
              ? this.navTo(
                  `/orgs/${this.orgId}/crawls/crawl/${
                    this.runningCrawlsMap[t.id]
                  }#watch`
                )
              : this.runNow(t);
          }}
        >
          <span class="whitespace-nowrap">
            ${this.runningCrawlsMap[t.id] ? msg("Watch crawl") : msg("Run now")}
          </span>
        </button>
      </div>
    `;
  }

  private renderName(crawlConfig: Workflow) {
    if (crawlConfig.name) return crawlConfig.name;
    const { config } = crawlConfig;
    const firstSeed = config.seeds[0];
    let firstSeedURL =
      typeof firstSeed === "string" ? firstSeed : firstSeed.url;
    if (config.seeds.length === 1) {
      return firstSeedURL;
    }
    const remainderCount = config.seeds.length - 1;
    if (remainderCount === 1) {
      return msg(
        html`${firstSeed}
          <span class="text-neutral-500">+${remainderCount} URL</span>`
      );
    }
    return msg(
      html`${firstSeed}
        <span class="text-neutral-500">+${remainderCount} URLs</span>`
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
   * Fetch Workflows and record running crawls
   * associated with the Workflows
   **/
  private async getWorkflows(): Promise<Workflow[]> {
    const params = this.filterByCurrentUser
      ? `?userid=${this.userInfo.id}`
      : "";

    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs${params}`,
      this.authState!
    );

    const runningCrawlsMap: RunningCrawlsMap = {};

    data.items.forEach(({ id, currCrawlId }) => {
      if (currCrawlId) {
        runningCrawlsMap[id] = currCrawlId;
      }
    });

    this.runningCrawlsMap = runningCrawlsMap;

    return data.items;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(crawlConfig: Workflow) {
    const workflow: InitialCrawlConfig = {
      name: msg(str`${this.renderName(crawlConfig)} Copy`),
      config: crawlConfig.config,
      profileid: crawlConfig.profileid || null,
      jobType: crawlConfig.jobType,
      schedule: crawlConfig.schedule,
      tags: crawlConfig.tags,
      crawlTimeout: crawlConfig.crawlTimeout,
    };

    this.navTo(
      `/orgs/${this.orgId}/workflows?new&jobType=${workflow.jobType}`,
      {
        workflow,
      }
    );

    this.notify({
      message: msg(str`Copied Workflowuration to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }

  private async deactivateTemplate(crawlConfig: Workflow): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${crawlConfig.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.notify({
        message: msg(
          html`Deactivated <strong>${this.renderName(crawlConfig)}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
      });

      this.crawlConfigs = this.crawlConfigs!.filter(
        (t) => t.id !== crawlConfig.id
      );
    } catch {
      this.notify({
        message: msg("Sorry, couldn't deactivate Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteTemplate(crawlConfig: Workflow): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${crawlConfig.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.notify({
        message: msg(
          html`Deleted <strong>${this.renderName(crawlConfig)}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
      });

      this.crawlConfigs = this.crawlConfigs!.filter(
        (t) => t.id !== crawlConfig.id
      );
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async runNow(crawlConfig: Workflow): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${crawlConfig.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      const crawlId = data.started;

      this.runningCrawlsMap = {
        ...this.runningCrawlsMap,
        [crawlConfig.id]: crawlId,
      };

      this.notify({
        message: msg(
          html`Started crawl from
            <strong>${this.renderName(crawlConfig)}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${this.orgId}/crawls/crawl/${data.started}#watch"
              @click=${this.navLink.bind(this)}
              >Watch crawl</a
            >`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
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

  private async onSubmitSchedule(event: {
    detail: { formData: FormData };
  }): Promise<void> {
    if (!this.selectedTemplateForEdit) return;

    const { formData } = event.detail;
    const interval = formData.get("scheduleInterval");
    let schedule = "";

    if (interval) {
      schedule = getUTCSchedule({
        interval: formData.get("scheduleInterval") as any,
        hour: formData.get("scheduleHour") as any,
        minute: formData.get("scheduleMinute") as any,
        period: formData.get("schedulePeriod") as any,
      });
    }
    const editedTemplateId = this.selectedTemplateForEdit.id;

    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${editedTemplateId}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({ schedule }),
        }
      );

      this.crawlConfigs = this.crawlConfigs?.map((t) =>
        t.id === editedTemplateId
          ? {
              ...t,
              schedule,
            }
          : t
      );
      this.showEditDialog = false;

      this.notify({
        message: msg("Successfully saved new schedule."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      console.error(e);

      this.notify({
        message: msg("Something went wrong, couldn't update schedule."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}

customElements.define("btrix-workflows-list", WorkflowsList);
