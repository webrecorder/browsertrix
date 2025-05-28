import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type { SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Crawl, CrawlLog, Seed, Workflow, WorkflowParams } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Alert } from "@/components/ui/alert";
import {
  calculatePages,
  parsePage,
  type PageChangeEvent,
} from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { ExclusionEditor } from "@/features/crawl-workflows/exclusion-editor";
import { pageError } from "@/layouts/pageError";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import { WorkflowTab } from "@/routes";
import { deleteConfirmation, noData, notApplicable } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import { type CrawlState } from "@/types/crawlState";
import { isApiError } from "@/utils/api";
import {
  DEFAULT_MAX_SCALE,
  inactiveCrawlStates,
  isActive,
  isSuccessfullyFinished,
} from "@/utils/crawler";
import { humanizeSchedule } from "@/utils/cron";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { isArchivingDisabled } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const POLL_INTERVAL_SECONDS = 10;
const CRAWLS_PAGINATION_NAME = "crawlsPage";

const isLoading = (task: Task) => task.status === TaskStatus.PENDING;

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
  workflowTab?: WorkflowTab;

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
  private lastCrawlId: Workflow["lastCrawlId"] = null;

  @state()
  private isDialogVisible = false;

  @state()
  private isCancelingRun = false;

  @state()
  private crawlToDelete: Crawl | null = null;

  @state()
  private crawlsParams: { state?: CrawlState[] } & APIPaginationQuery = {
    page: parsePage(
      new URLSearchParams(location.search).get(CRAWLS_PAGINATION_NAME),
    ),
  };

  @query("#pausedNotice")
  private readonly pausedNotice?: Alert | null;

  // Keep previous values to use when editing
  private readonly prevValues: {
    workflow?: Awaited<ReturnType<WorkflowDetail["getWorkflow"]>>;
    seeds?: APIPaginatedList<Seed>;
  } = {};

  private readonly workflowTask = new Task(this, {
    task: async ([workflowId, isEditing], { signal }) => {
      if (!workflowId) throw new Error("required `workflowId` missing");

      this.stopPoll();

      if (isEditing && this.prevValues.workflow) {
        return this.prevValues.workflow;
      }

      const workflow = await this.getWorkflow(workflowId, signal);

      this.prevValues.workflow = workflow;

      if (this.isCancelingRun) {
        this.isCancelingRun = !isActive(workflow);
      }

      if (
        // Last crawl ID can also be set in `runNow()`
        workflow.lastCrawlId !== this.lastCrawlId
      ) {
        this.lastCrawlId = workflow.lastCrawlId;
      }

      return workflow;
    },
    args: () => [this.workflowId, this.isEditing] as const,
  });

  private readonly seedsTask = new Task(this, {
    task: async ([workflowId, isEditing], { signal }) => {
      if (!workflowId) throw new Error("required `workflowId` missing");

      if (isEditing && this.prevValues.seeds) {
        return this.prevValues.seeds;
      }

      return await this.getSeeds(workflowId, signal);
    },
    args: () => [this.workflowId, this.isEditing] as const,
  });

  private readonly latestCrawlTask = new Task(this, {
    task: async ([lastCrawlId], { signal }) => {
      if (!lastCrawlId) return null;

      return await this.getCrawl(lastCrawlId, signal);
    },
    args: () => [this.lastCrawlId] as const,
  });

  private readonly logTotalsTask = new Task(this, {
    task: async ([lastCrawlId], { signal }) => {
      if (!lastCrawlId) return null;

      return await this.getLogTotals(lastCrawlId, signal);
    },
    args: () => [this.lastCrawlId] as const,
  });

  private readonly crawlsTask = new Task(this, {
    task: async ([workflowId, crawlsParams], { signal }) => {
      if (!workflowId) throw new Error("required `workflowId` missing");

      return await this.getCrawls(workflowId, crawlsParams, signal);
    },
    args: () => [this.workflowId, this.crawlsParams] as const,
  });

  private readonly pollTask = new Task(this, {
    task: async ([workflow, isEditing]) => {
      if (!workflow || isEditing) {
        return;
      }

      if (workflow.lastCrawlId) {
        await Promise.all([
          this.latestCrawlTask.taskComplete,
          this.logTotalsTask.taskComplete,
          this.crawlsTask.taskComplete,
        ]);
      }

      return window.setTimeout(async () => {
        void this.workflowTask.run();
        await this.workflowTask.taskComplete;

        // Retrieve additional data based on current tab
        if (this.isRunning) {
          switch (this.groupedWorkflowTab) {
            case WorkflowTab.LatestCrawl: {
              void this.latestCrawlTask.run();
              void this.logTotalsTask.run();
              break;
            }
            case WorkflowTab.Crawls: {
              void this.crawlsTask.run();
              break;
            }
            default:
              break;
          }
        }
      }, POLL_INTERVAL_SECONDS * 1000);
    },
    args: () => [this.workflowTask.value, this.isEditing] as const,
  });

  private readonly runNowTask = new Task(this, {
    task: async (_args, { signal }) => {
      this.stopPoll();

      await this.runNow(signal);

      await this.workflowTask.run();

      return this.workflow;
    },
  });

  private readonly scaleTask = new Task(this, {
    task: async ([value], { signal }) => {
      this.stopPoll();

      await this.scale(value as Crawl["scale"], signal);

      await this.workflowTask.run();

      return this.workflow;
    },
  });

  private readonly pauseResumeTask = new Task(this, {
    task: async (_args, { signal }) => {
      this.stopPoll();

      await this.pauseResume(signal);

      void this.crawlsTask.run();
      await this.workflowTask.run();

      return this.workflow;
    },
  });

  private readonly stopTask = new Task(this, {
    task: async (_args, { signal }) => {
      this.stopPoll();

      await this.stop(signal);

      void this.crawlsTask.run();
      await this.workflowTask.run();

      return this.workflow;
    },
  });

  private readonly cancelTask = new Task(this, {
    task: async (_args, { signal }) => {
      this.stopPoll();

      await this.cancel(signal);

      void this.crawlsTask.run();
      await this.workflowTask.run();

      return this.workflow;
    },
  });

  // TODO Use task render function
  private get workflow() {
    return this.workflowTask.value;
  }
  private get seeds() {
    return this.seedsTask.value;
  }
  private get crawls() {
    return this.crawlsTask.value;
  }

  private get isReady() {
    if (!this.workflow) return false;

    if (this.workflow.lastCrawlId) {
      if (this.groupedWorkflowTab === WorkflowTab.LatestCrawl) {
        return Boolean(this.latestCrawlTask.value);
      }

      if (this.groupedWorkflowTab === WorkflowTab.Crawls) {
        return Boolean(this.crawlsTask.value);
      }
    }

    if (this.groupedWorkflowTab === WorkflowTab.Settings) {
      return Boolean(this.seedsTask.value);
    }

    return true;
  }

  // Workflow is active and not paused
  private get isRunning() {
    return this.workflow?.isCrawlRunning && !this.isPaused;
  }

  // Crawl is explicitly running
  private get isCrawling() {
    return (
      this.workflow?.isCrawlRunning &&
      !this.workflow.lastCrawlStopping &&
      this.workflow.lastCrawlState === "running"
    );
  }

  private get isPaused() {
    return this.workflow?.lastCrawlState === "paused";
  }

  private get isResuming() {
    return this.workflow?.lastCrawlShouldPause === false && this.isPaused;
  }

  // Differentiate between archived item and crawl ID, since
  // non-successful crawls do not show up in the archived item list.
  private get archivedItemId() {
    if (!this.workflow) return;

    return (
      this.workflow.lastCrawlState &&
      isSuccessfullyFinished({ state: this.workflow.lastCrawlState }) &&
      this.workflow.lastCrawlId
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

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      (changedProperties.has("workflowTab") ||
        changedProperties.has("isEditing")) &&
      !this.isEditing &&
      !this.workflowTab
    ) {
      this.workflowTab = WorkflowTab.LatestCrawl;
    }
  }

  firstUpdated() {
    if (
      this.openDialogName &&
      (this.openDialogName === "scale" || this.openDialogName === "exclusions")
    ) {
      void this.showDialog();
    }
  }

  render() {
    if (this.workflowTask.status === TaskStatus.ERROR) {
      return this.workflowTask.render({
        error: this.renderPageError,
      });
    }

    if (this.isEditing && this.isCrawler) {
      return html`
        <div class="grid grid-cols-1 gap-7 pb-7">${this.renderEditor()}</div>
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

        ${when(
          this.isReady && this.groupedWorkflowTab,
          this.renderTabList,
          this.renderLoading,
        )}
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
            ?loading=${isLoading(this.stopTask)}
            @click=${async () => {
              await this.stopTask.run();
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
            ?loading=${isLoading(this.cancelTask)}
            @click=${async () => {
              await this.cancelTask.run();
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

  private readonly renderPageError = (err: unknown) => {
    if (isApiError(err) && err.statusCode >= 400 && err.statusCode < 500) {
      // API returns a 422 for non existing CIDs
      return html`<btrix-not-found></btrix-not-found>`;
    }

    console.error(err);

    const email = this.appState.settings?.supportEmail;

    return pageError({
      heading: msg("Sorry, something unexpected went wrong"),
      detail: msg("Try reloading the page."),
      primaryAction: html`<sl-button
        @click=${() => window.location.reload()}
        size="small"
        >${msg("Reload")}</sl-button
      >`,
      secondaryAction: email
        ? html`
            ${msg("If the problem persists, please reach out to us.")}
            <br />
            <btrix-link href="mailto:${email}">
              ${msg("Contact Support")}
            </btrix-link>
          `
        : undefined,
    });
  };

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

  private readonly renderTabList = (tab: WorkflowTab) => html`
    <btrix-tab-group active=${tab} placement="start">
      <header
        class="mb-2 flex h-7 items-end justify-between text-lg font-medium"
      >
        <h3>${this.tabLabels[tab]}</h3>
        <div class="flex items-center gap-2">${this.renderPanelAction()}</div>
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
    const latestCrawl = this.latestCrawlTask.value;

    if (this.groupedWorkflowTab === WorkflowTab.LatestCrawl && latestCrawl) {
      const latestCrawlId = latestCrawl.id;
      const logTotals = this.logTotalsTask.value;
      const authToken = this.authState?.headers.Authorization.split(" ")[1];
      const disableDownload = this.isRunning;

      return html`
        <btrix-copy-button
          class="mt-0.5"
          value=${latestCrawlId}
          content=${msg("Copy Item ID")}
          hoist
        ></btrix-copy-button>
        <sl-tooltip
          class=${disableDownload ? "invert-tooltip" : ""}
          content=${msg(
            "Downloads are disabled while running. Pause the crawl or wait for the crawl to finish to download.",
          )}
          ?disabled=${!disableDownload}
          hoist
        >
          <sl-button-group>
            <sl-tooltip
              content="${msg("Download Item as WACZ")} (${this.localize.bytes(
                latestCrawl.fileSize || 0,
              )})"
              ?disabled=${!latestCrawl.fileSize}
            >
              <sl-button
                size="small"
                href=${`/api/orgs/${this.orgId}/all-crawls/${latestCrawlId}/download?auth_bearer=${authToken}`}
                download=${`browsertrix-${latestCrawlId}.wacz`}
                ?disabled=${disableDownload || !latestCrawl.fileSize}
              >
                <sl-icon name="cloud-download" slot="prefix"></sl-icon>
                ${msg("Download")}
              </sl-button>
            </sl-tooltip>
            <sl-dropdown distance="4" placement="bottom-end" hoist>
              <sl-button
                slot="trigger"
                size="small"
                caret
                ?disabled=${disableDownload}
              >
                <sl-visually-hidden
                  >${msg("Download options")}</sl-visually-hidden
                >
              </sl-button>
              <sl-menu>
                <btrix-menu-item-link
                  href=${`/api/orgs/${this.orgId}/all-crawls/${this.lastCrawlId}/download?auth_bearer=${authToken}`}
                  ?disabled=${!latestCrawl.fileSize}
                  download
                >
                  <sl-icon name="cloud-download" slot="prefix"></sl-icon>
                  ${msg("Item")}
                  ${latestCrawl.fileSize
                    ? html` <btrix-badge
                        slot="suffix"
                        class="font-monostyle text-xs text-neutral-500"
                        >${this.localize.bytes(
                          latestCrawl.fileSize,
                        )}</btrix-badge
                      >`
                    : nothing}
                </btrix-menu-item-link>
                <btrix-menu-item-link
                  href=${`/api/orgs/${this.orgId}/crawls/${this.lastCrawlId}/logs?auth_bearer=${authToken}`}
                  ?disabled=${!(logTotals?.errors || logTotals?.behaviors)}
                  download
                >
                  <sl-icon
                    name="file-earmark-arrow-down"
                    slot="prefix"
                  ></sl-icon>
                  ${msg("Log")}
                </btrix-menu-item-link>
              </sl-menu>
            </sl-dropdown>
          </sl-button-group>
        </sl-tooltip>
      `;
    }

    if (this.workflowTab === WorkflowTab.Settings && this.isCrawler) {
      return html` <sl-tooltip content=${msg("Edit Workflow Settings")}>
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

    ${this.workflow && this.seeds
      ? html`
          <btrix-workflow-editor
            .initialWorkflow=${this.workflow}
            .initialSeeds=${this.seeds.items}
            configId=${this.workflowId}
            @reset=${() => this.navigate.to(this.basePath)}
          ></btrix-workflow-editor>
        `
      : until(
          Promise.all([
            this.workflowTask.taskComplete,
            this.seedsTask.taskComplete,
          ]).catch(this.renderPageError),
          this.renderLoading(),
        )}
  `;

  private get disablePauseResume() {
    if (!this.workflow) return true;

    // disable pause/resume button if desired state is already in the process of being set.
    // if crawl is running, and pause requested (shouldPause is true), don't allow clicking Pausing
    // if crawl not running, and resume requested (shouldPause is false), don't allow clicking Resume

    return (
      this.workflow.lastCrawlShouldPause ===
        (this.workflow.lastCrawlState !== "paused") ||
      isLoading(this.pauseResumeTask)
    );
  }

  private readonly renderActions = () => {
    if (!this.workflow) return;
    const workflow = this.workflow;

    const archivingDisabled = isArchivingDisabled(this.org, true);
    const cancelStopLoading = this.isCancelingRun;
    const paused = this.isPaused;

    const hidePauseResume =
      !this.lastCrawlId ||
      this.isCancelingRun ||
      this.workflow.lastCrawlStopping;
    const disablePauseResume =
      this.disablePauseResume ||
      cancelStopLoading ||
      (paused && archivingDisabled);
    const pauseResumeLoading = isLoading(this.pauseResumeTask);

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
                  @click=${() => void this.pauseResumeTask.run()}
                  ?disabled=${disablePauseResume}
                  variant=${ifDefined(paused ? "primary" : undefined)}
                >
                  ${pauseResumeLoading
                    ? html`<sl-spinner slot="prefix"></sl-spinner>`
                    : html`
                        <sl-icon
                          name=${paused ? "play-circle" : "pause-circle"}
                          slot="prefix"
                        ></sl-icon>
                      `}
                  <span>${paused ? msg("Resume") : msg("Pause")}</span>
                </sl-button>
              `,
            )}
            <sl-button
              size="small"
              @click=${() => (this.openDialogName = "stop")}
              ?disabled=${!this.lastCrawlId ||
              this.isCancelingRun ||
              this.workflow?.lastCrawlStopping}
            >
              <sl-icon name="dash-square" slot="prefix"></sl-icon>
              <span>${msg("Stop")}</span>
            </sl-button>
            <sl-button
              size="small"
              @click=${() => (this.openDialogName = "cancel")}
              ?disabled=${!this.lastCrawlId || this.isCancelingRun}
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
            workflow.isCrawlRunning,
            // HACK shoelace doesn't current have a way to override non-hover
            // color without resetting the --sl-color-neutral-700 variable
            () => html`
              ${when(!hidePauseResume && !disablePauseResume, () =>
                paused
                  ? html`
                      <sl-menu-item
                        class="[--sl-color-neutral-700:var(--success)]"
                        @click=${() => void this.pauseResumeTask.run()}
                      >
                        <sl-icon name="play-circle" slot="prefix"></sl-icon>
                        ${msg("Resume Crawl")}
                      </sl-menu-item>
                    `
                  : html`
                      <sl-menu-item
                        @click=${() => void this.pauseResumeTask.run()}
                      >
                        <sl-icon name="pause-circle" slot="prefix"></sl-icon>
                        ${msg("Pause Crawl")}
                      </sl-menu-item>
                    `,
              )}

              <sl-menu-item
                @click=${() => (this.openDialogName = "stop")}
                ?disabled=${workflow.lastCrawlStopping || this.isCancelingRun}
              >
                <sl-icon name="dash-square" slot="prefix"></sl-icon>
                ${msg("Stop Crawl")}
              </sl-menu-item>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                ?disabled=${this.isCancelingRun}
                @click=${() => (this.openDialogName = "cancel")}
              >
                <sl-icon name="x-octagon" slot="prefix"></sl-icon>
                ${msg(html`Cancel & Discard Crawl`)}
              </sl-menu-item>
            `,
            () => html`
              <sl-menu-item
                class="[--sl-color-neutral-700:var(--success)]"
                ?disabled=${archivingDisabled}
                @click=${() => void this.runNowTask.run()}
              >
                <sl-icon name="play" slot="prefix"></sl-icon>
                ${msg("Run Crawl")}
              </sl-menu-item>
            `,
          )}
          <sl-divider></sl-divider>
          ${when(
            workflow.isCrawlRunning && !workflow.lastCrawlStopping,
            () => html`
              <sl-menu-item @click=${() => (this.openDialogName = "scale")}>
                <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                ${msg("Edit Browser Windows")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => (this.openDialogName = "exclusions")}
                ?disabled=${!this.isCrawling}
              >
                <sl-icon name="table" slot="prefix"></sl-icon>
                ${msg("Edit Exclusions")}
              </sl-menu-item>
            `,
          )}
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
          ${when(
            workflow.lastCrawlId,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item>
                ${this.tabLabels.latest} ${this.renderLatestCrawlMenu()}
              </sl-menu-item>
            `,
          )}
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

  private renderLatestCrawlMenu() {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];
    const latestCrawl = this.latestCrawlTask.value;
    const logTotals = this.logTotalsTask.value;

    return html`
      <sl-menu slot="submenu">
        <btrix-menu-item-link
          href=${`/api/orgs/${this.orgId}/all-crawls/${this.lastCrawlId}/download?auth_bearer=${authToken}`}
          ?disabled=${!latestCrawl?.fileSize}
          download
        >
          <sl-icon name="cloud-download" slot="prefix"></sl-icon>
          ${msg("Download Item")}
          ${latestCrawl?.fileSize
            ? html` <btrix-badge
                slot="suffix"
                class="font-monostyle text-xs text-neutral-500"
                >${this.localize.bytes(latestCrawl.fileSize)}</btrix-badge
              >`
            : nothing}
        </btrix-menu-item-link>

        <btrix-menu-item-link
          href=${`/api/orgs/${this.orgId}/crawls/${this.lastCrawlId}/logs?auth_bearer=${authToken}`}
          ?disabled=${!(logTotals?.errors || logTotals?.behaviors)}
          download
        >
          <sl-icon name="file-earmark-arrow-down" slot="prefix"></sl-icon>
          ${msg("Download Log")}
        </btrix-menu-item-link>

        <sl-divider></sl-divider>

        ${when(
          this.archivedItemId,
          (id) => html`
            <sl-menu-item
              @click=${() =>
                this.navigate.to(
                  `${this.basePath}/${WorkflowTab.Crawls}/${id}`,
                )}
            >
              <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
              ${msg("View Item Details")}
            </sl-menu-item>
          `,
        )}
        <sl-menu-item
          @click=${() =>
            ClipboardController.copyToClipboard(this.lastCrawlId || "")}
          ?disabled=${!this.lastCrawlId}
        >
          <sl-icon name="copy" slot="prefix"></sl-icon>
          ${msg("Copy Item ID")}
        </sl-menu-item>
      </sl-menu>
    `;
  }

  private renderDetails() {
    const relativeDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const diff = new Date().valueOf() - date.valueOf();
      const seconds = diff / 1000;
      const minutes = seconds / 60;
      const hours = minutes / 60;

      return html`
        <sl-tooltip
          content=${this.localize.date(date, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          })}
          hoist
          placement="bottom"
        >
          ${hours > 24
            ? this.localize.date(date, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : seconds > 60
              ? html`<sl-relative-time sync date=${dateStr}></sl-relative-time>`
              : msg("Now")}
        </sl-tooltip>
      `;
    };

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
        ${this.renderDetailItem(msg("Last Run"), (workflow) =>
          workflow.lastRun
            ? // TODO Use `lastStartedByName` when it's updated to be null for scheduled runs
              relativeDate(workflow.lastRun)
            : html`<span class="text-neutral-400">${msg("Never")}</span>`,
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
            : html`<span class="text-neutral-400">${msg("None")}</span>`,
        )}
        ${this.renderDetailItem(msg("Total Size"), (workflow) =>
          workflow.lastRun
            ? html` ${this.localize.bytes(Number(workflow.totalSize), {
                unitDisplay: "narrow",
              })}`
            : notApplicable,
        )}
        ${this.renderDetailItem(
          msg("Last Modified"),
          (workflow) =>
            html`${relativeDate(workflow.modified)} ${msg("by")}
            ${workflow.modifiedByName}`,
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
    const pageView = (crawls: APIPaginatedList<Crawl>) => {
      const pages = calculatePages(crawls);

      if (crawls.page === 1 || pages < 2) return;

      const page = this.localize.number(crawls.page);
      const pageCount = this.localize.number(pages);

      return msg(str`Viewing page ${page} of ${pageCount}`);
    };

    return html`
      <section>
        <div
          class="mb-3 flex items-center justify-between rounded-lg border bg-neutral-50 p-3 text-neutral-500"
        >
          <div>${when(this.crawls, pageView)}</div>
          <div class="flex items-center">
            <div class="mx-2">${msg("Status:")}</div>
            <sl-select
              id="stateSelect"
              class="flex-1 md:min-w-[16rem]"
              size="small"
              pill
              multiple
              max-options-visible="1"
              placeholder=${msg("Any")}
              @sl-change=${async (e: CustomEvent) => {
                const value = (e.target as SlSelect).value as CrawlState[];
                await this.updateComplete;
                this.crawlsParams = {
                  ...this.crawlsParams,
                  page: 1,
                  state: value,
                };
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
              <btrix-alert variant="success">
                ${this.isRunning
                  ? msg("Workflow crawl is currently in progress.")
                  : msg("This workflow has an active crawl.")}
                <a
                  href="${this.basePath}/${WorkflowTab.LatestCrawl}"
                  class="underline hover:no-underline"
                  @click=${this.navigate.link}
                >
                  ${this.isRunning ? msg("Watch Crawl") : msg("View Crawl")}
                </a>
              </btrix-alert>
            </div>`,
        )}

        <div class="mx-2">
          <btrix-crawl-list workflowId=${this.workflowId}>
            ${when(
              this.crawls,
              (crawls) =>
                crawls.items.map(
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
              () =>
                this.crawlsTask.render({
                  pending: () => html`
                    <div class="col-span-full mt-2 py-3 text-center">
                      <sl-spinner class="text-xl"></sl-spinner>
                    </div>
                  `,
                  error: () => html`
                    <div class="col-span-full p-3 text-center">
                      <btrix-alert variant="danger"
                        >${msg(
                          "Sorry, couldn't retrieve crawls at this time",
                        )}</btrix-alert
                      >
                    </div>
                  `,
                }),
            )}
          </btrix-crawl-list>
        </div>
        ${when(this.crawls, (crawls) =>
          crawls.total
            ? html`
                <footer class="my-4 flex justify-center">
                  <btrix-pagination
                    name=${CRAWLS_PAGINATION_NAME}
                    page=${crawls.page}
                    totalCount=${crawls.total}
                    size=${crawls.pageSize}
                    @page-change=${(e: PageChangeEvent) => {
                      this.crawlsParams = {
                        ...this.crawlsParams,
                        page: e.detail.page,
                      };
                    }}
                  >
                  </btrix-pagination>
                </footer>
              `
            : html`
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
    const { icon, label } = CrawlStatus.getContent({ state });

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private readonly renderLatestCrawl = () => {
    if (!this.lastCrawlId) {
      return this.renderInactiveCrawlMessage();
    }

    const logTotals = this.logTotalsTask.value;
    const showReplay = !this.isRunning;

    return html`
      <div class="mb-3 rounded-lg border px-4 py-2">
        ${this.renderCrawlDetails()}
      </div>

      <btrix-tab-group active=${this.workflowTab || WorkflowTab.LatestCrawl}>
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
          ${logTotals?.errors
            ? html`<btrix-badge variant="danger">
                ${this.localize.number(logTotals.errors)}
                ${pluralOf("errors", logTotals.errors)}
              </btrix-badge>`
            : nothing}
        </btrix-tab-group-tab>
        ${when(
          this.archivedItemId,
          (id) => html`
            <sl-dropdown slot="nav" distance="4" hoist>
              <sl-button slot="trigger" size="small" caret variant="text">
                <sl-icon slot="prefix" name="info-square-fill"></sl-icon>
                ${msg("More Info")}
              </sl-button>
              <sl-menu>
                <btrix-menu-item-link
                  href="${this.basePath}/crawls/${id}#overview"
                >
                  <sl-icon name="info-circle-fill" slot="prefix"></sl-icon>
                  ${msg("View Metadata")}
                </btrix-menu-item-link>
                <btrix-menu-item-link href="${this.basePath}/crawls/${id}#qa">
                  <sl-icon name="clipboard2-data-fill" slot="prefix"></sl-icon>
                  ${msg("View Quality Assurance")}
                </btrix-menu-item-link>

                <btrix-menu-item-link
                  href="${this.basePath}/crawls/${id}#files"
                >
                  <sl-icon name="folder-fill" slot="prefix"></sl-icon>
                  ${msg("View WACZ Files")}
                </btrix-menu-item-link>
              </sl-menu>
            </sl-dropdown>
          `,
        )}

        <div slot="action" class="flex items-center gap-1">
          ${this.renderLatestCrawlAction()}
        </div>

        <btrix-tab-group-panel
          name=${WorkflowTab.LatestCrawl}
          class="mt-3 block"
        >
          <!-- Don't render tab panel content when tab isn't active to prevent too many API calls -->
          ${when(this.workflowTab === WorkflowTab.LatestCrawl, () =>
            when(
              showReplay,
              this.renderInactiveWatchCrawl,
              this.renderWatchCrawl,
            ),
          )}
        </btrix-tab-group-panel>
        <btrix-tab-group-panel name=${WorkflowTab.Logs} class="mt-3 block">
          ${when(this.workflowTab === WorkflowTab.Logs, this.renderLogs)}
        </btrix-tab-group-panel>
      </btrix-tab-group>
    `;
  };

  private readonly renderPausedNotice = (
    { truncate } = { truncate: false },
  ) => {
    if (
      !this.workflow ||
      !this.isPaused ||
      this.isResuming ||
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
        class="sticky top-2 z-50 part-[base]:mb-5"
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
    if (!this.workflow || !this.lastCrawlId) return;

    if (this.isRunning) {
      if (!this.isCrawler) return;

      const enableEditBrowserWindows = !this.workflow.lastCrawlStopping;
      const windowCount =
        this.workflow.scale * (this.appState.settings?.numBrowsers || 1);

      return html`
        <div class="text-xs text-neutral-500">
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
  }

  private readonly renderCrawlDetails = () => {
    const latestCrawl = this.latestCrawlTask.value;
    const skeleton = html`<sl-skeleton class="w-full"></sl-skeleton>`;

    const duration = (workflow: Workflow) => {
      if (!workflow.lastCrawlStartTime) return skeleton;

      return this.localize.humanizeDuration(
        (workflow.lastCrawlTime && !workflow.isCrawlRunning
          ? new Date(workflow.lastCrawlTime)
          : new Date()
        ).valueOf() - new Date(workflow.lastCrawlStartTime).valueOf(),
      );
    };

    const execTime = () => {
      if (!latestCrawl) return skeleton;

      if (this.isRunning) {
        return html`<span class="text-neutral-400">
          ${noData}
          <sl-tooltip
            class="invert-tooltip"
            content=${msg(
              "Execution time will be calculated once this crawl is finished or paused.",
            )}
            hoist
            placement="bottom"
          >
            <sl-icon name="question-circle"></sl-icon>
          </sl-tooltip>
        </span>`;
      }

      if (latestCrawl.crawlExecSeconds < 60) {
        return this.localize.humanizeDuration(
          latestCrawl.crawlExecSeconds * 1000,
        );
      }

      return humanizeExecutionSeconds(latestCrawl.crawlExecSeconds, {
        style: "short",
      });
    };

    const pages = (workflow: Workflow) => {
      if (!latestCrawl) return skeleton;

      if (workflow.isCrawlRunning) {
        return [
          this.localize.number(+(latestCrawl.stats?.done || 0)),
          this.localize.number(+(latestCrawl.stats?.found || 0)),
        ].join(` ${msg("of")} `);
      }

      return this.localize.number(latestCrawl.pageCount || 0);
    };

    const qa = (workflow: Workflow) => {
      if (!latestCrawl) return html`<sl-skeleton class="w-24"></sl-skeleton>`;

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

      return html`<div class="inline-flex items-center gap-2">
        ${latestCrawl.reviewStatus || !this.isCrawler
          ? html`<btrix-qa-review-status
              status=${ifDefined(latestCrawl.reviewStatus)}
            ></btrix-qa-review-status>`
          : html`<sl-button
              class="micro -ml-2"
              size="small"
              variant="text"
              href="${this.basePath}/crawls/${this.lastCrawlId}#qa"
              @click=${this.navigate.link}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${msg("Add Review")}
            </sl-button> `}
      </div> `;
    };

    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(msg("Run Duration"), (workflow) =>
          isLoading(this.runNowTask)
            ? html`${until(
                this.runNowTask.taskComplete.then((workflow) =>
                  workflow ? duration(workflow) : noData,
                ),
                html`<sl-spinner class="text-base"></sl-spinner>`,
              )}`
            : duration(workflow),
        )}
        ${this.renderDetailItem(msg("Execution Time"), () =>
          isLoading(this.runNowTask)
            ? html`${until(
                this.runNowTask.taskComplete.then((workflow) =>
                  workflow ? execTime() : noData,
                ),
                html`<sl-spinner class="text-base"></sl-spinner>`,
              )}`
            : execTime(),
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

    if (!this.isCrawling) {
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
        this.isCrawling && this.workflow,
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
        ${guard([this.lastCrawlId], this.renderReplay)}
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
          (id) =>
            html`<div class="mt-4">
              <sl-button
                size="small"
                href="${this.basePath}/crawls/${id}"
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

  private readonly renderReplay = () => {
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
  };

  private readonly renderLogs = () => {
    return html`
      <div aria-live="polite" aria-busy=${isLoading(this.logTotalsTask)}>
        ${when(
          this.lastCrawlId,
          (crawlId) => html`
            <btrix-crawl-logs
              crawlId=${crawlId}
              liveKey=${ifDefined(
                (this.isCrawling && this.pollTask.value) || undefined,
              )}
              pageSize=${this.isCrawling ? 100 : 50}
            ></btrix-crawl-logs>
          `,
          () => this.renderNoCrawlLogs(),
        )}
      </div>
    `;
  };

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
          isLoading(this.runNowTask)}
          ?loading=${isLoading(this.runNowTask)}
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
                  await this.scaleTask.run([value]);
                  this.openDialogName = undefined;
                }}
                ?disabled=${isLoading(this.scaleTask)}
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
          @click=${() => {
            this.scaleTask.abort();
            this.openDialogName = undefined;
          }}
          >${msg("Cancel")}</sl-button
        >
      </div>
    `;
  }

  private renderSettings() {
    return html`<section
      class="rounded-lg border px-5 py-3"
      aria-live="polite"
      aria-busy=${isLoading(this.seedsTask)}
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
    await this.workflowTask.taskComplete;
    this.isDialogVisible = true;
  };

  private handleExclusionChange() {
    void this.workflowTask.run();
  }

  private async scale(value: Crawl["scale"], signal: AbortSignal) {
    if (!this.lastCrawlId) return;

    try {
      const data = await this.api.fetch<{ scaled: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/scale`,
        {
          method: "POST",
          body: JSON.stringify({ scale: +value }),
          signal,
        },
      );

      if (data.scaled) {
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
  }

  private async getWorkflow(workflowId: string, signal: AbortSignal) {
    const data = await this.api.fetch<Workflow>(
      `/orgs/${this.orgId}/crawlconfigs/${workflowId}`,
      { signal },
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

  private async getSeeds(workflowId: string, signal: AbortSignal) {
    const data = await this.api.fetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawlconfigs/${workflowId}/seeds`,
      { signal },
    );
    return data;
  }

  private async getCrawls(
    workflowId: string,
    params: WorkflowDetail["crawlsParams"],
    signal: AbortSignal,
  ) {
    const query = queryString.stringify(
      {
        cid: workflowId,
        sortBy: "started",
        page: params.page ?? this.crawls?.page,
        pageSize: this.crawls?.pageSize ?? 10,
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );

    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
      { signal },
    );

    return data;
  }

  private stopPoll() {
    if (this.pollTask.value) {
      window.clearTimeout(this.pollTask.value);
    }

    this.pollTask.abort();
  }

  private async getCrawl(crawlId: Crawl["id"], signal: AbortSignal) {
    const data = await this.api.fetch<Crawl>(
      `/orgs/${this.orgId}/crawls/${crawlId}/replay.json`,
      { signal },
    );

    return data;
  }

  private async getLogTotals(crawlId: Crawl["id"], signal: AbortSignal) {
    const query = queryString.stringify({ pageSize: 1 });

    const [errors, behaviors] = await Promise.all([
      this.api.fetch<APIPaginatedList<CrawlLog>>(
        `/orgs/${this.orgId}/crawls/${crawlId}/errors?${query}`,
        { signal },
      ),
      this.api.fetch<APIPaginatedList<CrawlLog>>(
        `/orgs/${this.orgId}/crawls/${crawlId}/behaviorLogs?${query}`,
        { signal },
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
    if (!this.workflow) await this.workflowTask.taskComplete;
    if (!this.seeds) await this.seedsTask.taskComplete;
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

  private async pauseResume(signal: AbortSignal) {
    if (!this.lastCrawlId) return;

    const shouldPause = !this.isPaused;

    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/${shouldPause ? "pause" : "resume"}`,
        {
          method: "POST",
          signal,
        },
      );
      if (data.success) {
        this.notify.toast({
          message: shouldPause
            ? msg("Pausing crawl.")
            : msg("Resuming paused crawl."),
          variant: "success",
          icon: "check2-circle",
          id: "crawl-action-status",
        });
      } else {
        throw data;
      }
    } catch {
      this.notify.toast({
        message: shouldPause
          ? msg("Something went wrong, couldn't pause crawl.")
          : msg("Something went wrong, couldn't resume paused crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-action-status",
      });
    }
  }

  private async cancel(signal: AbortSignal) {
    if (!this.lastCrawlId) return;

    this.isCancelingRun = true;

    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/cancel`,
        {
          method: "POST",
          signal,
        },
      );
      if (data.success) {
        this.notify.toast({
          message: msg("Canceling crawl."),
          variant: "success",
          icon: "check2-circle",
          id: "crawl-action-status",
        });
      } else {
        throw data;
      }
    } catch {
      this.notify.toast({
        message: msg("Something went wrong, couldn't cancel crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-action-status",
      });
    }
  }

  private async stop(signal: AbortSignal) {
    if (!this.lastCrawlId) return;

    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${this.lastCrawlId}/stop`,
        {
          method: "POST",
          signal,
        },
      );
      if (data.success) {
        this.notify.toast({
          message: msg("Stopping crawl."),
          variant: "success",
          icon: "check2-circle",
          id: "crawl-action-status",
        });
      } else {
        throw data;
      }
    } catch {
      this.notify.toast({
        message: msg("Something went wrong, couldn't stop crawl."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-action-status",
      });
    }
  }

  private async runNow(signal: AbortSignal): Promise<void> {
    try {
      const data = await this.api.fetch<{ started: string | null }>(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}/run`,
        {
          method: "POST",
          signal,
        },
      );
      this.lastCrawlId = data.started;

      this.navigate.to(`${this.basePath}/${WorkflowTab.LatestCrawl}`);

      this.notify.toast({
        message: msg("Starting crawl."),
        variant: "success",
        icon: "check2-circle",
        id: "crawl-action-status",
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
        id: "crawl-action-status",
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
      void this.crawlsTask.run();

      this.notify.toast({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
        id: "archived-item-delete-status",
      });

      // Update crawl count
      void this.workflowTask.run();
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
