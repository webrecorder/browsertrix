import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { classMap } from "lit/directives/class-map.js";
import { msg, localized, str } from "@lit/localize";

import type { PageChangeEvent } from "../../components/pagination";
import { RelativeDuration } from "../../components/relative-duration";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { isActive } from "../../utils/crawler";
import { CopyButton } from "../../components/copy-button";
import type { Crawl, Workflow } from "./types";
import { APIPaginatedList } from "../../types/api";

const SECTIONS = [
  "overview",
  "watch",
  "replay",
  "files",
  "logs",
  "config",
  "exclusions",
] as const;
type SectionName = (typeof SECTIONS)[number];

const LOG_LEVEL_VARIANTS = {
  error: "danger",
} as const;
const POLL_INTERVAL_SECONDS = 10;

/**
 * Usage:
 * ```ts
 * <btrix-crawl-detail crawlsBaseUrl="/crawls"></btrix-crawl-detail>
 * ```
 */
@localized()
export class CrawlDetail extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  // e.g. `/org/${this.orgId}/crawls`
  @property({ type: String })
  crawlsBaseUrl!: string;

  // e.g. `/org/${this.orgId}/crawls`
  @property({ type: String })
  crawlsAPIBaseUrl?: string;

  @property({ type: String })
  artifactType: Crawl["type"] = null;

  @property({ type: Boolean })
  showOrgLink = false;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @state()
  private crawl?: Crawl;

  @state()
  private logs?: APIPaginatedList;

  @state()
  private sectionName: SectionName = "overview";

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private openDialogName?: "scale" | "metadata" | "exclusions";

  @state()
  private isDialogVisible: boolean = false;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();
  private dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  private get isActive(): boolean | null {
    if (!this.crawl) return null;

    return (
      this.crawl.state === "running" ||
      this.crawl.state === "starting" ||
      this.crawl.state === "waiting_capacity" ||
      this.crawl.state === "waiting_org_limit" ||
      this.crawl.state === "stopping"
    );
  }

  private get hasFiles(): boolean | null {
    if (!this.crawl) return null;
    if (!this.crawl.resources) return false;

    return this.crawl.resources.length > 0;
  }

  firstUpdated() {
    if (!this.crawlsBaseUrl) {
      throw new Error("Crawls base URL not defined");
    }

    this.fetchCrawl();
    this.fetchCrawlLogs();
  }

  willUpdate(changedProperties: Map<string, any>) {
    const prevId = changedProperties.get("crawlId");

    if (prevId && prevId !== this.crawlId) {
      // Handle update on URL change, e.g. from re-run
      this.fetchCrawl();
      this.fetchCrawlLogs();
    } else {
      const prevCrawl = changedProperties.get("crawl");

      if (prevCrawl && this.crawl) {
        if (
          (prevCrawl.state === "running" || prevCrawl.state === "stopping") &&
          !this.isActive
        ) {
          this.crawlDone();
        }
      }
    }
  }

  connectedCallback(): void {
    // Set initial active section based on URL #hash value
    const hash = window.location.hash.slice(1);
    if (SECTIONS.includes(hash as any)) {
      this.sectionName = hash as SectionName;
    }
    super.connectedCallback();
  }

  render() {
    let sectionContent: string | TemplateResult = "";

    switch (this.sectionName) {
      case "replay":
        sectionContent = this.renderPanel(
          msg("Replay Crawl"),
          this.renderReplay(),
          {
            "overflow-hidden": true,
            "rounded-lg": true,
            border: true,
          }
        );
        break;
      case "files":
        sectionContent = this.renderPanel(
          msg("Download Files"),
          this.renderFiles()
        );
        break;
      case "logs":
        sectionContent = this.renderPanel(msg("Error Logs"), this.renderLogs());
        break;
      case "config":
        sectionContent = this.renderPanel(msg("Config"), this.renderConfig(), {
          "p-4": true,
          "rounded-lg": true,
          border: true,
        });
        break;
      default:
        sectionContent = html`
          <div class="grid gap-5 grid-cols-1 lg:grid-cols-2">
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(msg("Overview"), this.renderOverview(), {
                "p-4": true,
                "rounded-lg": true,
                border: true,
              })}
            </div>
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(
                html`
                  ${msg("Metadata")}
                  ${when(
                    this.isCrawler,
                    () => html`
                      <sl-tooltip
                        content=${msg(
                          "Metadata cannot be edited while crawl is running."
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
                    `
                  )}
                `,
                this.renderMetadata(),
                {
                  "p-4": true,
                  "rounded-lg": true,
                  border: true,
                }
              )}
            </div>
          </div>
        `;
        break;
    }

    // TODO abstract into breadcrumbs
    const isWorkflowArtifact = this.crawlsBaseUrl.includes("/workflows/");

    return html`
      <div class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href="${this.crawlsBaseUrl}?artifactType=${this.crawl?.type}"
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${isWorkflowArtifact
              ? msg("Back to Crawl Workflow")
              : this.crawl?.type === "upload"
              ? msg("Back to All Uploads")
              : msg("Back to All Crawls")}</span
          >
        </a>
      </div>

      <div class="mb-4">${this.renderHeader()}</div>

      <hr class="mb-4" />

      <main>
        <section class="grid grid-cols-6 gap-4">
          <div class="col-span-6 md:col-span-1">${this.renderNav()}</div>
          <div class="col-span-6 md:col-span-5">${sectionContent}</div>
        </section>
      </main>

      <btrix-crawl-metadata-editor
        .authState=${this.authState}
        .crawl=${this.crawl}
        ?open=${this.openDialogName === "metadata"}
        @request-close=${() => (this.openDialogName = undefined)}
        @updated=${() => this.fetchCrawl()}
      ></btrix-crawl-metadata-editor>
    `;
  }

  private renderName() {
    if (!this.crawl)
      return html`<sl-skeleton
        class="inline-block"
        style="width: 15em"
      ></sl-skeleton>`;

    if (this.crawl.name) return this.crawl.name;
    if (!this.crawl.firstSeed) return this.crawl.id;
    const remainder = this.crawl.seedCount - 1;
    let crawlName: any = html`<span class="break-words"
      >${this.crawl.firstSeed}</span
    >`;
    if (remainder) {
      if (remainder === 1) {
        crawlName = msg(
          html`<span class="break-words">${this.crawl.firstSeed}</span>
            <span class="text-neutral-500">+${remainder} URL</span>`
        );
      } else {
        crawlName = msg(
          html`<span class="break-words">${this.crawl.firstSeed}</span>
            <span class="text-neutral-500">+${remainder} URLs</span>`
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
    }: {
      section: SectionName;
      label: any;
      iconLibrary: "app" | "default";
      icon: string;
    }) => {
      const isActive = section === this.sectionName;
      const baseUrl = window.location.pathname.split("#")[0];
      return html`
        <li class="relative grow" role="menuitem" aria-selected="${isActive}">
          <a
            class="flex gap-2 flex-col md:flex-row items-center font-semibold rounded-md h-full p-2 ${isActive
              ? "text-blue-600 bg-blue-100 shadow-sm"
              : "text-neutral-600 hover:bg-blue-50"}"
            href=${`${baseUrl}${window.location.search}#${section}`}
            @click=${() => (this.sectionName = section)}
          >
            <sl-icon
              class="w-4 h-4 shrink-0"
              name=${icon}
              aria-hidden="true"
              library=${iconLibrary}
            ></sl-icon>
            ${label}
          </a>
        </li>
      `;
    };
    return html`
      <nav class="border-b md:border-b-0 pb-4 md:mt-10">
        <ul
          class="flex flex-row md:flex-col gap-2 text-center md:text-start"
          role="menu"
        >
          ${renderNavItem({
            section: "overview",
            iconLibrary: "default",
            icon: "info-circle-fill",
            label: msg("Overview"),
          })}
          ${renderNavItem({
            section: "replay",
            iconLibrary: "app",
            icon: "link-replay",
            label: msg("Replay Crawl"),
          })}
          ${renderNavItem({
            section: "files",
            iconLibrary: "default",
            icon: "folder-fill",
            label: msg("Files"),
          })}
          ${when(
            this.artifactType === "crawl",
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
                label: msg("Config"),
              })}
            `
          )}
        </ul>
      </nav>
    `;
  }

  private renderHeader() {
    return html`
      <header class="md:flex justify-between items-end">
        <h1 class="text-xl font-semibold mb-4 md:mb-0 md:mr-2">
          ${this.renderName()}
        </h1>
        <div
          class="grid gap-2 grid-flow-col ${this.isActive
            ? "justify-between"
            : "justify-end"}"
        >
          ${this.isActive
            ? html`
                <sl-button-group>
                  <sl-button size="small" @click=${this.stop}>
                    <sl-icon name="slash-circle" slot="prefix"></sl-icon>
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
          ${this.crawl && this.isCrawler ? this.renderMenu() : ""}
        </div>
      </header>
    `;
  }

  private renderMenu() {
    if (!this.crawl) return;

    const crawlId = this.crawl.id;

    const closeDropdown = (e: any) => {
      e.target.closest("sl-dropdown").hide();
    };

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
            `
          )}
          ${when(
            this.artifactType === "crawl",
            () => html`
              <sl-menu-item
                @click=${() =>
                  this.navTo(
                    `/orgs/${this.crawl!.oid}/workflows/crawl/${
                      this.crawl!.cid
                    }`
                  )}
              >
                <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
                ${msg("Go to Workflow")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => CopyButton.copyToClipboard(this.crawl!.cid)}
              >
                <sl-icon name="copy-code" library="app" slot="prefix"></sl-icon>
                ${msg("Copy Workflow ID")}
              </sl-menu-item>
            `
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
            this.isCrawler && !isActive(this.crawl.state),
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => this.deleteCrawl()}
              >
                <sl-icon name="trash3" slot="prefix"></sl-icon>
                ${msg("Delete Crawl")}
              </sl-menu-item>
            `
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderPanel(title: any, content: any, classes: any = {}) {
    return html`
      <h2
        id="exclusions"
        class="flex-0 flex items-center justify-between text-lg font-semibold leading-none h-8 min-h-fit mb-2"
      >
        ${title}
      </h2>
      <div
        class=${classMap({
          "flex-1": true,
          ...classes,
        })}
      >
        ${content}
      </div>
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
                coll="${ifDefined(this.crawl?.id)}"
                config="${config}"
                replayBase="/replay/"
                noSandbox="true"
                noCache="true"
              ></replay-web-page>
            </div>`
          : html`
              <p class="text-sm text-neutral-400 p-4">
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
                  ?isUpload=${this.crawl.type === "upload"}
                ></btrix-crawl-status>
              `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${when(this.crawl, () =>
          this.crawl!.type === "upload"
            ? html`
                <btrix-desc-list-item label=${msg("Uploaded")}>
                  <sl-format-date
                    date=${`${this.crawl!.finished}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></sl-format-date>
                </btrix-desc-list-item>
              `
            : html`
                <btrix-desc-list-item label=${msg("Start Time")}>
                  <sl-format-date
                    date=${`${this.crawl!.started}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></sl-format-date>
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Finish Time")}>
                  ${this.crawl!.finished
                    ? html`<sl-format-date
                        date=${`${this.crawl!.finished}Z` /** Z for UTC */}
                        month="2-digit"
                        day="2-digit"
                        year="2-digit"
                        hour="numeric"
                        minute="numeric"
                        time-zone-name="short"
                      ></sl-format-date>`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Duration")}>
                  ${this.crawl!.finished
                    ? html`${RelativeDuration.humanize(
                        new Date(`${this.crawl!.finished}Z`).valueOf() -
                          new Date(`${this.crawl!.started}Z`).valueOf()
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
                <btrix-desc-list-item label=${msg("Initiator")}>
                  ${this.crawl!.manual
                    ? msg(
                        html`Manual start by
                          <span
                            >${this.crawl!.userName || this.crawl!.userid}</span
                          >`
                      )
                    : msg(html`Scheduled start`)}
                </btrix-desc-list-item>
              `
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
                            class="font-mono tracking-tighter${this.isActive
                              ? " text-purple-600"
                              : ""}"
                          >
                            ${this.numberFormatter.format(
                              +this.crawl.stats.done
                            )}
                            <span class="text-0-400">/</span>
                            ${this.numberFormatter.format(
                              +this.crawl.stats.found
                            )}
                          </span>
                          <span> pages</span>`
                      : ""}`
                : html`<span class="text-0-400">${msg("Unknown")}</span>`}`
            : html`<sl-skeleton class="h-5"></sl-skeleton>`}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Crawl ID")}>
          ${this.crawl
            ? html`<btrix-copy-button
                  value=${this.crawl.id}
                ></btrix-copy-button>
                <code title=${this.crawl.id}>${this.crawl.id}</code> `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${this.showOrgLink
          ? html`
              <btrix-desc-list-item label=${msg("Organization")}>
                ${this.crawl
                  ? html`
                      <a
                        class="font-medium text-neutral-700 hover:text-neutral-900"
                        href=${`/orgs/${this.crawl.oid}/artifacts/crawls`}
                        @click=${this.navLink}
                      >
                        <sl-icon
                          class="inline-block align-middle"
                          name="link-45deg"
                        ></sl-icon>
                        <span class="inline-block align-middle">
                          ${msg("View Organization")}
                        </span>
                      </a>
                    `
                  : html`<sl-skeleton class="h-6"></sl-skeleton>`}
              </btrix-desc-list-item>
            `
          : ""}
      </btrix-desc-list>
    `;
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
                () => html`<pre class="whitespace-pre-line font-sans">
${this.crawl?.description}
                </pre
                >`,
                () => noneText
              ),
            () => html`<sl-skeleton></sl-skeleton>`
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
                      html`<btrix-tag class="mt-1 mr-2">${tag}</btrix-tag>`
                  ),
                () => noneText
              ),
            () => html`<sl-skeleton></sl-skeleton>`
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;
  }

  private renderFiles() {
    return html`
      ${this.hasFiles
        ? html`
            <ul class="border rounded-lg text-sm">
              ${this.crawl!.resources!.map(
                (file) => html`
                  <li
                    class="flex justify-between p-3 border-t first:border-t-0"
                  >
                    <div class="whitespace-nowrap truncate flex items-center">
                      <sl-icon
                        name="file-earmark-zip-fill"
                        class="h-4 pr-2 shrink-0 text-neutral-600"
                      ></sl-icon>
                      <a
                        class="text-primary hover:underline truncate mr-2"
                        href=${file.path}
                        download
                        title=${file.name}
                        >${file.name.slice(file.name.lastIndexOf("/") + 1)}
                      </a>
                    </div>
                    <div
                      class="whitespace-nowrap text-sm font-mono text-neutral-400"
                    >
                      <sl-format-bytes value=${file.size}></sl-format-bytes>
                    </div>
                  </li>
                `
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
    if (!this.logs) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-3xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    if (!this.logs.total) {
      return html`<div class="border rounded-lg p-4">
        <p class="text-sm text-neutral-400">
          ${msg("No error logs to display.")}
        </p>
      </div>`;
    }

    return html`
      <btrix-crawl-logs
        .logs=${this.logs}
        @page-change=${async (e: PageChangeEvent) => {
          await this.fetchCrawlLogs({
            page: e.detail.page,
          });
          // Scroll to top of list
          this.scrollIntoView();
        }}
      ></btrix-crawl-logs>
    `;
  }

  private renderConfig() {
    if (!this.crawl?.config) return "";
    return html`
      <btrix-config-details
        .authState=${this.authState!}
        .crawlConfig=${{
          ...this.crawl,
          autoAddCollections: this.crawl.collections,
        }}
        hideTags
      ></btrix-config-details>
    `;
  }

  /**
   * Fetch crawl and update internal state
   */
  private async fetchCrawl(): Promise<void> {
    try {
      this.crawl = await this.getCrawl();
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawl(): Promise<Crawl> {
    const apiPath =
      this.artifactType === "upload"
        ? `/orgs/${this.orgId}/uploads/${this.crawlId}/replay.json`
        : `${this.crawlsAPIBaseUrl || this.crawlsBaseUrl}/${
            this.crawlId
          }/replay.json`;
    const data: Crawl = await this.apiFetch(apiPath, this.authState!);

    return data;
  }

  private async fetchCrawlLogs(
    params: Partial<APIPaginatedList> = {}
  ): Promise<void> {
    if (this.artifactType !== "crawl") {
      return;
    }
    try {
      this.logs = await this.getCrawlLogs(params);
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl logs at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawlLogs(
    params: Partial<APIPaginatedList>
  ): Promise<APIPaginatedList> {
    const page = params.page || this.logs?.page || 1;
    const pageSize = params.pageSize || this.logs?.pageSize || 50;

    const data: APIPaginatedList = await this.apiFetch(
      `${this.crawlsAPIBaseUrl || this.crawlsBaseUrl}/${
        this.crawlId
      }/errors?page=${page}&pageSize=${pageSize}`,
      this.authState!
    );

    return data;
  }

  private async cancel() {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawl();
      } else {
        this.notify({
          message: msg("Sorry, couldn't cancel crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop() {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.success === true) {
        this.fetchCrawl();
      } else {
        this.notify({
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

  private async runNow() {
    if (!this.crawl) return;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.crawl.oid}/crawlconfigs/${this.crawl.cid}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.started) {
        this.navTo(`/orgs/${this.crawl.oid}/artifacts/crawl/${data.started}`);
      }

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.renderName()}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
    } catch (e: any) {
      if (e.isApiError && e.message === "crawl_already_running") {
        this.notify({
          message: msg(
            html`Crawl of <strong>${this.renderName()}</strong> is already
              running.`
          ),
          variant: "warning",
          icon: "exclamation-triangle",
        });
      } else {
        this.notify({
          message: msg("Sorry, couldn't run crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async deleteCrawl() {
    if (
      !window.confirm(
        msg(str`Are you sure you want to delete crawl of ${this.renderName()}?`)
      )
    ) {
      return;
    }

    try {
      const data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/${
          this.crawl!.type === "crawl" ? "crawls" : "uploads"
        }/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [this.crawl!.id],
          }),
        }
      );

      this.navTo(this.crawlsBaseUrl);
      this.notify({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
      });
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

  /** Callback when crawl is no longer running */
  private crawlDone() {
    if (!this.crawl) return;

    this.fetchCrawlLogs();

    this.notify({
      message: msg(html`Done crawling <strong>${this.renderName()}</strong>.`),
      variant: "success",
      icon: "check2-circle",
    });

    if (this.sectionName === "watch") {
      // Show replay tab
      this.sectionName = "replay";
    }
  }

  /**
   * Enter fullscreen mode
   * @param id ID of element to fullscreen
   */
  private async enterFullscreen(id: string) {
    try {
      document.getElementById(id)!.requestFullscreen({
        // Show browser navigation controls
        navigationUI: "show",
      });
    } catch (err) {
      console.error(err);
    }
  }
}

customElements.define("btrix-crawl-detail", CrawlDetail);
