import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type { SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Crawl, CrawlLog, Seed, Workflow, WorkflowParams } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Alert } from "@/components/ui/alert";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { ExclusionEditor } from "@/features/crawl-workflows/exclusion-editor";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import { WorkflowTab } from "@/routes";
import { tooltipFor } from "@/strings/archived-items/tooltips";
import { deleteConfirmation, noData } from "@/strings/ui";
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
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

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

  @property({ type: String })
  workflowTab = WorkflowTab.LatestCrawl;

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
  private lastCrawl?: Pick<Crawl, "stats" | "pageCount" | "reviewStatus">;

  @state()
  private logTotals?: { errors: number; behaviors: number };

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

  @query("#pausedNotice")
  private readonly pausedNotice?: Alert | null;

  private getWorkflowPromise?: Promise<Workflow>;
  private getSeedsPromise?: Promise<APIPaginatedList<Seed>>;

  private readonly runNowTask = new Task(this, {
    autoRun: false,
    task: async (_args, { signal }) => {
      await this.runNow({ signal });
      await this.fetchWorkflow();
    },
    args: () => [] as const,
  });

  private get isExplicitRunning() {
    return (
      this.workflow?.isCrawlRunning &&
      !this.workflow.lastCrawlStopping &&
      this.workflow.lastCrawlState === "running"
    );
  }

  private readonly tabLabels: Record<WorkflowTab, string> = {
    [WorkflowTab.LatestCrawl]: msg("Latest Crawl"),
    crawls: msg("Crawls"),
    logs: msg("Logs"),
    settings: msg("Settings"),
  };

  private get groupedWorkflowTab() {
    return this.workflowTab === WorkflowTab.Logs
      ? WorkflowTab.LatestCrawl
      : this.workflowTab;
  }

  private get basePath() {
    return `${this.navigate.orgBasePath}/workflows/${this.workflowId}`;
  }

  connectedCallback(): void {
    this.redirectHash();
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this.stopPoll();
    super.disconnectedCallback();
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
      void this.fetchCrawls();
    } else if (changedProperties.has("workflowTab")) {
      void this.fetchDataForTab();
    }

    if (changedProperties.has("isEditing") && this.isEditing) {
      this.stopPoll();
    }
  }

  private async fetchDataForTab() {
    switch (this.groupedWorkflowTab) {
      case WorkflowTab.LatestCrawl:
        void this.fetchWorkflow();
        break;

      case WorkflowTab.Crawls: {
        void this.fetchCrawls();
        break;
      }
      default:
        break;
    }
  }

  private async fetchWorkflow() {
    this.stopPoll();
    this.isLoading = true;

    try {
      this.getWorkflowPromise = this.getWorkflow();
      this.workflow = await this.getWorkflowPromise;
      this.lastCrawlId = this.workflow.lastCrawlId;
      this.lastCrawlStartTime = this.workflow.lastCrawlStartTime;

      if (
        this.lastCrawlId &&
        this.groupedWorkflowTab === WorkflowTab.LatestCrawl
      ) {
        void this.fetchLastCrawl();
      }

      // TODO: Check if storage quota has been exceeded here by running
      // crawl??
    } catch (e) {
      this.notify.toast({
        message:
          isApiError(e) && e.statusCode === 404
            ? msg("Workflow not found.")
            : msg("Sorry, couldn't retrieve workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "data-retrieve-error",
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
          href: this.basePath,
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
    <btrix-tab-group active=${this.groupedWorkflowTab} placement="start">
      <header
        class="mb-2 flex h-7 items-end justify-between text-lg font-medium"
      >
        <h3>${this.tabLabels[this.groupedWorkflowTab]}</h3>
        ${this.renderPanelAction()}
      </header>

      ${this.renderTab(WorkflowTab.LatestCrawl)}
      ${this.renderTab(WorkflowTab.Crawls)}
      ${this.renderTab(WorkflowTab.Settings)}

      <btrix-tab-group-panel name=${WorkflowTab.Crawls}>
        ${this.renderCrawls()}
      </btrix-tab-group-panel>
      <btrix-tab-group-panel name=${WorkflowTab.LatestCrawl}>
        ${this.renderPausedNotice()} ${this.renderLatestCrawl()}
      </btrix-tab-group-panel>
      <btrix-tab-group-panel name=${WorkflowTab.Settings}>
        ${this.renderSettings()}
      </btrix-tab-group-panel>
    </btrix-tab-group>
  `;

  private renderPanelAction() {
    if (
      this.workflowTab === WorkflowTab.LatestCrawl &&
      this.isCrawler &&
      this.workflow &&
      !this.workflow.isCrawlRunning &&
      this.lastCrawlId
    ) {
      return html`<sl-tooltip content=${msg("Go to Quality Assurance")}>
        <sl-button
          size="small"
          href="${this.basePath}/crawls/${this.lastCrawlId}#qa"
          @click=${this.navigate.link}
          ?loading=${!this.lastCrawl}
        >
          <sl-icon slot="prefix" name="clipboard2-data-fill"></sl-icon>
          ${msg("QA Crawl")}
        </sl-button>
      </sl-tooltip>`;
    }

    if (this.workflowTab === WorkflowTab.Settings && this.isCrawler) {
      return html` 
        <sl-tooltip content=${msg("Edit Workflow Settings")}></sl-tooltip>
          <sl-icon-button
            name="pencil"
            class="text-base"
            href="${this.basePath}?edit"
            @click=${this.navigate.link}
          >
          </sl-icon-button>
        </sl-tooltip>`;
    }

    return nothing;
  }

  private renderTab(tabName: WorkflowTab) {
    const isActive = tabName === this.workflowTab;
    return html`
      <btrix-tab-group-tab
        slot="nav"
        panel=${tabName}
        href="${this.basePath}/${tabName}"
        aria-selected=${isActive}
        @click=${this.navigate.link}
      >
        ${choose(tabName, [
          [
            WorkflowTab.LatestCrawl,
            () => html`<sl-icon name="gear-wide-connected"></sl-icon>`,
          ],
          [WorkflowTab.Crawls, () => html`<sl-icon name="list-ul"></sl-icon>`],
          [
            WorkflowTab.Settings,
            () => html`<sl-icon name="file-code-fill"></sl-icon>`,
          ],
        ])}
        ${this.tabLabels[tabName]}
        ${choose(tabName, [
          [
            WorkflowTab.LatestCrawl,
            () =>
              this.workflow?.isCrawlRunning
                ? html`<btrix-badge variant="success">
                    ${msg("Active")}
                  </btrix-badge>`
                : nothing,
          ],
          [
            WorkflowTab.Crawls,
            () =>
              this.workflow
                ? html`<btrix-badge>
                    ${this.localize.number(
                      this.workflow.crawlCount +
                        (this.workflow.isCrawlRunning ? 1 : 0),
                    )}
                  </btrix-badge>`
                : nothing,
          ],
        ])}
      </btrix-tab-group-tab>
    `;
  }

  private readonly renderEditor = () => html`
    <div class="col-span-1">${this.renderBreadcrumbs()}</div>

    <header
      class="scrim scrim-to-b z-10 col-span-1 mb-3 flex flex-wrap gap-2 before:-top-3 lg:sticky lg:top-3"
    >
      <btrix-detail-page-title .item=${this.workflow}></btrix-detail-page-title>
    </header>

    ${when(
      !this.isLoading && this.seeds && this.workflow,
      (workflow) => html`
        <btrix-workflow-editor
          .initialWorkflow=${workflow}
          .initialSeeds=${this.seeds!.items}
          configId=${workflow.id}
          @reset=${() => this.navigate.to(this.basePath)}
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

    const hidePauseResume =
      !this.lastCrawlId ||
      this.isCancelingOrStoppingCrawl ||
      this.workflow.lastCrawlStopping;
    // disable pause/resume button if desired state is already in the process of being set.
    // if crawl is running, and pause requested (shouldPause is true), don't allow clicking Pausing
    // if crawl not running, and resume requested (shouldPause is false), don't allow clicking Resume
    const disablePauseResume =
      this.workflow.lastCrawlShouldPause ===
      (this.workflow.lastCrawlState === "running");

    return html`
      ${this.renderPausedNotice({ truncate: true })}
      ${when(
        this.workflow.isCrawlRunning,
        () => html`
          <sl-button-group>
            ${when(
              !hidePauseResume,
              () => html`
                <sl-button
                  size="small"
                  @click=${this.pauseResume}
                  ?disabled=${disablePauseResume}
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
        this.renderRunNowButton,
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
                @click=${() => void this.runNowTask.run()}
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
              ?shouldPause=${workflow.lastCrawlShouldPause}
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
                ${msg("A crawl is currently in progress.")}
                <a
                  href="${this.basePath}/${WorkflowTab.LatestCrawl}"
                  class="underline hover:no-underline"
                  @click=${this.navigate.link}
                >
                  ${msg("Watch Crawl")}
                </a>
              </btrix-alert>
            </div>`,
        )}

        <div class="mx-2">
          <btrix-crawl-list workflowId=${this.workflowId}>
            ${when(this.crawls, () =>
              this.crawls!.items.map(
                (crawl: Crawl) =>
                  html` <btrix-crawl-list-item
                    class=${clsx(
                      isActive(crawl) && tw`cursor-default text-neutral-500`,
                    )}
                    href=${ifDefined(
                      isActive(crawl)
                        ? undefined
                        : `${this.basePath}/crawls/${crawl.id}`,
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
                        this.isCrawler && !isActive(crawl),
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

  private readonly renderLatestCrawl = () => {
    if (!this.lastCrawlId) {
      return this.renderInactiveCrawlMessage();
    }

    const showReplay =
      this.workflow &&
      (!this.workflow.isCrawlRunning ||
        this.workflow.lastCrawlState === "paused");

    return html`
      <div class="mb-3 rounded-lg border px-4 py-2">
        ${this.renderCrawlDetails()}
      </div>

      <btrix-tab-group active=${this.workflowTab}>
        <btrix-tab-group-tab
          slot="nav"
          panel=${WorkflowTab.LatestCrawl}
          href="${this.basePath}/${WorkflowTab.LatestCrawl}"
          @click=${(e: MouseEvent) => this.navigate.link(e, undefined, false)}
        >
          ${showReplay
            ? html`
                <sl-icon name="replaywebpage" library="app"></sl-icon>
                ${msg("Replay")}
              `
            : html`
                <sl-icon name="eye-fill"></sl-icon>
                ${msg("Watch")}
              `}
        </btrix-tab-group-tab>
        <btrix-tab-group-tab
          slot="nav"
          panel=${WorkflowTab.Logs}
          href="${this.basePath}/${WorkflowTab.Logs}"
          @click=${(e: MouseEvent) => this.navigate.link(e, undefined, false)}
        >
          <sl-icon name="terminal-fill"></sl-icon>
          ${this.tabLabels.logs}
          ${this.logTotals?.errors
            ? html`<btrix-badge variant="danger">
                ${this.localize.number(this.logTotals.errors)}
                ${pluralOf("errors", this.logTotals.errors)}
              </btrix-badge>`
            : nothing}
        </btrix-tab-group-tab>

        <div slot="action" class="flex items-center gap-2">
          ${this.renderLatestCrawlAction()}
        </div>

        <btrix-tab-group-panel
          name=${WorkflowTab.LatestCrawl}
          class="mt-3 block"
        >
          ${when(
            showReplay,
            this.renderInactiveWatchCrawl,
            this.renderWatchCrawl,
          )}
        </btrix-tab-group-panel>
        <btrix-tab-group-panel name=${WorkflowTab.Logs} class="mt-3 block">
          ${this.renderLogs()}
        </btrix-tab-group-panel>
      </btrix-tab-group>
    `;
  };

  private readonly renderPausedNotice = (
    { truncate } = { truncate: false },
  ) => {
    if (
      !this.workflow ||
      this.workflow.lastCrawlState !== "paused" ||
      !this.workflow.lastCrawlPausedExpiry
    )
      return;

    const diff =
      new Date(this.workflow.lastCrawlPausedExpiry).valueOf() -
      new Date().valueOf();

    if (diff < 0) return;

    const formattedDate = this.localize.date(
      this.workflow.lastCrawlPausedExpiry,
    );

    const infoIcon = html`<sl-icon
      class="text-base"
      name="info-circle"
    ></sl-icon>`;

    if (truncate) {
      return html`
        <sl-tooltip>
          <btrix-badge
            class="cursor-default part-[base]:gap-1.5"
            variant="blue"
          >
            ${infoIcon}
            <div>
              ${this.localize.humanizeDuration(diff, {
                unitCount: diff / 1000 / 60 < 10 ? 2 : 1,
              })}
              ${msg("left to resume")}
            </div>
          </btrix-badge>

          <div slot="content">
            ${msg(str`This crawl will stop on ${formattedDate}.`)}
            ${msg(
              "Pages crawled so far will be saved, but the crawl will not be resumable.",
            )}
          </div>
        </sl-tooltip>
      `;
    }

    return html`
      <btrix-alert
        id="pausedNotice"
        class="sticky top-2 z-50 mb-5"
        variant="info"
      >
        <div class="mb-2 flex justify-between">
          <span class="inline-flex items-center gap-1.5">
            ${infoIcon}
            <strong class="font-medium">
              ${msg("This crawl is currently paused.")}
            </strong>
          </span>
          <sl-button
            size="small"
            variant="text"
            @click=${() => this.pausedNotice?.hide()}
          >
            <sl-icon slot="prefix" name="check-lg"></sl-icon>
            ${msg("Dismiss")}
          </sl-button>
        </div>
        <div class="text-pretty text-neutral-600">
          <p class="mb-2">
            ${msg(
              str`If the crawl isn't resumed by ${formattedDate}, the crawl will stop gracefully.`,
            )}
            ${msg("All pages crawled so far will be saved.")}
          </p>
          <p class="mb-2">
            ${msg(
              "You can replay or download your crawl while it's paused to assess whether to resume the crawl.",
            )}
          </p>
        </div>
      </btrix-alert>
    `;
  };

  private renderLatestCrawlAction() {
    if (
      this.isCrawler &&
      this.workflow &&
      this.workflow.isCrawlRunning &&
      this.workflow.lastCrawlState !== "paused"
    ) {
      const enableEditBrowserWindows = !this.workflow.lastCrawlStopping;
      const windowCount =
        this.workflow.scale * (this.appState.settings?.numBrowsers || 1);

      return html`
        <div class="text-neutral-500">
          ${msg("Running in")} ${this.localize.number(windowCount)}
          ${pluralOf("browserWindows", windowCount)}
        </div>

        <sl-tooltip
          content=${enableEditBrowserWindows
            ? msg("Edit Browser Windows")
            : msg(
                "Browser windows can only be edited while a crawl is starting or running",
              )}
        >
          <sl-icon-button
            name="plus-slash-minus"
            label=${msg("Increase or decrease")}
            ?disabled=${!enableEditBrowserWindows}
            @click=${() => (this.openDialogName = "scale")}
          >
          </sl-icon-button>
        </sl-tooltip>
      `;
    }

    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    if (
      this.workflowTab === WorkflowTab.LatestCrawl &&
      this.lastCrawlId &&
      this.workflow?.lastCrawlSize
    ) {
      return html`<sl-tooltip content=${tooltipFor.downloadMultWacz} hoist>
        <sl-icon-button
          class="text-base"
          name="cloud-download"
          href=${`/api/orgs/${this.orgId}/all-crawls/${this.lastCrawlId}/download?auth_bearer=${authToken}`}
          download=${`browsertrix-${this.lastCrawlId}.wacz`}
          label=${msg("Download")}
        >
        </sl-icon-button>
      </sl-tooltip> `;
    }

    if (
      this.workflowTab === WorkflowTab.Logs &&
      (this.logTotals?.errors || this.logTotals?.behaviors)
    ) {
      return html`<sl-tooltip content=${tooltipFor.downloadLogs} hoist>
        <sl-icon-button
          class="text-base"
          name="file-earmark-arrow-down"
          href=${`/api/orgs/${this.orgId}/crawls/${this.lastCrawlId}/logs?auth_bearer=${authToken}`}
          download=${`browsertrix-${this.lastCrawlId}-logs.log`}
          label=${msg("Download")}
        >
        </sl-icon-button>
      </sl-tooltip>`;
    }
  }

  private readonly renderCrawlDetails = () => {
    const skeleton = html`<sl-skeleton class="w-full"></sl-skeleton>`;

    const pages = (workflow: Workflow) => {
      if (!this.lastCrawl) return skeleton;

      if (workflow.isCrawlRunning) {
        return [
          this.localize.number(+(this.lastCrawl.stats?.done || 0)),
          this.localize.number(+(this.lastCrawl.stats?.found || 0)),
        ].join(" / ");
      }

      return this.localize.number(this.lastCrawl.pageCount || 0);
    };

    const qa = (workflow: Workflow) => {
      if (!this.lastCrawl)
        return html`<sl-skeleton class="w-24"></sl-skeleton>`;

      if (workflow.isCrawlRunning) {
        return html`<span class="text-neutral-400">
          ${noData}
          <sl-tooltip
            class="invert-tooltip"
            content=${msg("QA will be enabled once this crawl is complete.")}
            hoist
            placement="bottom"
          >
            <sl-icon name="question-circle"></sl-icon>
          </sl-tooltip>
        </span>`;
      }

      return html`<btrix-qa-review-status
        status=${ifDefined(this.lastCrawl.reviewStatus)}
      ></btrix-qa-review-status>`;
    };

    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(msg("Run Duration"), (workflow) =>
          this.lastCrawlStartTime
            ? this.localize.humanizeDuration(
                (workflow.lastCrawlTime && !workflow.isCrawlRunning
                  ? new Date(workflow.lastCrawlTime)
                  : new Date()
                ).valueOf() - new Date(this.lastCrawlStartTime).valueOf(),
              )
            : skeleton,
        )}
        ${this.renderDetailItem(msg("Pages Crawled"), pages)}
        ${this.renderDetailItem(msg("Size"), (workflow) =>
          this.localize.bytes(workflow.lastCrawlSize || 0, {
            unitDisplay: "narrow",
          }),
        )}
        ${this.renderDetailItem(msg("QA Rating"), qa)}
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

          <section class="mt-8">${this.renderExclusions()}</section>
        `,
        () =>
          waitingMsg
            ? html`<div class="rounded-lg border p-3">
                <p class="text-sm text-neutral-600 motion-safe:animate-pulse">
                  ${waitingMsg}
                </p>
              </div>`
            : this.renderInactiveCrawlMessage(),
      )}
    `;
  };

  private readonly renderInactiveWatchCrawl = () => {
    if (!this.workflow) return;

    if (!this.lastCrawlId || !this.workflow.lastCrawlSize) {
      return this.renderInactiveCrawlMessage();
    }

    return html`
      <div class="aspect-video overflow-hidden rounded-lg border">
        ${this.renderReplay()}
      </div>
    `;
  };

  private renderInactiveCrawlMessage() {
    if (!this.workflow) return;

    let message = msg("This workflow hasn’t been run yet.");

    if (this.lastCrawlId) {
      if (this.workflow.lastCrawlState === "canceled") {
        message = msg("This crawl can’t be replayed since it was canceled.");
      } else {
        message = msg("Replay is not enabled on this crawl.");
      }
    }

    return html`
      <section
        class="flex h-56 min-h-max flex-col items-center justify-center rounded-lg border p-4"
      >
        <p class="text-base font-medium">${message}</p>

        ${when(
          this.isCrawler && !this.lastCrawlId,
          () => html`<div class="mt-4">${this.renderRunNowButton()}</div>`,
        )}
        ${when(
          this.lastCrawlId,
          () =>
            html`<div class="mt-4">
              <sl-button
                size="small"
                href="${this.basePath}/crawls/${this.lastCrawlId}"
                @click=${this.navigate.link}
              >
                ${msg("View Crawl Details")}
                <sl-icon slot="suffix" name="arrow-right"></sl-icon>
              </sl-button>
            </div>`,
        )}
      </section>
    `;
  }

  private renderReplay() {
    if (!this.workflow || !this.lastCrawlId) return;

    const replaySource = `/api/orgs/${this.workflow.oid}/crawls/${this.lastCrawlId}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html`
      <replay-web-page
        source="${replaySource}"
        url="${(this.workflow.seedCount === 1 && this.workflow.firstSeed) ||
        ""}"
        config="${config}"
        replayBase="/replay/"
        noSandbox="true"
        noCache="true"
      ></replay-web-page>
    `;
  }

  private renderLogs() {
    return html`
      <div aria-live="polite" aria-busy=${this.isLoading}>
        ${when(
          this.lastCrawlId,
          (crawlId) => html`
            <btrix-crawl-logs
              crawlId=${crawlId}
              liveKey=${ifDefined(
                (this.isExplicitRunning && this.timerId) || undefined,
              )}
              pageSize=${this.isExplicitRunning ? 100 : 50}
            ></btrix-crawl-logs>
          `,
          () => this.renderNoCrawlLogs(),
        )}
      </div>
    `;
  }

  private readonly renderRunNowButton = () => {
    return html`
      <sl-tooltip
        content=${msg("Org Storage Full or Monthly Execution Minutes Reached")}
        ?disabled=${!this.org?.storageQuotaReached &&
        !this.org?.execMinutesQuotaReached}
      >
        <sl-button
          size="small"
          variant="primary"
          ?disabled=${this.org?.storageQuotaReached ||
          this.org?.execMinutesQuotaReached ||
          this.runNowTask.status === TaskStatus.PENDING}
          ?loading=${this.runNowTask.status === TaskStatus.PENDING}
          @click=${() => void this.runNowTask.run()}
        >
          <sl-icon slot="prefix" name="play"></sl-icon>
          ${msg("Run Crawl")}
        </sl-button>
      </sl-tooltip>
    `;
  };

  private renderNoCrawlLogs() {
    return html`
      <section
        class="flex h-56 min-h-max flex-col items-center justify-center rounded-lg border p-4"
      >
        <p class="text-base font-medium">
          ${msg("Logs will show here after you run a crawl.")}
        </p>
        ${when(
          this.isCrawler,
          () => html` <div class="mt-4">${this.renderRunNowButton()}</div> `,
        )}
      </section>
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
        id: "data-retrieve-error",
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
        id: "data-retrieve-error",
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

  private stopPoll() {
    window.clearTimeout(this.timerId);
  }

  private async fetchLastCrawl() {
    if (!this.lastCrawlId) return;

    let crawlState: CrawlState | null = null;

    try {
      const { stats, pageCount, reviewStatus, state } = await this.getCrawl(
        this.lastCrawlId,
      );
      this.lastCrawl = { stats, pageCount, reviewStatus };

      crawlState = state;
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve latest crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "data-retrieve-error",
      });
    }

    if (
      !this.logTotals ||
      (crawlState && isActive({ state: crawlState })) ||
      this.workflowTab === WorkflowTab.Logs
    ) {
      try {
        this.logTotals = await this.getLogTotals(this.lastCrawlId);
      } catch (err) {
        // Fail silently, since we're fetching just the total
        console.debug(err);
      }
    }
  }

  private async getCrawl(crawlId: Crawl["id"]): Promise<Crawl> {
    const data = await this.api.fetch<Crawl>(
      `/orgs/${this.orgId}/crawls/${crawlId}/replay.json`,
    );

    return data;
  }

  private async getLogTotals(
    crawlId: Crawl["id"],
  ): Promise<WorkflowDetail["logTotals"]> {
    const query = queryString.stringify({ pageSize: 1 });

    const [errors, behaviors] = await Promise.all([
      this.api.fetch<APIPaginatedList<CrawlLog>>(
        `/orgs/${this.orgId}/crawls/${crawlId}/errors?${query}`,
      ),
      this.api.fetch<APIPaginatedList<CrawlLog>>(
        `/orgs/${this.orgId}/crawls/${crawlId}/behaviorLogs?${query}`,
      ),
    ]);

    return {
      errors: errors.total,
      behaviors: behaviors.total,
    };
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

  private async pauseResume() {
    if (!this.lastCrawlId) return;

    const pause = this.workflow?.lastCrawlState !== "paused";

    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/${pause ? "pause" : "resume"}`,
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
        id: "crawl-pause-resume-status",
      });
    } catch {
      this.notify.toast({
        message: pause
          ? msg("Something went wrong, couldn't pause crawl.")
          : msg("Something went wrong, couldn't resume paused crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-pause-resume-status",
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

  private async runNow({
    signal,
  }: { signal?: AbortSignal } = {}): Promise<void> {
    try {
      const data = await this.api.fetch<{ started: string | null }>(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}/run`,
        {
          method: "POST",
          signal,
        },
      );
      this.lastCrawlId = data.started;
      this.lastCrawlStartTime = new Date().toISOString();

      this.navigate.to(`${this.basePath}/${WorkflowTab.LatestCrawl}`);

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

  /**
   * Handle redirects to new tabs introduced in
   * https://github.com/webrecorder/browsertrix/issues/2603
   */
  private redirectHash() {
    const hashValue = window.location.hash.slice(1);

    switch (hashValue) {
      case "watch":
        this.navigate.to(`${this.basePath}/${WorkflowTab.LatestCrawl}`, {
          replace: true,
        });
        break;
      case "crawls":
      case "logs":
      case "settings":
        this.navigate.to(`${this.basePath}/${hashValue}`, {
          replace: true,
        });
        break;
      default:
        break;
    }
  }
}
