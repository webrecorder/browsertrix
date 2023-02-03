import type { TemplateResult, HTMLTemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import Fuse from "fuse.js";

import type {
  Tags,
  TagInputEvent,
  TagsChangeEvent,
} from "../../components/tag-input";
import { RelativeDuration } from "../../components/relative-duration";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { CopyButton } from "../../components/copy-button";
import type { Crawl, CrawlConfig } from "./types";

const SECTIONS = [
  "overview",
  "watch",
  "replay",
  "files",
  "logs",
  "config",
  "exclusions",
] as const;
type SectionName = typeof SECTIONS[number];

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

  @property({ type: Boolean })
  showOrgLink = false;

  @property({ type: String })
  crawlId?: string;

  @state()
  private crawlTemplateId?: string;

  @state()
  private crawl?: Crawl;

  @state()
  private crawlConfig?: CrawlConfig;

  @state()
  private sectionName: SectionName = "overview";

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private openDialogName?: "scale" | "details";

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private tagOptions: Tags = [];

  @state()
  private tagsToSave: Tags = [];

  private timerId?: number;

  // For fuzzy search:
  private fuse = new Fuse([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();

  private get isActive(): boolean | null {
    if (!this.crawl) return null;

    return (
      this.crawl.state === "running" ||
      this.crawl.state === "starting" ||
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

    this.fetchData();
  }

  willUpdate(changedProperties: Map<string, any>) {
    const prevId = changedProperties.get("crawlId");

    if (prevId && prevId !== this.crawlId) {
      // Handle update on URL change, e.g. from re-run
      this.crawlTemplateId = "";
      this.stopPollTimer();
      this.fetchData();
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
    if (changedProperties.has("crawl") && this.crawl) {
      this.tagsToSave = this.crawl.tags || [];
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

  disconnectedCallback(): void {
    this.stopPollTimer();
    super.disconnectedCallback();
  }

  render() {
    let sectionContent: string | TemplateResult = "";

    switch (this.sectionName) {
      case "watch": {
        if (this.crawl) {
          sectionContent = this.renderPanel(
            msg("Watch Crawl"),
            this.renderWatch()
          );
        } else {
          // TODO loading indicator?
          return "";
        }

        break;
      }
      case "replay":
        sectionContent = this.renderPanel(
          msg("Replay Crawl"),
          this.renderReplay()
        );
        break;
      case "files":
        sectionContent = this.renderPanel(
          msg("Download Files"),
          this.renderFiles()
        );
        break;
      case "logs":
        sectionContent = this.renderPanel(msg("Logs"), this.renderLogs());
        break;
      case "exclusions":
        sectionContent = this.renderPanel(
          msg("Crawl Exclusions"),
          this.renderExclusions()
        );
        break;

      case "config":
        sectionContent = this.renderPanel(msg("Config"), this.renderConfig());
        break;
      default:
        sectionContent = html`
          <div class="grid gap-5 grid-cols-1 lg:grid-cols-2">
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(msg("Overview"), this.renderOverview())}
            </div>
            <div class="col-span-1 flex flex-col">
              ${this.renderPanel(
                html`
                  <div class="flex items-center justify-between">
                    ${msg("Tags")}
                    <sl-icon-button
                      class="text-base"
                      name="pencil"
                      @click=${this.openDetailEditor}
                    ></sl-icon-button>
                  </div>
                `,
                this.renderDetails()
              )}
            </div>
          </div>
        `;
        break;
    }

    return html`
      <div class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${this.crawlsBaseUrl}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Crawls")}</span
          >
        </a>
      </div>

      <div class="mb-2">${this.renderHeader()}</div>

      <main>
        <section class="rounded-lg border mb-7">
          ${this.renderSummary()}
        </section>

        <section class="grid grid-cols-6 gap-4">
          <div class="col-span-6 md:col-span-1">${this.renderNav()}</div>
          <div class="col-span-6 md:col-span-5">${sectionContent}</div>
        </section>
      </main>

      <btrix-dialog
        label=${msg("Change Crawler Instances")}
        ?open=${this.openDialogName === "scale"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.isDialogVisible ? this.renderEditScale() : ""}
      </btrix-dialog>

      <btrix-dialog
        label=${msg("Edit Tags")}
        ?open=${this.openDialogName === "details"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.isDialogVisible ? this.renderEditDetails() : ""}
      </btrix-dialog>
    `;
  }

  private renderNav() {
    const renderNavItem = ({
      section,
      label,
    }: {
      section: SectionName;
      label: any;
    }) => {
      const isActive = section === this.sectionName;
      return html`
        <li
          class="relative"
          role="menuitem"
          aria-selected=${isActive.toString()}
        >
          <a
            class="block font-medium rounded-sm mb-2 mr-2 p-2 transition-all ${isActive
              ? "text-blue-600 bg-blue-50 shadow-sm"
              : "text-neutral-600 hover:bg-neutral-50"}"
            href=${`${this.crawlsBaseUrl}/crawl/${this.crawlId}#${section}`}
            @click=${() => (this.sectionName = section)}
          >
            ${label}
          </a>
        </li>
      `;
    };
    return html`
      <nav class="border-b md:border-b-0">
        <ul class="flex flex-row md:flex-col" role="menu">
          ${renderNavItem({ section: "overview", label: msg("Overview") })}
          ${renderNavItem({
            section: "exclusions",
            label: msg("Crawl Queue & Exclusions"),
          })}
          ${this.isActive
            ? renderNavItem({
                section: "watch",
                label: msg("Watch Crawl"),
              })
            : ""}
          ${renderNavItem({ section: "replay", label: msg("Replay") })}
          ${renderNavItem({ section: "files", label: msg("Files") })}
          ${renderNavItem({ section: "config", label: msg("Config") })}
          ${/* renderNavItem({ section: "logs", label: msg("Logs") }) */ ""}
        </ul>
      </nav>
    `;
  }

  private renderHeader() {
    return html`
      <header class="md:flex justify-between">
        <h2 class="text-xl font-medium mb-3 md:h-8">
          ${msg(
            html`<span class="font-normal">Crawl of</span> ${this.crawl
                ? this.crawl.configName
                : html`<sl-skeleton
                    class="inline-block"
                    style="width: 15em"
                  ></sl-skeleton>`}`
          )}
        </h2>
        <div
          class="grid gap-2 grid-flow-col ${this.isActive
            ? "justify-between"
            : "justify-end"}"
        >
          ${this.isActive
            ? html`
                <sl-button-group>
                  <sl-button
                    size="small"
                    @click=${() => {
                      this.openDialogName = "scale";
                      this.isDialogVisible = true;
                    }}
                  >
                    <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                    <span> ${msg("Scale")} </span>
                  </sl-button>
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
          ${this.crawl
            ? html` ${this.renderMenu()} `
            : html`<sl-skeleton
                style="width: 6em; height: 2em;"
              ></sl-skeleton>`}
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

        <ul
          class="text-sm text-neutral-800 bg-white whitespace-nowrap"
          role="menu"
        >
          ${when(
            this.crawlConfig && !this.crawlConfig.inactive,
            () => html`
              ${when(
                !this.isActive,
                () => html`
                  <li
                    class="p-2 text-purple-500 hover:bg-purple-500 hover:text-white cursor-pointer"
                    role="menuitem"
                    @click=${(e: any) => {
                      this.runNow();
                      e.target.closest("sl-dropdown").hide();
                    }}
                  >
                    <sl-icon
                      class="inline-block align-middle mr-1"
                      name="arrow-clockwise"
                    ></sl-icon>
                    <span class="inline-block align-middle">
                      ${msg("Re-run crawl")}
                    </span>
                  </li>
                `
              )}
              <li
                class="p-2 hover:bg-zinc-100 cursor-pointer"
                role="menuitem"
                @click=${(e: any) => {
                  this.openDetailEditor();
                  e.target.closest("sl-dropdown").hide();
                }}
              >
                <sl-icon
                  class="inline-block align-middle mr-1"
                  name="pencil"
                ></sl-icon>
                <span class="inline-block align-middle">
                  ${msg("Edit Tags")}
                </span>
              </li>
              <hr />
              <li
                class="p-2 hover:bg-zinc-100 cursor-pointer"
                role="menuitem"
                @click=${() => {
                  this.navTo(
                    `/orgs/${this.crawl?.oid}/crawl-configs/config/${this.crawlTemplateId}?edit`
                  );
                }}
              >
                <span class="inline-block align-middle">
                  ${msg("Edit Crawl Config")}
                </span>
              </li>
            `
          )}
          <li
            class="p-2 hover:bg-zinc-100 cursor-pointer"
            role="menuitem"
            @click=${(e: any) => {
              CopyButton.copyToClipboard(crawlId);
              closeDropdown(e);
            }}
          >
            ${msg("Copy Crawl ID")}
          </li>
          <li
            class="p-2 hover:bg-zinc-100 cursor-pointer"
            role="menuitem"
            @click=${(e: any) => {
              CopyButton.copyToClipboard(this.crawlTemplateId || "");
              closeDropdown(e);
            }}
          >
            ${msg("Copy Crawl Config ID")}
          </li>
        </ul>
      </sl-dropdown>
    `;
  }

  private renderPanel(title: any, content: any) {
    return html`
      <h3 class="flex-0 text-lg font-medium mb-2">${title}</h3>
      <div class="flex-1 rounded-lg border p-5">${content}</div>
    `;
  }

  private renderSummary() {
    return html`
      <dl class="grid grid-cols-4 gap-5 text-center p-3 text-sm">
        <div class="col-span-2 md:col-span-1">
          <dt class="text-xs text-0-600">${msg("Status")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <div class="inline-flex items-baseline justify-between">
                    <div
                      class="whitespace-nowrap capitalize${this.isActive
                        ? " motion-safe:animate-pulse"
                        : ""}"
                    >
                      <span
                        class="inline-block ${this.crawl.state === "failed"
                          ? "text-red-500"
                          : this.crawl.state === "complete"
                          ? "text-emerald-500"
                          : this.isActive
                          ? "text-purple-500"
                          : "text-zinc-300"}"
                        style="font-size: 10px; vertical-align: 2px"
                      >
                        &#9679;
                      </span>
                      ${this.crawl.state.replace(/_/g, " ")}
                    </div>
                  </div>
                `
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-2 md:col-span-1">
          <dt class="text-xs text-0-600">${msg("Pages Crawled")}</dt>
          <dd>
            ${this.crawl?.stats
              ? html`
                  <span
                    class="font-mono tracking-tighter${this.isActive
                      ? " text-purple-600"
                      : ""}"
                  >
                    ${this.numberFormatter.format(+this.crawl.stats.done)}
                    <span class="text-0-400">/</span>
                    ${this.numberFormatter.format(+this.crawl.stats.found)}
                  </span>
                `
              : this.crawl
              ? html` <span class="text-0-400">${msg("Unknown")}</span> `
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-2 md:col-span-1">
          <dt class="text-xs text-0-600">${msg("Run Duration")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.finished
                    ? html`${RelativeDuration.humanize(
                        new Date(`${this.crawl.finished}Z`).valueOf() -
                          new Date(`${this.crawl.started}Z`).valueOf()
                      )}`
                    : html`
                        <span class="text-purple-600">
                          <btrix-relative-duration
                            value=${`${this.crawl.started}Z`}
                            unitCount="3"
                            tickSeconds="1"
                          ></btrix-relative-duration>
                        </span>
                      `}
                `
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-2 md:col-span-1">
          <dt class="text-xs text-0-600">${msg("Crawler Instances")}</dt>
          <dd>
            ${this.crawl
              ? this.crawl?.scale
              : html`<sl-skeleton class="h-5"></sl-skeleton>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderWatch() {
    if (!this.authState || !this.crawl) return "";

    const isStarting = this.crawl.state === "starting";
    const isRunning = this.crawl.state === "running";
    const isStopping = this.crawl.state === "stopping";
    const authToken = this.authState.headers.Authorization.split(" ")[1];

    return html`
      ${isStarting
        ? html`<div class="rounded border p-3">
            <p class="text-sm text-neutral-600 motion-safe:animate-pulse">
              ${msg("Crawl starting...")}
            </p>
          </div>`
        : this.isActive
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

            <div
              id="screencast-crawl"
              class="${isStopping ? "opacity-40" : ""} transition-opacity"
            >
              <btrix-screencast
                authToken=${authToken}
                orgId=${this.crawl.oid}
                crawlId=${this.crawlId!}
                scale=${this.crawl.scale}
              ></btrix-screencast>
            </div>
          `
        : this.renderInactiveCrawlMessage()}
    `;
  }

  private renderExclusions() {
    return html`
      <btrix-exclusion-editor
        orgId=${ifDefined(this.crawl?.oid)}
        crawlId=${ifDefined(this.crawl?.id)}
        .config=${this.crawlConfig?.config}
        .authState=${this.authState}
        ?isActiveCrawl=${this.crawl && this.isActive}
        @on-success=${this.handleExclusionChange}
      ></btrix-exclusion-editor>
    `;
  }

  private renderReplay() {
    const bearer = this.authState?.headers?.Authorization?.split(" ", 2)[1];

    // for now, just use the first file until multi-wacz support is fully implemented
    const replaySource = `/api/orgs/${this.crawl?.oid}/crawls/${this.crawlId}/replay.json?auth_bearer=${bearer}`;
    //const replaySource = this.crawl?.resources?.[0]?.path;

    const canReplay = replaySource && this.hasFiles;

    return html`
      <!-- https://github.com/webrecorder/browsertrix-crawler/blob/9f541ab011e8e4bccf8de5bd7dc59b632c694bab/screencast/index.html -->
      ${
        canReplay
          ? html`<div
              id="replay-crawl"
              class="aspect-4/3 rounded border overflow-hidden"
            >
              <replay-web-page
                source="${replaySource}"
                coll="${ifDefined(this.crawl?.id)}"
                replayBase="/replay/"
                noSandbox="true"
                noCache="true"
              ></replay-web-page>
            </div>`
          : html`
              <p class="text-sm text-neutral-400">
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
        <btrix-desc-list-item label=${msg("Started")}>
          ${this.crawl
            ? html`
                <sl-format-date
                  date=${`${this.crawl.started}Z` /** Z for UTC */}
                  month="2-digit"
                  day="2-digit"
                  year="2-digit"
                  hour="numeric"
                  minute="numeric"
                  time-zone-name="short"
                ></sl-format-date>
              `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Finished")}>
          ${this.crawl
            ? html`
                ${this.crawl.finished
                  ? html`<sl-format-date
                      date=${`${this.crawl.finished}Z` /** Z for UTC */}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="numeric"
                      minute="numeric"
                      time-zone-name="short"
                    ></sl-format-date>`
                  : html`<span class="text-0-400">${msg("Pending")}</span>`}
              `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Reason")}>
          ${this.crawl
            ? html`
                ${this.crawl.manual
                  ? msg(
                      html`Manual start by
                        <span
                          >${this.crawl?.userName || this.crawl?.userid}</span
                        >`
                    )
                  : msg(html`Scheduled run`)}
              `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Crawl ID")}>
          ${this.crawl
            ? html`<btrix-copy-button
                  value=${this.crawl.id}
                ></btrix-copy-button>
                <code class="text-xs" title=${this.crawl.id}
                  >${this.crawl.id}</code
                > `
            : html`<sl-skeleton class="h-6"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${this.showOrgLink
          ? html`
              <btrix-desc-list-item label=${msg("Organization")}>
                ${this.crawl
                  ? html`
                      <a
                        class="font-medium text-neutral-700 hover:text-neutral-900"
                        href=${`/orgs/${this.crawl.oid}/crawls`}
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

  private renderDetails() {
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Tags")}>
          ${when(
            this.crawl,
            () =>
              when(
                this.crawl?.tags?.length,
                () =>
                  this.crawl!.tags!.map(
                    (tag) =>
                      html`<btrix-tag class="mt-1 mr-2">${tag}</btrix-tag>`
                  ),
                () => html`${msg("None")}`
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
            <ul class="border rounded text-sm">
              ${this.crawl!.resources!.map(
                (file) => html`
                  <li
                    class="flex justify-between p-3 border-t first:border-t-0"
                  >
                    <div class="whitespace-nowrap truncate">
                      <a
                        class="text-primary hover:underline"
                        href=${file.path}
                        download
                        title=${file.name}
                        >${file.name.slice(file.name.lastIndexOf("/") + 1)}
                      </a>
                    </div>
                    <div class="whitespace-nowrap">
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
    return html`TODO`;
  }

  private renderConfig() {
    if (!this.crawlConfig) return "";
    return html`
      <btrix-config-details
        .crawlConfig=${this.crawlConfig}
        hideTags
      ></btrix-config-details>
    `;
  }

  private renderEditScale() {
    if (!this.crawl) return;

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
      <div class="text-center">
        <sl-radio-group value=${this.crawl.scale}>
          ${scaleOptions.map(
            ({ value, label }) => html`
              <sl-radio-button
                value=${value}
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

  private renderEditDetails() {
    if (!this.crawl) return;

    return html`
      <form
        id="crawlDetailsForm"
        @submit=${this.onSubmitDetails}
        @reset=${() => (this.openDialogName = undefined)}
      >
        <btrix-tag-input
          .initialTags=${this.crawl.tags}
          .tagOptions=${this.tagOptions}
          @tag-input=${this.onTagInput}
          @tags-change=${(e: TagsChangeEvent) =>
            (this.tagsToSave = e.detail.tags)}
        ></btrix-tag-input>
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button form="crawlDetailsForm" type="reset" size="small"
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          form="crawlDetailsForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${this.isSubmittingUpdate}
          ?disabled=${this.isSubmittingUpdate}
          >${msg("Save")}</sl-button
        >
      </div>
    `;
  }

  private renderInactiveCrawlMessage() {
    return html`
      <div class="rounded border bg-neutral-50 p-3">
        <p class="text-sm text-neutral-600">
          ${msg("Crawl is not running.")}
          ${this.hasFiles
            ? html`<a
                href=${`${this.crawlsBaseUrl}/crawl/${this.crawlId}#replay`}
                class="text-primary hover:underline"
                @click=${() => (this.sectionName = "replay")}
                >View replay</a
              >`
            : ""}
        </p>
      </div>
    `;
  }

  private async fetchData({ parallel }: { parallel?: boolean } = {}) {
    if (parallel) {
      this.fetchCrawl();
    } else {
      await this.fetchCrawl();
    }
    this.fetchCrawlTemplate();
  }

  /**
   * Fetch crawl and update internal state
   */
  private async fetchCrawl(): Promise<void> {
    try {
      this.crawl = await this.getCrawl();
      this.crawlTemplateId = this.crawlTemplateId || this.crawl.cid;

      if (this.isActive) {
        // Restart timer for next poll
        this.stopPollTimer();
        this.timerId = window.setTimeout(() => {
          this.fetchCrawl();
        }, 1000 * POLL_INTERVAL_SECONDS);
      } else {
        this.stopPollTimer();
      }
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawl(): Promise<Crawl> {
    const data: Crawl = await this.apiFetch(
      `${this.crawlsAPIBaseUrl || this.crawlsBaseUrl}/${
        this.crawlId
      }/replay.json`,
      this.authState!
    );

    return data;
  }

  /**
   * Fetch crawl config and update internal state
   */
  private async fetchCrawlTemplate(): Promise<void> {
    try {
      this.crawlConfig = await this.getCrawlTemplate();
    } catch {
      // Fail silently since page will mostly still function
    }
  }

  private async getCrawlTemplate(): Promise<CrawlConfig> {
    if (!this.crawl) {
      throw new Error("missing crawl");
    }

    const data: CrawlConfig = await this.apiFetch(
      `/orgs/${this.crawl.oid}/crawlconfigs/${this.crawlTemplateId}`,
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

  private onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse.search(value).map(({ item }) => item);
  };

  private async fetchTags() {
    if (!this.crawl) return;
    try {
      const tags = await this.apiFetch(
        `/orgs/${this.crawl.oid}/crawlconfigs/tags`,
        this.authState!
      );

      // Update search/filter collection
      this.fuse.setCollection(tags as any);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private openDetailEditor() {
    this.fetchTags();
    this.openDialogName = "details";
  }

  private async onSubmitDetails(e: SubmitEvent) {
    e.preventDefault();

    const params = {
      tags: this.tagsToSave,
    };
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        }
      );

      if (!data.success) {
        throw data;
      }

      this.fetchCrawl();
      this.notify({
        message: msg("Successfully saved crawl details."),
        variant: "success",
        icon: "check2-circle",
      });
      this.openDialogName = undefined;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't save crawl details at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  private async scale(value: Crawl["scale"]) {
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawlId}/scale`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({ scale: +value }),
        }
      );

      if (data.scaled) {
        this.crawl!.scale = data.scaled;

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

  private async runNow() {
    if (!this.crawl) return;

    try {
      // Get crawl config to check if crawl is already running
      const crawlTemplate = await this.getCrawlTemplate();

      if (crawlTemplate.currCrawlId) {
        this.notify({
          message: msg(
            html`Crawl of <strong>${this.crawl.configName}</strong> is already
              running.
              <br />
              <a
                class="underline hover:no-underline"
                href="/orgs/${this.crawl
                  .oid}/crawls/crawl/${crawlTemplate.currCrawlId}"
                @click=${this.navLink.bind(this)}
                >View crawl</a
              >`
          ),
          variant: "warning",
          icon: "exclamation-triangle",
        });

        return;
      }

      const data = await this.apiFetch(
        `/orgs/${this.crawl.oid}/crawlconfigs/${this.crawlTemplateId}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.started) {
        this.navTo(`/orgs/${this.crawl.oid}/crawls/crawl/${data.started}`);
      }

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.crawl.configName}</strong>.`
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

  private handleExclusionChange(e: CustomEvent) {
    const { cid } = e.detail;
    this.crawlTemplateId = cid;
    this.fetchData({ parallel: true });
  }

  private stopPollTimer() {
    window.clearTimeout(this.timerId);
  }

  /** Callback when crawl is no longer running */
  private crawlDone() {
    if (!this.crawl) return;

    this.notify({
      message: msg(
        html`Done crawling <strong>${this.crawl.configName}</strong>.`
      ),
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
