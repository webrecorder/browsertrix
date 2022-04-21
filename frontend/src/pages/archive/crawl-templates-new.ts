import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import cronParser from "cron-parser";
import { parse as yamlToJson, stringify as jsonToYaml } from "yaml";
import orderBy from "lodash/fp/orderBy";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { getLocaleTimeZone } from "../../utils/localization";
import type { CrawlConfig, Profile } from "./types";
import { getUTCSchedule } from "./utils";

export type NewCrawlTemplate = {
  id?: string;
  name: string;
  schedule: string;
  runNow: boolean;
  crawlTimeout?: number;
  scale: number;
  config: CrawlConfig;
  profileid: string;
};

const initialValues = {
  name: "",
  runNow: true,
  scale: "1",
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
  private scheduleInterval: "" | "daily" | "weekly" | "monthly" = "";

  /** Schedule local time */
  @state()
  private scheduleTime: { hour: number; minute: number; period: "AM" | "PM" } =
    {
      hour: new Date().getHours() % 12 || 12,
      minute: 0,
      period: new Date().getHours() > 11 ? "PM" : "AM",
    };

  @state()
  private isConfigCodeView: boolean = false;

  /** YAML or stringified JSON config */
  @state()
  private configCode: string = "";

  @state()
  private isSubmitting: boolean = false;

  @state()
  private serverError?: string;

  @state()
  browserProfiles?: Profile[];

  @state()
  selectedProfile?: Profile;

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
      this.isConfigCodeView = true;
    }
    this.initialCrawlTemplate = {
      name: this.initialCrawlTemplate?.name || initialValues.name,
      config: {
        ...initialValues.config,
        ...this.initialCrawlTemplate?.config,
      },
    };
    this.configCode = jsonToYaml(this.initialCrawlTemplate.config);
    super.connectedCallback();
  }

  protected firstUpdated() {
    this.fetchBrowserProfiles();
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

      <h2 class="text-xl font-medium mb-3">${msg("New Crawl Template")}</h2>
      <p class="text-neutral-500 text-sm">
        ${msg(
          "Configure a new crawl template. You can choose to run a crawl immediately upon saving this template."
        )}
      </p>

      <main class="mt-6">
        <div class="md:border md:rounded-lg">
          <sl-form @sl-submit=${this.onSubmit} aria-describedby="formError">
            <div class="grid grid-cols-3">
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
      <div class="col-span-3 md:col-span-1 py-2 md:p-8 md:border-b">
        <h3 class="font-medium">${msg("Basic Settings")}</h3>
      </div>
      <section class="col-span-3 md:col-span-2 pb-6 md:p-8 border-b grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          help-text=${msg("Name your template to easily identify it later.")}
          placeholder=${msg("Example (example.com) Weekly Crawl", {
            desc: "Example crawl template name",
          })}
          autocomplete="off"
          value=${this.initialCrawlTemplate!.name}
          required
        ></sl-input>

        <div>
          <sl-select
            label=${msg("Browser Profile")}
            clearable
            value=${this.selectedProfile?.id || ""}
            ?disabled=${!this.browserProfiles?.length}
            @sl-change=${(e: any) =>
              (this.selectedProfile = this.browserProfiles?.find(
                ({ id }) => id === e.target.value
              ))}
            @sl-focus=${() => {
              // Refetch to keep list up to date
              this.fetchBrowserProfiles();
            }}
          >
            ${this.browserProfiles
              ? ""
              : html` <sl-spinner slot="prefix"></sl-spinner> `}
            ${this.browserProfiles?.map(
              (profile) => html`
                <sl-menu-item value=${profile.id}>
                  ${profile.name}
                  <div slot="suffix">
                    <div class="text-xs">
                      <sl-format-date
                        date=${`${profile.created}Z` /** Z for UTC */}
                        month="2-digit"
                        day="2-digit"
                        year="2-digit"
                      ></sl-format-date>
                    </div></div
                ></sl-menu-item>
              `
            )}
          </sl-select>

          ${this.browserProfiles && !this.browserProfiles.length
            ? html`
                <div class="mt-2 text-sm text-neutral-500">
                  <span class="inline-block align-middle"
                    >${msg("No browser profiles found.")}</span
                  >
                  <a
                    href=${`/archives/${this.archiveId}/browser-profiles/new`}
                    class="font-medium text-primary hover:text-indigo-500"
                    target="_blank"
                    ><span class="inline-block align-middle"
                      >${msg("Create a browser profile")}</span
                    >
                    <sl-icon
                      class="inline-block align-middle"
                      name="box-arrow-up-right"
                    ></sl-icon
                  ></a>
                </div>
              `
            : ""}
          ${this.selectedProfile
            ? html`
                <div
                  class="mt-2 border bg-slate-50 border-slate-100 rounded p-2 text-sm flex justify-between"
                >
                  ${this.selectedProfile.description
                    ? html`<em class="text-slate-500"
                        >${this.selectedProfile.description}</em
                      >`
                    : ""}
                  <a
                    href=${`/archives/${this.archiveId}/browser-profiles/profile/${this.selectedProfile.id}`}
                    class="font-medium text-primary hover:text-indigo-500"
                    target="_blank"
                  >
                    <span class="inline-block align-middle mr-1"
                      >${msg("View profile")}</span
                    >
                    <sl-icon
                      class="inline-block align-middle"
                      name="box-arrow-up-right"
                    ></sl-icon>
                  </a>
                </div>
              `
            : ""}
        </div>
      </section>
    `;
  }

  private renderScheduleSettings() {
    return html`
      <div class="col-span-3 md:col-span-1 py-2 md:p-8 md:border-b">
        <h3 class="font-medium">${msg("Crawl Schedule")}</h3>
      </div>
      <section class="col-span-3 md:col-span-2 pb-6 md:p-8 border-b grid gap-5">
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
          <fieldset class="mt-2">
            <label class="text-sm">${msg("Time")} </label>
            <div class="flex items-center">
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
              <sl-button-group>
                <sl-button
                  type=${this.scheduleTime.period === "AM"
                    ? "neutral"
                    : "default"}
                  aria-selected=${this.scheduleTime.period === "AM"}
                  ?disabled=${!this.scheduleInterval}
                  @click=${() =>
                    (this.scheduleTime = {
                      ...this.scheduleTime,
                      period: "AM",
                    })}
                  >${msg("AM", { desc: "Time AM/PM" })}</sl-button
                >
                <sl-button
                  type=${this.scheduleTime.period === "PM"
                    ? "neutral"
                    : "default"}
                  aria-selected=${this.scheduleTime.period === "PM"}
                  ?disabled=${!this.scheduleInterval}
                  @click=${() =>
                    (this.scheduleTime = {
                      ...this.scheduleTime,
                      period: "PM",
                    })}
                  >${msg("PM", { desc: "Time AM/PM" })}</sl-button
                >
              </sl-button-group>
            </div>
          </fieldset>
          <div class="text-sm text-neutral-500 mt-2">
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
      <div class="col-span-3 md:col-span-1 py-2 md:p-8 md:border-b">
        <h3 class="font-medium">${msg("Crawl Settings")}</h3>
      </div>
      <section
        class="col-span-3 md:col-span-2 pb-6 md:p-8 border-b grid grid-cols-1 gap-5"
      >
        <div class="col-span-1">
          <sl-select
            name="scale"
            label=${msg("Crawl Scale")}
            value=${initialValues.scale}
          >
            <sl-menu-item value="1">${msg("Standard")}</sl-menu-item>
            <sl-menu-item value="2">${msg("Big (2x)")}</sl-menu-item>
            <sl-menu-item value="3">${msg("Bigger (3x)")}</sl-menu-item>
          </sl-select>
        </div>
        <div class="col-span-1 flex justify-between">
          <h4 class="font-medium">
            ${this.isConfigCodeView
              ? msg("Custom Config")
              : msg("Crawl Configuration")}
          </h4>
          <sl-switch
            ?checked=${this.isConfigCodeView}
            @sl-change=${(e: any) => (this.isConfigCodeView = e.target.checked)}
          >
            <span class="text-sm">${msg("Advanced Editor")}</span>
          </sl-switch>
        </div>

        <div class="col-span-1${this.isConfigCodeView ? "" : " hidden"}">
          ${this.renderSeedsCodeEditor()}
        </div>
        <div
          class="col-span-1 grid gap-5${this.isConfigCodeView ? " hidden" : ""}"
        >
          ${this.renderSeedsForm()}
        </div>
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
        ?required=${!this.isConfigCodeView}
      ></sl-textarea>
      <sl-select
        name="scopeType"
        label=${msg("Scope Type")}
        value=${this.initialCrawlTemplate!.config.scopeType!}
      >
        <sl-menu-item value="page">Page</sl-menu-item>
        <sl-menu-item value="page-spa">Page SPA</sl-menu-item>
        <sl-menu-item value="prefix">Prefix</sl-menu-item>
        <sl-menu-item value="host">Host</sl-menu-item>
        <sl-menu-item value="domain">Domain</sl-menu-item>
        <sl-menu-item value="any">Any</sl-menu-item>
      </sl-select>

      <sl-checkbox
        name="extraHopsOne"
        ?checked=${this.initialCrawlTemplate!.config.extraHops === 1}
        >${msg("Include External Links (“one hop out”)")}
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

  private renderSeedsCodeEditor() {
    return html`
      <div class="grid grid-cols-1 gap-4">
        <div class="col-span-1">
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

        <btrix-config-editor
          class="col-span-1"
          value=${this.configCode}
          @on-change=${(e: any) => {
            this.configCode = e.detail.value;
          }}
        ></btrix-config-editor>
      </div>
    `;
  }

  private parseTemplate(formData: FormData) {
    const crawlTimeoutMinutes = formData.get("crawlTimeoutMinutes");
    const pageLimit = formData.get("limit");
    const seedUrlsStr = formData.get("seedUrls");
    const scale = formData.get("scale") as string;
    const template: Partial<NewCrawlTemplate> = {
      name: formData.get("name") as string,
      schedule: this.getUTCSchedule(),
      runNow: this.isRunNow,
      crawlTimeout: crawlTimeoutMinutes ? +crawlTimeoutMinutes * 60 : 0,
      scale: +scale,
      profileid: this.selectedProfile?.id,
    };

    if (this.isConfigCodeView) {
      template.config = yamlToJson(this.configCode) as CrawlConfig;
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

    const params = this.parseTemplate(event.detail.formData);

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

      const crawlId = data.run_now_job;

      this.notify({
        message: crawlId
          ? msg("Crawl started with new template.")
          : msg("Crawl template created."),
        type: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      if (crawlId) {
        this.navTo(`/archives/${this.archiveId}/crawls/crawl/${crawlId}`);
      } else {
        this.navTo(
          `/archives/${this.archiveId}/crawl-templates/config/${data.added}`
        );
      }
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

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowserProfiles(): Promise<void> {
    try {
      const data = await this.getProfiles();

      this.browserProfiles = orderBy(["name", "created"])(["asc", "desc"])(
        data
      ) as Profile[];
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfiles(): Promise<Profile[]> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/profiles`,
      this.authState!
    );

    return data;
  }
}

customElements.define("btrix-crawl-templates-new", CrawlTemplatesNew);
