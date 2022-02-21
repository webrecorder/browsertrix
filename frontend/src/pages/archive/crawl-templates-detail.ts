import type { HTMLTemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import cronstrue from "cronstrue"; // TODO localize

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlTemplate, CrawlConfig } from "./types";
import { getUTCSchedule } from "./utils";
import "../../components/crawl-scheduler";

const SEED_URLS_MAX = 3;

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-detail></btrix-crawl-templates-detail>
 * ```
 */
@localized()
export class CrawlTemplatesDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  crawlConfigId!: string;

  @state()
  private crawlTemplate?: CrawlTemplate;

  @state()
  private showAllSeedURLs: boolean = false;

  @state()
  private isSeedsJsonView: boolean = false;

  @state()
  private seedsJson: string = "";

  @state()
  private invalidSeedsJsonMessage: string = "";

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private openDialogName?: "name" | "config" | "schedule";

  @state()
  private isDialogVisible: boolean = false;

  firstUpdated() {
    this.initializeCrawlTemplate();
  }

  async updated(changedProperties: any) {
    if (changedProperties.has("crawlConfigId")) {
      this.initializeCrawlTemplate();
    }
  }

  async initializeCrawlTemplate() {
    try {
      this.crawlTemplate = await this.getCrawlTemplate();

      // Show JSON editor view if complex initial config is specified
      // (e.g. cloning a template) since form UI doesn't support
      // all available fields in the config
      const isComplexConfig = this.crawlTemplate.config.seeds.some(
        (seed: any) => typeof seed !== "string"
      );
      if (isComplexConfig) {
        this.isSeedsJsonView = true;
      }
      this.seedsJson = JSON.stringify(this.crawlTemplate.config, null, 2);
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  render() {
    return html`
      <nav class="mb-5">
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${`/archives/${this.archiveId}/crawl-templates`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Crawl Templates")}</span
          >
        </a>
      </nav>

      ${this.renderInactiveNotice()}

      <header class="flex justify-between items-end mb-4">
        <div>
          <h2 class="text-2xl font-bold md:h-7 md:truncate leading-tight mb-1">
            ${this.crawlTemplate?.name ||
            html`<sl-skeleton class="h-7" style="width: 20em"></sl-skeleton>`}
          </h2>
          <div class="text-xs text-neutral-400 h-4">
            ${msg("ID")} <code>${this.crawlTemplate?.id}</code>
          </div>
        </div>

        <div class="flex-0">${this.renderMenu()}</div>
      </header>

      ${this.renderCurrentlyRunningNotice()}

      <section class="px-4 py-3 border-t border-b mb-4 text-sm">
        ${this.renderDetails()}
      </section>

      <main class="border rounded-lg">
        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Configuration")}</h3>
            ${this.crawlTemplate?.oldId
              ? html`
                  <aside>
                    <a
                      class="text-sm font-medium text-neutral-400 hover:text-neutral-500"
                      href=${`/archives/${this.archiveId}/crawl-templates/config/${this.crawlTemplate.oldId}`}
                      @click=${this.navLink}
                    >
                      ${msg("see previous version")}
                    </a>
                  </aside>
                `
              : ""}
            ${this.crawlTemplate?.newId
              ? html`
                  <aside>
                    <a
                      class="text-sm font-medium text-indigo-500 hover:text-indigo-600"
                      href=${`/archives/${this.archiveId}/crawl-templates/config/${this.crawlTemplate.newId}`}
                      @click=${this.navLink}
                    >
                      ${msg("see newer version")}
                    </a>
                  </aside>
                `
              : ""}
          </div>
          <div class="col-span-3 p-4 border-b flex">
            <div class="flex-1 md:p-4">${this.renderConfiguration()}</div>
            <div class="flex-0 md:ml-4">
              ${this.crawlTemplate?.inactive || !this.crawlTemplate
                ? ""
                : html`
                    <sl-button
                      size="small"
                      type="text"
                      @click=${() => (this.openDialogName = "config")}
                    >
                      ${msg("Edit")}
                    </sl-button>
                  `}
            </div>
          </div>
        </section>

        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Schedule")}</h3>
          </div>
          <div class="col-span-3 p-4 border-b flex">
            <div class="flex-1 md:p-4">${this.renderSchedule()}</div>
            <div class="flex-0 md:ml-4">
              ${this.crawlTemplate?.inactive || !this.crawlTemplate
                ? ""
                : html`
                    <sl-button
                      size="small"
                      type="text"
                      @click=${() => (this.openDialogName = "schedule")}
                    >
                      ${msg("Edit")}
                    </sl-button>
                  `}
            </div>
          </div>
        </section>

        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8">
            <h3 class="font-medium">${msg("Crawls")}</h3>
          </div>
          <div class="col-span-3 p-4 md:p-8">${this.renderCrawls()}</div>
        </section>
      </main>

      ${this.renderDialogs()}
    `;
  }

  private renderMenu() {
    if (!this.crawlTemplate) return;

    const closeDropdown = (e: any) => {
      e.target.closest("sl-dropdown").hide();
    };

    const menuItems: HTMLTemplateResult[] = [
      html`
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${() => this.duplicateConfig()}
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

    if (!this.crawlTemplate.inactive) {
      menuItems.unshift(html`
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            closeDropdown(e);
            this.openDialogName = "name";
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="pencil-square"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Change name")}</span
          >
        </li>
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            closeDropdown(e);
            this.openDialogName = "config";
          }}
        >
          <sl-icon class="inline-block align-middle px-1" name="gear"></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Edit crawl configuration")}</span
          >
        </li>
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            closeDropdown(e);
            this.openDialogName = "schedule";
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="clock-history"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Edit schedule")}</span
          >
        </li>
        <hr />
      `);
    }

    if (this.crawlTemplate.crawlCount && !this.crawlTemplate.inactive) {
      menuItems.push(html`
        <li
          class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            closeDropdown(e);

            this.deactivateTemplate();
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

    if (!this.crawlTemplate.crawlCount) {
      menuItems.push(html`
        <li
          class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            this.deleteTemplate();
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
      <sl-dropdown placement="bottom-end" distance="4">
        <sl-button slot="trigger" type="primary" size="small" caret
          >${msg("Actions")}</sl-button
        >

        <ul class="text-sm text-0-800 whitespace-nowrap" role="menu">
          ${menuItems.map((item: HTMLTemplateResult) => item)}
        </ul>
      </sl-dropdown>
    `;
  }

  private renderInactiveNotice() {
    if (this.crawlTemplate?.inactive) {
      return html`
        <div class="mb-5">
          <btrix-alert type="warning">
            <sl-icon
              name="exclamation-octagon"
              class="inline-block align-middle mr-2"
            ></sl-icon>
            <span class="inline-block align-middle">
              ${msg("This crawl template is inactive.")}
            </span>
          </btrix-alert>
        </div>
      `;
    }

    return "";
  }

  private renderCurrentlyRunningNotice() {
    if (this.crawlTemplate?.currCrawlId) {
      return html`
        <a
          class="flex items-center justify-between mb-4 px-3 py-2 border rounded-lg bg-purple-50 border-purple-200 hover:border-purple-500 shadow shadow-purple-200 text-purple-800 transition-colors"
          href=${`/archives/${this.archiveId}/crawls/crawl/${this.crawlTemplate.currCrawlId}`}
          @click=${this.navLink}
        >
          <span>${msg("View currently running crawl")}</span>
          <sl-icon name="arrow-right"></sl-icon>
        </a>
      `;
    }

    return "";
  }

  private renderDetails() {
    return html`
      <dl class="grid grid-cols-2">
        <div>
          <dt class="text-xs text-0-600">${msg("Created at")}</dt>
          <dd class="h-5">
            ${this.crawlTemplate?.created
              ? html`
                  <sl-format-date
                    date=${`${this.crawlTemplate.created}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></sl-format-date>
                `
              : html`<sl-skeleton style="width: 15em"></sl-skeleton>`}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-0-600">${msg("Created by")}</dt>
          <dd class="h-5">
            ${this.crawlTemplate?.userName ||
            this.crawlTemplate?.userid ||
            html`<sl-skeleton style="width: 15em"></sl-skeleton>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderEditName() {
    if (!this.crawlTemplate) return;

    return html`
      <sl-form @sl-submit=${this.handleSubmitEditName}>
        <sl-input
          name="name"
          label=${msg("Name")}
          placeholder=${msg("Example (example.com) Weekly Crawl", {
            desc: "Example crawl template name",
          })}
          autocomplete="off"
          value=${this.crawlTemplate.name}
          required
        ></sl-input>

        <div class="mt-5 text-right">
          <sl-button
            type="text"
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            type="primary"
            submit
            ?disabled=${this.isSubmittingUpdate}
            ?loading=${this.isSubmittingUpdate}
            >${msg("Save Changes")}</sl-button
          >
        </div>
      </sl-form>
    `;
  }

  private renderConfiguration() {
    const seeds = this.crawlTemplate?.config.seeds || [];

    return html`
      <div class="mb-5" role="table">
        <div class="grid grid-cols-5 gap-4" role="row">
          <span class="col-span-3 text-sm text-0-600" role="columnheader"
            >${msg("Seed URL")}</span
          >
          <span class="col-span-1 text-sm text-0-600" role="columnheader"
            >${msg("Scope Type")}</span
          >
          <span class="col-span-1 text-sm text-0-600" role="columnheader"
            >${msg("Page Limit")}</span
          >
        </div>
        <ul role="rowgroup">
          ${seeds
            .slice(0, this.showAllSeedURLs ? undefined : SEED_URLS_MAX)
            .map(
              (seed, i) =>
                html`<li
                  class="grid grid-cols-5 gap-4 items-baseline py-1 border-zinc-100${i
                    ? " border-t"
                    : ""}"
                  role="row"
                  title=${typeof seed === "string" ? seed : seed.url}
                >
                  <div class="col-span-3 break-all leading-tight" role="cell">
                    ${typeof seed === "string" ? seed : seed.url}
                  </div>
                  <span
                    class="col-span-1 uppercase text-0-500 text-xs"
                    role="cell"
                    >${(typeof seed !== "string" && seed.scopeType) ||
                    this.crawlTemplate?.config.scopeType}</span
                  >
                  <span
                    class="col-span-1 uppercase text-0-500 text-xs font-mono"
                    role="cell"
                    >${(typeof seed !== "string" && seed.limit) ||
                    this.crawlTemplate?.config.limit}</span
                  >
                </li>`
            )}
        </ul>

        ${seeds.length > SEED_URLS_MAX
          ? html`<sl-button
              class="mt-2"
              type="neutral"
              size="small"
              @click=${() => (this.showAllSeedURLs = !this.showAllSeedURLs)}
            >
              <span class="text-sm">
                ${this.showAllSeedURLs
                  ? msg("Show less")
                  : msg(str`Show
                    ${seeds.length - SEED_URLS_MAX}
                    more`)}
              </span>
            </sl-button>`
          : ""}
      </div>

      <sl-details style="--sl-spacing-medium: var(--sl-spacing-small)">
        <span slot="summary" class="text-sm">
          <span class="font-medium">${msg("Advanced configuration")}</span>
          <sl-tag size="small" type="neutral">${msg("JSON")}</sl-tag></span
        >
        <div class="relative">
          <pre
            class="language-json bg-gray-800 text-gray-50 p-4 rounded font-mono text-xs"
          ><code>${JSON.stringify(
            this.crawlTemplate?.config || {},
            null,
            2
          )}</code></pre>

          <div class="absolute top-2 right-2">
            <btrix-copy-button
              .value="${JSON.stringify(
                this.crawlTemplate?.config || {},
                null,
                2
              )}"
            ></btrix-copy-button>
          </div>
        </div>
      </sl-details>
    `;
  }

  private renderEditConfiguration() {
    if (!this.crawlTemplate) return;

    return html`
      <sl-form @sl-submit=${this.handleSubmitEditConfiguration}>
        <div class="grid gap-5">
          <btrix-alert>
            <p>
              ${msg(
                "Editing the crawl configuration will replace this crawl template with a new version. All other settings will be kept the same."
              )}
            </p>
          </btrix-alert>

          <div class="flex justify-between">
            <h4 class="font-medium">
              ${this.isSeedsJsonView
                ? msg("Custom Config")
                : msg("Configure Seeds")}
            </h4>
            <sl-switch
              ?checked=${this.isSeedsJsonView}
              @sl-change=${(e: any) =>
                (this.isSeedsJsonView = e.target.checked)}
            >
              <span class="text-sm">${msg("Use JSON Editor")}</span>
            </sl-switch>
          </div>

          ${this.isSeedsJsonView
            ? this.renderSeedsJson()
            : this.renderSeedsForm()}

          <div class="text-right">
            <sl-button
              type="text"
              @click=${() => (this.openDialogName = undefined)}
              >${msg("Cancel")}</sl-button
            >
            <sl-button
              type="primary"
              submit
              ?disabled=${Boolean(this.invalidSeedsJsonMessage) ||
              this.isSubmittingUpdate}
              ?loading=${this.isSubmittingUpdate}
              >${msg("Save Changes")}</sl-button
            >
          </div>
        </div>
      </sl-form>
    `;
  }

  private renderSchedule() {
    return html`
      <dl class="grid gap-5">
        <div>
          <dt class="text-sm text-0-600">${msg("Recurring crawls")}</dt>
          <dd>
            ${this.crawlTemplate
              ? html`
                  ${this.crawlTemplate.schedule
                    ? // TODO localize
                      // NOTE human-readable string is in UTC, limitation of library
                      // currently being used.
                      // https://github.com/bradymholt/cRonstrue/issues/94
                      html`<span
                        >${cronstrue.toString(this.crawlTemplate.schedule, {
                          verbose: true,
                        })}
                        (in UTC time zone)</span
                      >`
                    : html`<span class="text-0-400">${msg("None")}</span>`}
                `
              : html`<sl-skeleton></sl-skeleton>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderEditSchedule() {
    if (!this.crawlTemplate) return;

    return html`
      <btrix-crawl-scheduler
        .schedule=${this.crawlTemplate.schedule}
        .isSubmitting=${this.isSubmittingUpdate}
        cancelable
        @cancel=${() => (this.openDialogName = undefined)}
        @submit=${this.handleSubmitEditSchedule}
      ></btrix-crawl-scheduler>
    `;
  }

  private renderCrawls() {
    return html`
      <dl class="grid gap-5">
        <div>
          <dt class="text-sm text-0-600">${msg("# of Crawls")}</dt>
          <dd class="font-mono">
            ${(this.crawlTemplate?.crawlCount || 0).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-0-600">${msg("Currently Running Crawl")}</dt>
          <dd
            class="flex items-center justify-between border border-zinc-100 rounded p-1 mt-1"
          >
            ${this.crawlTemplate
              ? html`
                  ${this.crawlTemplate.currCrawlId
                    ? html` <a
                        class="text-primary font-medium hover:underline text-sm p-1"
                        href=${`/archives/${this.archiveId}/crawls/crawl/${this.crawlTemplate.currCrawlId}`}
                        @click=${this.navLink}
                        >${msg("View crawl")}</a
                      >`
                    : this.crawlTemplate.inactive
                    ? ""
                    : html`<span class="text-0-400 text-sm p-1"
                          >${msg("None")}</span
                        ><button
                          class="text-xs border rounded px-2 h-7 bg-purple-500 hover:bg-purple-400 text-white transition-colors"
                          @click=${() => this.runNow()}
                        >
                          <span class="whitespace-nowrap">
                            ${msg("Run now")}
                          </span>
                        </button>`}
                `
              : html` <sl-skeleton style="width: 6em"></sl-skeleton> `}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-0-600">${msg("Latest Crawl")}</dt>
          <dd
            class="flex items-center justify-between border border-zinc-100 rounded p-1 mt-1"
          >
            ${this.crawlTemplate?.lastCrawlId
              ? html`<a
                    class="text-primary font-medium hover:underline text-sm p-1"
                    href=${`/archives/${this.archiveId}/crawls/crawl/${this.crawlTemplate.lastCrawlId}`}
                    @click=${this.navLink}
                    >${msg("View crawl")}</a
                  >
                  <sl-format-date
                    date=${
                      `${this.crawlTemplate.lastCrawlTime}Z` /** Z for UTC */
                    }
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></sl-format-date>`
              : html`<span class="text-0-400 text-sm p-1"
                  >${msg("None")}</span
                >`}
          </dd>
        </div>
      </dl>
    `;
  }

  /**
   * Render dialog for edit forms
   *
   * `openDialogName` shows/hides a specific dialog, while `isDialogVisible`
   * renders/prevents rendering a dialog's content unless the dialog is visible
   * in order to reset the dialog content on close.
   */
  private renderDialogs() {
    const dialogWidth = "36rem";

    const resetScroll = (e: any) => {
      const dialogBody = e.target.shadowRoot.querySelector('[part="body"]');

      if (dialogBody) {
        dialogBody.scrollTop = 0;
      }
    };

    return html`
      <sl-dialog
        label=${msg(str`Edit Crawl Template Name`)}
        style="--width: ${dialogWidth}"
        ?open=${this.openDialogName === "name"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.isDialogVisible ? this.renderEditName() : ""}
      </sl-dialog>

      <sl-dialog
        label=${msg(str`Edit Crawl Configuration`)}
        style="--width: ${dialogWidth}"
        ?open=${this.openDialogName === "config"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
        @sl-after-show=${resetScroll}
      >
        ${this.isDialogVisible ? this.renderEditConfiguration() : ""}
      </sl-dialog>

      <sl-dialog
        label=${msg(str`Edit Crawl Schedule`)}
        style="--width: ${dialogWidth}"
        ?open=${this.openDialogName === "schedule"}
        @sl-request-close=${() => (this.openDialogName = undefined)}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${this.isDialogVisible ? this.renderEditSchedule() : ""}
      </sl-dialog>
    `;
  }

  private renderSeedsForm() {
    return html`
      <sl-textarea
        name="seedUrls"
        label=${msg("Seed URLs")}
        placeholder=${msg(`https://webrecorder.net\nhttps://example.com`, {
          desc: "Example seed URLs",
        })}
        help-text=${msg(
          "Required. Separate URLs with a new line, space or comma."
        )}
        rows="3"
        value=${this.crawlTemplate!.config.seeds.join("\n")}
        required
      ></sl-textarea>
      <sl-select
        name="scopeType"
        label=${msg("Crawl Scope")}
        value=${this.crawlTemplate!.config.scopeType!}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        <sl-menu-item value="page">Page</sl-menu-item>
        <sl-menu-item value="page-spa">Page SPA</sl-menu-item>
        <sl-menu-item value="prefix">Prefix</sl-menu-item>
        <sl-menu-item value="host">Host</sl-menu-item>
        <sl-menu-item value="any">Any</sl-menu-item>
      </sl-select>
      <sl-checkbox name="extraHopsOne"
        >${msg("Include External Links ('one hop out')")}
      </sl-checkbox>
      <sl-input
        name="limit"
        label=${msg("Page Limit")}
        type="number"
        value=${ifDefined(this.crawlTemplate!.config.limit)}
        placeholder=${msg("unlimited")}
      >
        <span slot="suffix">${msg("pages")}</span>
      </sl-input>
    `;
  }

  private renderSeedsJson() {
    return html`
      <div class="grid gap-4">
        <div>
          <p class="mb-2">
            ${msg(
              html`See
                <a
                  href="https://github.com/webrecorder/browsertrix-crawler#crawling-configuration-options"
                  class="text-primary hover:underline"
                  target="_blank"
                  >Browsertrix Crawler docs
                  <sl-icon name="box-arrow-up-right"></sl-icon
                ></a>
                for all configuration options.`
            )}
          </p>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="relative col-span-2">
            ${this.renderSeedsJsonInput()}

            <div class="absolute top-2 right-2">
              <btrix-copy-button .value=${this.seedsJson}></btrix-copy-button>
            </div>
          </div>

          <div class="col-span-1">
            ${this.invalidSeedsJsonMessage
              ? html`<btrix-alert type="danger">
                  ${this.invalidSeedsJsonMessage}
                </btrix-alert> `
              : html` <btrix-alert> ${msg("Valid JSON")} </btrix-alert>`}
          </div>
        </div>
      </div>
    `;
  }

  private renderSeedsJsonInput() {
    return html`
      <textarea
        id="json-editor"
        name="config"
        class="language-json block w-full bg-gray-800 text-gray-50 p-4 rounded font-mono text-sm"
        autocomplete="off"
        rows="10"
        spellcheck="false"
        .value=${this.seedsJson}
        @keydown=${(e: any) => {
          // Add indentation when pressing tab key instead of moving focus
          if (e.keyCode === /* tab: */ 9) {
            e.preventDefault();

            const textarea = e.target;

            textarea.setRangeText(
              "  ",
              textarea.selectionStart,
              textarea.selectionStart,
              "end"
            );
          }
        }}
        @change=${(e: any) => (this.seedsJson = e.target.value)}
        @blur=${this.updateSeedsJson}
      ></textarea>
    `;
  }

  private updateSeedsJson(e: any) {
    const textarea = e.target;
    const text = textarea.value;

    try {
      const json = JSON.parse(text);

      this.seedsJson = JSON.stringify(json, null, 2);
      this.invalidSeedsJsonMessage = "";

      textarea.setCustomValidity("");
      textarea.reportValidity();
    } catch (e: any) {
      this.invalidSeedsJsonMessage = e.message
        ? msg(str`JSON is invalid: ${e.message.replace("JSON.parse: ", "")}`)
        : msg("JSON is invalid.");
    }
  }

  async getCrawlTemplate(): Promise<CrawlTemplate> {
    const data: CrawlTemplate = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs/${this.crawlConfigId}`,
      this.authState!
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig() {
    if (!this.crawlTemplate) return;

    const config: CrawlTemplate["config"] = {
      seeds: this.crawlTemplate.config.seeds,
      scopeType: this.crawlTemplate.config.scopeType,
      limit: this.crawlTemplate.config.limit,
    };

    this.navTo(`/archives/${this.archiveId}/crawl-templates/new`, {
      crawlTemplate: {
        name: msg(str`${this.crawlTemplate.name} Copy`),
        config,
      },
    });

    this.notify({
      message: msg(str`Copied crawl configuration to new template.`),
      type: "success",
      icon: "check2-circle",
    });
  }

  private async handleSubmitEditName(e: { detail: { formData: FormData } }) {
    const { formData } = e.detail;
    const name = formData.get("name") as string;

    await this.updateTemplate({ name });

    this.openDialogName = undefined;
  }

  private async handleSubmitEditConfiguration(e: {
    detail: { formData: FormData };
  }) {
    const { formData } = e.detail;
    const configValue = formData.get("config") as string;
    let config: CrawlConfig;

    if (configValue) {
      if (this.invalidSeedsJsonMessage) return;

      config = JSON.parse(configValue) as CrawlConfig;
    } else {
      const pageLimit = formData.get("limit") as string;
      const seedUrlsStr = formData.get("seedUrls") as string;

      config = {
        seeds: seedUrlsStr.trim().replace(/,/g, " ").split(/\s+/g),
        scopeType: formData.get("scopeType") as string,
        limit: pageLimit ? +pageLimit : 0,
        extraHops: formData.get("extraHopsOne") ? 1 : 0,
      };
    }

    if (config) {
      await this.createRevisedTemplate(config);
    }

    this.openDialogName = undefined;
  }

  private async handleSubmitEditSchedule(e: {
    detail: { formData: FormData };
  }) {
    const { formData } = e.detail;
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

    await this.updateTemplate({ schedule });

    this.openDialogName = undefined;
  }

  private async deactivateTemplate(): Promise<void> {
    if (!this.crawlTemplate) return;

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${this.crawlTemplate.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.notify({
        message: msg(
          html`Deactivated <strong>${this.crawlTemplate.name}</strong>.`
        ),
        type: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't deactivate crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteTemplate(): Promise<void> {
    if (!this.crawlTemplate) return;

    const isDeactivating = this.crawlTemplate.crawlCount > 0;

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${this.crawlTemplate.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.navTo(`/archives/${this.archiveId}/crawl-templates`);

      this.notify({
        message: isDeactivating
          ? msg(html`Deactivated <strong>${this.crawlTemplate.name}</strong>.`)
          : msg(html`Deleted <strong>${this.crawlTemplate.name}</strong>.`),
        type: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: isDeactivating
          ? msg("Sorry, couldn't deactivate crawl template at this time.")
          : msg("Sorry, couldn't delete crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async runNow(): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${
          this.crawlTemplate!.id
        }/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      const crawlId = data.started;

      this.crawlTemplate = {
        ...this.crawlTemplate,
        currCrawlId: crawlId,
      } as CrawlTemplate;

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.crawlTemplate!.name}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/archives/${this.archiveId}/crawls/crawl/${data.started}"
              @click=${this.navLink.bind(this)}
              >View crawl</a
            >`
        ),
        type: "success",
        icon: "check2-circle",
        duration: 8000,
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't run crawl at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  /**
   * Create new crawl template with revised crawl configuration
   * @param config Crawl config object
   */
  private async createRevisedTemplate(config: CrawlConfig) {
    this.isSubmittingUpdate = true;

    const params = {
      oldId: this.crawlTemplate!.id,
      name: this.crawlTemplate!.name,
      schedule: this.crawlTemplate!.schedule,
      // runNow: this.crawlTemplate!.runNow,
      // crawlTimeout: this.crawlTemplate!.crawlTimeout,
      config,
    };

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      console.log(data);

      this.navTo(
        `/archives/${this.archiveId}/crawl-templates/config/${data.added}`
      );

      this.notify({
        message: msg("Crawl template updated."),
        type: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      console.error(e);

      this.notify({
        message: msg("Something went wrong, couldn't update crawl template."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  /**
   * Update crawl template properties
   * @param params Crawl template properties to update
   */
  private async updateTemplate(params: Partial<CrawlTemplate>): Promise<void> {
    console.log(params);

    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${this.crawlTemplate!.id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        }
      );

      if (data.success === true) {
        this.crawlTemplate = {
          ...this.crawlTemplate!,
          ...params,
        };

        this.notify({
          message: msg("Successfully saved changes."),
          type: "success",
          icon: "check2-circle",
        });
      } else {
        throw data;
      }
    } catch (e: any) {
      console.error(e);

      this.notify({
        message: msg("Something went wrong, couldn't update crawl template."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}

customElements.define("btrix-crawl-templates-detail", CrawlTemplatesDetail);
