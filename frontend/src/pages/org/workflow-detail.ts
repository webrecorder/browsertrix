import { localized, msg, str } from "@lit/localize";
import type { SlSelect } from "@shoelace-style/shoelace";
import { html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Crawl, Seed, Workflow, WorkflowParams } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { ExclusionEditor } from "@/features/crawl-workflows/exclusion-editor";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import { deleteConfirmation } from "@/strings/ui";
import type { APIPaginatedList } from "@/types/api";
import { type CrawlState } from "@/types/crawlState";
import { isApiError } from "@/utils/api";
import {
  DEFAULT_MAX_SCALE,
  inactiveCrawlStates,
  isActive,
} from "@/utils/crawler";
import { humanizeSchedule } from "@/utils/cron";
import { isArchivingDisabled } from "@/utils/orgs";

const SECTIONS = ["crawls", "watch", "settings", "logs"] as const;
type Tab = (typeof SECTIONS)[number];
const DEFAULT_SECTION: Tab = "crawls";
const POLL_INTERVAL_SECONDS = 10;

/**
 * Usage:
 * ```ts
 * <btrix-workflow-detail></btrix-workflow-detail>
 * ```
 */
@customElement("btrix-workflow-detail")
@localized()
export class WorkflowDetail extends BtrixElement {
  @property({ type: String })
  workflowId!: string;

  @property({ type: Boolean })
  isEditing = false;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: String })
  openDialogName?:
    | "scale"
    | "exclusions"
    | "cancel"
    | "stop"
    | "delete"
    | "deleteCrawl";

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

  @state()
  private timerId?: number;

  private getWorkflowPromise?: Promise<Workflow>;
  private getSeedsPromise?: Promise<APIPaginatedList<Seed>>;

  private get isExplicitRunning() {
    return (
      this.workflow?.isCrawlRunning &&
      !this.workflow.lastCrawlStopping &&
      this.workflow.lastCrawlState === "running"
    );
  }

  private readonly tabLabels: Record<Tab, string> = {
    crawls: msg("Crawls"),
    watch: msg("Watch Crawl"),
    logs: msg("Logs"),
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
      this.getWorkflowPromise = this.getWorkflow();
      this.workflow = await this.getWorkflowPromise;
      this.lastCrawlId = this.workflow.lastCrawlId;
      this.lastCrawlStartTime = this.workflow.lastCrawlStartTime;

      if (this.lastCrawlId) {
        if (this.workflow.isCrawlRunning) {
          void this.fetchCurrentCrawlStats();
        }
      }
      // TODO: Check if storage quota has been exceeded here by running
      // crawl??
    } catch (e) {
      this.notify.toast({
        message:
          isApiError(e) && e.statusCode === 404
            ? msg("Workflow not found.")
            : msg("Sorry, couldn't retrieve Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "workflow-retrieve-error",
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
        <div class="grid grid-cols-1 gap-7 pb-7">
          ${when(this.workflow, this.renderEditor)}
        </div>
      `;
    }

    return html`
      <div class="grid grid-cols-1 gap-7 pb-7">
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
          "Pages currently being crawled will be completed and saved, and finished pages will be kept, but all remaining pages in the queue will be discarded. Are you sure you want to stop crawling?",
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
            >${msg(html`Cancel & Discard Crawl`)}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-dialog
        .label=${msg("Delete Crawl?")}
        .open=${this.openDialogName === "deleteCrawl"}
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
      <btrix-dialog
        .label=${msg("Edit Browser Windows")}
        .open=${this.openDialogName === "scale"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.isDialogVisible ? this.renderEditScale() : ""}
      </btrix-dialog>
      <btrix-dialog
        .label=${msg("Delete Workflow?")}
        .open=${this.openDialogName === "delete"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${this.showDialog}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${deleteConfirmation(this.renderName())}
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
              void this.delete();
              this.openDialogName = undefined;
            }}
            >${msg("Delete Workflow")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderBreadcrumbs() {
    const breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.navigate.orgBasePath}/workflows`,
        content: msg("Crawl Workflows"),
      },
    ];

    if (this.isEditing) {
      breadcrumbs.push(
        {
          href: `${this.navigate.orgBasePath}/workflows/${this.workflowId}`,
          content: this.workflow ? this.renderName() : undefined,
        },
        {
          content: msg("Edit Settings"),
        },
      );
    } else {
      breadcrumbs.push({
        content: this.workflow ? this.renderName() : undefined,
      });
    }

    return pageNav(breadcrumbs);
  }

  private readonly renderTabList = () => html`
    <btrix-tab-group active=${ifDefined(this.activePanel)} placement="start">
      <header
        class="mb-2 flex h-7 items-center justify-between text-lg font-medium"
      >
        ${this.renderPanelHeader()}
      </header>

      ${this.renderTab("crawls")} ${this.renderTab("watch")}
      ${this.renderTab("logs")} ${this.renderTab("settings")}

      <btrix-tab-group-panel name="crawls">
        ${this.renderCrawls()}
      </btrix-tab-group-panel>
      <btrix-tab-group-panel name="watch">
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
      </btrix-tab-group-panel>
      <btrix-tab-group-panel name="logs">
        ${this.renderLogs()}
      </btrix-tab-group-panel>
      <btrix-tab-group-panel name="settings">
        ${this.renderSettings()}
      </btrix-tab-group-panel>
    </btrix-tab-group>
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
              >(${this.localize.number(this.crawls!.total)}${this.workflow
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
        <sl-tooltip content=${msg("Edit Workflow Settings")}></sl-tooltip>
          <sl-icon-button
            name="pencil"
            class="text-base"
            @click=${() =>
              this.navigate.to(
                `/orgs/${this.appState.orgSlug}/workflows/${this.workflow?.id}?edit`,
              )}
          >
          </sl-icon-button>
        </sl-tooltip>`;
    }
    if (this.activePanel === "watch" && this.isCrawler) {
      const enableEditBrowserWindows =
        this.workflow?.isCrawlRunning && !this.workflow.lastCrawlStopping;
      return html` <h3>${this.tabLabels[this.activePanel]}</h3>
        <div>
          <sl-tooltip
            content=${msg(
              "Browser windows can only be edited while a crawl is starting or running",
            )}
            ?disabled=${enableEditBrowserWindows}
          >
            <sl-button
              size="small"
              ?disabled=${!enableEditBrowserWindows}
              @click=${() => (this.openDialogName = "scale")}
            >
              <sl-icon
                name="plus-slash-minus"
                slot="prefix"
                label=${msg("Increase or decrease")}
              ></sl-icon>
              <span>${msg("Edit Browser Windows")}</span>
            </sl-button>
          </sl-tooltip>
        </div>`;
    }
    if (this.activePanel === "logs") {
      const authToken = this.authState?.headers.Authorization.split(" ")[1];
      const isDownloadEnabled = Boolean(
        this.workflow?.lastCrawlId && !this.workflow.isCrawlRunning,
      );
      return html` <h3>${this.tabLabels.logs}</h3>
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
            ${msg("Download All Logs")}
          </sl-button>
        </sl-tooltip>`;
    }

    return html`<h3>${this.tabLabels[this.activePanel]}</h3>`;
  }

  private renderTab(tabName: Tab, { disabled = false } = {}) {
    const isActive = tabName === this.activePanel;
    return html`
      <btrix-tab-group-tab
        slot="nav"
        panel=${tabName}
        href=${`${window.location.pathname}#${tabName}`}
        ?disabled=${disabled}
        aria-selected=${isActive}
        aria-disabled=${disabled}
        @click=${(e: MouseEvent) => {
          if (disabled) e.preventDefault();
        }}
      >
        ${choose(tabName, [
          [
            "crawls",
            () => html`<sl-icon name="gear-wide-connected"></sl-icon>`,
          ],
          ["watch", () => html`<sl-icon name="eye-fill"></sl-icon>`],
          ["logs", () => html`<sl-icon name="terminal-fill"></sl-icon>`],
          ["settings", () => html`<sl-icon name="file-code-fill"></sl-icon>`],
        ])}
        ${this.tabLabels[tabName]}
      </btrix-tab-group-tab>
    `;
  }

  private readonly renderEditor = () => html`
    <div class="col-span-1">${this.renderBreadcrumbs()}</div>

    <header class="col-span-1 mb-3 flex flex-wrap gap-2">
      <btrix-detail-page-title .item=${this.workflow}></btrix-detail-page-title>
    </header>

    ${when(
      !this.isLoading && this.seeds && this.workflow,
      (workflow) => html`
        <btrix-workflow-editor
          .initialWorkflow=${workflow}
          .initialSeeds=${this.seeds!.items}
          configId=${workflow.id}
          @reset=${() =>
            this.navigate.to(
              `${this.navigate.orgBasePath}/workflows/${workflow.id}`,
            )}
        ></btrix-workflow-editor>
      `,
      this.renderLoading,
    )}
  `;

  private readonly renderActions = () => {
    if (!this.workflow) return;
    const workflow = this.workflow;

    const archivingDisabled = isArchivingDisabled(this.org, true);
    const paused = workflow.lastCrawlState === "paused";
    const hidePause =
      !this.lastCrawlId ||
      this.isCancelingOrStoppingCrawl ||
      this.workflow.lastCrawlStopping;
    const disablePause =
      this.workflow.lastCrawlPausing ===
      (this.workflow.lastCrawlState === "running");

    return html`
      ${when(
        this.workflow.isCrawlRunning,
        () => html`
          <sl-button-group>
            ${when(
              !hidePause,
              () => html`
                <sl-button
                  size="small"
                  @click=${this.pauseUnpause}
                  ?disabled=${disablePause}
                  variant=${ifDefined(paused ? "primary" : undefined)}
                >
                  <sl-icon
                    name=${paused ? "play-circle" : "pause-circle"}
                    slot="prefix"
                  ></sl-icon>
                  <span>${paused ? msg("Resume") : msg("Pause")}</span>
                </sl-button>
              `,
            )}
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
                ${msg(html`Cancel & Discard Crawl`)}
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
            workflow.isCrawlRunning && !workflow.lastCrawlStopping,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item @click=${() => (this.openDialogName = "scale")}>
                <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                ${msg("Edit Browser Windows")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => (this.openDialogName = "exclusions")}
                ?disabled=${!this.isExplicitRunning}
              >
                <sl-icon name="table" slot="prefix"></sl-icon>
                ${msg("Edit Exclusions")}
              </sl-menu-item>
            `,
          )}
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              this.navigate.to(
                `/orgs/${this.appState.orgSlug}/workflows/${workflow.id}?edit`,
              )}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Workflow Settings")}
          </sl-menu-item>
          <sl-menu-item
            ?disabled=${archivingDisabled}
            @click=${() => void this.duplicateConfig()}
          >
            <sl-icon name="files" slot="prefix"></sl-icon>
            ${msg("Duplicate Workflow")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              ClipboardController.copyToClipboard(workflow.tags.join(", "))}
            ?disabled=${!workflow.tags.length}
          >
            <sl-icon name="tags" slot="prefix"></sl-icon>
            ${msg("Copy Tags")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() => ClipboardController.copyToClipboard(workflow.id)}
          >
            <sl-icon name="copy" slot="prefix"></sl-icon>
            ${msg("Copy Workflow ID")}
          </sl-menu-item>
          ${when(
            !workflow.crawlCount,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => (this.openDialogName = "delete")}
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
              ?pausing=${workflow.lastCrawlPausing}
            ></btrix-crawl-status>
          `,
        )}
        ${this.renderDetailItem(
          msg("Total Size"),
          (workflow) =>
            html` ${this.localize.bytes(Number(workflow.totalSize), {
              unitDisplay: "narrow",
            })}`,
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
            str`${workflow.createdByName} on ${this.localize.date(
              new Date(workflow.created),
              {
                year: "numeric",
                month: "numeric",
                day: "numeric",
              },
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
          class="mb-3 flex items-center justify-end rounded-lg border bg-neutral-50 p-3"
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
            ${when(this.crawls, () =>
              this.crawls!.items.map(
                (crawl: Crawl) =>
                  html` <btrix-crawl-list-item
                    href=${ifDefined(
                      isActive(crawl)
                        ? undefined
                        : `${this.navigate.orgBasePath}/workflows/${this.workflowId}/crawls/${crawl.id}`,
                    )}
                    .crawl=${crawl}
                  >
                    <sl-menu slot="menu">
                      <sl-menu-item
                        @click=${() =>
                          ClipboardController.copyToClipboard(crawl.id)}
                      >
                        <sl-icon name="copy" slot="prefix"></sl-icon>
                        ${msg("Copy Crawl ID")}
                      </sl-menu-item>
                      ${when(
                        this.isCrawler,
                        () => html`
                          <sl-divider></sl-divider>
                          <sl-menu-item
                            style="--sl-color-neutral-700: var(--danger)"
                            @click=${() => this.confirmDeleteCrawl(crawl)}
                          >
                            <sl-icon name="trash3" slot="prefix"></sl-icon>
                            ${msg("Delete Crawl")}
                          </sl-menu-item>
                        `,
                      )}
                    </sl-menu>
                  </btrix-crawl-list-item>`,
              ),
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
            ? `${this.localize.number(
                +(this.lastCrawlStats.done || 0),
              )} / ${this.localize.number(+(this.lastCrawlStats.found || 0))}`
            : html`<sl-spinner></sl-spinner>`,
        )}
        ${this.renderDetailItem(msg("Run Duration"), () =>
          this.lastCrawlStartTime
            ? this.localize.humanizeDuration(
                new Date().valueOf() -
                  new Date(this.lastCrawlStartTime).valueOf(),
              )
            : skeleton,
        )}
        ${this.renderDetailItem(msg("Crawl Size"), () =>
          this.workflow
            ? this.localize.bytes(this.workflow.lastCrawlSize || 0, {
                unitDisplay: "narrow",
              })
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

    // Show custom message if crawl is active but not explicitly running
    let waitingMsg: string | null = null;

    if (!this.isExplicitRunning) {
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

        case "pending-wait":
        case "generate-wacz":
        case "uploading-wacz":
          waitingMsg = msg("Crawl finishing...");
          break;

        default:
          if (this.workflow.lastCrawlStopping) {
            waitingMsg = msg("Crawl stopping...");
          }
          break;
      }
    }

    const authToken = this.authState.headers.Authorization.split(" ")[1];

    return html`
      ${when(
        this.isExplicitRunning && this.workflow,
        (workflow) => html`
          <div id="screencast-crawl">
            <btrix-screencast
              authToken=${authToken}
              .crawlId=${this.lastCrawlId ?? undefined}
              scale=${workflow.scale}
            ></btrix-screencast>
          </div>

          <section class="mt-4">${this.renderWatchLogs()}</section>
          <section class="mt-8">${this.renderExclusions()}</section>
        `,
        () =>
          waitingMsg
            ? html`<div class="rounded border p-3">
                <p class="text-sm text-neutral-600 motion-safe:animate-pulse">
                  ${waitingMsg}
                </p>
              </div>`
            : this.renderInactiveCrawlMessage(),
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
                href=${`${this.navigate.orgBasePath}/workflows/${workflow.id}/crawls/${workflow.lastCrawlId}#replay`}
                variant="primary"
                size="small"
                @click=${this.navigate.link}
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
                href=${`${this.navigate.orgBasePath}/workflows/${workflow.id}/crawls/${workflow.lastCrawlId}#qa`}
                size="small"
                @click=${this.navigate.link}
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
          this.lastCrawlId || this.workflow?.lastCrawlId,
          (crawlId) =>
            this.workflow?.isCrawlRunning
              ? html`
                  <div class="mb-4">
                    <btrix-alert variant="success" class="text-sm">
                      ${msg(
                        "You are viewing error and behavior logs for the currently running crawl.",
                      )}
                      <a
                        href="${`${window.location.pathname}#watch`}"
                        class="underline hover:no-underline"
                      >
                        ${msg("Watch Crawl")}
                      </a>
                    </btrix-alert>
                  </div>
                  <btrix-crawl-logs
                    crawlId=${crawlId}
                    liveKey=${ifDefined(this.timerId)}
                  ></btrix-crawl-logs>
                `
              : html`<btrix-crawl-logs crawlId=${crawlId}></btrix-crawl-logs>`,
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

  private renderWatchLogs() {
    if (!this.lastCrawlId) return;

    return html`
      <btrix-crawl-logs
        crawlId=${this.lastCrawlId}
        liveKey=${ifDefined(this.timerId)}
        pageSize=${1000}
        collapsible
      ></btrix-crawl-logs>
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
              ?isActiveCrawl=${this.workflow.lastCrawlState
                ? isActive({
                    state: this.workflow.lastCrawlState,
                    stopping: this.workflow.lastCrawlStopping,
                  })
                : false}
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
      const data = await this.api.fetch<{ scaled: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/scale`,
        {
          method: "POST",
          body: JSON.stringify({ scale: +value }),
        },
      );

      if (data.scaled) {
        void this.fetchWorkflow();
        this.notify.toast({
          message: msg("Updated number of browser windows."),
          variant: "success",
          icon: "check2-circle",
          id: "browser-windows-update-status",
        });
      } else {
        throw new Error("unhandled API response");
      }
    } catch {
      this.notify.toast({
        message: msg(
          "Sorry, couldn't change number of browser windows at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-windows-update-status",
      });
    }

    this.isSubmittingUpdate = false;
  }

  private async getWorkflow(): Promise<Workflow> {
    const data: Workflow = await this.api.fetch(
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
      this.notify.toast({
        message: msg(
          "Sorry, couldn't retrieve all crawl settings at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-retrieve-error",
      });
    }
  }

  private async getSeeds() {
    const data = await this.api.fetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}/seeds`,
    );
    return data;
  }

  private async fetchCrawls() {
    try {
      this.crawls = await this.getCrawls();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't get crawls at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-retrieve-error",
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
    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
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
    const data = await this.api.fetch<Crawl>(
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

    this.navigate.to(`${this.navigate.orgBasePath}/workflows/new`, {
      workflow: workflowParams,
      seeds: this.seeds?.items,
    });

    this.notify.toast({
      message: msg(str`Copied Workflow to new template.`),
      variant: "success",
      icon: "check2-circle",
      id: "workflow-copied-success",
    });
  }

  private async delete(): Promise<void> {
    if (!this.workflow) return;

    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow.id}`,
        {
          method: "DELETE",
        },
      );

      this.navigate.to(`${this.navigate.orgBasePath}/workflows`);

      this.notify.toast({
        message: msg(
          html`Deleted <strong>${this.renderName()}</strong> Workflow.`,
        ),
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

  private async pauseUnpause() {
    if (!this.lastCrawlId) return;

    const pause = this.workflow?.lastCrawlState !== "paused";

    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/${pause ? "pause" : "unpause"}`,
        {
          method: "POST",
        },
      );
      if (data.success) {
        void this.fetchWorkflow();
      } else {
        throw data;
      }

      this.notify.toast({
        message: pause ? msg("Pausing crawl.") : msg("Resuming paused crawl."),
        variant: "success",
        icon: "check2-circle",
        id: "crawl-pause-unpause-status",
      });
    } catch {
      this.notify.toast({
        message: pause
          ? msg("Something went wrong, couldn't pause crawl.")
          : msg("Something went wrong, couldn't resume paused crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-pause-unpause-status",
      });
    }
  }

  private async cancel() {
    if (!this.lastCrawlId) return;

    this.isCancelingOrStoppingCrawl = true;

    try {
      const data = await this.api.fetch<{ success: boolean }>(
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
      this.notify.toast({
        message: msg("Something went wrong, couldn't cancel crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-stop-error",
      });
    }

    this.isCancelingOrStoppingCrawl = false;
  }

  private async stop() {
    if (!this.lastCrawlId) return;

    this.isCancelingOrStoppingCrawl = true;

    try {
      const data = await this.api.fetch<{ success: boolean }>(
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
      this.notify.toast({
        message: msg("Something went wrong, couldn't stop crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-stop-error",
      });
    }

    this.isCancelingOrStoppingCrawl = false;
  }

  private async runNow(): Promise<void> {
    try {
      const data = await this.api.fetch<{ started: string | null }>(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}/run`,
        {
          method: "POST",
        },
      );
      this.lastCrawlId = data.started;
      this.lastCrawlStartTime = new Date().toISOString();
      void this.fetchWorkflow();
      this.goToTab("watch");

      this.notify.toast({
        message: msg("Starting crawl."),
        variant: "success",
        icon: "check2-circle",
        id: "crawl-start-status",
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
      } else if (isApiError(e) && e.details == "proxy_not_found") {
        message = msg(
          "Your org doesn't have permission to use the proxy configured for this crawl.",
        );
      }
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-start-status",
      });
    }
  }

  private readonly confirmDeleteCrawl = (crawl: Crawl) => {
    this.crawlToDelete = crawl;
    this.openDialogName = "deleteCrawl";
  };

  private async deleteCrawl(crawl: Crawl) {
    try {
      const _data = await this.api.fetch(`/orgs/${crawl.oid}/crawls/delete`, {
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
      this.notify.toast({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
        id: "archived-item-delete-status",
      });
      void this.fetchCrawls();

      // Update crawl count
      void this.fetchWorkflow();
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
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-delete-status",
      });
    }
  }
}
