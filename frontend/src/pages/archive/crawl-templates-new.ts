import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import cronParser from "cron-parser";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { getLocaleTimeZone } from "../../utils/localization";
import type { CrawlConfig } from "./types";
import { getUTCSchedule } from "./utils";

export type NewCrawlTemplate = {
  id?: string;
  name: string;
  schedule: string;
  runNow: boolean;
  crawlTimeout?: number;
  config: CrawlConfig;
};

const initialValues = {
  name: "",
  runNow: true,
  config: {
    seeds: [],
    scopeType: "prefix",
  },
};
const hours = Array.from({ length: 12 }).map((x, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}));
const minutes = Array.from({ length: 60 }).map((x, i) => ({
  value: i,
  label: `${i}`.padStart(2, "0"),
}));

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-new></btrix-crawl-templates-new>
 * ```
 */
@localized()
export class CrawlTemplatesNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: Object })
  initialCrawlTemplate?: {
    name: string;
    config: CrawlConfig;
  };

  @state()
  private isRunNow: boolean = initialValues.runNow;

  @state()
  private scheduleInterval: "" | "daily" | "weekly" | "monthly" = "weekly";

  /** Schedule local time */
  @state()
  private scheduleTime: { hour: number; minute: number; period: "AM" | "PM" } =
    {
      hour: new Date().getHours() % 12 || 12,
      minute: 0,
      period: new Date().getHours() > 11 ? "PM" : "AM",
    };

  @state()
  private isSeedsJsonView: boolean = false;

  @state()
  private seedsJson: string = "";

  @state()
  private invalidSeedsJsonMessage: string = "";

  @state()
  private isSubmitting: boolean = false;

  @state()
  private serverError?: string;

  private get timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  private get timeZoneShortName() {
    return getLocaleTimeZone();
  }

  private get formattededNextCrawlDate() {
    const utcSchedule = this.getUTCSchedule();

    return this.scheduleInterval
      ? html`<sl-format-date
          date="${cronParser
            .parseExpression(utcSchedule, {
              utc: true,
            })
            .next()
            .toString()}"
          weekday="long"
          month="long"
          day="numeric"
          year="numeric"
          hour="numeric"
          minute="numeric"
          time-zone-name="short"
          time-zone=${this.timeZone}
        ></sl-format-date>`
      : undefined;
  }

  connectedCallback(): void {
    // Show JSON editor view if complex initial config is specified
    // (e.g. cloning a template) since form UI doesn't support
    // all available fields in the config
    const isComplexConfig = this.initialCrawlTemplate?.config.seeds.some(
      (seed: any) => typeof seed !== "string"
    );
    if (isComplexConfig) {
      this.isSeedsJsonView = true;
    }
    this.initialCrawlTemplate = {
      name: this.initialCrawlTemplate?.name || initialValues.name,
      config: {
        ...initialValues.config,
        ...this.initialCrawlTemplate?.config,
      },
    };
    this.seedsJson = JSON.stringify(this.initialCrawlTemplate.config, null, 2);
    super.connectedCallback();
  }

  render() {
    return html`
      <h2 class="text-xl font-bold mb-3">${msg("New Crawl Template")}</h2>
      <p>
        ${msg(
          "Configure a new crawl template. You can choose to run a crawl immediately upon saving this template."
        )}
      </p>

      <main class="mt-6">
        <div class="border rounded-lg">
          <sl-form @sl-submit=${this.onSubmit} aria-describedby="formError">
            <div class="md:grid grid-cols-3">
              ${this.renderBasicSettings()} ${this.renderCrawlConfigSettings()}
              ${this.renderScheduleSettings()}
            </div>

            <div class="p-4 md:p-8 text-center grid gap-5">
              ${this.serverError
                ? html`<btrix-alert id="formError" type="danger"
                    >${this.serverError}</btrix-alert
                  >`
                : ""}

              <div>
                <sl-button
                  type="primary"
                  submit
                  ?loading=${this.isSubmitting}
                  ?disabled=${this.isSubmitting}
                  >${msg("Save Crawl Template")}</sl-button
                >
              </div>

              ${this.isRunNow || this.scheduleInterval
                ? html`<div class="text-sm text-gray-500">
                    ${this.isRunNow
                      ? html`
                          <p class="mb-2">
                            ${msg("A crawl will start immediately on save.")}
                          </p>
                        `
                      : ""}
                    ${this.scheduleInterval
                      ? html`
                          <p class="mb-2">
                            ${msg(
                              html`Scheduled crawl will run
                              ${this.formattededNextCrawlDate}.`
                            )}
                          </p>
                        `
                      : ""}
                  </div>`
                : ""}
            </div>
          </sl-form>
        </div>
      </main>
    `;
  }

  private renderBasicSettings() {
    return html`
      <div class="col-span-1 p-4 md:p-8 md:border-b">
        <h3 class="font-medium">${msg("Basic Settings")}</h3>
      </div>
      <section class="col-span-2 p-4 md:p-8 border-b grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          help-text=${msg(
            "Required. Name your template to easily identify it later."
          )}
          placeholder=${msg("Example (example.com) Weekly Crawl", {
            desc: "Example crawl template name",
          })}
          autocomplete="off"
          value=${this.initialCrawlTemplate!.name}
          required
        ></sl-input>
      </section>
    `;
  }

  private renderScheduleSettings() {
    return html`
      <div class="col-span-1 p-4 md:p-8 md:border-b">
        <h3 class="font-medium">${msg("Crawl Schedule")}</h3>
      </div>
      <section class="col-span-2 p-4 md:p-8 border-b grid gap-5">
        <div>
          <div class="flex items-end">
            <div class="pr-2 flex-1">
              <sl-select
                name="schedule"
                label=${msg("Recurring Crawls")}
                value=${this.scheduleInterval}
                @sl-select=${(e: any) =>
                  (this.scheduleInterval = e.target.value)}
              >
                <sl-menu-item value="">${msg("None")}</sl-menu-item>
                <sl-menu-item value="daily">${msg("Daily")}</sl-menu-item>
                <sl-menu-item value="weekly">${msg("Weekly")}</sl-menu-item>
                <sl-menu-item value="monthly">${msg("Monthly")}</sl-menu-item>
              </sl-select>
            </div>
          </div>
          <div class="flex items-center mt-2">
            <span class="px-3">${msg("At")}</span>
            <sl-select
              name="scheduleHour"
              value=${this.scheduleTime.hour}
              ?disabled=${!this.scheduleInterval}
              @sl-select=${(e: any) =>
                (this.scheduleTime = {
                  ...this.scheduleTime,
                  hour: +e.target.value,
                })}
            >
              ${hours.map(
                ({ value, label }) =>
                  html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
              )}
            </sl-select>
            <span class="px-1">:</span>
            <sl-select
              name="scheduleMinute"
              class="mr-2"
              value=${this.scheduleTime.minute}
              ?disabled=${!this.scheduleInterval}
              @sl-select=${(e: any) =>
                (this.scheduleTime = {
                  ...this.scheduleTime,
                  minute: +e.target.value,
                })}
            >
              ${minutes.map(
                ({ value, label }) =>
                  html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
              )}
            </sl-select>
            <sl-select
              value=${this.scheduleTime.period}
              ?disabled=${!this.scheduleInterval}
              @sl-select=${(e: any) =>
                (this.scheduleTime = {
                  ...this.scheduleTime,
                  period: e.target.value,
                })}
            >
              <sl-menu-item value="AM"
                >${msg("AM", { desc: "Time AM/PM" })}</sl-menu-item
              >
              <sl-menu-item value="PM"
                >${msg("PM", { desc: "Time AM/PM" })}</sl-menu-item
              >
            </sl-select>
            <span class="px-3">${this.timeZoneShortName}</span>
          </div>
          <div class="text-sm text-gray-500 mt-2">
            ${this.formattededNextCrawlDate
              ? msg(
                  html`Next scheduled crawl: ${this.formattededNextCrawlDate}`
                )
              : msg("No crawls scheduled")}
          </div>
        </div>

        <sl-checkbox
          name="runNow"
          ?checked=${initialValues.runNow}
          @sl-change=${(e: any) => (this.isRunNow = e.target.checked)}
          >${msg("Run immediately on save")}
        </sl-checkbox>

        <sl-input
          name="crawlTimeoutMinutes"
          label=${msg("Time Limit")}
          placeholder=${msg("unlimited")}
          type="number"
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      </section>
    `;
  }

  private renderCrawlConfigSettings() {
    return html`
      <div class="col-span-1 p-4 md:p-8 md:border-b">
        <h3 class="font-medium">${msg("Crawl Configuration")}</h3>
      </div>
      <section class="col-span-2 p-4 md:p-8 border-b grid gap-5">
        <div class="flex justify-between">
          <h4 class="font-medium">
            ${this.isSeedsJsonView
              ? msg("Custom Config")
              : msg("Configure Seeds")}
          </h4>
          <sl-switch
            ?checked=${this.isSeedsJsonView}
            @sl-change=${(e: any) => (this.isSeedsJsonView = e.target.checked)}
          >
            <span class="text-sm">${msg("Use JSON Editor")}</span>
          </sl-switch>
        </div>

        ${this.isSeedsJsonView
          ? this.renderSeedsJson()
          : this.renderSeedsForm()}
      </section>
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
        value=${this.initialCrawlTemplate!.config.seeds.join("\n")}
        required
      ></sl-textarea>
      <sl-select
        name="scopeType"
        label=${msg("Crawl Scope")}
        value=${this.initialCrawlTemplate!.config.scopeType!}
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
        value=${ifDefined(this.initialCrawlTemplate!.config.limit)}
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

  private parseTemplate(formData: FormData) {
    const crawlTimeoutMinutes = formData.get("crawlTimeoutMinutes");
    const pageLimit = formData.get("limit");
    const seedUrlsStr = formData.get("seedUrls");
    const template: Partial<NewCrawlTemplate> = {
      name: formData.get("name") as string,
      schedule: this.getUTCSchedule(),
      runNow: this.isRunNow,
      crawlTimeout: crawlTimeoutMinutes ? +crawlTimeoutMinutes * 60 : 0,
    };

    if (this.isSeedsJsonView) {
      template.config = JSON.parse(this.seedsJson);
    } else {
      template.config = {
        seeds: (seedUrlsStr as string).trim().replace(/,/g, " ").split(/\s+/g),
        scopeType: formData.get("scopeType") as string,
        limit: pageLimit ? +pageLimit : 0,
        extraHops: formData.get("extraHopsOne") ? 1 : 0,
      };
    }

    return template;
  }

  private async onSubmit(event: {
    detail: { formData: FormData };
    target: any;
  }) {
    if (!this.authState) return;

    if (this.isSeedsJsonView && this.invalidSeedsJsonMessage) {
      // Check JSON validity
      const jsonEditor = event.target.querySelector("#json-editor");

      jsonEditor.setCustomValidity(msg("Please correct JSON errors."));
      jsonEditor.reportValidity();

      return;
    }

    const params = this.parseTemplate(event.detail.formData);

    console.log(params);

    this.serverError = undefined;
    this.isSubmitting = true;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      this.notify({
        message: data.run_now_job
          ? msg(
              str`Crawl running with new template. <br /><a class="underline hover:no-underline" href="/archives/${this.archiveId}/crawls/${data.run_now_job}">View crawl</a>`
            )
          : msg("Crawl template created."),
        type: "success",
        icon: "check2-circle",
        duration: 10000,
      });

      this.navTo(`/archives/${this.archiveId}/crawl-templates`);
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  private getUTCSchedule(): string {
    if (!this.scheduleInterval) {
      return "";
    }
    const { minute, hour, period } = this.scheduleTime;

    return getUTCSchedule({
      interval: this.scheduleInterval,
      hour,
      minute,
      period,
    });
  }
}

customElements.define("btrix-crawl-templates-new", CrawlTemplatesNew);
