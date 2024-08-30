import { localized, msg, str } from "@lit/localize";
import type { SlSelect } from "@shoelace-style/shoelace";
import { type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type {
  Crawl,
  CrawlState,
  Seed,
  Workflow,
  WorkflowParams,
} from "./types";

import { CopyButton } from "@/components/ui/copy-button";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { RelativeDuration } from "@/components/ui/relative-duration";
import { type IntersectEvent } from "@/components/utils/observable";
import type { CrawlLog } from "@/features/archived-items/crawl-logs";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { ExclusionEditor } from "@/features/crawl-workflows/exclusion-editor";
import { pageBreadcrumbs, type Breadcrumb } from "@/layouts/pageHeader";
import type { APIPaginatedList } from "@/types/api";
import { isApiError } from "@/utils/api";
import {
  DEFAULT_MAX_SCALE,
  inactiveCrawlStates,
  isActive,
} from "@/utils/crawler";
import { humanizeSchedule } from "@/utils/cron";
import LiteElement, { html } from "@/utils/LiteElement";
import { getLocale } from "@/utils/localization";
import { isArchivingDisabled } from "@/utils/orgs";

const SECTIONS = ["crawls", "watch", "settings", "logs"] as const;
type Tab = (typeof SECTIONS)[number];
const DEFAULT_SECTION: Tab = "crawls";
const POLL_INTERVAL_SECONDS = 10;
const LOGS_PAGE_SIZE = 50;

/**
 * Usage:
 * ```ts
 * <btrix-workflow-detail></btrix-workflow-detail>
 * ```
 */
@localized()
@customElement("btrix-workflow-detail")
export class WorkflowDetail extends LiteElement {
  @property({ type: String })
  workflowId!: string;

  @property({ type: Boolean })
  isEditing = false;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: String })
  openDialogName?: "scale" | "exclusions" | "cancel" | "stop" | "delete";

  @property({ type: String })
  initialActivePanel?: Tab;

  @property({ type: Number })
  maxScale = DEFAULT_MAX_SCALE;

  @state()
  private workflow?: Workflow;

  @state()
  private seeds?: APIPaginatedList<Seed>;

  @state()
  private crawls?: APIPaginatedList<Crawl>; // Only inactive crawls

  @state()
  private logs?: APIPaginatedList<CrawlLog>;

  @state()
  private lastCrawlId: Workflow["lastCrawlId"] = null;

  @state()
  private lastCrawlStartTime: Workflow["lastCrawlStartTime"] = null;

  @state()
  private lastCrawlStats?: Crawl["stats"];

  @state()
  private activePanel: Tab | undefined = SECTIONS[0];

  @state()
  private isLoading = false;

  @state()
  private isSubmittingUpdate = false;

  @state()
  private isDialogVisible = false;

  @state()
  private isCancelingOrStoppingCrawl = false;

  @state()
  private crawlToDelete: Crawl | null = null;

  @state()
  private filterBy: Partial<Record<keyof Crawl, string | CrawlState[]>> = {};

  private readonly numberFormatter = new Intl.NumberFormat(getLocale(), {
    // notation: "compact",
  });
  private readonly dateFormatter = new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  private timerId?: number;

  private isPanelHeaderVisible?: boolean;

  private getWorkflowPromise?: Promise<Workflow>;
  private getSeedsPromise?: Promise<APIPaginatedList<Seed>>;

  private readonly tabLabels: Record<Tab, string> = {
    crawls: msg("Crawls"),
    watch: msg("Watch Crawl"),
    logs: msg("Error Logs"),
    settings: msg("Settings"),
  };

  connectedCallback(): void {
    // Set initial active section and dialog based on URL #hash value
    if (this.initialActivePanel) {
      this.activePanel = this.initialActivePanel;
    } else {
      void this.getActivePanelFromHash();
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
      void this.showDialog();
    }
  }

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (
      (changedProperties.has("workflowId") && this.workflowId) ||
      (changedProperties.get("isEditing") === true && !this.isEditing)
    ) {
      void this.fetchWorkflow();
      void this.fetchSeeds();
    }
    if (changedProperties.has("isEditing")) {
      if (this.isEditing) {
        this.stopPoll();
      } else {
        void this.getActivePanelFromHash();
      }
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
        void this.fetchCrawls();
      }
    }
  }

  private readonly getActivePanelFromHash = async () => {
    await this.updateComplete;
    if (this.isEditing) return;

    const hashValue = window.location.hash.slice(1);
    if (SECTIONS.includes(hashValue as (typeof SECTIONS)[number])) {
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

  private async fetchWorkflow() {
    this.stopPoll();
    this.isLoading = true;

    try {
      const prevLastCrawlId = this.lastCrawlId;
      this.getWorkflowPromise = this.getWorkflow();
      this.workflow = await this.getWorkflowPromise;
      this.lastCrawlId = this.workflow.lastCrawlId;
      this.lastCrawlStartTime = this.workflow.lastCrawlStartTime;

      if (this.lastCrawlId) {
        if (this.workflow.isCrawlRunning) {
          void this.fetchCurrentCrawlStats();
          void this.fetchCrawlLogs();
        } else if (this.lastCrawlId !== prevLastCrawlId) {
          this.logs = undefined;
          void this.fetchCrawlLogs();
        }
      }
      // TODO: Check if storage quota has been exceeded here by running
      // crawl??
    } catch (e) {
      this.notify({
        message:
          isApiError(e) && e.statusCode === 404
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
        void this.fetchWorkflow();
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
        <div class="col-span-1">${this.renderBreadcrumbs()}</div>

        <div>
          <header class="col-span-1 mb-3 flex flex-wrap gap-2">
            <btrix-detail-page-title
              .item=${this.workflow}
            ></btrix-detail-page-title>
            ${when(
              this.workflow?.inactive,
              () => html`
                <btrix-badge class="inline-block align-middle" variant="warning"
                  >${msg("Inactive")}</btrix-badge
                >
              `,
            )}

            <div class="flex-0 ml-auto flex flex-wrap justify-end gap-2">
              ${when(
                this.isCrawler && this.workflow && !this.workflow.inactive,
                this.renderActions,
              )}
            </div>
          </header>

          <section class="col-span-1 rounded-lg border px-4 py-2">
            ${this.renderDetails()}
          </section>
        </div>

        ${when(this.workflow, this.renderTabList, this.renderLoading)}
      </div>

      <btrix-dialog
        .label=${msg("Stop Crawl?")}
        .open=${this.openDialogName === "stop"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          "Pages crawled so far will be saved and marked as incomplete. Are you sure you want to stop crawling?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            .autofocus=${true}
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Keep Crawling")}</sl-button
          >
          <sl-button
            size="small"
            variant="primary"
            ?loading=${this.isCancelingOrStoppingCrawl}
            @click=${async () => {
              await this.stop();
              this.openDialogName = undefined;
            }}
            >${msg("Stop Crawling")}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-dialog
        .label=${msg("Cancel Crawl?")}
        .open=${this.openDialogName === "cancel"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          "Canceling will discard all pages crawled. Are you sure you want to discard them?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            .autofocus=${true}
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Keep Crawling")}</sl-button
          >
          <sl-button
            size="small"
            variant="danger"
            ?loading=${this.isCancelingOrStoppingCrawl}
            @click=${async () => {
              await this.cancel();
              this.openDialogName = undefined;
            }}
            >${msg("Cancel & Discard Crawl")}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-dialog
        .label=${msg("Delete Crawl?")}
        .open=${this.openDialogName === "delete"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${msg(
          "All files and logs associated with this crawl will also be deleted, and the crawl will be removed from any Collection it is a part of.",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            .autofocus=${true}
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            size="small"
            variant="danger"
            @click=${async () => {
              this.openDialogName = undefined;
              if (this.crawlToDelete) {
                await this.deleteCrawl(this.crawlToDelete);
              }
            }}
            >${msg("Delete Crawl")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderBreadcrumbs() {
    const breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.orgBasePath}/workflows/crawls`,
        content: msg("Crawl Workflows"),
      },
    ];

    if (this.workflow) {
      breadcrumbs.push({
        href: `${this.orgBasePath}/workflows/crawl/${this.workflowId}`,
        content: this.renderName(),
      });

      if (this.isEditing) {
        breadcrumbs.push({
          content: msg("Edit Settings"),
        });
      } else if (this.activePanel) {
        breadcrumbs.push({
          content: this.tabLabels[this.activePanel],
        });
      }
    }

    return pageBreadcrumbs(breadcrumbs);
  }

  private readonly renderTabList = () => html`
    <btrix-tab-list activePanel=${ifDefined(this.activePanel)} hideIndicator>
      <btrix-observable
        slot="header"
        @intersect=${({ detail }: IntersectEvent) =>
          (this.isPanelHeaderVisible = detail.entry.isIntersecting)}
      >
        <header class="flex h-5 items-center justify-between">
          ${this.renderPanelHeader()}
        </header>
      </btrix-observable>

      ${this.renderTab("crawls")} ${this.renderTab("watch")}
      ${this.renderTab("logs")} ${this.renderTab("settings")}

      <btrix-tab-panel name="crawls">${this.renderCrawls()}</btrix-tab-panel>
      <btrix-tab-panel name="watch">
        ${until(
          this.getWorkflowPromise?.then(
            () => html`
              ${when(this.activePanel === "watch", () =>
                this.workflow?.isCrawlRunning
                  ? html` <div class="mb-5 h-14 rounded-lg border py-2">
                        ${this.renderCurrentCrawl()}
                      </div>
                      ${this.renderWatchCrawl()}`
                  : this.renderInactiveWatchCrawl(),
              )}
            `,
          ),
        )}
      </btrix-tab-panel>
      <btrix-tab-panel name="logs">${this.renderLogs()}</btrix-tab-panel>
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
          () => html`
            <span class="text-neutral-500"
              >(${this.crawls!.total.toLocaleString()}${this.workflow
                ?.isCrawlRunning
                ? html`<span class="text-success"> + 1</span>`
                : ""})</span
            >
          `,
        )}
      </h3>`;
    }
    if (this.activePanel === "settings" && this.isCrawler) {
      return html` <h3>${this.tabLabels[this.activePanel]}</h3>
        <sl-icon-button
          name="gear"
          label=${msg("Edit workflow settings")}
          @click=${() =>
            this.navTo(
              `/orgs/${this.appState.orgSlug}/workflows/crawl/${this.workflow?.id}?edit`,
            )}
        >
        </sl-icon-button>`;
    }
    if (this.activePanel === "watch" && this.isCrawler) {
      return html` <h3>${this.tabLabels[this.activePanel]}</h3>
        <sl-button
          size="small"
          ?disabled=${this.workflow?.lastCrawlState !== "running"}
          @click=${() => (this.openDialogName = "scale")}
        >
          <sl-icon
            name="plus-slash-minus"
            slot="prefix"
            label=${msg("Increase or decrease")}
          ></sl-icon>
          <span>${msg("Edit Browser Windows")}</span>
        </sl-button>`;
    }
    if (this.activePanel === "logs") {
      const authToken = this.authState?.headers.Authorization.split(" ")[1];
      const isDownloadEnabled = Boolean(
        this.logs?.total &&
          this.workflow?.lastCrawlId &&
          !this.workflow.isCrawlRunning,
      );
      return html` <h3>${this.tabLabels[this.activePanel]}</h3>
        <sl-tooltip
          content=${msg(
            "Downloading will be enabled when this crawl is finished.",
          )}
          ?disabled=${!this.workflow?.isCrawlRunning}
        >
          <sl-button
            href=${`/api/orgs/${this.orgId}/crawls/${this.lastCrawlId}/logs?auth_bearer=${authToken}`}
            download=${`btrix-${this.lastCrawlId}-logs.txt`}
            size="small"
            ?disabled=${!isDownloadEnabled}
          >
            <sl-icon slot="prefix" name="cloud-download"></sl-icon>
            ${msg("Download Logs")}
          </sl-button>
        </sl-tooltip>`;
    }

    return html`<h3>${this.tabLabels[this.activePanel]}</h3>`;
  }

  private renderTab(tabName: Tab, { disabled = false } = {}) {
    const isActive = tabName === this.activePanel;
    return html`
      <btrix-navigation-button
        slot="nav"
        href=${`${window.location.pathname}#${tabName}`}
        .active=${isActive}
        .disabled=${disabled}
        aria-selected=${isActive}
        aria-disabled=${disabled}
        @click=${(e: MouseEvent) => {
          if (disabled) e.preventDefault();
        }}
      >
        ${this.tabLabels[tabName]}
      </btrix-navigation-button>
    `;
  }

  private readonly renderEditor = () => html`
    <div class="col-span-1">${this.renderBreadcrumbs()}</div>

    <header>
      <h2 class="break-all text-xl font-semibold leading-10">
        ${this.renderName()}
      </h2>
    </header>

    ${when(
      !this.isLoading && this.seeds && this.workflow,
      (workflow) => html`
        <btrix-workflow-editor
          .initialWorkflow=${workflow}
          .initialSeeds=${this.seeds!.items}
          jobType=${workflow.jobType!}
          configId=${workflow.id}
          @reset=${() =>
            this.navTo(`${this.orgBasePath}/workflows/crawl/${workflow.id}`)}
        ></btrix-workflow-editor>
      `,
      this.renderLoading,
    )}
  `;

  private readonly renderActions = () => {
    if (!this.workflow) return;
    const workflow = this.workflow;

    const archivingDisabled = isArchivingDisabled(this.org, true);

    return html`
      ${when(
        this.workflow.isCrawlRunning,
        () => html`
          <sl-button-group>
            <sl-button
              size="small"
              @click=${() => (this.openDialogName = "stop")}
              ?disabled=${!this.lastCrawlId ||
              this.isCancelingOrStoppingCrawl ||
              this.workflow?.lastCrawlStopping}
            >
              <sl-icon name="dash-square" slot="prefix"></sl-icon>
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
          <sl-tooltip
            content=${msg(
              "Org Storage Full or Monthly Execution Minutes Reached",
            )}
            ?disabled=${!this.org?.storageQuotaReached &&
            !this.org?.execMinutesQuotaReached}
          >
            <sl-button
              size="small"
              variant="primary"
              ?disabled=${archivingDisabled}
              @click=${() => void this.runNow()}
            >
              <sl-icon name="play" slot="prefix"></sl-icon>
              <span>${msg("Run Crawl")}</span>
            </sl-button>
          </sl-tooltip>
        `,
      )}

      <sl-dropdown placement="bottom-end" distance="4" hoist>
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          ${when(
            this.workflow.isCrawlRunning,
            // HACK shoelace doesn't current have a way to override non-hover
            // color without resetting the --sl-color-neutral-700 variable
            () => html`
              <sl-menu-item
                @click=${() => (this.openDialogName = "stop")}
                ?disabled=${workflow.lastCrawlStopping ||
                this.isCancelingOrStoppingCrawl}
              >
                <sl-icon name="dash-square" slot="prefix"></sl-icon>
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
                ?disabled=${archivingDisabled}
                @click=${() => void this.runNow()}
              >
                <sl-icon name="play" slot="prefix"></sl-icon>
                ${msg("Run Crawl")}
              </sl-menu-item>
            `,
          )}
          ${when(
            workflow.isCrawlRunning,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item @click=${() => (this.openDialogName = "scale")}>
                <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                ${msg("Edit Browser Windows")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => (this.openDialogName = "exclusions")}
              >
                <sl-icon name="table" slot="prefix"></sl-icon>
                ${msg("Edit Exclusions")}
              </sl-menu-item>
            `,
          )}
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `/orgs/${this.appState.orgSlug}/workflows/crawl/${workflow.id}?edit`,
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
          <sl-menu-item
            ?disabled=${archivingDisabled}
            @click=${() => void this.duplicateConfig()}
          >
            <sl-icon name="files" slot="prefix"></sl-icon>
            ${msg("Duplicate Workflow")}
          </sl-menu-item>
          ${when(
            !this.lastCrawlId,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => void this.delete()}
              >
                <sl-icon name="trash3" slot="prefix"></sl-icon>
                ${msg("Delete Workflow")}
              </sl-menu-item>
            `,
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderDetails() {
    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(
          msg("Status"),
          (workflow) => html`
            <btrix-crawl-status
              state=${workflow.lastCrawlState || msg("No Crawls Yet")}
              ?stopping=${workflow.lastCrawlStopping}
            ></btrix-crawl-status>
          `,
        )}
        ${this.renderDetailItem(
          msg("Total Size"),
          (workflow) =>
            html` <sl-format-bytes
              value=${Number(workflow.totalSize)}
              display="narrow"
            ></sl-format-bytes>`,
        )}
        ${this.renderDetailItem(msg("Schedule"), (workflow) =>
          workflow.schedule
            ? html`
                <div>
                  ${humanizeSchedule(workflow.schedule, {
                    length: "short",
                  })}
                </div>
              `
            : html`<span class="text-neutral-400">${msg("No Schedule")}</span>`,
        )}
        ${this.renderDetailItem(msg("Created By"), (workflow) =>
          msg(
            str`${workflow.createdByName} on ${this.dateFormatter.format(
              new Date(`${workflow.created}Z`),
            )}`,
          ),
        )}
      </btrix-desc-list>
    `;
  }

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: (workflow: Workflow) => TemplateResult | string | number,
  ) {
    return html`
      <btrix-desc-list-item label=${label}>
        ${when(
          this.workflow,
          renderContent,
          () => html`<sl-skeleton class="w-full"></sl-skeleton>`,
        )}
      </btrix-desc-list-item>
    `;
  }

  private renderName() {
    if (!this.workflow)
      return html`<sl-skeleton class="inline-block h-8 w-60"></sl-skeleton>`;
    if (this.workflow.name)
      return html`<span class="truncate">${this.workflow.name}</span>`;
    const { seedCount, firstSeed } = this.workflow;
    if (seedCount === 1) {
      return html`<span class="truncate">${firstSeed}</span>`;
    }
    const remainderCount = seedCount - 1;
    if (remainderCount === 1) {
      return msg(
        html` <span class="truncate">${firstSeed}</span>
          <span class="whitespace-nowrap text-neutral-500"
            >+${remainderCount} URL</span
          >`,
      );
    }
    return msg(
      html` <span class="truncate">${firstSeed}</span>
        <span class="whitespace-nowrap text-neutral-500"
          >+${remainderCount} URLs</span
        >`,
    );
  }

  private renderCrawls() {
    return html`
      <section>
        <div
          class="mb-3 flex items-center justify-end rounded-lg border bg-neutral-50 p-4"
        >
          <div class="flex items-center">
            <div class="mx-2 text-neutral-500">${msg("View:")}</div>
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
                void this.fetchCrawls();
              }}
            >
              ${inactiveCrawlStates.map(this.renderStatusMenuItem)}
            </sl-select>
          </div>
        </div>

        ${when(
          this.workflow?.isCrawlRunning,
          () =>
            html`<div class="mb-4">
              <btrix-alert variant="success" class="text-sm">
                ${msg(
                  html`Crawl is currently running.
                    <a
                      href="${`${window.location.pathname}#watch`}"
                      class="underline hover:no-underline"
                      >Watch Crawl Progress</a
                    >`,
                )}
              </btrix-alert>
            </div>`,
        )}

        <div class="mx-2">
          <btrix-crawl-list workflowId=${this.workflowId}>
            ${when(
              this.crawls,
              () =>
                this.crawls!.items.map(
                  (crawl: Crawl) =>
                    html` <btrix-crawl-list-item
                      href=${`${this.orgBasePath}/workflows/crawl/${this.workflowId}/items/${crawl.id}`}
                      .crawl=${crawl}
                    >
                      ${when(
                        this.isCrawler,
                        () =>
                          html` <sl-menu slot="menu">
                            <sl-menu-item
                              style="--sl-color-neutral-700: var(--danger)"
                              @click=${() => this.confirmDeleteCrawl(crawl)}
                            >
                              <sl-icon name="trash3" slot="prefix"></sl-icon>
                              ${msg("Delete Crawl")}
                            </sl-menu-item>
                          </sl-menu>`,
                      )}</btrix-crawl-list-item
                    >`,
                ),
              () =>
                html`<div
                  class="my-24 flex w-full items-center justify-center text-3xl"
                >
                  <sl-spinner></sl-spinner>
                </div>`,
            )}
          </btrix-crawl-list>
        </div>
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
          `,
        )}
      </section>
    `;
  }

  private readonly renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent(state);

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private readonly renderCurrentCrawl = () => {
    const skeleton = html`<sl-skeleton class="w-full"></sl-skeleton>`;

    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(msg("Pages Crawled"), () =>
          this.lastCrawlStats
            ? msg(
                str`${this.numberFormatter.format(
                  +(this.lastCrawlStats.done || 0),
                )} / ${this.numberFormatter.format(
                  +(this.lastCrawlStats.found || 0),
                )}`,
              )
            : html`<sl-spinner></sl-spinner>`,
        )}
        ${this.renderDetailItem(msg("Run Duration"), () =>
          this.lastCrawlStartTime
            ? RelativeDuration.humanize(
                new Date().valueOf() -
                  new Date(`${this.lastCrawlStartTime}Z`).valueOf(),
              )
            : skeleton,
        )}
        ${this.renderDetailItem(msg("Crawl Size"), () =>
          this.workflow
            ? html`<sl-format-bytes
                value=${this.workflow.lastCrawlSize || 0}
                display="narrow"
              ></sl-format-bytes>`
            : skeleton,
        )}
        ${this.renderDetailItem(msg("Browser Windows"), () =>
          this.workflow && this.appState.settings
            ? this.workflow.scale * this.appState.settings.numBrowsers
            : skeleton,
        )}
      </btrix-desc-list>
    `;
  };

  private readonly renderWatchCrawl = () => {
    if (!this.authState || !this.workflow?.lastCrawlState) return "";

    let waitingMsg = null;

    switch (this.workflow.lastCrawlState) {
      case "starting":
        waitingMsg = msg("Crawl starting...");
        break;

      case "waiting_capacity":
        waitingMsg = msg(
          "Crawl waiting for available resources before it can continue...",
        );
        break;

      case "waiting_org_limit":
        waitingMsg = msg(
          "Crawl waiting for others to finish, concurrent limit per Organization reached...",
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
        isRunning && this.workflow,
        (workflow) => html`
          <div id="screencast-crawl">
            <btrix-screencast
              authToken=${authToken}
              .crawlId=${this.lastCrawlId ?? undefined}
              scale=${workflow.scale}
            ></btrix-screencast>
          </div>

          <section class="mt-4">${this.renderCrawlErrors()}</section>
          <section class="mt-8">${this.renderExclusions()}</section>

          <btrix-dialog
            .label=${msg("Edit Browser Windows")}
            .open=${this.openDialogName === "scale"}
            @sl-request-close=${() => (this.openDialogName = undefined)}
            @sl-show=${this.showDialog}
            @sl-after-hide=${() => (this.isDialogVisible = false)}
          >
            ${this.isDialogVisible ? this.renderEditScale() : ""}
          </btrix-dialog>
        `,
      )}
    `;
  };

  private renderInactiveWatchCrawl() {
    return html`
      <section
        class="flex h-56 min-h-max flex-col items-center justify-center rounded-lg border p-4"
      >
        <p class="text-base font-medium">
          ${msg("Crawl workflow is not currently running.")}
        </p>
        <div class="mt-4">
          ${when(
            this.workflow?.lastCrawlId && this.workflow,
            (workflow) => html`
              <sl-button
                href=${`${this.orgBasePath}/items/crawl/${workflow.lastCrawlId}#replay`}
                variant="primary"
                size="small"
                @click=${this.navLink}
              >
                <sl-icon
                  slot="prefix"
                  name="replaywebpage"
                  library="app"
                ></sl-icon>
                ${msg("Replay Latest Crawl")}</sl-button
              >
            `,
          )}
          ${when(
            this.isCrawler && this.workflow,
            (workflow) =>
              html` <sl-button
                href=${`${this.orgBasePath}/items/crawl/${workflow.lastCrawlId}#qa`}
                size="small"
                @click=${this.navLink}
              >
                <sl-icon
                  slot="prefix"
                  name="clipboard2-data-fill"
                  library="default"
                ></sl-icon>
                ${msg("QA Latest Crawl")}
              </sl-button>`,
          )}
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

  private renderLogs() {
    return html`
      <div aria-live="polite" aria-busy=${this.isLoading}>
        ${when(
          this.workflow?.isCrawlRunning,
          () =>
            html`<div class="mb-4">
              <btrix-alert variant="success" class="text-sm">
                ${msg(
                  html`Viewing error logs for currently running crawl.
                    <a
                      href="${`${window.location.pathname}#watch`}"
                      class="underline hover:no-underline"
                      >Watch Crawl Progress</a
                    >`,
                )}
              </btrix-alert>
            </div>`,
        )}
        ${when(
          this.lastCrawlId,
          () =>
            this.logs?.total
              ? html`<btrix-crawl-logs
                  .logs=${this.logs}
                  @page-change=${async (e: PageChangeEvent) => {
                    await this.fetchCrawlLogs({
                      page: e.detail.page,
                    });
                    // Scroll to top of list
                    this.scrollIntoView();
                  }}
                ></btrix-crawl-logs>`
              : html`
                  <div
                    class="flex flex-col items-center justify-center rounded-lg border p-4"
                  >
                    <p class="text-center text-neutral-400">
                      ${this.workflow?.lastCrawlState === "waiting_capacity"
                        ? msg("Error logs currently not available.")
                        : msg("No error logs found yet for latest crawl.")}
                    </p>
                  </div>
                `,
          () => this.renderNoCrawlLogs(),
        )}
      </div>
    `;
  }

  private renderNoCrawlLogs() {
    return html`
      <section
        class="flex h-56 min-h-max flex-col items-center justify-center rounded-lg border p-4"
      >
        <p class="text-base font-medium">
          ${msg("Logs will show here after you run a crawl.")}
        </p>
        <div class="mt-4">
          <sl-tooltip
            content=${msg(
              "Org Storage Full or Monthly Execution Minutes Reached",
            )}
            ?disabled=${!this.org?.storageQuotaReached &&
            !this.org?.execMinutesQuotaReached}
          >
            <sl-button
              size="small"
              variant="primary"
              ?disabled=${this.org?.storageQuotaReached ||
              this.org?.execMinutesQuotaReached}
              @click=${() => void this.runNow()}
            >
              <sl-icon name="play" slot="prefix"></sl-icon>
              ${msg("Run Crawl")}
            </sl-button>
          </sl-tooltip>
        </div>
      </section>
    `;
  }

  private renderCrawlErrors() {
    return html`
      <sl-details>
        <h3
          slot="summary"
          class="text flex items-center gap-2 font-semibold leading-none"
        >
          ${msg("Error Logs")}
          <btrix-badge variant=${this.logs?.total ? "danger" : "neutral"}
            >${this.logs?.total
              ? this.logs.total.toLocaleString()
              : 0}</btrix-badge
          >
        </h3>
        <btrix-crawl-logs .logs=${this.logs}></btrix-crawl-logs>
        ${when(
          this.logs?.total && this.logs.total > LOGS_PAGE_SIZE,
          () => html`
            <p class="my-4 text-xs text-neutral-500">
              ${msg(
                str`Displaying latest ${LOGS_PAGE_SIZE.toLocaleString()} errors of ${this.logs!.total.toLocaleString()}.`,
              )}
            </p>
          `,
        )}
      </sl-details>
    `;
  }

  private renderExclusions() {
    return html`
      <header class="flex items-center justify-between">
        <h3 class="mb-2 text-base font-semibold leading-none">
          ${msg("Upcoming Pages")}
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
            .crawlId=${this.lastCrawlId ?? undefined}
          ></btrix-crawl-queue>
        `,
      )}

      <btrix-dialog
        .label=${msg("Crawl Queue Editor")}
        .open=${this.openDialogName === "exclusions"}
        style=${`--width: var(--btrix-screen-desktop)`}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.workflow && this.isDialogVisible
          ? html`<btrix-exclusion-editor
              .crawlId=${this.lastCrawlId ?? undefined}
              .config=${this.workflow.config}
              ?isActiveCrawl=${isActive(this.workflow.lastCrawlState)}
              @on-success=${this.handleExclusionChange}
            ></btrix-exclusion-editor>`
          : ""}
        <div slot="footer">
          <sl-button size="small" @click=${this.onCloseExclusions}
            >${msg("Done Editing")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderEditScale() {
    if (!this.workflow) return;

    const scaleOptions = [];

    if (this.appState.settings) {
      for (let value = 1; value <= this.maxScale; value++) {
        scaleOptions.push({
          value,
          label: value * this.appState.settings.numBrowsers,
        });
      }
    }

    return html`
      <div>
        <p class="mb-4 text-neutral-600">
          ${msg(
            "Change the number of browser windows crawling in parallel. This change will take effect immediately on the currently running crawl and update crawl workflow settings.",
          )}
        </p>
        <sl-radio-group value=${this.workflow.scale}>
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
            `,
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
    return html`<section
      class="rounded-lg border px-5 py-3"
      aria-live="polite"
      aria-busy=${this.isLoading || !this.seeds}
    >
      <btrix-config-details
        .crawlConfig=${this.workflow}
        .seeds=${this.seeds?.items}
        anchorLinks
      ></btrix-config-details>
    </section>`;
  }

  private readonly renderLoading = () =>
    html`<div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>`;

  private readonly showDialog = async () => {
    await this.getWorkflowPromise;
    this.isDialogVisible = true;
  };

  private handleExclusionChange() {
    void this.fetchWorkflow();
  }

  private async scale(value: Crawl["scale"]) {
    if (!this.lastCrawlId) return;
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch<{ scaled: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/scale`,
        {
          method: "POST",
          body: JSON.stringify({ scale: +value }),
        },
      );

      if (data.scaled) {
        void this.fetchWorkflow();
        this.notify({
          message: msg("Updated number of browser windows."),
          variant: "success",
          icon: "check2-circle",
        });
      } else {
        throw new Error("unhandled API response");
      }
    } catch {
      this.notify({
        message: msg(
          "Sorry, couldn't change number of browser windows at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  private async getWorkflow(): Promise<Workflow> {
    const data: Workflow = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}`,
    );
    return data;
  }

  private async onCloseExclusions() {
    const editor = this.querySelector("btrix-exclusion-editor");
    if (editor && editor instanceof ExclusionEditor) {
      await editor.onClose();
    }
    this.openDialogName = undefined;
  }

  private async fetchSeeds(): Promise<void> {
    try {
      this.getSeedsPromise = this.getSeeds();
      this.seeds = await this.getSeedsPromise;
    } catch {
      this.notify({
        message: msg(
          "Sorry, couldn't retrieve all crawl settings at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getSeeds() {
    const data = await this.apiFetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}/seeds`,
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

  private async getCrawls() {
    const query = queryString.stringify(
      {
        state: this.filterBy.state,
        cid: this.workflowId,
        sortBy: "started",
      },
      {
        arrayFormat: "comma",
      },
    );
    const data = await this.apiFetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
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
    const data = await this.apiFetch<Crawl>(
      `/orgs/${this.orgId}/crawls/${crawlId}/replay.json`,
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig() {
    if (!this.workflow) await this.getWorkflowPromise;
    if (!this.seeds) await this.getSeedsPromise;
    await this.updateComplete;
    if (!this.workflow) return;

    const workflowParams: WorkflowParams = {
      ...this.workflow,
      name: this.workflow.name ? msg(str`${this.workflow.name} Copy`) : "",
    };

    this.navTo(
      `${this.orgBasePath}/workflows?new&jobType=${workflowParams.jobType}`,
      {
        workflow: workflowParams,
        seeds: this.seeds?.items,
      },
    );

    this.notify({
      message: msg(str`Copied Workflow to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }

  private async delete(): Promise<void> {
    if (!this.workflow) return;

    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow.id}`,
        {
          method: "DELETE",
        },
      );

      this.navTo(`${this.orgBasePath}/workflows/crawls`);

      this.notify({
        message: msg(
          html`Deleted <strong>${this.renderName()}</strong> Workflow.`,
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

  private async cancel() {
    if (!this.lastCrawlId) return;

    this.isCancelingOrStoppingCrawl = true;

    try {
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/cancel`,
        {
          method: "POST",
        },
      );
      if (data.success) {
        void this.fetchWorkflow();
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
      const data = await this.apiFetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/stop`,
        {
          method: "POST",
        },
      );
      if (data.success) {
        void this.fetchWorkflow();
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
      const data = await this.apiFetch<{ started: string | null }>(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}/run`,
        {
          method: "POST",
        },
      );
      this.lastCrawlId = data.started;
      // remove 'Z' from timestamp to match API response
      this.lastCrawlStartTime = new Date().toISOString().slice(0, -1);
      this.logs = undefined;
      void this.fetchWorkflow();
      this.goToTab("watch");

      this.notify({
        message: msg("Starting crawl."),
        variant: "success",
        icon: "check2-circle",
      });
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
      }
      this.notify({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private readonly confirmDeleteCrawl = (crawl: Crawl) => {
    this.crawlToDelete = crawl;
    this.openDialogName = "delete";
  };

  private async deleteCrawl(crawl: Crawl) {
    try {
      const _data = await this.apiFetch(`/orgs/${crawl.oid}/crawls/delete`, {
        method: "POST",
        body: JSON.stringify({
          crawl_ids: [crawl.id],
        }),
      });
      this.crawlToDelete = null;
      this.crawls = {
        ...this.crawls!,
        items: this.crawls!.items.filter((c) => c.id !== crawl.id),
      };
      this.notify({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
      });
      void this.fetchCrawls();
    } catch (e) {
      if (this.crawlToDelete) {
        this.confirmDeleteCrawl(this.crawlToDelete);
      }

      let message = msg(
        str`Sorry, couldn't delete archived item at this time.`,
      );
      if (isApiError(e)) {
        if (e.details == "not_allowed") {
          message = msg(
            str`Only org owners can delete other users' archived items.`,
          );
        } else if (e.message) {
          message = e.message;
        }
      }
      this.notify({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchCrawlLogs(
    params: Partial<APIPaginatedList> = {},
  ): Promise<void> {
    try {
      this.logs = await this.getCrawlErrors(params);
    } catch (e) {
      if (isApiError(e) && e.statusCode === 503) {
        // do nothing, keep logs if previously loaded
      } else {
        this.notify({
          message: msg(
            "Sorry, couldn't retrieve crawl error logs at this time.",
          ),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async getCrawlErrors(params: Partial<APIPaginatedList>) {
    const page = params.page || this.logs?.page || 1;
    const pageSize = params.pageSize || this.logs?.pageSize || LOGS_PAGE_SIZE;

    const data = await this.apiFetch<APIPaginatedList<CrawlLog>>(
      `/orgs/${this.orgId}/crawls/${
        this.workflow!.lastCrawlId
      }/errors?page=${page}&pageSize=${pageSize}`,
    );

    return data;
  }
}
