import type { LitElement, TemplateResult } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import type {
  SlCheckbox,
  SlInput,
  SlRadio,
  SlRadioGroup,
  SlSelect,
  SlTextarea,
} from "@shoelace-style/shoelace";
import { state, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import { ifDefined } from "lit/directives/if-defined.js";
import compact from "lodash/fp/compact";
import { mergeDeep } from "immutable";
import flow from "lodash/fp/flow";
import uniq from "lodash/fp/uniq";
import RegexColorize from "regex-colorize";
import ISO6391 from "iso-639-1";

import LiteElement, { html } from "../../utils/LiteElement";
import { regexEscape } from "../../utils/string";
import type { AuthState } from "../../utils/AuthService";
import {
  getUTCSchedule,
  humanizeSchedule,
  humanizeNextDate,
} from "../../utils/cron";
import type { Tab } from "../../components/tab-list";
import type {
  ExclusionRemoveEvent,
  ExclusionChangeEvent,
} from "../../components/queue-exclusion-table";
import type { TimeInputChangeEvent } from "../../components/time-input";
import type { CrawlConfigParams, Profile, JobType } from "./types";

type NewCrawlConfigParams = CrawlConfigParams & {
  runNow: boolean;
};
export type InitialJobConfig = Pick<CrawlConfigParams, "name" | "profileid"> & {
  jobType?: JobType;
  config: Pick<CrawlConfigParams["config"], "seeds" | "scopeType" | "exclude">;
};
type StepName =
  | "crawlerSetup"
  | "browserSettings"
  | "jobScheduling"
  | "jobInformation"
  | "confirmSettings";
type Tabs = Record<
  StepName,
  {
    enabled: boolean;
    completed: boolean;
    error: boolean;
  }
>;
type ProgressState = {
  currentStep: StepName;
  activeTab: StepName;
  tabs: Tabs;
};
type FormState = {
  primarySeedUrl: string;
  urlList: string;
  includeLinkedPages: boolean;
  allowedExternalUrlList: string;
  crawlTimeoutMinutes: number | null;
  pageTimeoutMinutes: number | null;
  scopeType: CrawlConfigParams["config"]["scopeType"];
  exclusions: CrawlConfigParams["config"]["exclude"];
  pageLimit: CrawlConfigParams["config"]["limit"];
  scale: CrawlConfigParams["scale"];
  blockAds: CrawlConfigParams["config"]["blockAds"];
  lang: CrawlConfigParams["config"]["lang"];
  scheduleType: "now" | "date" | "cron";
  scheduleFrequency: "daily" | "weekly" | "monthly";
  scheduleDayOfMonth: number;
  scheduleDayOfWeek: number;
  scheduleTime: {
    hour: number;
    minute: number;
    period: "AM" | "PM";
  };
  runNow: boolean;
  jobName: CrawlConfigParams["name"];
  browserProfile: Profile | null;
};
const getDefaultProgressState = (): ProgressState => ({
  activeTab: "crawlerSetup",
  currentStep: "crawlerSetup",
  tabs: {
    crawlerSetup: { enabled: true, error: false, completed: false },
    browserSettings: { enabled: false, error: false, completed: false },
    jobScheduling: { enabled: false, error: false, completed: false },
    jobInformation: { enabled: false, error: false, completed: false },
    confirmSettings: { enabled: false, error: false, completed: false },
  },
});
const getDefaultFormState = (): FormState => ({
  primarySeedUrl: "",
  urlList: "",
  includeLinkedPages: false,
  allowedExternalUrlList: "",
  crawlTimeoutMinutes: null,
  pageTimeoutMinutes: null,
  scopeType: "host",
  exclusions: [""], // Empty slots for adding exclusions
  pageLimit: undefined,
  scale: 1,
  blockAds: true,
  lang: undefined,
  scheduleType: "now",
  scheduleFrequency: "weekly",
  scheduleDayOfMonth: new Date().getDate(),
  scheduleDayOfWeek: new Date().getDay(),
  scheduleTime: {
    hour: 12,
    minute: 0,
    period: "AM",
  },
  runNow: false,
  jobName: "",
  browserProfile: null,
});
const stepOrder: StepName[] = [
  "crawlerSetup",
  "browserSettings",
  "jobScheduling",
  "jobInformation",
  "confirmSettings",
];
const defaultProgressState = getDefaultProgressState();
const orderedTabNames = stepOrder.filter(
  (stepName) => defaultProgressState.tabs[stepName as StepName]
) as StepName[];

function getLocalizedWeekDays() {
  const now = new Date();
  // TODO accept locale from locale-picker
  const { format } = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  return Array.from({ length: 7 }).map((x, day) =>
    format(Date.now() - (now.getDay() - day) * 86400000)
  );
}

function validURL(url: string) {
  return /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/.test(
    url
  );
}

const trimExclusions = flow(uniq, compact);
const urlListToArray = (str: string) =>
  str.trim().replace(/,/g, " ").split(/\s+/g);

@localized()
export class CrawlConfigEditor extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  jobType?: JobType;

  @property({ type: Object })
  initialJobConfig?: InitialJobConfig;

  @state()
  private isSubmitting = false;

  @state()
  private progressState!: ProgressState;

  @state()
  private formState!: FormState;

  @state()
  private serverError?: TemplateResult | string;

  private get formHasError() {
    return Object.values(this.progressState.tabs).some(({ error }) => error);
  }

  private get utcSchedule() {
    return getUTCSchedule({
      interval: this.formState.scheduleFrequency,
      dayOfMonth: this.formState.scheduleDayOfMonth,
      dayOfWeek: this.formState.scheduleDayOfWeek,
      ...this.formState.scheduleTime,
    });
  }

  private daysOfWeek = getLocalizedWeekDays();

  private scopeTypeLabels: Record<FormState["scopeType"], string> = {
    prefix: msg("Path Begins with This URL"),
    host: msg("Pages on This Domain"),
    domain: msg("Pages on This Domain & Subdomains"),
    "page-spa": msg("Single Page App (In-Page Links Only)"),
    page: msg("Page"),
    custom: msg("Custom"),
    any: msg("Any"),
  };

  private scheduleTypeLabels: Record<FormState["scheduleType"], string> = {
    now: msg("Run Immediately on Save"),
    date: msg("Run on a Specific Date & Time"),
    cron: msg("Run on a Recurring Basis"),
  };

  private scheduleFrequencyLabels: Record<
    FormState["scheduleFrequency"],
    string
  > = {
    daily: msg("Daily"),
    weekly: msg("Weekly"),
    monthly: msg("Monthly"),
  };

  @query('form[name="newJobConfig"]')
  formElem!: HTMLFormElement;

  constructor() {
    super();
    this.progressState = getDefaultProgressState();
    this.formState = getDefaultFormState();
    if (!this.formState.lang) {
      this.formState.lang = this.getInitialLang();
    }
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("initialJobConfig") && this.initialJobConfig) {
      this.updateFormState(this.getInitialFormState());
    }
  }

  private getInitialLang() {
    // Default to current user browser language
    const browserLanguage = window.navigator.language;
    if (browserLanguage) {
      return browserLanguage.slice(0, browserLanguage.indexOf("-"));
    }
    return null;
  }

  private getInitialFormState(): Partial<FormState> {
    if (!this.initialJobConfig) return {};
    const seedState: Partial<FormState> = {};
    const { seeds, scopeType } = this.initialJobConfig.config;
    if (this.initialJobConfig.jobType === "seed-crawl") {
      seedState.primarySeedUrl =
        typeof seeds[0] === "string" ? seeds[0] : seeds[0].url;
    } else {
      // Treat "custom" like URL list
      seedState.urlList = seeds
        .map((seed) => (typeof seed === "string" ? seed : seed.url))
        .join("\n");

      if (this.initialJobConfig.jobType === "custom") {
        seedState.scopeType = scopeType || "page";
      }
    }

    return {
      jobName: this.initialJobConfig.name,
      browserProfile: this.initialJobConfig.profileid
        ? ({ id: this.initialJobConfig.profileid } as Profile)
        : undefined,
      scopeType: this.initialJobConfig.config
        .scopeType as FormState["scopeType"],
      exclusions: this.initialJobConfig.config.exclude,
      ...seedState,
    };
  }

  render() {
    const tabLabels: Record<StepName, string> = {
      crawlerSetup: msg("Crawler Setup"),
      browserSettings: msg("Browser Settings"),
      jobScheduling: msg("Job Scheduling"),
      jobInformation: msg("Job Information"),
      confirmSettings: msg("Confirm Settings"),
    };

    return html`
      <header class="lg:ml-48 mb-3 flex justify-between items-baseline">
        <h3 class="text-lg font-medium">
          ${tabLabels[this.progressState.activeTab]}
        </h3>
        <p class="text-xs text-neutral-500">
          ${msg(
            html`Fields marked with
              <span style="color:var(--sl-input-required-content-color)"
                >*</span
              >
              are required`
          )}
        </p>
      </header>

      <form
        name="newJobConfig"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
        @keydown=${this.onKeyDown}
        @sl-blur=${this.validateOnBlur}
        @sl-change=${this.updateFormStateOnChange}
      >
        <btrix-tab-list
          activePanel="newJobConfig-${this.progressState.activeTab}"
          progressPanel="newJobConfig-${this.progressState.currentStep}"
        >
          ${orderedTabNames.map((tabName) =>
            this.renderNavItem(tabName, tabLabels[tabName])
          )}

          <btrix-tab-panel name="newJobConfig-crawlerSetup">
            ${this.renderPanelContent(
              html`
                ${when(this.jobType === "url-list", this.renderUrlListSetup)}
                ${when(
                  this.jobType === "seed-crawl",
                  this.renderSeededCrawlSetup
                )}
                ${when(this.jobType === "custom", () =>
                  this.renderUrlListSetup(true)
                )}
              `,
              { isFirst: true }
            )}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-browserSettings">
            ${this.renderPanelContent(this.renderCrawlBehaviors())}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-jobScheduling">
            ${this.renderPanelContent(this.renderJobScheduling())}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-jobInformation">
            ${this.renderPanelContent(this.renderJobInformation())}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-confirmSettings">
            ${this.renderPanelContent(this.renderConfirmSettings(), {
              isLast: true,
            })}
          </btrix-tab-panel>
        </btrix-tab-list>
      </form>
    `;
  }

  private renderNavItem(tabName: StepName, content: TemplateResult | string) {
    const isActive = tabName === this.progressState.activeTab;
    const { error: isInvalid, completed } = this.progressState.tabs[tabName];
    let icon = html`
      <sl-icon
        name="circle"
        class="inline-block align-middle mr-1 text-base text-neutral-300"
      ></sl-icon>
    `;
    if (isInvalid) {
      icon = html`
        <sl-icon
          name="exclamation-circle"
          class="inline-block align-middle mr-1 text-base text-danger"
        ></sl-icon>
      `;
    } else if (isActive) {
      icon = html`
        <sl-icon
          library="app"
          name="pencil-circle-dashed"
          class="inline-block align-middle mr-1 text-base"
        ></sl-icon>
      `;
    } else if (completed) {
      icon = html`
        <sl-icon
          name="check-circle"
          class="inline-block align-middle mr-1 text-base text-success"
        ></sl-icon>
      `;
    }

    return html`
      <btrix-tab
        slot="nav"
        name="newJobConfig-${tabName}"
        class="whitespace-nowrap"
        ?disabled=${!this.progressState.tabs[tabName].enabled}
        @click=${this.tabClickHandler(tabName)}
      >
        ${icon}
        <span class="inline-block align-middle whitespace-normal">
          ${content}
        </span>
      </btrix-tab>
    `;
  }

  private renderPanelContent(
    content: TemplateResult,
    { isFirst = false, isLast = false } = {}
  ) {
    return html`
      <div class="flex flex-col h-full">
        <div class="flex-1 p-6 grid grid-cols-1 md:grid-cols-5 gap-6">
          ${content}
        </div>
        ${this.renderFooter({ isFirst, isLast })}
      </div>
    `;
  }

  private renderFooter({ isFirst = false, isLast = false }) {
    return html`
      <div class="px-6 py-4 border-t flex justify-between">
        ${isFirst
          ? html`
              <sl-button size="small" type="reset">
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Start Over")}
              </sl-button>
            `
          : html`
              <sl-button size="small" @click=${this.backStep}>
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Previous Step")}
              </sl-button>
            `}
        ${isLast
          ? html`<sl-button
              type="submit"
              size="small"
              variant="primary"
              ?disabled=${this.isSubmitting || this.formHasError}
              ?loading=${this.isSubmitting}
            >
              ${this.formState.runNow
                ? msg("Save & Run Crawl")
                : msg("Save & Schedule Crawl")}
            </sl-button>`
          : html`<sl-button
              size="small"
              variant="primary"
              @click=${this.nextStep}
            >
              <sl-icon slot="suffix" name="arrow-right"></sl-icon>
              ${msg("Next Step")}
            </sl-button>`}
      </div>
    `;
  }

  private renderSectionHeading(content: TemplateResult | string) {
    return html`
      <h4
        class="col-span-1 md:col-span-5 text-neutral-500 leading-none py-2 border-b"
      >
        ${content}
      </h4>
    `;
  }

  private renderFormCol = (content: TemplateResult) => {
    return html`<div class="col-span-1 md:col-span-3">${content}</div> `;
  };

  private renderHelpTextCol(content: TemplateResult, padTop = true) {
    return html`
      <div class="col-span-1 md:col-span-2 flex${padTop ? " pt-6" : ""}">
        <div class="text-base mr-2">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  private renderUrlListSetup = (isCustom = false) => {
    return html`
      ${this.renderFormCol(html`
        <sl-textarea
          name="urlList"
          label=${msg("List of URLs")}
          rows="10"
          autocomplete="off"
          value=${this.formState.urlList}
          placeholder=${`https://example.com
https://example.com/path`}
          required
          @sl-input=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (
              inputEl.invalid &&
              !urlListToArray(inputEl.value).some((url) => !validURL(url))
            ) {
              inputEl.setCustomValidity("");
              inputEl.helpText = "";
            }
          }}
          @sl-blur=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (
              inputEl.value &&
              urlListToArray(inputEl.value).some((url) => !validURL(url))
            ) {
              const text = msg("Please fix invalid URL in list.");
              inputEl.invalid = true;
              inputEl.helpText = text;
              inputEl.setCustomValidity(text);
            }
          }}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(
        html`The crawler will visit and record each URL listed in the order
        defined here.`
      )}
      ${when(
        isCustom,
        () => html`
          ${this.renderFormCol(html`
            <sl-select
              name="scopeType"
              label=${msg("Crawl Scope")}
              defaultValue=${this.formState.scopeType}
              value=${this.formState.scopeType}
              @sl-select=${(e: Event) =>
                this.updateFormState({
                  scopeType: (e.target as HTMLSelectElement)
                    .value as FormState["scopeType"],
                })}
            >
              <sl-menu-item value="prefix">
                ${this.scopeTypeLabels["prefix"]}
              </sl-menu-item>
              <sl-menu-item value="host">
                ${this.scopeTypeLabels["host"]}
              </sl-menu-item>
              <sl-menu-item value="domain">
                ${this.scopeTypeLabels["domain"]}
              </sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-label>${msg("Advanced Options")}</sl-menu-label>
              <sl-menu-item value="page-spa">
                ${this.scopeTypeLabels["page-spa"]}
              </sl-menu-item>
              <sl-menu-item value="page">
                ${this.scopeTypeLabels["page"]}
              </sl-menu-item>
              <sl-menu-item value="custom">
                ${this.scopeTypeLabels["custom"]}
              </sl-menu-item>
              <sl-menu-item value="any">
                ${this.scopeTypeLabels["any"]}
              </sl-menu-item>
            </sl-select>
          `)}
          ${this.renderHelpTextCol(
            html`Tells the crawler which pages it can visit.`
          )}
        `
      )}
      ${this.renderFormCol(html`<sl-checkbox
        name="includeLinkedPages"
        ?checked=${this.formState.includeLinkedPages}
      >
        ${msg("Include Linked Pages")}
      </sl-checkbox>`)}
      ${this.renderHelpTextCol(
        html`If checked, the crawler will visit pages one link away from a Crawl
        URL.`,
        false
      )}
      ${when(
        this.formState.includeLinkedPages,
        () => html`
          ${this.renderSectionHeading(msg("Page Limits"))}
          ${this.renderFormCol(html`
            <btrix-queue-exclusion-table
              .exclusions=${this.formState.exclusions}
              pageSize="50"
              editable
              removable
              @on-remove=${this.handleRemoveRegex}
              @on-change=${this.handleChangeRegex}
            ></btrix-queue-exclusion-table>
            <sl-button
              class="w-full mt-1"
              @click=${() =>
                this.updateFormState({
                  exclusions: [...(this.formState.exclusions || []), ""],
                })}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              <span class="text-neutral-600">${msg("Add More")}</span>
            </sl-button>
          `)}
          ${this.renderHelpTextCol(
            html`Specify exclusion rules for what pages should not be visited.
            Exclusions apply to all URLs.`
          )}
        `
      )}
      ${this.renderCrawlScale()}
    `;
  };

  private renderSeededCrawlSetup = () => {
    const urlPlaceholder = "https://example.com";
    let exampleUrl = new URL(urlPlaceholder);
    if (this.formState.primarySeedUrl) {
      try {
        exampleUrl = new URL(this.formState.primarySeedUrl);
      } catch {}
    }
    const exampleHost = exampleUrl.host;
    const exampleProtocol = exampleUrl.protocol;
    const examplePathname = exampleUrl.pathname.replace(/\/$/, "");
    const exampleDomain = `${exampleProtocol}//${exampleHost}`;

    let helpText: TemplateResult | string;

    switch (this.formState.scopeType) {
      case "prefix":
        helpText = msg(
          html`Will crawl all page URLs that begin with
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            >, e.g.
            <span class="text-blue-500 break-word break-word"
              >${exampleDomain}${examplePathname}</span
            ><span class="text-blue-500 font-medium break-word"
              >/path/page.html</span
            >`
        );
        break;
      case "host":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and ignore pages
            on any subdomains.`
        );
        break;
      case "domain":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and
            <span class="text-blue-500">subdomain.${exampleHost}</span>.`
        );
        break;
      case "page-spa":
        helpText = msg(
          html`Will only visit
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            >
            and links that stay within the same URL, e.g. hash anchor links:
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            ><span class="text-blue-500 font-medium break-word"
              >#example-page</span
            >`
        );
        break;
      default:
        helpText = "";
        break;
    }

    return html`
      ${this.renderFormCol(html`
        <sl-input
          name="primarySeedUrl"
          label=${msg("Crawl Start URL")}
          autocomplete="off"
          placeholder=${urlPlaceholder}
          value=${this.formState.primarySeedUrl}
          required
          @sl-input=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (inputEl.invalid && validURL(inputEl.value)) {
              inputEl.setCustomValidity("");
              inputEl.helpText = "";
            }
          }}
          @sl-blur=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (inputEl.value && !validURL(inputEl.value)) {
              const text = msg("Please enter a valid URL.");
              inputEl.invalid = true;
              inputEl.helpText = text;
              inputEl.setCustomValidity(text);
            }
          }}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(html`The starting point of your crawl.`)}
      ${this.renderFormCol(html`
        <sl-select
          name="scopeType"
          label=${msg("Crawl Scope")}
          defaultValue=${this.formState.scopeType}
          value=${this.formState.scopeType}
          @sl-select=${(e: Event) =>
            this.updateFormState({
              scopeType: (e.target as HTMLSelectElement)
                .value as FormState["scopeType"],
            })}
        >
          <div slot="help-text">${helpText}</div>
          <sl-menu-item value="prefix">
            ${this.scopeTypeLabels["prefix"]}
          </sl-menu-item>
          <sl-menu-item value="host">
            ${this.scopeTypeLabels["host"]}
          </sl-menu-item>
          <sl-menu-item value="domain">
            ${this.scopeTypeLabels["domain"]}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-label>${msg("Advanced Options")}</sl-menu-label>
          <sl-menu-item value="page-spa">
            ${this.scopeTypeLabels["page-spa"]}
          </sl-menu-item>
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        html`Tells the crawler which pages it can visit.`
      )}
      ${this.renderSectionHeading(msg("Additional Pages"))}
      ${this.renderFormCol(html`
        <sl-textarea
          name="allowedExternalUrlList"
          label=${msg("Allowed URL Prefixes")}
          rows="3"
          autocomplete="off"
          value=${this.formState.allowedExternalUrlList}
          placeholder=${`https://example.org/page/
https://example.net`}
          ?disabled=${this.formState.scopeType === "page-spa"}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(
        html`Crawl pages outside of Crawl Scope that begin with these URLs.`
      )}
      ${this.renderFormCol(html`
        <sl-checkbox
          name="includeLinkedPages"
          ?checked=${this.formState.includeLinkedPages}
        >
          ${msg("Include Any Linked Page (“one hop out”)")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        html`If checked, the crawler will visit pages one link away outside of
        Crawl Scope.`,
        false
      )}
      ${this.renderSectionHeading(msg("Page Limits"))}
      ${this.renderFormCol(html`
        <sl-input
          name="pageLimit"
          label=${msg("Max Pages")}
          type="number"
          defaultValue=${this.formState.pageLimit || ""}
          placeholder=${msg("Unlimited")}
        >
          <span slot="suffix">${msg("pages")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(html`Adds a hard limit on the number of pages
      that will be crawled.`)}
      ${this.renderFormCol(html`
        <btrix-queue-exclusion-table
          .exclusions=${this.formState.exclusions}
          pageSize="50"
          editable
          removable
          @on-remove=${this.handleRemoveRegex}
          @on-change=${this.handleChangeRegex}
        ></btrix-queue-exclusion-table>
        <sl-button
          class="w-full mt-1"
          @click=${() =>
            this.updateFormState({
              exclusions: [...(this.formState.exclusions || []), ""],
            })}
        >
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          <span class="text-neutral-600">${msg("Add More")}</span>
        </sl-button>
      `)}
      ${this.renderHelpTextCol(
        html`Specify exclusion rules for what pages should not be visited.`
      )}
      ${this.renderCrawlScale()}
    `;
  };

  private renderCrawlScale() {
    return html`
      ${this.renderSectionHeading(msg("Crawl Limits"))}
      ${this.renderFormCol(html`
        <sl-input
          name="crawlTimeoutMinutes"
          label=${msg("Crawl Time Limit")}
          placeholder=${msg("Unlimited")}
          type="number"
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        html`Gracefully stop the crawler after a specified time limit.`
      )}
      ${this.renderFormCol(html`
        <sl-radio-group
          name="scale"
          label=${msg("Crawler Instances")}
          value=${this.formState.scale}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scale: +(e.target as SlCheckbox).value,
            })}
        >
          <sl-radio-button value="1" size="small">1</sl-radio-button>
          <sl-radio-button value="2" size="small">2</sl-radio-button>
          <sl-radio-button value="3" size="small">3</sl-radio-button>
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        html`Increasing parallel crawler instances will speed up crawls, but
        take up more system resources.`
      )}
    `;
  }

  private renderCrawlBehaviors() {
    return html`
      ${this.renderFormCol(html`
        <btrix-select-browser-profile
          archiveId=${this.archiveId}
          .profileId=${this.formState.browserProfile?.id}
          .authState=${this.authState}
          @on-change=${(e: any) =>
            this.updateFormState({
              browserProfile: e.detail.value,
            })}
        ></btrix-select-browser-profile>
      `)}
      ${this.renderHelpTextCol(
        html`Choose a custom profile to make use of saved cookies and logged-in
        accounts.`
      )}
      ${this.renderFormCol(html`
        <sl-checkbox name="blockAds" ?checked=${this.formState.blockAds}>
          ${msg("Block Ads by Domain")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        html`Blocks advertising content from being loaded. Uses
          <a
            href="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
            class="text-blue-600 hover:text-blue-500"
            target="_blank"
            rel="noopener noreferrer nofollow"
            >Steven Black’s Hosts file</a
          >.`,
        false
      )}
      ${this.renderFormCol(html`
        <btrix-language-select
          .value=${this.formState.lang}
          @sl-select=${(e: CustomEvent) =>
            this.updateFormState({
              lang: e.detail.item.value,
            })}
          @sl-clear=${() => {
            this.updateFormState({
              lang: null,
            });
          }}
        >
          <span slot="label">${msg("Language")}</span>
        </btrix-language-select>
      `)}
      ${this.renderHelpTextCol(
        html`Websites that observe the browser’s language setting may serve
        content in that language if available.`
      )}
      ${this.renderSectionHeading(msg("On-Page Behavior"))}
      ${this.renderFormCol(html`
        <sl-input
          name="pageTimeoutMinutes"
          type="number"
          label=${msg("Page Time Limit")}
          placeholder=${msg("Unlimited")}
          value=${ifDefined(this.formState.pageTimeoutMinutes || undefined)}
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        html`Adds a hard time limit for how long the crawler can spend on a
        single webpage.`
      )}
    `;
  }

  private renderJobScheduling() {
    return html`
      ${this.renderFormCol(html`
        <sl-radio-group
          label=${msg("Crawl Schedule Type")}
          name="scheduleType"
          value=${this.formState.scheduleType}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scheduleType: (e.target as SlRadio)
                .value as FormState["scheduleType"],
              runNow: (e.target as SlRadio).value === "now",
            })}
        >
          <sl-radio value="now">${this.scheduleTypeLabels["now"]}</sl-radio>
          <sl-radio value="cron">${this.scheduleTypeLabels["cron"]}</sl-radio>
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        html`Should a crawl run immediately when setup is complete, on a set
        day, or on a recurring schedule?`
      )}
      ${when(this.formState.scheduleType === "cron", this.renderScheduleCron)}
    `;
  }

  private renderScheduleCron = () => {
    const utcSchedule = this.utcSchedule;
    return html`
      ${this.renderSectionHeading(msg("Set Schedule"))}
      ${this.renderFormCol(html`
        <sl-select
          name="scheduleFrequency"
          label=${msg("Frequency")}
          value=${this.formState.scheduleFrequency}
          @sl-select=${(e: Event) =>
            this.updateFormState({
              scheduleFrequency: (e.target as HTMLSelectElement)
                .value as FormState["scheduleFrequency"],
            })}
        >
          <sl-menu-item value="daily"
            >${this.scheduleFrequencyLabels["daily"]}</sl-menu-item
          >
          <sl-menu-item value="weekly"
            >${this.scheduleFrequencyLabels["weekly"]}</sl-menu-item
          >
          <sl-menu-item value="monthly"
            >${this.scheduleFrequencyLabels["monthly"]}</sl-menu-item
          >
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        html`Limit the frequency for how often a crawl will run.`
      )}
      ${when(
        this.formState.scheduleFrequency === "weekly",
        () => html`
          ${this.renderFormCol(html`
            <sl-radio-group
              name="scheduleDayOfWeek"
              label=${msg("Day")}
              value=${this.formState.scheduleDayOfWeek}
              @sl-change=${(e: Event) =>
                this.updateFormState({
                  scheduleDayOfWeek: +(e.target as SlRadioGroup).value,
                })}
            >
              ${this.daysOfWeek.map(
                (label, day) =>
                  html`<sl-radio-button value=${day}>${label}</sl-radio-button>`
              )}
            </sl-radio-group>
          `)}
          ${this.renderHelpTextCol(
            html`What day of the week should a crawl run on?`
          )}
        `
      )}
      ${when(
        this.formState.scheduleFrequency === "monthly",
        () => html`
          ${this.renderFormCol(html`
            <sl-input
              name="scheduleDayOfMonth"
              label=${msg("Date")}
              type="number"
              min="1"
              max="31"
              value=${this.formState.scheduleDayOfMonth}
              required
            >
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            html`What day of the month should a crawl run on?`
          )}
        `
      )}
      ${this.renderFormCol(html`
        <btrix-time-input
          hour=${ifDefined(this.formState.scheduleTime.hour)}
          minute=${ifDefined(this.formState.scheduleTime.minute)}
          period=${ifDefined(this.formState.scheduleTime.period)}
          @time-change=${(e: TimeInputChangeEvent) => {
            this.updateFormState({
              scheduleTime: e.detail,
            });
          }}
        >
          <span slot="label">${msg("Start Time")}</span>
        </btrix-time-input>
        <div class="text-xs text-neutral-500 mt-3">
          <p class="mb-1">
            ${msg(
              html`Schedule:
                <span class="text-blue-500"
                  >${utcSchedule
                    ? humanizeSchedule(utcSchedule)
                    : msg("Invalid date")}</span
                >.`
            )}
          </p>
          <p>
            ${msg(
              html`Next scheduled run:
                <span
                  >${utcSchedule
                    ? humanizeNextDate(utcSchedule)
                    : msg("Invalid date")}</span
                >.`
            )}
          </p>
        </div>
      `)}
      ${this.renderHelpTextCol(
        html`A crawl will run at this time in your current timezone.`
      )}
      ${this.renderFormCol(html`<sl-checkbox
        name="runNow"
        ?checked=${this.formState.runNow}
      >
        ${msg("Also run a crawl immediately on save")}
      </sl-checkbox>`)}
      ${this.renderHelpTextCol(
        html`If checked, a crawl will run at the time specified above and also
        once when setup is complete.`,
        false
      )}
    `;
  };

  private renderJobInformation() {
    const jobNameValue =
      this.formState.jobName ||
      (this.jobType === "seed-crawl" && this.formState.primarySeedUrl) ||
      "";
    return html`
      ${this.renderFormCol(html`
        <sl-input
          name="jobName"
          label=${msg("Crawl Name")}
          autocomplete="off"
          placeholder=${msg("Example (example.com) Weekly Crawl", {
            desc: "Example crawl config name",
          })}
          value=${jobNameValue}
          required
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(
        html`Try to create a unique name to help keep things organized!`
      )}
    `;
  }

  private renderErrorAlert(errorMessage: string | TemplateResult) {
    return html`
      <div class="col-span-1 md:col-span-5">
        <btrix-alert variant="danger">${errorMessage}</btrix-alert>
      </div>
    `;
  }

  private renderConfirmSettings = () => {
    const crawlConfig = this.parseConfig();
    const exclusions = crawlConfig.config.exclude || [];
    return html`
      ${this.renderSectionHeading(msg("Crawler Setup"))}
      <div class="col-span-1 md:col-span-5">
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${when(this.jobType === "url-list", () =>
            this.renderConfirmUrlListSettings(crawlConfig)
          )}
          ${when(this.jobType === "seed-crawl", () =>
            this.renderConfirmSeededSettings(crawlConfig)
          )}
          ${this.renderSetting(
            msg("Exclusions"),
            html`
              ${when(
                exclusions.length,
                () => html`
                  <btrix-queue-exclusion-table
                    .exclusions=${exclusions}
                    label=""
                  >
                  </btrix-queue-exclusion-table>
                `,
                () => msg("None")
              )}
            `,
            2
          )}
          ${this.renderSetting(
            msg("Crawl Time Limit"),
            crawlConfig.crawlTimeout
              ? msg(str`${crawlConfig.crawlTimeout / 60} minute(s)`)
              : msg("None")
          )}
          ${this.renderSetting(msg("Crawler Instances"), crawlConfig.scale)}
        </dl>
      </div>
      ${this.renderSectionHeading(msg("Browser Settings"))}
      <div class="col-span-1 md:col-span-5">
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${this.renderSetting(
            msg("Browser Profile"),
            when(
              crawlConfig.profileid,
              () => html`<a
                class="text-blue-500 hover:text-blue-600"
                href=${`/archives/${this.archiveId}/browser-profiles/profile/${crawlConfig.profileid}`}
                @click=${this.navLink}
              >
                ${this.formState.browserProfile!.name}
              </a>`,
              () => msg("Default Profile")
            )
          )}
          ${this.renderSetting(
            msg("Block Ads by Domain"),
            crawlConfig.config.blockAds
          )}
          ${this.renderSetting(
            msg("Language"),
            ISO6391.getName(crawlConfig.config.lang!)
          )}
          ${this.renderSetting(
            msg("Page Time Limit"),
            crawlConfig.config.behaviorTimeout
              ? msg(str`${crawlConfig.config.behaviorTimeout / 60} minute(s)`)
              : msg("None")
          )}
        </dl>
      </div>
      ${this.renderSectionHeading(msg("Job Scheduling"))}

      <div class="col-span-1 md:col-span-5">
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${this.renderSetting(
            msg("Crawl Schedule Type"),
            this.scheduleTypeLabels[this.formState.scheduleType]
          )}
          ${when(this.formState.scheduleType === "cron", () =>
            this.renderSetting(
              msg("Schedule"),
              humanizeSchedule(crawlConfig.schedule)
            )
          )}
        </dl>
      </div>
      ${this.renderSectionHeading(msg("Job Information"))}
      <div class="col-span-1 md:col-span-5">
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${this.renderSetting(msg("Job Name"), crawlConfig.name)}
        </dl>
      </div>
      ${when(this.serverError, () => this.renderErrorAlert(this.serverError!))}
      ${when(this.formHasError, () =>
        this.renderErrorAlert(
          msg(
            "There are issues with this crawl configuration. Please go through previous steps and fix all issues to continue."
          )
        )
      )}
    `;
  };

  private renderConfirmUrlListSettings(crawlConfig: CrawlConfigParams) {
    return html`
      ${this.renderSetting(
        msg("List of URLs"),
        html`
          <ul>
            ${crawlConfig.config.seeds.map((url) => html` <li>${url}</li> `)}
          </ul>
        `
      )}
      ${this.renderSetting(
        msg("Include Linked Pages"),
        Boolean(crawlConfig.config.extraHops)
      )}
    `;
  }

  private renderConfirmSeededSettings(crawlConfig: CrawlConfigParams) {
    return html`
      ${this.renderSetting(
        msg("Primary Seed URL"),
        this.formState.primarySeedUrl
      )}
      ${this.renderSetting(
        msg("Crawl Scope"),
        this.scopeTypeLabels[this.formState.scopeType]
      )}
      ${this.renderSetting(
        msg("Allowed URL Prefixes"),
        crawlConfig.config.include?.length
          ? html`
              <ul>
                ${crawlConfig.config.include.map(
                  (url) =>
                    staticHtml`<li class="regex">${unsafeStatic(
                      new RegexColorize().colorizeText(url)
                    )}</li>`
                )}
              </ul>
            `
          : msg("None")
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page (“one hop out”)"),
        Boolean(crawlConfig.config.extraHops)
      )}
      ${this.renderSetting(
        msg("Max Pages"),
        crawlConfig.config.limit
          ? msg(str`${crawlConfig.config.limit} pages`)
          : msg("Unlimited")
      )}
    `;
  }

  private renderSetting(label: string, value: any, cols = 1) {
    let content = value;

    if (typeof value === "boolean") {
      content = value ? msg("Yes") : msg("No");
    } else if (typeof value !== "number" && !value) {
      content = html`<span class="text-neutral-300"
        >${msg("Not specified")}</span
      >`;
    }
    return html`
      <div class="col-span-${cols}">
        <dt class="mb-0.5 text-xs text-neutral-500">${label}</dt>
        <dd class="font-monostyle text-neutral-700">${content}</dd>
      </div>
    `;
  }

  private async handleRemoveRegex(e: ExclusionRemoveEvent) {
    const { index } = e.detail;
    if (!this.formState.exclusions) {
      this.updateFormState(
        {
          exclusions: this.formState.exclusions,
        },
        true
      );
    } else {
      const { exclusions: exclude } = this.formState;
      this.updateFormState(
        {
          exclusions: [...exclude.slice(0, index), ...exclude.slice(index + 1)],
        },
        true
      );
    }

    // Check if we removed an erroring input
    const table = e.target as LitElement;
    await this.updateComplete;
    await table.updateComplete;
    this.syncTabErrorState(table);
  }

  private handleChangeRegex(e: ExclusionChangeEvent) {
    const { regex, index } = e.detail;

    const nextExclusions = [...this.formState.exclusions!];
    nextExclusions[index] = regex;
    this.updateFormState(
      {
        exclusions: nextExclusions,
      },
      true
    );
  }

  private validateOnBlur = async (e: Event) => {
    const el = e.target as SlInput | SlTextarea | SlSelect | SlCheckbox;
    const tagName = el.tagName.toLowerCase();
    if (
      !["sl-input", "sl-textarea", "sl-select", "sl-checkbox"].includes(tagName)
    ) {
      return;
    }
    await el.updateComplete;
    await this.updateComplete;

    const currentTab = this.progressState.activeTab as StepName;
    const tabs = { ...this.progressState.tabs };
    // Check [data-user-invalid] instead of .invalid property
    // to validate only touched inputs
    if ("userInvalid" in el.dataset) {
      tabs[currentTab].error = true;
      this.updateProgressState({ tabs });
    } else if (this.progressState.tabs[currentTab].error) {
      this.syncTabErrorState(el);
    }
  };

  private syncTabErrorState(el: HTMLElement) {
    const currentTab = this.progressState.activeTab as StepName;
    const tabs = { ...this.progressState.tabs };
    const panelEl = el.closest("btrix-tab-panel")!;
    const hasInvalid = panelEl.querySelector("[data-user-invalid]");

    if (!hasInvalid) {
      tabs[currentTab].error = false;
      this.updateProgressState({ tabs });
    }
  }

  private updateFormStateOnChange(e: Event) {
    const elem = e.target as SlTextarea | SlInput | SlCheckbox;
    const name = elem.name;
    const tagName = elem.tagName.toLowerCase();
    let value: any;
    switch (tagName) {
      case "sl-checkbox":
        value = (elem as SlCheckbox).checked;
        break;
      case "sl-textarea":
        value = elem.value;
        break;
      case "sl-input": {
        if ((elem as SlInput).type === "number") {
          value = +elem.value;
        } else {
          value = elem.value;
        }
        break;
      }
      default:
        return;
    }
    if (name in this.formState) {
      this.updateFormState({
        [name]: value,
      });
    }
  }

  private tabClickHandler = (step: StepName) => (e: MouseEvent) => {
    const tab = e.currentTarget as Tab;
    if (tab.disabled || tab.active) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.updateProgressState({ activeTab: step });
  };

  private backStep() {
    const targetTabIdx = stepOrder.indexOf(this.progressState.activeTab!);
    if (targetTabIdx) {
      this.updateProgressState({
        activeTab: stepOrder[targetTabIdx - 1] as StepName,
      });
    }
  }

  private nextStep() {
    const isValid = this.checkCurrentPanelValidity();
    console.log(isValid);

    if (isValid) {
      const { activeTab, tabs, currentStep } = this.progressState;
      const nextTab = stepOrder[stepOrder.indexOf(activeTab!) + 1] as StepName;

      const isFirstTimeEnabled = !tabs[nextTab].enabled;
      const nextTabs = { ...tabs };
      let nextCurrentStep = currentStep;

      if (isFirstTimeEnabled) {
        nextTabs[nextTab].enabled = true;
        nextCurrentStep = nextTab;
      }

      nextTabs[activeTab!].completed = true;
      this.updateProgressState({
        activeTab: nextTab,
        currentStep: nextCurrentStep,
        tabs: nextTabs,
      });
    }
  }

  private checkCurrentPanelValidity = (): boolean => {
    if (!this.formElem) return false;

    const currentTab = this.progressState.activeTab as StepName;
    const activePanel = this.formElem.querySelector(
      `btrix-tab-panel[name="newJobConfig-${currentTab}"]`
    );
    const invalidElems = [...activePanel!.querySelectorAll("[data-invalid]")];

    const hasInvalid = Boolean(invalidElems.length);
    if (hasInvalid) {
      invalidElems.forEach((el) => {
        (el as HTMLInputElement).reportValidity();
      });
    }

    return !hasInvalid;
  };

  private onKeyDown(event: KeyboardEvent) {
    const el = event.target as HTMLElement;
    const tagName = el.tagName.toLowerCase();
    if (tagName !== "sl-input") return;

    const { key } = event;
    if ((el as SlInput).type === "number") {
      // Prevent typing non-numeric keys
      if (key.length === 1 && /\D/.test(key)) {
        event.preventDefault();
        return;
      }
    }

    if (
      key === "Enter" &&
      this.progressState.activeTab !== stepOrder[stepOrder.length - 1]
    ) {
      // Prevent submission by "Enter" keypress if not on last tab
      event.preventDefault();
    }
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const isValid = this.checkCurrentPanelValidity();
    await this.updateComplete;

    if (!isValid || this.formHasError) {
      return;
    }

    const config = this.parseConfig();

    console.log(config);

    this.isSubmitting = true;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(config),
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

  private async onReset() {
    this.progressState = getDefaultProgressState();
    this.formState = {
      ...getDefaultFormState(),
      lang: this.getInitialLang(),
      ...this.getInitialFormState(),
    };
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
      <ul class="list-disc w-fit pl-4">
        ${detailsWithoutDictError.map(renderDetail)}
      </ul>
    `;
  }

  private parseConfig(): NewCrawlConfigParams {
    const config: NewCrawlConfigParams = {
      jobType: this.jobType || "custom",
      name: this.formState.jobName || this.formState.primarySeedUrl,
      scale: this.formState.scale,
      profileid: this.formState.browserProfile?.id || null,
      runNow: this.formState.runNow || this.formState.scheduleType === "now",
      schedule: this.formState.scheduleType === "cron" ? this.utcSchedule : "",
      crawlTimeout: this.formState.crawlTimeoutMinutes
        ? this.formState.crawlTimeoutMinutes * 60
        : 0,
      config: {
        ...(this.jobType === "url-list"
          ? this.parseUrlListConfig()
          : this.parseSeededConfig()),
        behaviorTimeout: this.formState.pageTimeoutMinutes
          ? this.formState.pageTimeoutMinutes * 60
          : 0,
        limit: this.formState.pageLimit ? +this.formState.pageLimit : null,
        extraHops: this.formState.includeLinkedPages ? 1 : 0,
        lang: this.formState.lang || null,
        blockAds: this.formState.blockAds,
        exclude: trimExclusions(this.formState.exclusions),
      },
    };

    return config;
  }

  private parseUrlListConfig(): NewCrawlConfigParams["config"] {
    const config = {
      seeds: urlListToArray(this.formState.urlList),
      scopeType: "page" as FormState["scopeType"],
    };

    return config;
  }

  private parseSeededConfig(): NewCrawlConfigParams["config"] {
    const primarySeedUrl = this.formState.primarySeedUrl.replace(/\/$/, "");
    const externalUrlList = this.formState.allowedExternalUrlList
      ? urlListToArray(this.formState.allowedExternalUrlList).map((str) =>
          str.replace(/\/$/, "")
        )
      : [];
    let scopeType = this.formState.scopeType;
    const include = [];
    if (externalUrlList.length) {
      const { host, origin } = new URL(primarySeedUrl);
      scopeType = "custom";

      // Replicate scope type with regex
      switch (this.formState.scopeType) {
        case "prefix":
          include.push(`${regexEscape(primarySeedUrl)}\/.*`);
          break;
        case "host":
          include.push(`${regexEscape(origin)}\/.*`);
          break;
        case "domain":
          include.push(
            `${regexEscape(origin)}\/.*`,
            `.*\.${regexEscape(host)}\/.*`
          );
          break;
        default:
          break;
      }

      externalUrlList.forEach((url) => {
        include.push(`${regexEscape(url)}\/.*`);
      });
    }
    const config = {
      seeds: [primarySeedUrl],
      scopeType,
      include,
    };
    return config;
  }

  private updateProgressState(
    nextState: Partial<ProgressState>,
    shallowMerge = false
  ) {
    if (shallowMerge) {
      this.progressState = {
        ...this.progressState,
        ...nextState,
      };
    } else {
      this.progressState = mergeDeep(this.progressState, nextState);
    }
  }

  private updateFormState(nextState: Partial<FormState>, shallowMerge = false) {
    if (shallowMerge) {
      this.formState = {
        ...this.formState,
        ...nextState,
      };
    } else {
      this.formState = mergeDeep(this.formState, nextState);
    }
  }
}

customElements.define("btrix-crawl-config-editor", CrawlConfigEditor);
