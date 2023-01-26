import type { HTMLTemplateResult, PropertyValueMap } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { parseCron } from "@cheap-glitch/mi-cron";
import debounce from "lodash/fp/debounce";
import flow from "lodash/fp/flow";
import map from "lodash/fp/map";
import orderBy from "lodash/fp/orderBy";
import filter from "lodash/fp/filter";
import Fuse from "fuse.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlConfig, InitialCrawlConfig } from "./types";
import {
  getUTCSchedule,
  humanizeNextDate,
  humanizeSchedule,
} from "../../utils/cron";
import "../../components/crawl-scheduler";
import { SlCheckbox } from "@shoelace-style/shoelace";

type RunningCrawlsMap = {
  /** Map of configId: crawlId */
  [configId: string]: string;
};

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
 * <btrix-crawl-configs-list></btrix-crawl-configs-list>
 * ```
 */
@localized()
export class CrawlTemplatesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  userId!: string;

  @state()
  crawlTemplates?: CrawlConfig[];

  @state()
  runningCrawlsMap: RunningCrawlsMap = {};

  @state()
  showEditDialog?: boolean = false;

  @state()
  selectedTemplateForEdit?: CrawlConfig;

  @state()
  private orderBy: {
    field: "created";
    direction: "asc" | "desc";
  } = {
    field: "created",
    direction: "desc",
  };

  @state()
  private filterByCurrentUser = true;

  @state()
  private searchBy: string = "";

  @state()
  private filterByScheduled: boolean | null = null;

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["name"],
    shouldSort: false,
    threshold: 0.4, // stricter; default is 0.6
  });

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("orgId") ||
      changedProperties.has("filterByCurrentUser")
    ) {
      try {
        this.crawlTemplates = await this.getCrawlTemplates();

        // Update search/filter collection
        this.fuse.setCollection(this.crawlTemplates as any);
      } catch (e) {
        this.notify({
          message: msg("Sorry, couldn't retrieve crawl configs at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  render() {
    return html`
      <div class="sticky z-10 mb-2 top-0 py-2 bg-neutral-0">
        ${this.renderControls()}
      </div>

      ${this.crawlTemplates
        ? this.crawlTemplates.length
          ? this.renderTemplateList()
          : html`
              <div class="border-t border-b py-5">
                <p class="text-center text-0-500">
                  ${msg("No crawl configs yet.")}
                </p>
              </div>
            `
        : html`<div
            class="w-full flex items-center justify-center my-24 text-3xl"
          >
            <sl-spinner></sl-spinner>
          </div>`}

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
            placeholder=${msg("Search by name")}
            clearable
            ?disabled=${!this.crawlTemplates?.length}
            @sl-input=${this.onSearchInput}
          >
            <sl-icon name="search" slot="prefix"></sl-icon>
          </sl-input>
        </div>

        <div class="grow-0 mb-4">
          <sl-button
            href=${`/orgs/${this.orgId}/crawl-configs?new&jobType=`}
            variant="primary"
            @click=${this.navLink}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${msg("New Crawl Config")}
          </sl-button>
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
          ${this.userId
            ? html`<label class="mr-3">
                <span class="text-neutral-500 mr-1"
                  >${msg("Show Only Mine")}</span
                >
                <sl-switch
                  @sl-change=${(e: CustomEvent) =>
                    (this.filterByCurrentUser = (
                      e.target as SlCheckbox
                    ).checked)}
                  ?checked=${this.filterByCurrentUser}
                ></sl-switch>
              </label>`
            : ""}

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
              ?disabled=${!this.crawlTemplates?.length}
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
      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        ${flow(...flowFns)(this.crawlTemplates)}
      </div>
    `;
  }

  private renderTemplateItem(t: CrawlConfig) {
    return html`<a
      class="block col-span-1 p-1 border shadow hover:shadow-sm hover:bg-zinc-50/50 hover:text-primary rounded text-sm transition-colors"
      aria-label=${t.name}
      href=${`/orgs/${this.orgId}/crawl-configs/config/${t.id}`}
      @click=${this.navLink}
    >
      <header class="flex">
        <div
          class="flex-1 px-3 pt-3 font-medium whitespace-nowrap truncate mb-1"
          title=${t.name}
        >
          ${t.name}
        </div>

        ${this.renderCardMenu(t)}
      </header>

      <div class="px-3 pb-3 flex justify-between items-end text-0-800">
        <div class="grid gap-2 text-xs leading-none">
          <div class="overflow-hidden">
            <sl-tooltip
              content=${t.config.seeds
                .map((seed) => (typeof seed === "string" ? seed : seed.url))
                .join(", ")}
            >
              <div class="font-mono whitespace-nowrap truncate text-0-500">
                <span class="underline decoration-dashed"
                  >${t.config.seeds
                    .map((seed) => (typeof seed === "string" ? seed : seed.url))
                    .join(", ")}</span
                >
              </div>
            </sl-tooltip>
          </div>
          <div class="font-mono text-purple-500">
            ${t.crawlCount === 1
              ? msg(str`${t.crawlCount} crawl`)
              : msg(str`${(t.crawlCount || 0).toLocaleString()} crawls`)}
          </div>
          <div>
            ${t.crawlCount
              ? html`<sl-tooltip>
                  <span slot="content" class="capitalize">
                    ${msg(
                      str`Last Crawl: ${
                        t.lastCrawlState && t.lastCrawlState.replace(/_/g, " ")
                      }`
                    )}
                  </span>
                  <a
                    class="font-medium hover:underline"
                    href=${`/orgs/${this.orgId}/crawls/crawl/${t.lastCrawlId}`}
                    @click=${(e: any) => {
                      e.stopPropagation();
                      this.navLink(e);
                    }}
                  >
                    <sl-icon
                      class="inline-block align-middle mr-1 ${t.lastCrawlState ===
                      "failed"
                        ? "text-neutral-400"
                        : "text-purple-400"}"
                      name=${t.lastCrawlState === "complete"
                        ? "check-circle-fill"
                        : t.lastCrawlState === "failed"
                        ? "x-circle-fill"
                        : "exclamation-circle-fill"}
                    ></sl-icon
                    ><sl-format-date
                      class="inline-block align-middle text-neutral-600"
                      date=${`${t.lastCrawlTime}Z` /** Z for UTC */}
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
            ${t.schedule
              ? html`
                  <sl-tooltip
                    content=${msg(
                      str`Next scheduled crawl: ${humanizeNextDate(t.schedule)}`
                    )}
                  >
                    <span>
                      <sl-icon
                        class="inline-block align-middle mr-1"
                        name="clock-history"
                      ></sl-icon
                      ><span class="inline-block align-middle text-0-600"
                        >${humanizeSchedule(t.schedule, {
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
        ${this.renderCardFooter(t)}
      </div>
    </a>`;
  }

  private renderCardMenu(t: CrawlConfig) {
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
            >${msg("Duplicate crawl config")}</span
          >
        </li>
      `,
    ];

    if (!t.inactive) {
      menuItems.unshift(html`
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            e.target.closest("sl-dropdown").hide();
            this.navTo(`/orgs/${this.orgId}/crawl-configs/config/${t.id}?edit`);
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="pencil-square"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Edit crawl config")}</span
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

  private renderCardFooter(t: CrawlConfig) {
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

  private onSearchInput = debounce(200)((e: any) => {
    this.searchBy = e.target.value;
  }) as any;

  private filterResults = () => {
    const results = this.fuse.search(this.searchBy);

    return results.map(({ item }) => item);
  };

  /**
   * Fetch crawl configs and record running crawls
   * associated with the crawl configs
   **/
  private async getCrawlTemplates(): Promise<CrawlConfig[]> {
    const params =
      this.userId && this.filterByCurrentUser ? `?userid=${this.userId}` : "";

    const data: { crawlConfigs: CrawlConfig[] } = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs${params}`,
      this.authState!
    );

    const runningCrawlsMap: RunningCrawlsMap = {};

    data.crawlConfigs.forEach(({ id, currCrawlId }) => {
      if (currCrawlId) {
        runningCrawlsMap[id] = currCrawlId;
      }
    });

    this.runningCrawlsMap = runningCrawlsMap;

    return data.crawlConfigs;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(template: CrawlConfig) {
    const crawlTemplate: InitialCrawlConfig = {
      name: msg(str`${template.name} Copy`),
      config: template.config,
      profileid: template.profileid || null,
      jobType: template.jobType,
      schedule: template.schedule,
      tags: template.tags,
    };

    this.navTo(
      `/orgs/${this.orgId}/crawl-configs?new&jobType=${crawlTemplate.jobType}`,
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

  private async deactivateTemplate(template: CrawlConfig): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${template.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.notify({
        message: msg(html`Deactivated <strong>${template.name}</strong>.`),
        variant: "success",
        icon: "check2-circle",
      });

      this.crawlTemplates = this.crawlTemplates!.filter(
        (t) => t.id !== template.id
      );
    } catch {
      this.notify({
        message: msg("Sorry, couldn't deactivate crawl config at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteTemplate(template: CrawlConfig): Promise<void> {
    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${template.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.notify({
        message: msg(html`Deleted <strong>${template.name}</strong>.`),
        variant: "success",
        icon: "check2-circle",
      });

      this.crawlTemplates = this.crawlTemplates!.filter(
        (t) => t.id !== template.id
      );
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete crawl config at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async runNow(template: CrawlConfig): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${template.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      const crawlId = data.started;

      this.runningCrawlsMap = {
        ...this.runningCrawlsMap,
        [template.id]: crawlId,
      };

      this.notify({
        message: msg(
          html`Started crawl from <strong>${template.name}</strong>. <br />
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
    } catch {
      this.notify({
        message: msg("Sorry, couldn't run crawl at this time."),
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

      this.crawlTemplates = this.crawlTemplates?.map((t) =>
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

customElements.define("btrix-crawl-configs-list", CrawlTemplatesList);
