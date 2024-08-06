import { localized, msg, str } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";

import { BtrixElement } from "@/classes/BtrixElement";
import { CopyButton } from "@/components/ui/copy-button";
import { type Dialog } from "@/components/ui/dialog";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { RelativeDuration } from "@/components/ui/relative-duration";
import type { CrawlLog } from "@/features/archived-items/crawl-logs";
import type { APIPaginatedList } from "@/types/api";
import type {
  ArchivedItem,
  Crawl,
  CrawlConfig,
  CrawlState,
  Seed,
  Workflow,
} from "@/types/crawler";
import type { QARun } from "@/types/qa";
import { isApiError } from "@/utils/api";
import {
  activeCrawlStates,
  finishedCrawlStates,
  isActive,
} from "@/utils/crawler";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { getLocale } from "@/utils/localization";
import { isArchivingDisabled } from "@/utils/orgs";
import { tw } from "@/utils/tailwind";

import "./ui/qa";

const SECTIONS = [
  "overview",
  "qa",
  "watch",
  "replay",
  "files",
  "logs",
  "config",
  "exclusions",
] as const;
type SectionName = (typeof SECTIONS)[number];

const POLL_INTERVAL_SECONDS = 5;
export const QA_RUNNING_STATES = [
  "starting",
  ...activeCrawlStates,
] as CrawlState[];

/**
 * Usage:
 * ```ts
 * <btrix-archived-item-detail></btrix-archived-item-detail>
 * ```
 */
@localized()
@customElement("btrix-archived-item-detail")
export class ArchivedItemDetail extends BtrixElement {
  @property({ type: String })
  itemType: ArchivedItem["type"] = "crawl";

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @property({ type: Boolean })
  showOrgLink = false;

  @property({ type: String })
  crawlId?: string;

  @property({ type: Boolean })
  isCrawler = false;

  @state()
  private qaRunId?: string;

  @state()
  private isQAActive = false;

  @state()
  qaRuns?: QARun[];

  @state()
  private crawl?: ArchivedItem;

  @state()
  private workflow?: Workflow;

  @state()
  private seeds?: APIPaginatedList<Seed>;

  @state()
  private logs?: APIPaginatedList<CrawlLog>;

  @state()
  activeTab: SectionName = "overview";

  @state()
  private openDialogName?: "scale" | "metadata" | "exclusions";

  @state()
  mostRecentNonFailedQARun?: QARun;

  @query("#stopQARunDialog")
  private readonly stopQARunDialog?: Dialog | null;

  @query("#cancelQARunDialog")
  private readonly cancelQARunDialog?: Dialog | null;

  private get listUrl(): string {
    let path = "items";
    if (this.workflowId) {
      path = `workflows/crawl/${this.workflowId}#crawls`;
    } else if (this.collectionId) {
      path = `collections/view/${this.collectionId}/items`;
    } else if (this.crawl?.type === "upload") {
      path = "items/upload";
    } else if (this.crawl?.type === "crawl") {
      path = "items/crawl";
    }
    return `${this.navigate.orgBasePath}/${path}`;
  }

  private readonly numberFormatter = new Intl.NumberFormat(getLocale());

  private timerId?: number;

  private get isActive(): boolean | null {
    if (!this.crawl) return null;
    return activeCrawlStates.includes(this.crawl.state);
  }

  private get hasFiles(): boolean | null {
    if (!this.crawl) return null;
    if (!this.crawl.resources) return false;

    return this.crawl.resources.length > 0;
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      void this.fetchCrawl();
      void this.fetchCrawlLogs();
      if (this.itemType === "crawl") {
        void this.fetchSeeds();
        void this.fetchQARuns();
      }
    } else if (changedProperties.get("activeTab")) {
      if (this.activeTab === "qa") {
        void this.fetchQARuns();
      }
    }
    if (changedProperties.has("workflowId") && this.workflowId) {
      void this.fetchWorkflow();
    }
    if (changedProperties.has("qaRuns")) {
      // Latest QA run that's either running or finished:
      this.mostRecentNonFailedQARun = this.qaRuns?.find((run) =>
        [...QA_RUNNING_STATES, ...finishedCrawlStates].includes(run.state),
      );
    }
    if (
      (changedProperties.has("qaRuns") ||
        changedProperties.has("mostRecentNonFailedQARun")) &&
      this.qaRuns &&
      this.mostRecentNonFailedQARun?.id
    ) {
      if (!this.qaRunId) {
        this.qaRunId = this.mostRecentNonFailedQARun.id;
      }
    }
  }

  connectedCallback(): void {
    // Set initial active section based on URL #hash value
    const hash = window.location.hash.slice(1);
    if ((SECTIONS as readonly string[]).includes(hash)) {
      this.activeTab = hash as SectionName;
    } else {
      const newLocation = new URL(window.location.toString());
      newLocation.hash = this.activeTab;
      window.history.replaceState(undefined, "", newLocation);
    }
    super.connectedCallback();
    window.addEventListener("hashchange", this.getActiveTabFromHash);
  }

  disconnectedCallback(): void {
    this.stopPoll();
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.getActiveTabFromHash);
  }

  // TODO this should be refactored out into the API router or something, it's
  // mostly copied from frontend/src/pages/org/workflow-detail.ts
  private readonly getActiveTabFromHash = async () => {
    await this.updateComplete;

    const hashValue = window.location.hash.slice(1);
    if (SECTIONS.includes(hashValue as (typeof SECTIONS)[number])) {
      this.activeTab = hashValue as SectionName;
    } else {
      this.goToTab(this.activeTab, { replace: true });
    }
  };

  private goToTab(tab: SectionName, { replace = false } = {}) {
    const path = `${window.location.href.split("#")[0]}#${tab}`;
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    this.activeTab = tab;
  }

  render() {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];
    let sectionContent: string | TemplateResult<1> = "";

    switch (this.activeTab) {
      case "qa": {
        if (!this.isCrawler) {
          sectionContent = "";
          break;
        }
        sectionContent = this.renderPanel(
          html`${this.renderTitle(
              html`${msg("Quality Assurance")}
                <btrix-beta-badge></btrix-beta-badge>`,
            )}
            <div class="ml-auto flex flex-wrap justify-end gap-2">
              ${when(this.qaRuns, this.renderQAHeader)}
            </div> `,
          html`
            <btrix-archived-item-detail-qa
              .crawlId=${this.crawlId}
              .itemType=${this.itemType}
              .crawl=${this.crawl}
              .qaRuns=${this.qaRuns}
              .qaRunId=${this.qaRunId}
              .mostRecentNonFailedQARun=${this.mostRecentNonFailedQARun}
              @btrix-qa-runs-update=${() => void this.fetchQARuns()}
            ></btrix-archived-item-detail-qa>
          `,
        );
        break;
      }
      case "replay":
        sectionContent = this.renderPanel(msg("Replay"), this.renderReplay(), [
          tw`overflow-hidden rounded-lg border`,
        ]);
        break;
      case "files":
        sectionContent = this.renderPanel(
          html` ${this.renderTitle(msg("Files"))}
            <sl-tooltip content=${msg("Download all files as a single WACZ")}>
              <sl-button
                href=${`/api/orgs/${this.orgId}/all-crawls/${this.crawlId}/download?auth_bearer=${authToken}`}
                download
                size="small"
                variant="primary"
              >
                <sl-icon slot="prefix" name="cloud-download"></sl-icon>
                ${msg("Download Item")}
              </sl-button>
            </sl-tooltip>`,
          this.renderFiles(),
        );
        break;
      case "logs":
        sectionContent = this.renderPanel(
          html` ${this.renderTitle(msg("Error Logs"))}
            <sl-button
              href=${`/api/orgs/${this.orgId}/crawls/${this.crawlId}/logs?auth_bearer=${authToken}`}
              download=${`btrix-${this.crawlId}-logs.txt`}
              size="small"
              variant="primary"
            >
              <sl-icon slot="prefix" name="cloud-download"></sl-icon>
              ${msg("Download Logs")}
            </sl-button>`,
          this.renderLogs(),
        );
        break;
      case "config":
        sectionContent = this.renderPanel(
          msg("Crawl Settings"),
          this.renderConfig(),
          [tw`rounded-lg border p-4`],
        );
        break;
      default:
        sectionContent = html`
          <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(msg("Overview"), this.renderOverview(), [
                tw`rounded-lg border p-4`,
              ])}
            </div>
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(
                html`
                  ${this.renderTitle(msg("Metadata"))}
                  ${when(
                    this.isCrawler,
                    () => html`
                      <sl-tooltip
                        content=${msg(
                          "Metadata cannot be edited while crawl is running.",
                        )}
                        ?disabled=${!this.isActive}
                      >
                        <sl-icon-button
                          class=${`text-base${
                            this.isActive ? " cursor-not-allowed" : ""
                          }`}
                          name="pencil"
                          @click=${this.openMetadataEditor}
                          label=${msg("Edit Metadata")}
                          ?disabled=${this.isActive}
                        ></sl-icon-button>
                      </sl-tooltip>
                    `,
                  )}
                `,
                this.renderMetadata(),
                [tw`rounded-lg border p-4`],
              )}
            </div>
          </div>
        `;
        break;
    }

    let label = "Back";
    if (this.workflowId) {
      label = msg("Back to Crawl Workflow");
    } else if (this.collectionId) {
      label = msg("Back to Collection");
    } else if (this.crawl) {
      if (this.crawl.type === "upload") {
        label = msg("Back to All Uploads");
      } else {
        label = msg("Back to All Crawls");
      }
      // TODO have a "Back to Archived Items" link & label when we have the info to tell
      // https://github.com/webrecorder/browsertrix-cloud/issues/1526
    }

    return html`
      <div class="mb-7">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${this.listUrl}
          @click=${this.navigate.link}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle">${label}</span>
        </a>
      </div>

      <div class="mb-4">${this.renderHeader()}</div>

      <main>
        <section class="grid gap-6 md:grid-cols-14">
          <div
            class="col-span-14 grid min-w-0 border-b md:col-span-3 md:border-b-0"
          >
            <div class="-mx-3 box-border flex overflow-x-auto px-3 md:block ">
              ${this.renderNav()}
            </div>
          </div>
          <div class="col-span-14 min-w-0 md:col-span-11">
            ${sectionContent}
          </div>
        </section>
      </main>

      <btrix-item-metadata-editor
        .crawl=${this.crawl}
        ?open=${this.openDialogName === "metadata"}
        @request-close=${() => (this.openDialogName = undefined)}
        @updated=${() => void this.fetchCrawl()}
      ></btrix-item-metadata-editor>
    `;
  }

  private renderName() {
    if (!this.crawl)
      return html`<sl-skeleton class="inline-block h-8 w-60"></sl-skeleton>`;

    if (this.crawl.name)
      return html`<span class="truncate">${this.crawl.name}</span>`;
    if (!this.crawl.firstSeed || !this.crawl.seedCount) return this.crawl.id;
    const remainder = this.crawl.seedCount - 1;
    let crawlName: TemplateResult = html`<span class="truncate"
      >${this.crawl.firstSeed}</span
    >`;
    if (remainder) {
      if (remainder === 1) {
        crawlName = msg(
          html`<span class="truncate">${this.crawl.firstSeed}</span>
            <span class="whitespace-nowrap text-neutral-500"
              >+${remainder} URL</span
            >`,
        );
      } else {
        crawlName = msg(
          html`<span class="truncate">${this.crawl.firstSeed}</span>
            <span class="whitespace-nowrap text-neutral-500"
              >+${remainder} URLs</span
            >`,
        );
      }
    }
    return crawlName;
  }

  private renderNav() {
    const renderNavItem = ({
      section,
      label,
      iconLibrary,
      icon,
      detail,
    }: {
      section: SectionName;
      label: string;
      iconLibrary: "app" | "default";
      icon: string;
      detail?: TemplateResult<1>;
    }) => {
      const isActive = section === this.activeTab;
      const baseUrl = window.location.pathname.split("#")[0];
      return html`
        <btrix-navigation-button
          class="whitespace-nowrap md:whitespace-normal"
          .active=${isActive}
          href=${`${baseUrl}${window.location.search}#${section}`}
          @click=${() => {
            this.activeTab = section;
          }}
          ><sl-icon
            class="size-4 shrink-0"
            name=${icon}
            aria-hidden="true"
            library=${iconLibrary}
          ></sl-icon>
          ${label}${detail}</btrix-navigation-button
        >
      `;
    };
    return html`
      <nav
        class="sticky top-0 -mx-3 flex flex-row gap-2 overflow-x-auto px-3 pb-4 text-center md:mt-10 md:flex-col md:text-start"
        role="menu"
      >
        ${renderNavItem({
          section: "overview",
          iconLibrary: "default",
          icon: "info-circle-fill",
          label: msg("Overview"),
        })}
        ${when(
          this.itemType === "crawl" && this.isCrawler,
          () => html`
            ${renderNavItem({
              section: "qa",
              iconLibrary: "default",
              icon: "clipboard2-data-fill",
              label: msg("Quality Assurance"),
              detail: html`<btrix-beta-icon></btrix-beta-icon>`,
            })}
          `,
        )}
        ${renderNavItem({
          section: "replay",
          iconLibrary: "app",
          icon: "replaywebpage",
          label: msg("Replay"),
        })}
        ${renderNavItem({
          section: "files",
          iconLibrary: "default",
          icon: "folder-fill",
          label: msg("Files"),
        })}
        ${when(
          this.itemType === "crawl",
          () => html`
            ${renderNavItem({
              section: "logs",
              iconLibrary: "default",
              icon: "terminal-fill",
              label: msg("Error Logs"),
            })}
            ${renderNavItem({
              section: "config",
              iconLibrary: "default",
              icon: "file-code-fill",
              label: msg("Crawl Settings"),
            })}
          `,
        )}
      </nav>
    `;
  }

  private renderHeader() {
    return html`
      <header class="mb-3 flex flex-wrap gap-2 border-b pb-3">
        <btrix-detail-page-title .item=${this.crawl}></btrix-detail-page-title>
        <div class="ml-auto flex flex-wrap justify-end gap-2">
          ${this.isActive
            ? html`
                <sl-button-group>
                  <sl-button size="small" @click=${this.stop}>
                    <sl-icon name="dash-square" slot="prefix"></sl-icon>
                    <span> ${msg("Stop")} </span>
                  </sl-button>
                  <sl-button size="small" @click=${this.cancel}>
                    <sl-icon
                      class="text-danger"
                      name="trash3"
                      slot="prefix"
                    ></sl-icon>
                    <span class="text-danger"> ${msg("Cancel")} </span>
                  </sl-button>
                </sl-button-group>
              `
            : ""}
          ${this.isCrawler
            ? this.crawl
              ? this.renderMenu()
              : html`<sl-skeleton
                  class="h-8 w-24 [--border-radius:theme(borderRadius.sm)]"
                ></sl-skeleton>`
            : nothing}
        </div>
      </header>
    `;
  }

  private renderMenu() {
    if (!this.crawl) return;

    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    return html`
      <sl-dropdown placement="bottom-end" distance="4" hoist>
        <sl-button slot="trigger" size="small" caret
          >${this.isActive
            ? html`<sl-icon name="three-dots"></sl-icon>`
            : msg("Actions")}</sl-button
        >
        <sl-menu>
          ${when(
            this.isCrawler,
            () => html`
              <sl-menu-item
                @click=${() => {
                  this.openMetadataEditor();
                }}
              >
                <sl-icon name="pencil" slot="prefix"></sl-icon>
                ${msg("Edit Metadata")}
              </sl-menu-item>
              <sl-divider></sl-divider>
            `,
          )}
          ${when(
            this.itemType === "crawl",
            () => html`
              <sl-menu-item
                @click=${() =>
                  this.navigate.to(
                    `${this.navigate.orgBasePath}/workflows/crawl/${this.crawl?.cid}`,
                  )}
              >
                <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
                ${msg("Go to Workflow")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() =>
                  CopyButton.copyToClipboard(this.crawl?.cid || "")}
              >
                <sl-icon name="copy" slot="prefix"></sl-icon>
                ${msg("Copy Workflow ID")}
              </sl-menu-item>
            `,
          )}
          <sl-menu-item
            @click=${() =>
              CopyButton.copyToClipboard(this.crawl!.tags.join(", "))}
            ?disabled=${!this.crawl.tags.length}
          >
            <sl-icon name="tags" slot="prefix"></sl-icon>
            ${msg("Copy Tags")}
          </sl-menu-item>
          ${when(
            finishedCrawlStates.includes(this.crawl.state),
            () => html`
              <sl-divider></sl-divider>
              <btrix-menu-item-link
                href=${`/api/orgs/${this.orgId}/all-crawls/${this.crawlId}/download?auth_bearer=${authToken}`}
                download
              >
                <sl-icon name="cloud-download" slot="prefix"></sl-icon>
                ${msg("Download Item")}
              </btrix-menu-item-link>
            `,
          )}
          ${when(
            this.isCrawler && !isActive(this.crawl.state),
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => void this.deleteCrawl()}
              >
                <sl-icon name="trash3" slot="prefix"></sl-icon>
                ${msg("Delete Item")}
              </sl-menu-item>
            `,
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderTitle(title: string | TemplateResult<1>) {
    return html`<h2 class="text-lg font-semibold leading-8">${title}</h2>`;
  }

  private renderPanel(
    heading: string | TemplateResult,
    content: TemplateResult | undefined,
    classes: clsx.ClassValue[] = [],
  ) {
    const headingIsTitle = typeof heading === "string";
    return html`
      <header
        class="flex-0 mb-2 flex min-h-fit flex-wrap items-center justify-between gap-2 leading-none"
      >
        ${headingIsTitle ? this.renderTitle(heading) : heading}
      </header>
      <div class=${clsx("flex-1", ...classes)}>${content}</div>
    `;
  }

  private renderReplay() {
    if (!this.crawl) return;
    const replaySource = `/api/orgs/${this.crawl.oid}/${
      this.crawl.type === "upload" ? "uploads" : "crawls"
    }/${this.crawlId}/replay.json`;

    const headers = this.authState?.headers;

    const config = JSON.stringify({ headers });

    const canReplay = this.hasFiles;

    return html`
      <!-- https://github.com/webrecorder/browsertrix-crawler/blob/9f541ab011e8e4bccf8de5bd7dc59b632c694bab/screencast/index.html -->
      ${
        canReplay
          ? html`<div id="replay-crawl" class="aspect-4/3 overflow-hidden">
              <replay-web-page
                source="${replaySource}"
                url="${(this.crawl.seedCount === 1 && this.crawl.firstSeed) ||
                ""}"
                coll="${ifDefined(this.crawl.id)}"
                config="${config}"
                replayBase="/replay/"
                noSandbox="true"
                noCache="true"
              ></replay-web-page>
            </div>`
          : html`
              <p class="p-4 text-sm text-neutral-400">
                ${this.isActive
                  ? msg("No files yet.")
                  : msg("No files to replay.")}
              </p>
            `
      }
      </div>
    `;
  }

  private renderOverview() {
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Status")}>
          ${this.crawl
            ? html`
                <btrix-crawl-status
                  state=${this.crawl.state}
                  type=${this.crawl.type}
                ></btrix-crawl-status>
              `
            : html`<sl-skeleton class="mb-[3px] h-[16px] w-24"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${when(this.crawl, () =>
          this.crawl!.type === "upload"
            ? html`
                <btrix-desc-list-item label=${msg("Uploaded")}>
                  <sl-format-date
                    lang=${getLocale()}
                    date=${`${this.crawl!.finished}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    timeZoneName="short"
                  ></sl-format-date>
                </btrix-desc-list-item>
              `
            : html`
                <btrix-desc-list-item label=${msg("Start Time")}>
                  <sl-format-date
                    lang=${getLocale()}
                    date=${`${this.crawl!.started}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    timeZoneName="short"
                  ></sl-format-date>
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Finish Time")}>
                  ${this.crawl!.finished
                    ? html`<sl-format-date
                        lang=${getLocale()}
                        date=${`${this.crawl!.finished}Z` /** Z for UTC */}
                        month="2-digit"
                        day="2-digit"
                        year="2-digit"
                        hour="numeric"
                        minute="numeric"
                        timeZoneName="short"
                      ></sl-format-date>`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Elapsed Time")}>
                  ${this.crawl!.finished
                    ? html`${RelativeDuration.humanize(
                        new Date(`${this.crawl!.finished}Z`).valueOf() -
                          new Date(`${this.crawl!.started}Z`).valueOf(),
                      )}`
                    : html`
                        <span class="text-purple-600">
                          <btrix-relative-duration
                            value=${`${this.crawl!.started}Z`}
                            unitCount="3"
                            tickSeconds="1"
                          ></btrix-relative-duration>
                        </span>
                      `}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Execution Time")}>
                  ${this.crawl!.finished
                    ? html`<span
                        >${humanizeExecutionSeconds(
                          this.crawl!.crawlExecSeconds,
                          { displaySeconds: true },
                        )}</span
                      >`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Initiator")}>
                  ${this.crawl!.manual
                    ? msg(
                        html`Manual start by
                          <span
                            >${this.crawl!.userName || this.crawl!.userid}</span
                          >`,
                      )
                    : msg(html`Scheduled start`)}
                </btrix-desc-list-item>
              `,
        )}

        <btrix-desc-list-item label=${msg("Size")}>
          ${this.crawl
            ? html`${this.crawl.fileSize
                ? html`<sl-format-bytes
                      value=${this.crawl.fileSize || 0}
                      display="narrow"
                    ></sl-format-bytes
                    >${this.crawl.stats
                      ? html`<span>,</span
                          ><span
                            class="tracking-tighter${this.isActive
                              ? " text-purple-600"
                              : ""} font-mono"
                          >
                            ${this.numberFormatter.format(
                              +this.crawl.stats.done,
                            )}
                            <span class="text-0-400">/</span>
                            ${this.numberFormatter.format(
                              +this.crawl.stats.found,
                            )}
                          </span>
                          <span>${msg("pages")}</span>`
                      : ""}`
                : html`<span class="text-0-400">${msg("Unknown")}</span>`}`
            : html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${this.renderCrawlChannelVersion()}
        <btrix-desc-list-item label=${msg("Crawl ID")}>
          ${this.crawl
            ? html`<btrix-copy-field
                value="${this.crawl.id}"
              ></btrix-copy-field>`
            : html`<sl-skeleton class="mb-[3px] h-[16px] w-24"></sl-skeleton>`}
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;
  }

  private renderCrawlChannelVersion() {
    if (!this.crawl) {
      return html``;
    }

    const text =
      capitalize(this.crawl.crawlerChannel || "default") +
      (this.crawl.image ? ` (${this.crawl.image})` : "");

    return html` <btrix-desc-list-item
      label=${msg("Crawler Channel (Exact Crawler Version)")}
    >
      <div class="flex items-center gap-2">
        <code class="grow" title=${text}>${text}</code>
      </div>
    </btrix-desc-list-item>`;
  }

  private renderMetadata() {
    const noneText = html`<span class="text-neutral-300">${msg("None")}</span>`;
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Description")}>
          ${when(
            this.crawl,
            () =>
              when(
                this.crawl!.description?.length,
                () =>
                  html`<pre class="whitespace-pre-line font-sans">
${this.crawl?.description}
                </pre
                  >`,
                () => noneText,
              ),
            () => html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Tags")}>
          ${when(
            this.crawl,
            () =>
              when(
                this.crawl!.tags.length,
                () =>
                  this.crawl!.tags.map(
                    (tag) =>
                      html`<btrix-tag class="mr-2 mt-1">${tag}</btrix-tag>`,
                  ),
                () => noneText,
              ),
            () => html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("In Collections")}>
          ${when(
            this.crawl,
            () =>
              when(
                this.crawl!.collections.length,
                () => html`
                  <ul>
                    ${this.crawl!.collections.map(
                      ({ id, name }) =>
                        html`<li class="mt-1">
                          <a
                            class="text-primary hover:text-indigo-400"
                            href=${`${this.navigate.orgBasePath}/collections/view/${id}`}
                            @click=${this.navigate.link}
                            >${name}</a
                          >
                        </li>`,
                    )}
                  </ul>
                `,
                () => noneText,
              ),
            () => html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`,
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;
  }

  private renderFiles() {
    return html`
      ${this.hasFiles
        ? html`
            <ul class="rounded-lg border text-sm">
              ${this.crawl!.resources!.map(
                (file) => html`
                  <li
                    class="flex justify-between border-t p-3 first:border-t-0"
                  >
                    <div class="flex items-center truncate whitespace-nowrap">
                      <sl-icon
                        name="file-earmark-zip-fill"
                        class="h-4 shrink-0 pr-2 text-neutral-600"
                      ></sl-icon>
                      <a
                        class="mr-2 truncate text-blue-600 hover:text-blue-500 hover:underline"
                        href=${file.path}
                        download
                        title=${file.name}
                        >${file.name.slice(file.name.lastIndexOf("/") + 1)}
                      </a>
                    </div>
                    <div
                      class="whitespace-nowrap font-mono text-sm text-neutral-400"
                    >
                      ${when(
                        file.numReplicas > 0,
                        () =>
                          html` <sl-tooltip content=${msg("Backed up")}>
                            <sl-icon
                              name="clouds-fill"
                              class="mr-2 size-4 shrink-0 align-text-bottom text-success"
                            ></sl-icon>
                          </sl-tooltip>`,
                      )}
                      <sl-format-bytes value=${file.size}></sl-format-bytes>
                    </div>
                  </li>
                `,
              )}
            </ul>
          `
        : html`
            <p class="text-sm text-neutral-400">
              ${this.isActive
                ? msg("No files yet.")
                : msg("No files to download.")}
            </p>
          `}
    `;
  }

  private renderLogs() {
    return html`
      <div aria-live="polite" aria-busy=${!this.logs}>
        ${when(this.logs, () =>
          this.logs!.total
            ? html`
                <btrix-crawl-logs
                  .logs=${this.logs}
                  paginate
                  @page-change=${async (e: PageChangeEvent) => {
                    await this.fetchCrawlLogs({
                      page: e.detail.page,
                    });
                    // Scroll to top of list
                    this.scrollIntoView();
                  }}
                ></btrix-crawl-logs>
              `
            : html`<div class="rounded-lg border p-4">
                <p class="text-sm text-neutral-400">
                  ${msg("No error logs to display.")}
                </p>
              </div>`,
        )}
      </div>
    `;
  }

  private renderConfig() {
    return html`
      <div aria-live="polite" aria-busy=${!this.crawl || !this.seeds}>
        ${when(
          this.crawl && this.seeds && (!this.workflowId || this.workflow),
          () => html`
            <btrix-config-details
              .crawlConfig=${{
                ...this.crawl,
                jobType: this.workflow?.jobType,
              } as CrawlConfig}
              .seeds=${this.seeds!.items}
              hideMetadata
            ></btrix-config-details>
          `,
          this.renderLoading,
        )}
      </div>
    `;
  }

  private readonly renderQAHeader = (qaRuns: QARun[]) => {
    const qaIsRunning = this.isQAActive;
    const qaIsAvailable = !!this.mostRecentNonFailedQARun;

    const reviewLink =
      qaIsAvailable && this.qaRunId
        ? `${this.navigate.orgBasePath}/items/crawl/${this.crawlId}/review/screenshots?qaRunId=${this.qaRunId}`
        : undefined;

    return html`
      ${qaIsRunning
        ? html`
            <sl-button-group>
              <sl-button
                size="small"
                @click=${() => void this.stopQARunDialog?.show()}
              >
                <sl-icon name="dash-square" slot="prefix"></sl-icon>
                <span>${msg("Stop Analysis")}</span>
              </sl-button>
              <sl-button
                size="small"
                @click=${() => void this.cancelQARunDialog?.show()}
              >
                <sl-icon
                  name="x-octagon"
                  slot="prefix"
                  class="text-danger"
                ></sl-icon>
                <span class="text-danger">${msg("Cancel Analysis")}</span>
              </sl-button>
            </sl-button-group>
          `
        : html`
            <sl-button
              size="small"
              variant="${
                // This is checked again being 0 explicitly because while QA state is loading, `this.qaRuns` is undefined, and the content change is less when the rightmost button stays non-primary when a run exists.
                qaRuns.length === 0 ? "primary" : "default"
              }"
              @click=${() => void this.startQARun()}
              ?disabled=${isArchivingDisabled(this.org, true) || qaIsRunning}
            >
              <sl-icon slot="prefix" name="microscope" library="app"></sl-icon>
              ${qaRuns.length ? msg("Rerun Analysis") : msg("Run Analysis")}
            </sl-button>
          `}
      ${qaRuns.length
        ? html`
            <sl-tooltip
              ?disabled=${qaIsAvailable}
              content=${msg("No completed analysis runs are available.")}
            >
              <sl-button
                variant="primary"
                size="small"
                href="${ifDefined(reviewLink)}"
                @click=${this.navigate.link}
                ?disabled=${!qaIsAvailable}
              >
                <sl-icon slot="prefix" name="clipboard2-data"></sl-icon>
                ${msg("Review Crawl")}
              </sl-button>
            </sl-tooltip>
          `
        : nothing}

      <btrix-dialog id="stopQARunDialog" .label=${msg("Stop QA Analysis?")}>
        ${msg(
          "Pages analyzed so far will be saved and this run will be marked as incomplete. Are you sure you want to stop this analysis run?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            variant="primary"
            .autofocus=${true}
            @click=${() => void this.stopQARunDialog?.hide()}
          >
            ${msg("Keep Running")}
          </sl-button>
          <sl-button
            size="small"
            variant="danger"
            outline
            @click=${async () => {
              await this.stopQARun();
              void this.stopQARunDialog?.hide();
            }}
            >${msg("Stop Analysis")}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-dialog id="cancelQARunDialog" .label=${msg("Cancel QA Analysis?")}>
        ${msg(
          "Canceling will discard all analysis data associated with this run. Are you sure you want to cancel this analysis run?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            variant="primary"
            .autofocus=${true}
            @click=${async () => this.cancelQARunDialog?.hide()}
          >
            ${msg("Keep Running")}
          </sl-button>
          <sl-button
            size="small"
            variant="danger"
            outline
            @click=${async () => {
              await this.cancelQARun();
              void this.cancelQARunDialog?.hide();
            }}
            >${msg("Cancel Analysis")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  };

  private readonly renderLoading = () =>
    html`<div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>`;

  /**
   * Fetch crawl and update internal state
   */
  private async fetchCrawl(): Promise<void> {
    try {
      this.crawl = await this.getCrawl();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchSeeds(): Promise<void> {
    try {
      this.seeds = await this.getSeeds();
    } catch {
      this.notify.toast({
        message: msg(
          "Sorry, couldn't retrieve all crawl settings at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchWorkflow(): Promise<void> {
    try {
      this.workflow = await this.getWorkflow();
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async getCrawl(): Promise<Crawl> {
    const apiPath = `/orgs/${this.orgId}/${
      this.itemType === "upload" ? "uploads" : "crawls"
    }/${this.crawlId}/replay.json`;
    return this.api.fetch<Crawl>(apiPath);
  }

  private async getSeeds() {
    // NOTE Returns first 1000 seeds (backend pagination max)
    const data = await this.api.fetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/seeds`,
    );
    return data;
  }

  private async getWorkflow(): Promise<Workflow> {
    return this.api.fetch<Workflow>(
      `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}`,
    );
  }

  private async fetchCrawlLogs(
    params: Partial<APIPaginatedList> = {},
  ): Promise<void> {
    if (this.itemType !== "crawl") {
      return;
    }
    try {
      this.logs = await this.getCrawlErrors(params);
    } catch (e: unknown) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't retrieve crawl logs at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawlErrors(params: Partial<APIPaginatedList>) {
    const page = params.page || this.logs?.page || 1;
    const pageSize = params.pageSize || this.logs?.pageSize || 50;

    const data = (await this.api.fetch)<APIPaginatedList<CrawlLog>>(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/errors?page=${page}&pageSize=${pageSize}`,
    );

    return data;
  }

  private async cancel() {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/cancel`,
        {
          method: "POST",
        },
      );

      if (data.success) {
        void this.fetchCrawl();
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't cancel crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop() {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/stop`,
        {
          method: "POST",
        },
      );

      if (data.success) {
        void this.fetchCrawl();
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't stop crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private openMetadataEditor() {
    this.openDialogName = "metadata";
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  // TODO replace with in-page dialog
  private async deleteCrawl() {
    if (
      !window.confirm(msg(str`Are you sure you want to delete this crawl?`))
    ) {
      return;
    }

    try {
      const _data = await this.api.fetch(
        `/orgs/${this.crawl!.oid}/${
          this.crawl!.type === "crawl" ? "crawls" : "uploads"
        }/delete`,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [this.crawl!.id],
          }),
        },
      );
      this.navigate.to(this.listUrl);
      this.notify.toast({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
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
      });
    }
  }

  private async startQARun() {
    try {
      const result = await this.api.fetch<{ started: string }>(
        `/orgs/${this.orgId}/crawls/${this.crawlId}/qa/start`,
        {
          method: "POST",
        },
      );
      this.qaRunId = result.started;

      void this.fetchQARuns();

      this.notify.toast({
        message: msg("Starting QA analysis..."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: unknown) {
      let message = msg("Sorry, couldn't start QA run at this time.");
      if (e instanceof Error && e.message === "qa_not_supported_for_crawl") {
        message = msg(
          "Sorry, QA analysis is not supported for this crawl as it was run with an older crawler version. Please run a new crawl with the latest crawler and QA should be available.",
        );
      }
      console.debug(e);

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async stopQARun() {
    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/qa/stop`,
        {
          method: "POST",
        },
      );

      if (!data.success) {
        throw data;
      }

      void this.fetchQARuns();
      this.notify.toast({
        message: msg(`Stopping QA analysis...`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: unknown) {
      this.notify.toast({
        message:
          e === "qa_not_running"
            ? msg("Analysis is not currently running.")
            : msg("Sorry, couldn't stop crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async cancelQARun() {
    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/qa/cancel`,
        {
          method: "POST",
        },
      );

      if (!data.success) {
        throw data;
      }

      void this.fetchQARuns();
      this.notify.toast({
        message: msg(`Canceling QA analysis...`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: unknown) {
      this.notify.toast({
        message:
          e === "qa_not_running"
            ? msg("Analysis is not currently running.")
            : msg("Sorry, couldn't cancel crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchQARuns(): Promise<void> {
    try {
      this.qaRuns = await this.getQARuns();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isQAActive = Boolean(
      this.qaRuns?.[0] && QA_RUNNING_STATES.includes(this.qaRuns[0].state),
    );

    if (this.isQAActive) {
      // Clear current timer, if it exists
      if (this.timerId != null) {
        this.stopPoll();
      }
      // Restart timer for next poll
      this.timerId = window.setTimeout(() => {
        void this.fetchQARuns();
      }, 1000 * POLL_INTERVAL_SECONDS);
    }
  }

  private stopPoll() {
    window.clearTimeout(this.timerId);
  }

  private async getQARuns(): Promise<QARun[]> {
    return this.api.fetch<QARun[]>(
      `/orgs/${this.orgId}/crawls/${this.crawlId}/qa`,
    );
  }
}
