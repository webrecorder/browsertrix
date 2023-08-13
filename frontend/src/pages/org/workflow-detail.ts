import type { HTMLTemplateResult, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { until } from "lit/directives/until.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import queryString from "query-string";

import { CopyButton } from "../../components/copy-button";
import { CrawlStatus } from "../../components/crawl-status";
import { RelativeDuration } from "../../components/relative-duration";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type {
  Crawl,
  CrawlState,
  Workflow,
  WorkflowParams,
  JobType,
} from "./types";
import { humanizeSchedule, humanizeNextDate } from "../../utils/cron";
import { APIPaginatedList } from "../../types/api";
import { inactiveCrawlStates, isActive } from "../../utils/crawler";
import { SlSelect } from "@shoelace-style/shoelace";
import { DASHBOARD_ROUTE } from "../../routes";

const SECTIONS = ["crawls", "watch", "settings"] as const;
type Tab = (typeof SECTIONS)[number];
const DEFAULT_SECTION: Tab = "crawls";
const POLL_INTERVAL_SECONDS = 10;
const ABORT_REASON_CANCLED = "canceled";

/**
 * Usage:
 * ```ts
 * <btrix-workflow-detail></btrix-workflow-detail>
 * ```
 */
@localized()
export class WorkflowDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  workflowId!: string;

  @property({ type: Boolean })
  isEditing: boolean = false;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: String })
  openDialogName?: "scale" | "exclusions" | "cancel" | "stop";

  @property({ type: String })
  initialActivePanel?: Tab;

  @state()
  private workflow?: Workflow;

  @state()
  private crawls?: APIPaginatedList; // Only inactive crawls

  @state()
  private lastCrawlId: Workflow["lastCrawlId"] = null;

  @state()
  private lastCrawlStartTime: Workflow["lastCrawlStartTime"] = null;

  @state()
  private lastCrawlStats?: Crawl["stats"];

  @state()
  private activePanel: Tab = SECTIONS[0];

  @state()
  private isLoading: boolean = false;

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private isCancelingOrStoppingCrawl: boolean = false;

  @state()
  private filterBy: Partial<Record<keyof Crawl, any>> = {};

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    // notation: "compact",
  });
  private dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  private timerId?: number;

  private isPanelHeaderVisible?: boolean;

  private getWorkflowPromise?: Promise<Workflow>;

  private readonly jobTypeLabels: Record<JobType, string> = {
    "url-list": msg("URL List"),
    "seed-crawl": msg("Seeded Crawl"),
    custom: msg("Custom"),
  };

  private readonly tabLabels: Record<Tab, string> = {
    crawls: msg("Crawls"),
    watch: msg("Watch Crawl"),
    settings: msg("Workflow Settings"),
  };

  connectedCallback(): void {
    // Set initial active section and dialog based on URL #hash value
    if (this.initialActivePanel) {
      this.activePanel = this.initialActivePanel;
    } else {
      this.getActivePanelFromHash();
    }

    super.connectedCallback();
    window.addEventListener("hashchange", this.getActivePanelFromHash);
  }

  disconnectedCallback(): void {
    this.stopPoll();
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.getActivePanelFromHash);
  }

  firstUpdated() {
    if (
      this.openDialogName &&
      (this.openDialogName === "scale" || this.openDialogName === "exclusions")
    ) {
      this.showDialog();
    }
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (
      (changedProperties.has("workflowId") && this.workflowId) ||
      (changedProperties.get("isEditing") === true && this.isEditing === false)
    ) {
      this.fetchWorkflow();
    }
    if (changedProperties.has("isEditing") && this.isEditing) {
      this.stopPoll();
    }
    if (
      changedProperties.get("lastCrawlId") &&
      !this.lastCrawlId &&
      this.activePanel === "watch"
    ) {
      this.handleCrawlRunEnd();
    }
    if (
      !this.isEditing &&
      changedProperties.has("activePanel") &&
      this.activePanel
    ) {
      if (!this.isPanelHeaderVisible) {
        // Scroll panel header into view
        this.querySelector("btrix-tab-list")?.scrollIntoView({
          behavior: "smooth",
        });
      }

      if (this.activePanel === "crawls") {
        this.fetchCrawls();
      }
    }
  }

  private getActivePanelFromHash = async () => {
    await this.updateComplete;
    if (this.isEditing) return;

    const hashValue = window.location.hash.slice(1);
    if (SECTIONS.includes(hashValue as any)) {
      this.activePanel = hashValue as Tab;
    } else {
      this.goToTab(DEFAULT_SECTION, { replace: true });
    }
  };

  private goToTab(tab: Tab, { replace = false } = {}) {
    const path = `${window.location.href.split("#")[0]}#${tab}`;
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    this.activePanel = tab;
  }

  private async handleCrawlRunEnd() {
    this.goToTab("crawls", { replace: true });
    await this.fetchWorkflow();

    let notifyOpts = {
      message: msg("Crawl finished."),
      variant: "info",
      icon: "info-circle",
    } as any;
    // TODO consolidate with `CrawlStatus.getContent`
    switch (this.workflow!.lastCrawlState) {
      case "complete":
        notifyOpts = {
          message: msg("Crawl complete."),
          variant: "success",
          icon: "check-circle",
        };
        break;
      case "canceled":
        notifyOpts = {
          message: msg("Crawl canceled."),
          variant: "danger",
          icon: "x-octagon",
        };
        break;
      case "failed":
        notifyOpts = {
          message: msg("Crawl failed."),
          variant: "danger",
          icon: "exclamation-triangle",
        };
        break;
      default:
        break;
    }
    this.notify({
      ...notifyOpts,
      duration: 8000,
    });
  }

  private async fetchWorkflow() {
    this.stopPoll();
    this.isLoading = true;

    try {
      this.getWorkflowPromise = this.getWorkflow();
      this.workflow = await this.getWorkflowPromise;
      this.lastCrawlId = this.workflow.lastCrawlId;
      this.lastCrawlStartTime = this.workflow.lastCrawlStartTime;
      if (this.lastCrawlId) {
        this.fetchCurrentCrawlStats();
      }
    } catch (e: any) {
      this.notify({
        message:
          e.statusCode === 404
            ? msg("Workflow not found.")
            : msg("Sorry, couldn't retrieve Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isLoading = false;

    if (!this.isEditing) {
      // Restart timer for next poll
      this.timerId = window.setTimeout(() => {
        this.fetchWorkflow();
      }, 1000 * POLL_INTERVAL_SECONDS);
    }
  }

  render() {
    if (this.isEditing && this.isCrawler) {
      return html`
        <div class="grid grid-cols-1 gap-7">
          ${when(this.workflow, this.renderEditor)}
        </div>
      `;
    }

    return html`
      <div class="grid grid-cols-1 gap-7">
        ${this.renderHeader()}

        <header class="col-span-1 md:flex justify-between items-end">
          <h2>
            <span
              class="inline-block align-middle text-xl font-semibold leading-10 md:mr-2"
              >${this.renderName()}</span
            >
            ${when(
              this.workflow?.inactive,
              () => html`
                <btrix-badge class="inline-block align-middle" variant="warning"
                  >${msg("Inactive")}</btrix-badge
                >
              `
            )}
          </h2>
          <div class="flex-0 flex justify-end">
            ${when(
              this.isCrawler && this.workflow && !this.workflow.inactive,
              this.renderActions
            )}
          </div>
        </header>

        <section class="col-span-1 border rounded-lg py-2">
          ${this.renderDetails()}
        </section>

        ${when(
          this.workflow,
          this.renderTabList,
          () => html`<div
            class="w-full flex items-center justify-center my-24 text-3xl"
          >
            <sl-spinner></sl-spinner>
          </div>`
        )}
      </div>

      <btrix-dialog
        label=${msg("Stop Crawl?")}
        ?open=${this.openDialogName === "stop"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          "Pages crawled so far will be saved and marked as incomplete. Are you sure you want to stop crawling?"
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >Keep Crawling</sl-button
          >
          <sl-button
            size="small"
            variant="primary"
            ?loading=${this.isCancelingOrStoppingCrawl}
            @click=${async () => {
              await this.stop();
              this.openDialogName = undefined;
            }}
            >Stop Crawling</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-dialog
        label=${msg("Cancel Crawl?")}
        ?open=${this.openDialogName === "cancel"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          "Canceling will discard all pages crawled. Are you sure you want to discard them?"
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >Keep Crawling</sl-button
          >
          <sl-button
            size="small"
            variant="primary"
            ?loading=${this.isCancelingOrStoppingCrawl}
            @click=${async () => {
              await this.cancel();
              this.openDialogName = undefined;
            }}
            >Cancel & Discard Crawl</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderHeader(workflowId?: string) {
    return html`
      <nav class="col-span-1">
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${`/orgs/${this.orgId}/workflows${
            workflowId ? `/crawl/${workflowId}` : "/crawls"
          }`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${workflowId
              ? msg(html`Back to ${this.renderName()}`)
              : msg("Back to Crawl Workflows")}</span
          >
        </a>
      </nav>
    `;
  }

  private renderTabList = () => html`
    <btrix-tab-list activePanel=${this.activePanel} hideIndicator>
      <btrix-observable
        slot="header"
        @intersect=${({ detail }: CustomEvent) =>
          (this.isPanelHeaderVisible = detail.entry.isIntersecting)}
      >
        <header class="flex items-center justify-between h-5">
          ${this.renderPanelHeader()}
        </header>
      </btrix-observable>

      ${this.renderTab("crawls")}
      ${this.renderTab("watch", { disabled: !this.lastCrawlId })}
      ${this.renderTab("settings")}

      <btrix-tab-panel name="crawls">${this.renderCrawls()}</btrix-tab-panel>
      <btrix-tab-panel name="watch">
        ${until(
          this.getWorkflowPromise?.then(
            () => html`
              ${when(this.activePanel === "watch", () =>
                this.workflow?.isCrawlRunning
                  ? html` <div class="border rounded-lg py-2 mb-5 h-14">
                        ${this.renderCurrentCrawl()}
                      </div>
                      ${this.renderWatchCrawl()}`
                  : this.renderInactiveWatchCrawl()
              )}
            `
          )
        )}
      </btrix-tab-panel>
      <btrix-tab-panel name="settings">
        ${this.renderSettings()}
      </btrix-tab-panel>
    </btrix-tab-list>
  `;

  private renderPanelHeader() {
    if (!this.activePanel) return;
    if (this.activePanel === "crawls") {
      return html`<h3>
        ${this.tabLabels[this.activePanel]}
        ${when(
          this.crawls,
          () =>
            html`
              <span class="text-neutral-500"
                >(${this.crawls!.total.toLocaleString()}${this.workflow
                  ?.isCrawlRunning
                  ? html`<span class="text-success"> + 1</span>`
                  : ""})</span
              >
            `
        )}
      </h3>`;
    }
    if (this.activePanel === "settings") {
      return html` <h3>${this.tabLabels[this.activePanel]}</h3>
        <sl-icon-button
          name="gear"
          label="Edit workflow settings"
          @click=${() =>
            this.navTo(
              `/orgs/${this.workflow?.oid}/workflows/crawl/${this.workflow?.id}?edit`
            )}
        >
        </sl-icon-button>`;
    }
    if (this.activePanel === "watch") {
      return html` <h3>${this.tabLabels[this.activePanel]}</h3>
        <sl-button
          size="small"
          ?disabled=${!this.workflow?.isCrawlRunning}
          @click=${() => (this.openDialogName = "scale")}
        >
          <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
          <span> ${msg("Edit Crawler Instances")} </span>
        </sl-button>`;
    }

    return html`<h3>${this.tabLabels[this.activePanel]}</h3>`;
  }

  private renderTab(tabName: Tab, { disabled = false } = {}) {
    const isActive = tabName === this.activePanel;
    let className = "text-neutral-600 hover:bg-neutral-50";
    if (isActive) {
      className = "text-blue-600 bg-blue-50 shadow-sm";
    } else if (disabled) {
      className = "text-neutral-300 cursor-not-allowed";
    }
    return html`
      <a
        slot="nav"
        href=${`${window.location.pathname}#${tabName}`}
        class="block font-medium rounded-sm mb-2 mr-2 p-2 transition-all ${className}"
        aria-selected=${isActive}
        aria-disabled=${disabled}
        @click=${(e: MouseEvent) => {
          if (disabled) e.preventDefault();
        }}
      >
        ${this.tabLabels[tabName]}
      </a>
    `;
  }

  private renderEditor = () => html`
    ${this.renderHeader(this.workflow!.id)}

    <header>
      <h2 class="text-xl font-semibold leading-10">${this.renderName()}</h2>
    </header>

    ${when(
      !this.isLoading,
      () => html`
        <btrix-workflow-editor
          .initialWorkflow=${this.workflow}
          jobType=${this.workflow!.jobType}
          configId=${this.workflow!.id}
          orgId=${this.orgId}
          .authState=${this.authState}
          @reset=${(e: Event) =>
            this.navTo(
              `/orgs/${this.orgId}/workflows/crawl/${this.workflow!.id}`
            )}
        ></btrix-workflow-editor>
      `
    )}
  `;

  private renderActions = () => {
    if (!this.workflow) return;
    const workflow = this.workflow;

    return html`
      ${when(
        this.workflow?.isCrawlRunning,
        () => html`
          <sl-button-group class="mr-2">
            <sl-button
              size="small"
              @click=${() => (this.openDialogName = "stop")}
              ?disabled=${!this.lastCrawlId ||
              this.isCancelingOrStoppingCrawl ||
              this.workflow?.lastCrawlStopping}
            >
              <sl-icon name="dash-circle" slot="prefix"></sl-icon>
              <span>${msg("Stop")}</span>
            </sl-button>
            <sl-button
              size="small"
              @click=${() => (this.openDialogName = "cancel")}
              ?disabled=${!this.lastCrawlId || this.isCancelingOrStoppingCrawl}
            >
              <sl-icon
                name="x-octagon"
                slot="prefix"
                class="text-danger"
              ></sl-icon>
              <span class="text-danger">${msg("Cancel")}</span>
            </sl-button>
          </sl-button-group>
        `,
        () => html`
          <sl-button
            size="small"
            variant="primary"
            class="mr-2"
            @click=${() => this.runNow()}
          >
            <sl-icon name="play" slot="prefix"></sl-icon>
            <span>${msg("Run Crawl")}</span>
          </sl-button>
        `
      )}

      <sl-dropdown placement="bottom-end" distance="4" hoist>
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          ${when(
            this.workflow?.isCrawlRunning,
            // HACK shoelace doesn't current have a way to override non-hover
            // color without resetting the --sl-color-neutral-700 variable
            () => html`
              <sl-menu-item
                @click=${() => (this.openDialogName = "stop")}
                ?disabled=${workflow.lastCrawlStopping ||
                this.isCancelingOrStoppingCrawl}
              >
                <sl-icon name="dash-circle" slot="prefix"></sl-icon>
                ${msg("Stop Crawl")}
              </sl-menu-item>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                ?disabled=${this.isCancelingOrStoppingCrawl}
                @click=${() => (this.openDialogName = "cancel")}
              >
                <sl-icon name="x-octagon" slot="prefix"></sl-icon>
                ${msg("Cancel & Discard Crawl")}
              </sl-menu-item>
            `,
            () => html`
              <sl-menu-item
                style="--sl-color-neutral-700: var(--success)"
                @click=${() => this.runNow()}
              >
                <sl-icon name="play" slot="prefix"></sl-icon>
                ${msg("Run Crawl")}
              </sl-menu-item>
            `
          )}
          ${when(
            workflow.isCrawlRunning,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item @click=${() => (this.openDialogName = "scale")}>
                <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                ${msg("Edit Crawler Instances")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => (this.openDialogName = "exclusions")}
              >
                <sl-icon name="table" slot="prefix"></sl-icon>
                ${msg("Edit Exclusions")}
              </sl-menu-item>
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
          <sl-menu-item @click=${() => this.duplicateConfig()}>
            <sl-icon name="files" slot="prefix"></sl-icon>
            ${msg("Duplicate Workflow")}
          </sl-menu-item>
          ${when(!this.lastCrawlId, () => {
            const shouldDeactivate = workflow.crawlCount && !workflow.inactive;
            return html`
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() =>
                  shouldDeactivate ? this.deactivate() : this.delete()}
              >
                <sl-icon name="trash3" slot="prefix"></sl-icon>
                ${shouldDeactivate
                  ? msg("Deactivate Workflow")
                  : msg("Delete Workflow")}
              </sl-menu-item>
            `;
          })}
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderDetails() {
    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(
          msg("Status"),
          () => html`
            <btrix-crawl-status
              state=${this.workflow!.lastCrawlState || msg("No Crawls Yet")}
              ?stopping=${this.workflow?.lastCrawlStopping}
            ></btrix-crawl-status>
          `
        )}
        ${this.renderDetailItem(
          msg("Total Size"),
          () => html` <sl-format-bytes
            value=${this.workflow!.totalSize}
            display="narrow"
          ></sl-format-bytes>`
        )}
        ${this.renderDetailItem(msg("Schedule"), () =>
          this.workflow!.schedule
            ? html`
                <div>
                  ${humanizeSchedule(this.workflow!.schedule, {
                    length: "short",
                  })}
                </div>
              `
            : html`<span class="text-neutral-400">${msg("No Schedule")}</span>`
        )}
        ${this.renderDetailItem(msg("Created By"), () =>
          msg(
            str`${this.workflow!.createdByName} on ${this.dateFormatter.format(
              new Date(`${this.workflow!.created}Z`)
            )}`
          )
        )}
      </btrix-desc-list>
    `;
  }

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: () => any
  ) {
    return html`
      <btrix-desc-list-item label=${label}>
        ${when(
          this.workflow,
          renderContent,
          () => html`<sl-skeleton class="w-full"></sl-skeleton>`
        )}
      </btrix-desc-list-item>
    `;
  }

  private renderName() {
    if (!this.workflow) return "";
    if (this.workflow.name) return this.workflow.name;
    const { config } = this.workflow;
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

  private renderCrawls() {
    return html`
      <section>
        <div
          class="mb-3 p-4 bg-neutral-50 border rounded-lg flex items-center justify-end"
        >
          <div class="flex items-center">
            <div class="text-neutral-500 mx-2">${msg("View:")}</div>
            <sl-select
              id="stateSelect"
              class="flex-1 md:min-w-[16rem]"
              size="small"
              pill
              multiple
              max-options-visible="1"
              placeholder=${msg("All Crawls")}
              @sl-change=${async (e: CustomEvent) => {
                const value = (e.target as SlSelect).value as CrawlState[];
                await this.updateComplete;
                this.filterBy = {
                  ...this.filterBy,
                  state: value,
                };
                this.fetchCrawls();
              }}
            >
              ${inactiveCrawlStates.map(this.renderStatusMenuItem)}
            </sl-select>
          </div>
        </div>

        ${when(
          this.workflow?.isCrawlRunning,
          () => html`<div class="mb-4">
            <btrix-alert variant="success" class="text-sm">
              ${msg(
                html`Crawl is currently running.
                  <a
                    href="${`${window.location.pathname}#watch`}"
                    class="underline hover:no-underline"
                    >Watch Crawl Progress</a
                  >`
              )}
            </btrix-alert>
          </div>`
        )}

        <btrix-crawl-list workflowId=${this.workflowId}>
          <span slot="idCol">${msg("Start Time")}</span>
          ${when(
            this.crawls,
            () =>
              this.crawls!.items.map(
                (crawl: Crawl) => html`
                  <btrix-crawl-list-item .crawl=${crawl}>
                    <sl-format-date
                      slot="id"
                      date=${`${crawl.started}Z`}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="2-digit"
                      minute="2-digit"
                    ></sl-format-date>
                    <sl-menu slot="menu">
                      <sl-menu-item
                        style="--sl-color-neutral-700: var(--danger)"
                        @click=${() => this.deleteCrawl(crawl)}
                      >
                        <sl-icon name="trash3" slot="prefix"></sl-icon>
                        ${msg("Delete Crawl")}
                      </sl-menu-item>
                    </sl-menu>
                  </btrix-crawl-list-item>
                `
              ),
            () => html`<div
              class="w-full flex items-center justify-center my-24 text-3xl"
            >
              <sl-spinner></sl-spinner>
            </div>`
          )}
        </btrix-crawl-list>

        ${when(
          this.crawls && !this.crawls.items.length,
          () => html`
            <div class="p-4">
              <p class="text-center text-neutral-400">
                ${this.crawls?.total
                  ? msg("No matching crawls found.")
                  : msg("No crawls yet.")}
              </p>
            </div>
          `
        )}
      </section>
    `;
  }

  private renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private renderCurrentCrawl = () => {
    const skeleton = html`<sl-skeleton class="w-full"></sl-skeleton>`;

    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(msg("Pages Crawled"), () =>
          this.lastCrawlStats
            ? msg(
                str`${this.numberFormatter.format(
                  +(this.lastCrawlStats.done || 0)
                )} / ${this.numberFormatter.format(
                  +(this.lastCrawlStats.found || 0)
                )}`
              )
            : html`<sl-spinner></sl-spinner>`
        )}
        ${this.renderDetailItem(msg("Run Duration"), () =>
          this.lastCrawlStartTime
            ? RelativeDuration.humanize(
                new Date().valueOf() -
                  new Date(`${this.lastCrawlStartTime}Z`).valueOf()
              )
            : skeleton
        )}
        ${this.renderDetailItem(msg("Crawl Size"), () =>
          this.workflow
            ? html`<sl-format-bytes
                value=${this.workflow.lastCrawlSize || 0}
                display="narrow"
              ></sl-format-bytes>`
            : skeleton
        )}
        ${this.renderDetailItem(msg("Crawler Instances"), () =>
          this.workflow ? this.workflow.scale : skeleton
        )}
      </btrix-desc-list>
    `;
  };

  private renderWatchCrawl = () => {
    if (!this.authState || !this.workflow?.lastCrawlState) return "";

    let waitingMsg = null;

    switch (this.workflow.lastCrawlState) {
      case "starting":
        waitingMsg = msg("Crawl starting...");
        break;

      case "waiting_capacity":
        waitingMsg = msg(
          "Crawl waiting for available resources before it can start..."
        );
        break;

      case "waiting_org_limit":
        waitingMsg = msg(
          "Crawl waiting for others to finish, concurrent limit per Organization reached..."
        );
        break;
    }

    const isRunning = this.workflow.lastCrawlState === "running";
    const isStopping = this.workflow.lastCrawlStopping;
    const authToken = this.authState.headers.Authorization.split(" ")[1];

    return html`
      ${waitingMsg
        ? html`<div class="rounded border p-3">
            <p class="text-sm text-neutral-600 motion-safe:animate-pulse">
              ${waitingMsg}
            </p>
          </div>`
        : isActive(this.workflow.lastCrawlState)
        ? html`
            ${isStopping
              ? html`
                  <div class="mb-4">
                    <btrix-alert variant="warning" class="text-sm">
                      ${msg("Crawl stopping...")}
                    </btrix-alert>
                  </div>
                `
              : ""}
          `
        : this.renderInactiveCrawlMessage()}
      ${when(
        isRunning,
        () => html`
          <div id="screencast-crawl">
            <btrix-screencast
              authToken=${authToken}
              orgId=${this.orgId}
              crawlId=${this.lastCrawlId}
              scale=${this.workflow!.scale}
            ></btrix-screencast>
          </div>

          <section class="mt-8">${this.renderExclusions()}</section>

          <btrix-dialog
            label=${msg("Edit Crawler Instances")}
            ?open=${this.openDialogName === "scale"}
            @sl-request-close=${() => (this.openDialogName = undefined)}
            @sl-show=${this.showDialog}
            @sl-after-hide=${() => (this.isDialogVisible = false)}
          >
            ${this.isDialogVisible ? this.renderEditScale() : ""}
          </btrix-dialog>
        `
      )}
    `;
  };

  private renderInactiveWatchCrawl() {
    return html`
      <section
        class="border rounded-lg p-4 h-56 min-h-max flex flex-col items-center justify-center"
      >
        <p class="font-medium text-base">
          ${msg("Crawl is not currently running.")}
        </p>
        <div class="mt-4">
          ${when(
            this.workflow?.lastCrawlId,
            () => html`
              <sl-button
                class="mr-2"
                href=${`/orgs/${this.orgId}/items/crawl/${
                  this.workflow!.lastCrawlId
                }?workflowId=${this.workflowId}#replay`}
                variant="primary"
                size="small"
                @click=${this.navLink}
              >
                <sl-icon
                  slot="prefix"
                  name="link-replay"
                  library="app"
                ></sl-icon>
                ${msg("Replay Latest Crawl")}</sl-button
              >
            `
          )}

          <sl-button size="small" @click=${() => this.runNow()}>
            <sl-icon name="play" slot="prefix"></sl-icon>
            ${msg("Run Crawl")}
          </sl-button>
        </div>
      </section>
    `;
  }

  private renderInactiveCrawlMessage() {
    return html`
      <div class="rounded border bg-neutral-50 p-3">
        <p class="text-sm text-neutral-600">${msg("Crawl is not running.")}</p>
      </div>
    `;
  }

  private renderExclusions() {
    return html`
      <header class="flex items-center justify-between">
        <h3 class="leading-none text-lg font-semibold mb-2">
          ${msg("Crawl URLs")}
        </h3>
        <sl-button
          size="small"
          variant="primary"
          @click=${() => (this.openDialogName = "exclusions")}
        >
          <sl-icon slot="prefix" name="table"></sl-icon>
          ${msg("Edit Exclusions")}
        </sl-button>
      </header>

      ${when(
        this.lastCrawlId,
        () => html`
          <btrix-crawl-queue
            orgId=${this.orgId}
            crawlId=${this.lastCrawlId}
            .authState=${this.authState}
          ></btrix-crawl-queue>
        `
      )}

      <btrix-dialog
        label=${msg("Crawl Queue Editor")}
        ?open=${this.openDialogName === "exclusions"}
        style=${/* max-w-screen-lg: */ `--width: 1124px;`}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.workflow && this.isDialogVisible
          ? html`<btrix-exclusion-editor
              orgId=${this.orgId}
              crawlId=${ifDefined(this.lastCrawlId)}
              .config=${this.workflow.config}
              .authState=${this.authState}
              ?isActiveCrawl=${isActive(this.workflow.lastCrawlState!)}
              @on-success=${this.handleExclusionChange}
            ></btrix-exclusion-editor>`
          : ""}
        <div slot="footer">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Done Editing")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderEditScale() {
    if (!this.workflow) return;

    const scaleOptions = [
      {
        value: 1,
        label: "1",
      },
      {
        value: 2,
        label: "2",
      },
      {
        value: 3,
        label: "3",
      },
    ];

    return html`
      <div>
        <sl-radio-group
          value=${this.workflow.scale}
          help-text=${msg(
            "This change will only apply to the currently running crawl."
          )}
        >
          ${scaleOptions.map(
            ({ value, label }) => html`
              <sl-radio-button
                value=${value}
                size="small"
                @click=${async () => {
                  await this.scale(value);
                  this.openDialogName = undefined;
                }}
                ?disabled=${this.isSubmittingUpdate}
                >${label}</sl-radio-button
              >
            `
          )}
        </sl-radio-group>
      </div>
      <div slot="footer" class="flex justify-between">
        <sl-button
          size="small"
          type="reset"
          @click=${() => (this.openDialogName = undefined)}
          >${msg("Cancel")}</sl-button
        >
      </div>
    `;
  }

  private renderSettings() {
    return html`<section class="border rounded-lg py-3 px-5">
      <btrix-config-details
        .authState=${this.authState!}
        .crawlConfig=${this.workflow}
        anchorLinks
      ></btrix-config-details>
    </section>`;
  }

  private showDialog = async () => {
    await this.getWorkflowPromise;
    this.isDialogVisible = true;
  };

  private handleExclusionChange(e: CustomEvent) {
    this.fetchWorkflow();
  }

  private async scale(value: Crawl["scale"]) {
    if (!this.lastCrawlId) return;
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/scale`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({ scale: +value }),
        }
      );

      if (data.scaled) {
        this.fetchWorkflow();
        this.notify({
          message: msg("Updated crawl scale."),
          variant: "success",
          icon: "check2-circle",
        });
      } else {
        throw new Error("unhandled API response");
      }
    } catch {
      this.notify({
        message: msg("Sorry, couldn't change crawl scale at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  private async getWorkflow(): Promise<Workflow> {
    const data: Workflow = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}`,
      this.authState!
    );
    return data;
  }

  private async fetchCrawls() {
    try {
      this.crawls = await this.getCrawls();
    } catch {
      this.notify({
        message: msg("Sorry, couldn't get crawls at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawls(): Promise<APIPaginatedList> {
    const query = queryString.stringify(
      {
        state: this.filterBy.state || inactiveCrawlStates,
        cid: this.workflowId,
        sortBy: "started",
      },
      {
        arrayFormat: "comma",
      }
    );
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawls?${query}`,
      this.authState!
    );

    return data;
  }

  private async fetchCurrentCrawlStats() {
    if (!this.lastCrawlId) return;

    try {
      // TODO see if API can pass stats in GET workflow
      const { stats } = await this.getCrawl(this.lastCrawlId);
      this.lastCrawlStats = stats;
    } catch (e) {
      // TODO handle error
      console.debug(e);
    }
  }

  private stopPoll() {
    window.clearTimeout(this.timerId);
  }

  private async getCrawl(crawlId: Crawl["id"]): Promise<Crawl> {
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/crawls/${crawlId}/replay.json`,
      this.authState!
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig() {
    if (!this.workflow) return;

    const workflowParams: WorkflowParams = {
      ...this.workflow,
      name: msg(str`${this.renderName()} Copy`),
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

  private async deactivate(): Promise<void> {
    if (!this.workflow) return;

    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.workflow = {
        ...this.workflow,
        inactive: true,
      };

      this.notify({
        message: msg(html`Deactivated <strong>${this.renderName()}</strong>.`),
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

  private async delete(): Promise<void> {
    if (!this.workflow) return;

    const isDeactivating = this.workflow.crawlCount > 0;

    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.navTo(`/orgs/${this.orgId}/workflows/crawls`);

      this.notify({
        message: isDeactivating
          ? msg(html`Deactivated <strong>${this.renderName()}</strong>.`)
          : msg(html`Deleted <strong>${this.renderName()}</strong>.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: isDeactivating
          ? msg("Sorry, couldn't deactivate Workflow at this time.")
          : msg("Sorry, couldn't delete Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async cancel() {
    if (!this.lastCrawlId) return;

    this.isCancelingOrStoppingCrawl = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.fetchWorkflow();
      } else {
        throw data;
      }
    } catch {
      this.notify({
        message: msg("Something went wrong, couldn't cancel crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isCancelingOrStoppingCrawl = false;
  }

  private async stop() {
    if (!this.lastCrawlId) return;

    this.isCancelingOrStoppingCrawl = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.fetchWorkflow();
      } else {
        throw data;
      }
    } catch {
      this.notify({
        message: msg("Something went wrong, couldn't stop crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isCancelingOrStoppingCrawl = false;
  }

  private async runNow(): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow!.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );
      this.lastCrawlId = data.started;
      // remove 'Z' from timestamp to match API response
      this.lastCrawlStartTime = new Date().toISOString().slice(0, -1);
      this.fetchWorkflow();
      this.goToTab("watch");

      this.notify({
        message: msg("Starting crawl."),
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

  private async deleteCrawl(crawl: Crawl) {
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

      this.crawls = {
        ...this.crawls!,
        items: this.crawls!.items.filter((c) => c.id !== crawl.id),
      };
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
}

customElements.define("btrix-workflow-detail", WorkflowDetail);
