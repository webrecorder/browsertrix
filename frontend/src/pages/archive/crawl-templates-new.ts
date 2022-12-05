import type { TemplateResult, LitElement } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { parse as yamlToJson, stringify as jsonToYaml } from "yaml";
import compact from "lodash/fp/compact";
import merge from "lodash/fp/merge";
import flow from "lodash/fp/flow";
import uniq from "lodash/fp/uniq";

import type {
  ExclusionRemoveEvent,
  ExclusionChangeEvent,
} from "../../components/queue-exclusion-table";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { ScheduleInterval, humanizeNextDate } from "../../utils/cron";
import type { SeedConfig, Profile } from "./types";
import { getUTCSchedule } from "../../utils/cron";
import type { JobType, InitialJobConfig } from "./new-crawl-config";
import "./new-crawl-config";
import seededCrawlSvg from "../../assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-crawl-config_URL-List.svg";

const NEW_JOB_CONFIG = true;

type NewCrawlTemplate = {
  id?: string;
  name: string;
  schedule: string;
  runNow: boolean;
  crawlTimeout?: number;
  scale: number;
  config: Pick<
    SeedConfig,
    "seeds" | "scopeType" | "limit" | "extraHops" | "exclude" | "lang"
  >;
  profileid: string | null;
};

export type InitialCrawlTemplate = InitialJobConfig;

const initialJobType: JobType | undefined = undefined;
const defaultValue = {
  name: "",
  profileid: null,
  config: {
    seeds: [],
    scopeType: "prefix",
    exclude: [""],
  },
} as InitialCrawlTemplate;
const hours = Array.from({ length: 12 }).map((x, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}));
const minutes = Array.from({ length: 60 }).map((x, i) => ({
  value: i,
  label: `${i}`.padStart(2, "0"),
}));

const trimExclusions = flow(uniq, compact);

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

  // Use custom property accessor to prevent
  // overriding default crawl config values
  @property({ type: Object })
  get initialCrawlTemplate() {
    return this._initialCrawlTemplate;
  }
  private _initialCrawlTemplate: InitialCrawlTemplate = defaultValue;
  set initialCrawlTemplate(val: any) {
    this._initialCrawlTemplate = merge(this._initialCrawlTemplate, val);
  }

  @state()
  private jobType?: JobType = initialJobType;

  @state()
  private isRunNow: boolean = true;

  @state()
  private scheduleInterval: ScheduleInterval | "" = "";

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
  private exclusions: SeedConfig["exclude"] = defaultValue.config.exclude;

  private browserLanguage: SeedConfig["lang"] = null;

  @state()
  private isSubmitting: boolean = false;

  @state()
  private browserProfileId?: string | null;

  @state()
  private serverError?: TemplateResult | string;

  @state()
  private exclusionFieldErrorMessage?: string;

  private get formattededNextCrawlDate() {
    const utcSchedule = this.getUTCSchedule();

    return this.scheduleInterval ? humanizeNextDate(utcSchedule) : undefined;
  }

  connectedCallback(): void {
    // Show JSON editor view if complex initial config is specified
    // (e.g. cloning a template) since form UI doesn't support
    // all available fields in the config
    const isComplexConfig = this.initialCrawlTemplate.config.seeds.some(
      (seed: any) => typeof seed !== "string"
    );
    if (isComplexConfig) {
      this.isConfigCodeView = true;
    }
    this.configCode = jsonToYaml(this.initialCrawlTemplate.config);
    if (this.initialCrawlTemplate.config.exclude?.length) {
      this.exclusions = this.initialCrawlTemplate.config.exclude;
    }
    this.browserProfileId = this.initialCrawlTemplate.profileid;
    // Default to current user browser language
    const browserLanguage = window.navigator.language;
    if (browserLanguage) {
      this.browserLanguage = browserLanguage.slice(
        0,
        browserLanguage.indexOf("-")
      );
    }

    super.connectedCallback();
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.get("isConfigCodeView") !== undefined) {
      if (this.isConfigCodeView) {
        this.configCode = jsonToYaml(
          merge(this.initialCrawlTemplate.config, {
            exclude: trimExclusions(this.exclusions),
          })
        );
      } else if (this.isConfigCodeView === false) {
        const exclude = (yamlToJson(this.configCode) as SeedConfig).exclude;
        this.exclusions = exclude?.length
          ? exclude
          : defaultValue.config.exclude;
      }
    }
  }

  private renderHeader() {
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
            >${msg("Back to Crawl Configs")}</span
          >
        </a>
      </nav>
    `;
  }

  render() {
    if (NEW_JOB_CONFIG) {
      const jobTypeLabels: Record<JobType, string> = {
        urlList: msg("URL List"),
        seeded: msg("Seeded Crawl"),
      };

      // TODO get job type from API if duplicating
      const jobType =
        this.jobType || (this.initialCrawlTemplate.name ? "urlList" : null);

      if (jobType) {
        return html`
          ${this.renderHeader()}
          <h2 class="text-xl font-medium mb-6">
            ${msg(html`New Crawl Config &mdash; ${jobTypeLabels[jobType]}`)}
          </h2>
          <btrix-new-crawl-config
            .initialJobConfig=${this.initialCrawlTemplate}
            jobType=${jobType}
            archiveId=${this.archiveId}
            .authState=${this.authState}
            @reset=${async (e: Event) => {
              await (e.target as LitElement).updateComplete;
              this.jobType = undefined;
            }}
          ></btrix-new-crawl-config>
        `;
      }

      return html`
        ${this.renderHeader()}
        <h2 class="text-xl font-medium mb-6">${msg("New Crawl Config")}</h2>
        ${this.renderChooseJobType()}
      `;
    }
    return html`
      ${this.renderHeader()}

      <p class="text-neutral-500 text-sm">
        ${msg(
          "Configure a new crawl config. You can choose to run a crawl immediately upon saving this template."
        )}
      </p>
      <main class="mt-6">
        <div class="md:border md:rounded-lg">
          <form @submit=${this.onSubmit} aria-describedby="formError">
            <div class="grid grid-cols-3">
              ${this.renderBasicSettings()} ${this.renderCrawlConfigSettings()}
              ${this.renderScheduleSettings()}
            </div>

            <div class="p-4 md:p-8 text-center grid gap-5">
              <div>
                <sl-checkbox
                  name="runNow"
                  ?checked=${this.isRunNow}
                  @sl-change=${(e: any) => (this.isRunNow = e.target.checked)}
                  >${msg("Run immediately on save")}
                </sl-checkbox>
              </div>

              ${this.serverError
                ? html`<btrix-alert id="formError" variant="danger"
                    >${this.serverError}</btrix-alert
                  >`
                : ""}

              <div>
                <sl-button
                  variant="primary"
                  type="submit"
                  ?loading=${this.isSubmitting}
                  ?disabled=${this.isSubmitting}
                  >${this.isRunNow
                    ? msg("Save & Run Template")
                    : msg("Save Template")}</sl-button
                >
              </div>
            </div>
          </form>
        </div>
      </main>
    `;
  }

  private renderChooseJobType() {
    return html`
      <style>
        .jobTypeButton:hover img {
          transform: scale(1.05);
        }
      </style>
      <h3 class="text-lg font-medium mb-3">${msg("Choose Crawl Type")}</h3>
      <div
        class="border rounded p-8 md:py-12 flex flex-col md:flex-row items-start justify-evenly"
      >
        <div
          role="button"
          class="jobTypeButton"
          @click=${() => (this.jobType = "urlList")}
        >
          <figure class="w-64 m-4">
            <img class="transition-transform" src=${urlListSvg} />
            <figcaption>
              <div class="text-lg font-medium my-3">${msg("URL List")}</div>
              <p class="text-sm text-neutral-500">
                ${msg(
                  "The crawler visits every URL you tell it to and optionally every URL linked on those pages."
                )}
              </p>
            </figcaption>
          </figure>
        </div>
        <div
          role="button"
          class="jobTypeButton"
          @click=${() => (this.jobType = "seeded")}
        >
          <figure class="w-64 m-4">
            <img class="transition-transform" src=${seededCrawlSvg} />
            <figcaption>
              <div class="text-lg font-medium my-3">${msg("Seeded Crawl")}</div>
              <p class="text-sm text-neutral-500">
                ${msg(
                  "The crawler automatically finds new pages and archives them."
                )}
              </p>
            </figcaption>
          </figure>
        </div>
      </div>
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
            desc: "Example crawl config name",
          })}
          autocomplete="off"
          value=${this.initialCrawlTemplate.name}
          required
        ></sl-input>

        <div>
          <btrix-select-browser-profile
            archiveId=${this.archiveId}
            .profileId=${this.initialCrawlTemplate.profileid}
            .authState=${this.authState}
            @on-change=${(e: any) =>
              (this.browserProfileId = e.detail.value
                ? e.detail.value.id
                : null)}
          ></btrix-select-browser-profile>
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
              <sl-radio-group value=${this.scheduleTime.period}>
                <sl-radio-button
                  value="AM"
                  ?disabled=${!this.scheduleInterval}
                  @click=${() =>
                    (this.scheduleTime = {
                      ...this.scheduleTime,
                      period: "AM",
                    })}
                  >${msg("AM", { desc: "Time AM/PM" })}</sl-radio-button
                >
                <sl-radio-button
                  value="PM"
                  ?disabled=${!this.scheduleInterval}
                  @click=${() =>
                    (this.scheduleTime = {
                      ...this.scheduleTime,
                      period: "PM",
                    })}
                  >${msg("PM", { desc: "Time AM/PM" })}</sl-radio-button
                >
              </sl-radio-group>
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

        <sl-input
          name="crawlTimeoutMinutes"
          label=${msg("Time Limit")}
          placeholder=${msg("Unlimited")}
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
          <sl-select name="scale" value="1">
            <div slot="label">
              <span class="inline-block align-middle">
                ${msg("Crawler Instances")}
              </span>
              <sl-tooltip
                content=${msg(
                  "The number of crawler instances that will run in parallel for this crawl."
                )}
                ><sl-icon
                  class="inline-block align-middle ml-1 text-neutral-500"
                  name="info-circle"
                ></sl-icon
              ></sl-tooltip>
            </div>
            <sl-menu-item value="1">${msg("1")}</sl-menu-item>
            <sl-menu-item value="2">${msg("2")}</sl-menu-item>
            <sl-menu-item value="3">${msg("3")}</sl-menu-item>
          </sl-select>
        </div>
        <div class="col-span-1">
          <btrix-language-select
            .value=${this.browserLanguage}
            @sl-select=${(e: CustomEvent) =>
              (this.browserLanguage = e.detail.item.value)}
            @sl-clear=${() => (this.browserLanguage = null)}
          >
            <div slot="label">
              <span class="inline-block align-middle">
                ${msg("Language")}
              </span>
              <sl-tooltip
                content=${msg(
                  "The browser language setting used when crawling."
                )}
                ><sl-icon
                  class="inline-block align-middle ml-1 text-neutral-500"
                  name="info-circle"
                ></sl-icon
              ></sl-tooltip>
            </div>
          </btrix-language-select>
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
          <div>${this.renderExclusionEditor()}</div>
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
        value=${this.initialCrawlTemplate.config.seeds.join("\n")}
        ?required=${!this.isConfigCodeView}
      ></sl-textarea>
      <sl-select
        name="scopeType"
        label=${msg("Scope Type")}
        value=${this.initialCrawlTemplate.config.scopeType!}
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
        ?checked=${this.initialCrawlTemplate.config.extraHops === 1}
        >${msg("Include External Links (“one hop out”)")}
      </sl-checkbox>
      <sl-input
        name="limit"
        label=${msg("Page Limit")}
        type="number"
        value=${ifDefined(this.initialCrawlTemplate.config.limit)}
        placeholder=${msg("Unlimited")}
      >
        <span slot="suffix">${msg("pages")}</span>
      </sl-input>
    `;
  }

  private renderExclusionEditor() {
    if (!this.initialCrawlTemplate.config) {
      return;
    }

    return html`
      <btrix-queue-exclusion-table
        .exclusions=${this.exclusions}
        pageSize="50"
        editable
        removable
        @on-remove=${this.handleRemoveRegex}
        @on-change=${this.handleChangeRegex}
      ></btrix-queue-exclusion-table>
      <sl-button
        class="w-full mt-1"
        @click=${() => (this.exclusions = [...(this.exclusions || []), ""])}
      >
        <sl-icon slot="prefix" name="plus-lg"></sl-icon>
        <span class="text-neutral-600">${msg("Add More")}</span>
      </sl-button>
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
      profileid: this.browserProfileId,
    };

    if (this.isConfigCodeView) {
      template.config = yamlToJson(this.configCode) as SeedConfig;
    } else {
      template.config = {
        seeds: (seedUrlsStr as string).trim().replace(/,/g, " ").split(/\s+/g),
        scopeType: formData.get("scopeType") as SeedConfig["scopeType"],
        limit: pageLimit ? +pageLimit : 0,
        extraHops: formData.get("extraHopsOne") ? 1 : 0,
        exclude: trimExclusions(this.exclusions),
        lang: this.browserLanguage || null,
      };
    }

    return template;
  }

  private handleRemoveRegex(e: ExclusionRemoveEvent) {
    const { index } = e.detail;
    if (!this.exclusions) {
      this.exclusions = defaultValue.config.exclude;
    } else {
      this.exclusions = [
        ...this.exclusions.slice(0, index),
        ...this.exclusions.slice(index + 1),
      ];
    }
  }

  private handleChangeRegex(e: ExclusionChangeEvent) {
    const { regex, index } = e.detail;

    const nextExclusions = [...this.exclusions!];
    nextExclusions[index] = regex;
    this.exclusions = nextExclusions;
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!this.authState) return;
    const form = event.target as HTMLFormElement;

    if (form.querySelector("[data-invalid]")) {
      return;
    }

    const formData = new FormData(event.target as HTMLFormElement);
    const params = this.parseTemplate(formData);

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
          : msg("Crawl config created."),
        variant: "success",
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
        const isConfigError = ({ loc }: any) =>
          loc.some((v: string) => v === "config");
        if (e.details && e.details.some(isConfigError)) {
          this.serverError = this.formatConfigServerError(e.details);
        } else {
          this.serverError = e.message;
        }
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  /**
   * Format `config` related API error returned from server
   */
  private formatConfigServerError(details: any): TemplateResult {
    const detailsWithoutDictError = details.filter(
      ({ type }: any) => type !== "type_error.dict"
    );

    const renderDetail = ({ loc, msg: detailMsg }: any) => html`
      <li>
        ${loc.some((v: string) => v === "seeds") &&
        typeof loc[loc.length - 1] === "number"
          ? msg(str`Seed URL ${loc[loc.length - 1] + 1}: `)
          : `${loc[loc.length - 1]}: `}
        ${detailMsg}
      </li>
    `;

    return html`
      ${msg(
        "Couldn't save crawl config. Please fix the following crawl configuration issues:"
      )}
      <ul class="list-disc w-fit mx-auto">
        ${detailsWithoutDictError.map(renderDetail)}
      </ul>
    `;
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
