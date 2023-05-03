import type { HTMLTemplateResult, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
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

const SECTIONS = ["artifacts", "watch", "settings"] as const;
type Tab = (typeof SECTIONS)[number];

const POLL_INTERVAL_SECONDS = 10;

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
  openDialogName?: "scale" | "exclusions";

  @state()
  private workflow?: Workflow;

  @state()
  private crawls?: Crawl[]; // Only inactive crawls

  @state()
  private currentCrawl?: Crawl;

  @state()
  private activePanel?: Tab;

  @state()
  private isLoading: boolean = false;

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private isDialogVisible: boolean = false;

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

  private readonly jobTypeLabels: Record<JobType, string> = {
    "url-list": msg("URL List"),
    "seed-crawl": msg("Seeded Crawl"),
    custom: msg("Custom"),
  };

  private readonly tabLabels: Record<Tab, string> = {
    artifacts: msg("Crawls"),
    watch: msg("Watch Crawl"),
    settings: msg("Workflow Settings"),
  };

  connectedCallback(): void {
    // Set initial active section and dialog based on URL #hash value
    const hash = window.location.hash.slice(1);
    if (SECTIONS.includes(hash as any)) {
      this.activePanel = hash as Tab;
    }

    if (
      this.openDialogName &&
      (this.openDialogName === "scale" || this.openDialogName === "exclusions")
    ) {
      this.isDialogVisible = true;
    }
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this.stopPoll();
    super.disconnectedCallback();
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
    if (changedProperties.has("activePanel") && this.activePanel) {
      if (!this.isPanelHeaderVisible) {
        // Scroll panel header into view
        this.querySelector("btrix-tab-list")?.scrollIntoView({
          behavior: "smooth",
        });
      }

      if (this.activePanel !== window.location.hash.slice(1)) {
        window.location.hash = `#${this.activePanel}`;
      }

      if (this.activePanel === "artifacts") {
        this.fetchCrawls();
      }
    }
  }

  private async fetchWorkflow() {
    this.stopPoll();
    this.isLoading = true;

    try {
      this.workflow = await this.getWorkflow();
      let activePanel = this.activePanel;

      if (!this.activePanel) {
        if (this.workflow.currCrawlId) {
          activePanel = "watch";
        } else {
          activePanel = "artifacts";
        }
      }

      if (activePanel === "watch") {
        if (this.workflow.currCrawlId) {
          this.fetchCurrentCrawl();
        } else {
          activePanel = "artifacts";
        }
      }

      this.activePanel = activePanel;
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
              this.renderMenu
            )}
          </div>
        </header>

        <section class="col-span-1 border rounded-lg py-2 h-14">
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
              ? msg(str`Back to ${this.renderName()}`)
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

      ${when(this.workflow?.currCrawlId, () => this.renderTab("watch"))}
      ${this.renderTab("artifacts")} ${this.renderTab("settings")}

      <btrix-tab-panel name="artifacts"
        >${this.renderArtifacts()}</btrix-tab-panel
      >
      <btrix-tab-panel name="watch"
        >${when(
          this.activePanel === "watch",
          () => html` <div class="border rounded-lg py-2 mb-5 h-14">
              ${this.renderCurrentCrawl()}
            </div>
            ${this.renderWatchCrawl()}`
        )}</btrix-tab-panel
      >
      <btrix-tab-panel name="settings">
        ${this.renderSettings()}
      </btrix-tab-panel>
    </btrix-tab-list>
  `;

  private renderPanelHeader() {
    if (!this.activePanel) return;
    if (this.activePanel === "artifacts") {
      return html`<h3>
        ${this.workflow?.crawlCount === 1
          ? msg(str`${this.workflow?.crawlCount} Crawl`)
          : msg(str`${this.workflow?.crawlCount} Crawls`)}
      </h3>`;
    }

    if (this.activePanel === "watch") {
      return html` <h3>${this.tabLabels[this.activePanel]}</h3>
        <sl-button
          size="small"
          ?disabled=${this.workflow?.currCrawlState !== "running"}
          @click=${() => {
            this.openDialogName = "scale";
            this.isDialogVisible = true;
          }}
        >
          <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
          <span> ${msg("Crawler Instances")} </span>
        </sl-button>`;
    }

    return html`<h3>${this.tabLabels[this.activePanel]}</h3>`;
  }

  private renderTab(tabName: Tab) {
    const isActive = tabName === this.activePanel;
    return html`
      <a
        slot="nav"
        href=${`/orgs/${this.orgId}/workflows/crawl/${this.workflow?.id}#${tabName}`}
        class="block font-medium rounded-sm mb-2 mr-2 p-2 transition-all ${isActive
          ? "text-blue-600 bg-blue-50 shadow-sm"
          : "text-neutral-600 hover:bg-neutral-50"}"
        @click=${() => (this.activePanel = tabName)}
        aria-selected=${isActive}
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

  private renderMenu = () => {
    if (!this.workflow) return;
    const workflow = this.workflow;

    return html`
      <sl-dropdown placement="bottom-end" distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          ${when(
            workflow.currCrawlId,
            // HACK shoelace doesn't current have a way to override non-hover
            // color without resetting the --sl-color-neutral-700 variable
            () => html`
              <sl-menu-item
                @click=${() => this.stop()}
                ?disabled=${workflow.currCrawlState === "stopping"}
              >
                <sl-icon name="dash-circle" slot="prefix"></sl-icon>
                ${msg("Stop Crawl")}
              </sl-menu-item>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => this.cancel()}
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
            workflow.currCrawlState === "running",
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                @click=${() => {
                  this.openDialogName = "scale";
                  this.isDialogVisible = true;
                }}
              >
                <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                ${msg("Edit Crawler Instances")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => {
                  this.openDialogName = "exclusions";
                  this.isDialogVisible = true;
                }}
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
            @click=${() => CopyButton.copyToClipboard(workflow.tags.join(","))}
            ?disabled=${!workflow.tags.length}
          >
            <sl-icon name="tags" slot="prefix"></sl-icon>
            ${msg("Copy Tags")}
          </sl-menu-item>
          <sl-menu-item @click=${() => this.duplicateConfig()}>
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
              shouldDeactivate ? this.deactivate() : this.delete()}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${
              shouldDeactivate
                ? msg("Deactivate Workflow")
                : msg("Delete Workflow")
            }
          </sl-menu-item>
            </sl-menu>

      </sl-dropdown>
        `;
          })}
        </sl-menu></sl-dropdown
      >
    `;
  };

  private renderDetails() {
    return html`
      <dl class="h-14 px-3 md:px-0 md:flex justify-evenly">
        ${this.renderDetailItem(
          msg("Status"),
          () => html`
            <btrix-crawl-status
              state=${this.workflow!.currCrawlState ||
              this.workflow!.lastCrawlState ||
              msg("No Crawls Yet")}
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
        ${this.renderDetailItem(
          msg("Created By"),
          () =>
            msg(
              str`${
                this.workflow!.createdByName
              } on ${this.dateFormatter.format(
                new Date(`${this.workflow!.created}Z`)
              )}`
            ),
          true
        )}
      </dl>
    `;
  }

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: () => any,
    isLast = false
  ) {
    return html`
      <btrix-desc-list-item label=${label}>
        ${when(
          this.workflow,
          renderContent,
          () => html`<sl-skeleton class="w-full"></sl-skeleton>`
        )}
      </btrix-desc-list-item>
      ${when(!isLast, () => html`<hr class="flex-0 border-l w-0 h-10" />`)}
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

  private renderArtifacts() {
    return html`
      <section>
        <div class="mb-3 p-4 bg-neutral-50 border rounded-lg flex justify-end">
          <div class="flex items-center">
            <div class="text-neutral-500 mx-2">${msg("View:")}</div>
            <sl-select
              id="stateSelect"
              class="flex-1 md:min-w-[16rem]"
              size="small"
              pill
              multiple
              max-tags-visible="1"
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

        <btrix-crawl-list
          baseUrl=${`/orgs/${this.orgId}/workflows/crawl/${this.workflowId}/artifact`}
        >
          <span slot="idCol">${msg("Start Time")}</span>
          ${when(
            this.crawls,
            () =>
              this.crawls!.map(
                (crawl) => html`
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
                    <!-- Hide menu trigger: -->
                    <div slot="menuTrigger" role="none"></div>
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
          this.crawls && !this.crawls.length,
          () => html`
            <div class="p-4">
              <p class="text-center text-neutral-400">
                ${this.workflow?.crawlCount
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

    return html`<sl-menu-item value=${state}>${icon}${label}</sl-menu-item>`;
  };

  private renderCurrentCrawl = () => {
    const crawl = this.currentCrawl;
    const skeleton = html`<sl-skeleton class="w-full"></sl-skeleton>`;

    return html`
      <dl class="px-3 md:px-0 md:flex justify-evenly">
        ${this.renderDetailItem(msg("Pages Crawled"), () =>
          crawl
            ? msg(
                str`${this.numberFormatter.format(
                  +(crawl.stats?.done || 0)
                )} / ${this.numberFormatter.format(+(crawl.stats?.found || 0))}`
              )
            : skeleton
        )}
        ${this.renderDetailItem(msg("Run Duration"), () =>
          crawl
            ? RelativeDuration.humanize(
                new Date().valueOf() - new Date(`${crawl.started}Z`).valueOf()
              )
            : skeleton
        )}
        ${this.renderDetailItem(
          msg("Crawl Size"),
          () => html`<sl-format-bytes
            value=${this.workflow?.currCrawlSize || 0}
            display="narrow"
          ></sl-format-bytes>`
        )}
        ${this.renderDetailItem(
          msg("Crawler Instances"),
          () => (crawl ? crawl.scale : skeleton),
          true
        )}
      </dl>
    `;
  };

  private renderWatchCrawl = () => {
    if (!this.authState || !this.workflow?.currCrawlState) return "";

    const isStarting = this.workflow.currCrawlState === "starting";
    const isRunning = this.workflow.currCrawlState === "running";
    const isStopping = this.workflow.currCrawlState === "stopping";
    const authToken = this.authState.headers.Authorization.split(" ")[1];

    return html`
      ${isStarting
        ? html`<div class="rounded border p-3">
            <p class="text-sm text-neutral-600 motion-safe:animate-pulse">
              ${msg("Crawl starting...")}
            </p>
          </div>`
        : isActive(this.workflow.currCrawlState)
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
        this.currentCrawl && isRunning,
        () => html`
          <div id="screencast-crawl">
            <btrix-screencast
              authToken=${authToken}
              orgId=${this.orgId}
              crawlId=${this.workflow!.currCrawlId}
              scale=${this.currentCrawl!.scale}
            ></btrix-screencast>
          </div>

          <section class="mt-8">${this.renderExclusions()}</section>

          <btrix-dialog
            label=${msg("Edit Crawler Instances")}
            ?open=${this.openDialogName === "scale"}
            @sl-request-close=${() => (this.openDialogName = undefined)}
            @sl-show=${async () => {
              await this.fetchCurrentCrawl();
              await this.updateComplete;
              this.isDialogVisible = true;
            }}
            @sl-after-hide=${() => (this.isDialogVisible = false)}
          >
            ${this.isDialogVisible ? this.renderEditScale() : ""}
          </btrix-dialog>
        `
      )}
    `;
  };

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
          @click=${() => {
            this.openDialogName = "exclusions";
            this.isDialogVisible = true;
          }}
        >
          <sl-icon slot="prefix" name="table"></sl-icon>
          ${msg("Edit Exclusions")}
        </sl-button>
      </header>

      ${when(
        this.workflow?.currCrawlId,
        () => html`
          <btrix-crawl-queue
            orgId=${this.orgId}
            crawlId=${this.workflow!.currCrawlId}
            .authState=${this.authState}
          ></btrix-crawl-queue>
        `
      )}

      <btrix-dialog
        label=${msg("Crawl Queue Editor")}
        ?open=${this.openDialogName === "exclusions"}
        style=${/* max-w-screen-lg: */ `--width: 1124px;`}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.workflow && this.isDialogVisible
          ? html`<btrix-exclusion-editor
              orgId=${this.orgId}
              crawlId=${ifDefined(this.workflow.currCrawlId)}
              .config=${this.workflow.config}
              .authState=${this.authState}
              ?isActiveCrawl=${isActive(this.workflow.currCrawlState!)}
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
    if (!this.currentCrawl) return;

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
          value=${this.currentCrawl!.scale}
          help-text=${msg(
            "This change will only apply to the currently running crawl."
          )}
        >
          ${scaleOptions.map(
            ({ value, label }) => html`
              <sl-radio-button
                value=${value}
                size="small"
                @click=${() => this.scale(value)}
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
        .crawlConfig=${this.workflow}
        anchorLinks
      ></btrix-config-details>
    </section>`;
  }

  private handleExclusionChange(e: CustomEvent) {
    this.fetchWorkflow();
  }

  private async scale(value: Crawl["scale"]) {
    if (!this.workflow?.currCrawlId) return;
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.workflow.currCrawlId}/scale`,
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

      this.openDialogName = undefined;
      this.isDialogVisible = false;
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

  private async getCrawls(): Promise<Crawl[]> {
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

    return data.items;
  }

  private async fetchCurrentCrawl() {
    if (!this.workflow?.currCrawlId) return;

    try {
      this.currentCrawl = await this.getCrawl(this.workflow.currCrawlId);
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

      this.navTo(`/orgs/${this.orgId}/${DASHBOARD_ROUTE}`);

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
    if (!this.workflow?.currCrawlId) return;
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.workflow.currCrawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.fetchWorkflow();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't cancel crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop() {
    if (!this.workflow?.currCrawlId) return;
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.workflow.currCrawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.fetchWorkflow();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't stop crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
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
      this.activePanel = "watch";
      this.fetchWorkflow();

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.renderName()}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${this.orgId}/workflows/crawl/${this.workflowId}"
              @click="${this.navLink.bind(this)}"
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
}

customElements.define("btrix-workflow-detail", WorkflowDetail);
