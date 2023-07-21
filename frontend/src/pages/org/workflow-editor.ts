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
import { state, property, query, queryAsync } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import { ifDefined } from "lit/directives/if-defined.js";
import compact from "lodash/fp/compact";
import { mergeDeep } from "immutable";
import flow from "lodash/fp/flow";
import uniq from "lodash/fp/uniq";
import Fuse from "fuse.js";

import LiteElement, { html } from "../../utils/LiteElement";
import { regexEscape } from "../../utils/string";
import type { AuthState } from "../../utils/AuthService";
import {
  getUTCSchedule,
  humanizeSchedule,
  humanizeNextDate,
  getScheduleInterval,
  getNextDate,
} from "../../utils/cron";
import { maxLengthValidator } from "../../utils/form";
import type { Tab } from "../../components/tab-list";
import type {
  ExclusionRemoveEvent,
  ExclusionChangeEvent,
} from "../../components/queue-exclusion-table";
import type { TimeInputChangeEvent } from "../../components/time-input";
import type {
  TagInputEvent,
  Tags,
  TagsChangeEvent,
} from "../../components/tag-input";
import type { CollectionsChangeEvent } from "../../components/collections-add";
import type {
  WorkflowParams,
  Profile,
  JobType,
  Seed,
  SeedConfig,
} from "./types";
import type { CollectionList } from "../../types/collection";

type NewCrawlConfigParams = WorkflowParams & {
  runNow: boolean;
};

const STEPS = [
  "crawlSetup",
  "crawlLimits",
  "browserSettings",
  "crawlScheduling",
  "crawlMetadata",
  "confirmSettings",
] as const;
type StepName = (typeof STEPS)[number];
type TabState = {
  completed: boolean;
  error: boolean;
};
type Tabs = Record<StepName, TabState>;
type ProgressState = {
  activeTab: StepName;
  tabs: Tabs;
};
type FormState = {
  primarySeedUrl: string;
  urlList: string;
  includeLinkedPages: boolean;
  useSitemap: boolean;
  customIncludeUrlList: string;
  crawlTimeoutMinutes: number | null;
  behaviorTimeoutSeconds: number | null;
  pageLoadTimeoutSeconds: number | null;
  pageExtraDelaySeconds: number | null;
  maxScopeDepth: number | null;
  scopeType: WorkflowParams["config"]["scopeType"];
  exclusions: WorkflowParams["config"]["exclude"];
  pageLimit: WorkflowParams["config"]["limit"];
  scale: WorkflowParams["scale"];
  blockAds: WorkflowParams["config"]["blockAds"];
  lang: WorkflowParams["config"]["lang"];
  scheduleType: "now" | "date" | "cron" | "none";
  scheduleFrequency: "daily" | "weekly" | "monthly" | "";
  scheduleDayOfMonth?: number;
  scheduleDayOfWeek?: number;
  scheduleTime?: {
    hour: number;
    minute: number;
    period: "AM" | "PM";
  };
  runNow: boolean;
  jobName: WorkflowParams["name"];
  browserProfile: Profile | null;
  tags: Tags;
  autoAddCollections: string[];
  description: WorkflowParams["description"];
  autoscrollBehavior: boolean;
};

const DEPTH_SUPPORTED_SCOPES = ["prefix", "host", "domain", "custom", "any"];

const getDefaultProgressState = (hasConfigId = false): ProgressState => {
  let activeTab: StepName = "crawlSetup";
  if (window.location.hash) {
    const hashValue = window.location.hash.slice(1);

    if (STEPS.includes(hashValue as any)) {
      activeTab = hashValue as StepName;
    }
  }

  return {
    activeTab,
    tabs: {
      crawlSetup: { error: false, completed: hasConfigId },
      crawlLimits: {
        error: false,
        completed: hasConfigId,
      },
      browserSettings: {
        error: false,
        completed: hasConfigId,
      },
      crawlScheduling: {
        error: false,
        completed: hasConfigId,
      },
      crawlMetadata: {
        error: false,
        completed: hasConfigId,
      },
      confirmSettings: {
        error: false,
        completed: hasConfigId,
      },
    },
  };
};
const getDefaultFormState = (): FormState => ({
  primarySeedUrl: "",
  urlList: "",
  includeLinkedPages: false,
  useSitemap: true,
  customIncludeUrlList: "",
  crawlTimeoutMinutes: null,
  behaviorTimeoutSeconds: null,
  pageLoadTimeoutSeconds: null,
  pageExtraDelaySeconds: null,
  maxScopeDepth: null,
  scopeType: "host",
  exclusions: [],
  pageLimit: null,
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
  tags: [],
  autoAddCollections: [],
  description: null,
  autoscrollBehavior: true,
});
const defaultProgressState = getDefaultProgressState();
const orderedTabNames = STEPS.filter(
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

const trimArray = flow(uniq, compact);
const urlListToArray = flow(
  (str: string) => (str.length ? str.trim().split(/\s+/g) : []),
  trimArray
);
const mapSeedToUrl = (arr: Seed[]) =>
  arr.map((seed) => (typeof seed === "string" ? seed : seed.url));
const DEFAULT_BEHAVIORS = [
  "autoscroll",
  "autoplay",
  "autofetch",
  "siteSpecific",
];

@localized()
export class CrawlConfigEditor extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  configId?: string;

  @property({ type: String })
  jobType?: JobType;

  @property({ type: Object })
  initialWorkflow?: WorkflowParams;

  @state()
  private tagOptions: string[] = [];

  @state()
  private isSubmitting = false;

  @state()
  private progressState!: ProgressState;

  @state()
  private orgDefaults?: {
    behaviorTimeoutSeconds?: number;
    pageLoadTimeoutSeconds?: number;
    maxPagesPerCrawl?: number;
  };

  @state()
  private formState!: FormState;

  @state()
  private serverError?: TemplateResult | string;

  // For fuzzy search:
  private fuse = new Fuse([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private validateNameMax = maxLengthValidator(50);
  private validateDescriptionMax = maxLengthValidator(350);

  private get formHasError() {
    return (
      !this.hasRequiredFields() ||
      Object.values(this.progressState.tabs).some(({ error }) => error)
    );
  }

  private get utcSchedule() {
    if (!this.formState.scheduleFrequency) {
      return "";
    }
    return getUTCSchedule({
      interval: this.formState.scheduleFrequency!,
      dayOfMonth: this.formState.scheduleDayOfMonth,
      dayOfWeek: this.formState.scheduleDayOfWeek,
      ...this.formState.scheduleTime!,
    });
  }

  private readonly daysOfWeek = getLocalizedWeekDays();

  private readonly scopeTypeLabels: Record<FormState["scopeType"], string> = {
    prefix: msg("Pages in the Same Directory"),
    host: msg("Pages on This Domain"),
    domain: msg("Pages on This Domain & Subdomains"),
    "page-spa": msg("Hashtag Links Only"),
    page: msg("Page"),
    custom: msg("Custom Page Prefix"),
    any: msg("Any"),
  };

  private readonly scheduleTypeLabels: Record<
    FormState["scheduleType"],
    string
  > = {
    now: msg("Run Immediately on Save"),
    date: msg("Run on a Specific Date & Time"),
    cron: msg("Run on a Recurring Basis"),
    none: msg("No Schedule"),
  };

  private readonly scheduleFrequencyLabels: Record<
    FormState["scheduleFrequency"],
    string
  > = {
    daily: msg("Daily"),
    weekly: msg("Weekly"),
    monthly: msg("Monthly"),
    "": "",
  };

  @query('form[name="newJobConfig"]')
  formElem!: HTMLFormElement;

  @queryAsync("btrix-tab-panel[aria-hidden=false]")
  activeTabPanel!: Promise<HTMLElement | null>;

  connectedCallback(): void {
    this.initializeEditor();
    super.connectedCallback();

    window.addEventListener("hashchange", () => {
      const hashValue = window.location.hash.slice(1);
      if (STEPS.includes(hashValue as any)) {
        this.updateProgressState({
          activeTab: hashValue as StepName,
        });
      }
    });
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("authState") && this.authState) {
      this.fetchAPIDefaults();
    }
    if (changedProperties.get("initialWorkflow") && this.initialWorkflow) {
      this.initializeEditor();
    }
    if (changedProperties.get("progressState") && this.progressState) {
      if (
        changedProperties.get("progressState").activeTab === "crawlSetup" &&
        this.progressState.activeTab !== "crawlSetup"
      ) {
        // Show that required tab has error even if input hasn't been touched
        if (
          !this.hasRequiredFields() &&
          !this.progressState.tabs.crawlSetup.error
        ) {
          this.updateProgressState({
            tabs: {
              crawlSetup: { error: true },
            },
          });
        }
      }
    }
    if (changedProperties.get("orgId") && this.orgId) {
      this.fetchTags();
    }
  }

  async updated(changedProperties: Map<string, any>) {
    if (changedProperties.get("progressState") && this.progressState) {
      if (
        changedProperties.get("progressState").activeTab !==
        this.progressState.activeTab
      ) {
        this.scrollToPanelTop();

        // Focus on first field in section
        (
          (await this.activeTabPanel)?.querySelector(
            "sl-input, sl-textarea, sl-select, sl-radio-group"
          ) as HTMLElement
        )?.focus();
      }
    }
  }

  async firstUpdated() {
    // Focus on first field in section
    (
      (await this.activeTabPanel)?.querySelector(
        "sl-input, sl-textarea, sl-select, sl-radio-group"
      ) as HTMLElement
    )?.focus();

    this.fetchTags();
  }

  private initializeEditor() {
    this.progressState = getDefaultProgressState(Boolean(this.configId));
    this.formState = {
      ...getDefaultFormState(),
      ...this.getInitialFormState(),
    };
    if (!this.formState.lang) {
      this.formState.lang = this.getInitialLang();
    }
    if (!this.formState.exclusions?.length) {
      this.formState.exclusions = [""]; // Add empty slot
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

  private getInitialFormState(): FormState {
    const defaultFormState = getDefaultFormState();
    if (!this.initialWorkflow) return defaultFormState;
    const formState: Partial<FormState> = {};
    const seedsConfig = this.initialWorkflow.config;
    const { seeds } = seedsConfig;
    let primarySeedConfig: SeedConfig | Seed = seedsConfig;
    if (this.initialWorkflow.jobType === "seed-crawl") {
      if (typeof seeds[0] === "string") {
        formState.primarySeedUrl = seeds[0];
      } else {
        primarySeedConfig = seeds[0];
        formState.primarySeedUrl = primarySeedConfig.url;
      }
      if (primarySeedConfig.include?.length) {
        formState.customIncludeUrlList = primarySeedConfig.include
          // Unescape regex
          .map((url) => url.replace(/(\\|\/\.\*)/g, ""))
          .join("\n");
        // if we have additional include URLs, set to "custom" scope here
        // to indicate 'Custom Page Prefix' option
        formState.scopeType = "custom";
      }
      const additionalSeeds = seeds.slice(1);
      if (additionalSeeds.length) {
        formState.urlList = mapSeedToUrl(additionalSeeds).join("\n");
      }
      formState.useSitemap = seedsConfig.useSitemap;
    } else {
      // Treat "custom" like URL list
      formState.urlList = mapSeedToUrl(seeds).join("\n");

      if (this.initialWorkflow.jobType === "custom") {
        formState.scopeType = seedsConfig.scopeType || "page";
      }
    }

    if (this.initialWorkflow.schedule) {
      formState.scheduleType = "cron";
      formState.scheduleFrequency = getScheduleInterval(
        this.initialWorkflow.schedule
      );
      const nextDate = getNextDate(this.initialWorkflow.schedule)!;
      formState.scheduleDayOfMonth = nextDate.getDate();
      formState.scheduleDayOfWeek = nextDate.getDay();
      const hours = nextDate.getHours();
      formState.scheduleTime = {
        hour: hours % 12 || 12,
        minute: nextDate.getMinutes(),
        period: hours > 11 ? "PM" : "AM",
      };
    } else {
      if (this.configId) {
        formState.scheduleType = "none";
      } else {
        formState.scheduleType = "now";
      }
    }

    if (this.initialWorkflow.tags?.length) {
      formState.tags = this.initialWorkflow.tags;
    }

    if (this.initialWorkflow.autoAddCollections?.length) {
      formState.autoAddCollections = this.initialWorkflow.autoAddCollections;
    }

    const secondsToMinutes = (value: any, fallback: number | null) => {
      if (typeof value === "number" && value > 0) return value / 60;
      return fallback;
    };

    return {
      primarySeedUrl: defaultFormState.primarySeedUrl,
      urlList: defaultFormState.urlList,
      customIncludeUrlList: defaultFormState.customIncludeUrlList,
      crawlTimeoutMinutes: secondsToMinutes(
        this.initialWorkflow.crawlTimeout,
        defaultFormState.crawlTimeoutMinutes
      ),
      behaviorTimeoutSeconds:
        seedsConfig.behaviorTimeout ?? defaultFormState.behaviorTimeoutSeconds,
      pageLoadTimeoutSeconds:
        seedsConfig.pageLoadTimeout ?? defaultFormState.pageLoadTimeoutSeconds,
      pageExtraDelaySeconds:
        seedsConfig.pageExtraDelay ?? defaultFormState.pageExtraDelaySeconds,
      maxScopeDepth: primarySeedConfig.depth ?? defaultFormState.maxScopeDepth,
      scale: this.initialWorkflow.scale,
      blockAds: this.initialWorkflow.config.blockAds,
      lang: this.initialWorkflow.config.lang,
      scheduleType: defaultFormState.scheduleType,
      scheduleFrequency: defaultFormState.scheduleFrequency,
      runNow: defaultFormState.runNow,
      tags: this.initialWorkflow.tags,
      autoAddCollections: this.initialWorkflow.autoAddCollections,
      jobName: this.initialWorkflow.name || defaultFormState.jobName,
      description: this.initialWorkflow.description,
      browserProfile: this.initialWorkflow.profileid
        ? ({ id: this.initialWorkflow.profileid } as Profile)
        : defaultFormState.browserProfile,
      scopeType: primarySeedConfig.scopeType as FormState["scopeType"],
      exclusions: seedsConfig.exclude,
      includeLinkedPages:
        Boolean(primarySeedConfig.extraHops || seedsConfig.extraHops) ?? true,
      useSitemap: defaultFormState.useSitemap,
      pageLimit:
        this.initialWorkflow.config.limit ?? defaultFormState.pageLimit,
      autoscrollBehavior: this.initialWorkflow.config.behaviors
        ? this.initialWorkflow.config.behaviors.includes("autoscroll")
        : defaultFormState.autoscrollBehavior,
      ...formState,
    };
  }

  render() {
    const tabLabels: Record<StepName, string> = {
      crawlSetup: msg("Scope"),
      crawlLimits: msg("Limits"),
      browserSettings: msg("Browser Settings"),
      crawlScheduling: msg("Scheduling"),
      crawlMetadata: msg("Metadata"),
      confirmSettings: msg("Review Config"),
    };

    return html`
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
          progressPanel="newJobConfig-${this.progressState.activeTab}"
        >
          <header slot="header" class="flex justify-between items-baseline">
            <h3 class="font-semibold">
              ${tabLabels[this.progressState.activeTab]}
            </h3>
            <p class="text-xs text-neutral-500 font-normal">
              ${msg(
                html`Fields marked with
                  <span style="color:var(--sl-input-required-content-color)"
                    >*</span
                  >
                  are required`
              )}
            </p>
          </header>

          ${orderedTabNames.map((tabName) =>
            this.renderNavItem(tabName, tabLabels[tabName])
          )}

          <btrix-tab-panel name="newJobConfig-crawlSetup" class="scroll-m-3">
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
          <btrix-tab-panel name="newJobConfig-crawlLimits" class="scroll-m-3">
            ${this.renderPanelContent(this.renderCrawlLimits())}
          </btrix-tab-panel>
          <btrix-tab-panel
            name="newJobConfig-browserSettings"
            class="scroll-m-3"
          >
            ${this.renderPanelContent(this.renderCrawlBehaviors())}
          </btrix-tab-panel>
          <btrix-tab-panel
            name="newJobConfig-crawlScheduling"
            class="scroll-m-3"
          >
            ${this.renderPanelContent(this.renderJobScheduling())}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-crawlMetadata" class="scroll-m-3">
            ${this.renderPanelContent(this.renderJobMetadata())}
          </btrix-tab-panel>
          <btrix-tab-panel
            name="newJobConfig-confirmSettings"
            class="scroll-m-3"
          >
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
    const isConfirmSettings = tabName === "confirmSettings";
    const { error: isInvalid, completed } = this.progressState.tabs[tabName];
    const iconProps = {
      name: "circle",
      library: "default",
      class: "text-neutral-400",
    };
    if (isConfirmSettings) {
      iconProps.name = "info-circle";
      iconProps.class = "text-base";
    } else {
      if (isInvalid) {
        iconProps.name = "exclamation-circle";
        iconProps.class = "text-danger";
      } else if (isActive) {
        iconProps.name = "pencil-circle-dashed";
        iconProps.library = "app";
        iconProps.class = "text-base";
      } else if (completed) {
        iconProps.name = "check-circle";
      }
    }

    return html`
      <btrix-tab
        slot="nav"
        name="newJobConfig-${tabName}"
        class="whitespace-nowrap"
        @click=${this.tabClickHandler(tabName)}
      >
        <sl-tooltip
          content=${msg("Form section contains errors")}
          ?disabled=${!isInvalid}
          hoist
        >
          <sl-icon
            name=${iconProps.name}
            library=${iconProps.library}
            class="inline-block align-middle mr-1 text-base ${iconProps.class}"
          ></sl-icon>
        </sl-tooltip>
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
      <div class="border rounded-lg flex flex-col h-full">
        <div class="flex-1 p-6 grid grid-cols-5 gap-4">
          ${content}
          ${when(this.serverError, () =>
            this.renderErrorAlert(this.serverError!)
          )}
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
                <sl-icon slot="prefix" name="chevron-left"></sl-icon>
                ${this.configId ? msg("Cancel") : msg("Start Over")}
              </sl-button>
            `
          : html`
              <sl-button size="small" @click=${this.backStep}>
                <sl-icon slot="prefix" name="chevron-left"></sl-icon>
                ${msg("Previous Step")}
              </sl-button>
            `}
        ${when(
          this.configId,
          () => html`
            <div>
              ${when(
                !isLast,
                () => html`
                  <sl-button class="mr-1" size="small" @click=${this.nextStep}>
                    <sl-icon slot="suffix" name="chevron-right"></sl-icon>
                    ${msg("Next")}
                  </sl-button>
                `
              )}

              <sl-button
                type="submit"
                size="small"
                variant="primary"
                ?disabled=${this.isSubmitting}
                ?loading=${this.isSubmitting}
              >
                ${msg("Save Changes")}
              </sl-button>
            </div>
          `,
          () =>
            isLast
              ? html`<sl-button
                  type="submit"
                  size="small"
                  variant="primary"
                  ?disabled=${this.isSubmitting || this.formHasError}
                  ?loading=${this.isSubmitting}
                >
                  ${this.formState.scheduleType === "now" ||
                  this.formState.runNow
                    ? msg("Save & Run Crawl")
                    : this.formState.scheduleType === "none"
                    ? msg("Save Workflow")
                    : msg("Save & Schedule Crawl")}
                </sl-button>`
              : html`
                  <div>
                    <sl-button
                      class="mr-1"
                      size="small"
                      variant="primary"
                      @click=${this.nextStep}
                    >
                      <sl-icon slot="suffix" name="chevron-right"></sl-icon>
                      ${msg("Next Step")}
                    </sl-button>
                    <sl-button
                      size="small"
                      @click=${() => {
                        if (this.hasRequiredFields()) {
                          this.updateProgressState({
                            activeTab: "confirmSettings",
                          });
                        } else {
                          this.nextStep();
                        }
                      }}
                    >
                      <sl-icon
                        slot="suffix"
                        name="chevron-double-right"
                      ></sl-icon>
                      ${msg("Review & Save")}
                    </sl-button>
                  </div>
                `
        )}
      </div>
    `;
  }

  private renderSectionHeading(content: TemplateResult | string) {
    return html`
      <btrix-section-heading class="col-span-5">
        <h4>${content}</h4>
      </btrix-section-heading>
    `;
  }

  private renderFormCol = (content: TemplateResult) => {
    return html`<div class="col-span-5 md:col-span-3">${content}</div> `;
  };

  private renderHelpTextCol(content: TemplateResult | string, padTop = true) {
    return html`
      <div class="col-span-5 md:col-span-2 flex${padTop ? " pt-6" : ""}">
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
          inputmode="url"
          value=${this.formState.urlList}
          placeholder=${`https://example.com
https://example.com/path`}
          required
          @sl-input=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (
              !inputEl.checkValidity() &&
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
              inputEl.helpText = text;
              inputEl.setCustomValidity(text);
            }
          }}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(
        msg(`The crawler will visit and record each URL listed in the order
        defined here.`)
      )}
      ${when(
        isCustom,
        () => html`
          ${this.renderFormCol(html`
            <sl-select
              name="scopeType"
              label=${msg("Crawl Scope")}
              value=${this.formState.scopeType}
              @sl-change=${(e: Event) =>
                this.updateFormState({
                  scopeType: (e.target as HTMLSelectElement)
                    .value as FormState["scopeType"],
                })}
            >
              <sl-option value="prefix">
                ${this.scopeTypeLabels["prefix"]}
              </sl-option>
              <sl-option value="host">
                ${this.scopeTypeLabels["host"]}
              </sl-option>
              <sl-option value="domain">
                ${this.scopeTypeLabels["domain"]}
              </sl-option>
              <sl-option value="page-spa">
                ${this.scopeTypeLabels["page-spa"]}
              </sl-option>
              <sl-option value="page">
                ${this.scopeTypeLabels["page"]}
              </sl-option>
              <sl-option value="custom">
                ${this.scopeTypeLabels["custom"]}
              </sl-option>
              <sl-option value="any">
                ${this.scopeTypeLabels["any"]}
              </sl-option>
            </sl-select>
          `)}
          ${this.renderHelpTextCol(
            msg(`Tells the crawler which pages it can visit.`)
          )}
        `
      )}
      ${this.renderFormCol(html`<sl-checkbox
        name="includeLinkedPages"
        ?checked=${this.formState.includeLinkedPages}
      >
        ${msg("Include Any Linked Page")}
      </sl-checkbox>`)}
      ${this.renderHelpTextCol(
        msg(`If checked, the crawler will visit pages one link away from a Crawl
        URL.`),
        false
      )}
      ${when(
        this.formState.includeLinkedPages || this.jobType === "custom",
        () => html`
          ${this.renderFormCol(html`
            <btrix-queue-exclusion-table
              .exclusions=${this.formState.exclusions}
              pageSize="30"
              editable
              removable
              @on-remove=${this.handleRemoveRegex}
              @on-change=${this.handleChangeRegex}
            ></btrix-queue-exclusion-table>
            <sl-button
              class="w-full mt-1"
              @click=${() =>
                this.updateFormState({
                  exclusions: [""],
                })}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              <span class="text-neutral-600">${msg("Add More")}</span>
            </sl-button>
          `)}
          ${this.renderHelpTextCol(
            msg(`Specify exclusion rules for what pages should not be visited.
            Exclusions apply to all URLs.`)
          )}
        `
      )}
    `;
  };

  private renderSeededCrawlSetup = () => {
    const urlPlaceholder = "https://example.com/path/page.html";
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
          html`Will crawl all pages and paths in the same directory, e.g.
            <span class="text-blue-500 break-word break-word"
              >${exampleDomain}</span
            ><span class="text-blue-500 font-medium break-word"
              >/path/page-2</span
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
            hash anchor links, e.g.
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            ><span class="text-blue-500 font-medium break-word"
              >#example-page</span
            >`
        );
        break;
      case "custom":
        helpText = msg(
          html`Will crawl all page URLs that begin with
            <span class="text-blue-500 break-word"
              >${exampleDomain}${examplePathname}</span
            >
            or any URL that begins with those specified in
            <em>Extra URLs in Scope</em>`
        );
        break;
      default:
        helpText = "";
        break;
    }
    const exclusions = trimArray(this.formState.exclusions || []);
    const additionalUrlList = urlListToArray(this.formState.urlList);

    return html`
      ${this.renderFormCol(html`
        <sl-input
          name="primarySeedUrl"
          label=${msg("Crawl Start URL")}
          autocomplete="off"
          inputmode="url"
          placeholder=${urlPlaceholder}
          value=${this.formState.primarySeedUrl}
          required
          @sl-input=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (!inputEl.checkValidity() && validURL(inputEl.value)) {
              inputEl.setCustomValidity("");
              inputEl.helpText = "";
            }
          }}
          @sl-blur=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (inputEl.value && !validURL(inputEl.value)) {
              const text = msg("Please enter a valid URL.");
              inputEl.helpText = text;
              inputEl.setCustomValidity(text);
            }
          }}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(msg(`The starting point of your crawl.`))}
      ${this.renderFormCol(html`
        <sl-select
          name="scopeType"
          label=${msg("Start URL Scope")}
          value=${this.formState.scopeType}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scopeType: (e.target as HTMLSelectElement)
                .value as FormState["scopeType"],
            })}
        >
          <div slot="help-text">${helpText}</div>
          <sl-option value="page-spa">
            ${this.scopeTypeLabels["page-spa"]}
          </sl-option>
          <sl-option value="prefix">
            ${this.scopeTypeLabels["prefix"]}
          </sl-option>
          <sl-option value="host"> ${this.scopeTypeLabels["host"]} </sl-option>
          <sl-option value="domain">
            ${this.scopeTypeLabels["domain"]}
          </sl-option>
          <sl-option value="custom">
            ${this.scopeTypeLabels["custom"]}
          </sl-option>
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        msg(`Tells the crawler which pages it can visit.`)
      )}
      ${when(
        DEPTH_SUPPORTED_SCOPES.includes(this.formState.scopeType),
        () => html`
          ${this.renderFormCol(html`
            <sl-input
              name="maxScopeDepth"
              label=${msg("Max Depth")}
              value=${this.formState.maxScopeDepth}
              placeholder=${msg("Default: Unlimited")}
              min="0"
              type="number"
              inputmode="numeric"
            >
              <span slot="suffix">${msg("hops")}</span>
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            msg(
              `Limits how many hops away the crawler can visit while staying within the Start URL Scope.`
            )
          )}
        `
      )}
      ${when(
        this.formState.scopeType === "custom",
        () => html`
          ${this.renderFormCol(html`
            <sl-textarea
              name="customIncludeUrlList"
              label=${msg("Extra URLs in Scope")}
              rows="3"
              autocomplete="off"
              inputmode="url"
              value=${this.formState.customIncludeUrlList}
              placeholder=${`https://example.org
https://example.net`}
              required
            ></sl-textarea>
          `)}
          ${this.renderHelpTextCol(
            msg(`If the crawler finds pages outside of the Start URL Scope they
            will only be saved if they begin with URLs listed here.`)
          )}
        `
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
        msg(`If checked, the crawler will visit pages one link away outside of
        Start URL Scope.`),
        false
      )}
      ${this.renderFormCol(html`
        <sl-checkbox
          name="useSitemap"
          ?checked=${this.formState.useSitemap}
        >
          ${msg("Check For Sitemap")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(`If checked, the crawler will check for a sitemap at /sitemap.xml and use it to discover pages to crawl if present.`),
        false
      )}
      <div class="col-span-5">
        <btrix-details ?open=${exclusions.length > 0}>
          <span slot="title"
            >${msg("Exclusions")}
            ${exclusions.length
              ? html`<btrix-badge>${exclusions.length}</btrix-badge>`
              : ""}</span
          >
          <div class="grid grid-cols-5 gap-4 py-2">
            ${this.renderFormCol(html`
              <btrix-queue-exclusion-table
                label=""
                .exclusions=${this.formState.exclusions}
                pageSize="10"
                editable
                removable
                @on-remove=${this.handleRemoveRegex}
                @on-change=${this.handleChangeRegex}
              ></btrix-queue-exclusion-table>
              <sl-button
                class="w-full mt-1"
                @click=${() =>
                  this.updateFormState({
                    exclusions: [""],
                  })}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                <span class="text-neutral-600">${msg("Add More")}</span>
              </sl-button>
            `)}
            ${this.renderHelpTextCol(
              msg(
                `Specify exclusion rules for what pages should not be visited.`
              )
            )}
          </div></btrix-details
        >
      </div>

      <div class="col-span-5">
        <btrix-details>
          <span slot="title">
            ${msg("Additional URLs")}
            ${additionalUrlList.length
              ? html`<btrix-badge>${additionalUrlList.length}</btrix-badge>`
              : ""}
          </span>
          <div class="grid grid-cols-5 gap-4 py-2">
            ${this.renderFormCol(html`
              <sl-textarea
                name="urlList"
                label=${msg("List of URLs")}
                rows="3"
                autocomplete="off"
                inputmode="url"
                value=${this.formState.urlList}
                placeholder=${`https://webrecorder.net/blog
https://archiveweb.page/images/${"logo.svg"}`}
                @sl-input=${async (e: Event) => {
                  const inputEl = e.target as SlInput;
                  await inputEl.updateComplete;
                  if (
                    !inputEl.checkValidity() &&
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
                    inputEl.helpText = text;
                    inputEl.setCustomValidity(text);
                  }
                }}
              ></sl-textarea>
            `)}
            ${this.renderHelpTextCol(
              msg(`The crawler will visit and record each URL listed here. Other
              links on these pages will not be crawled.`)
            )}
          </div>
        </btrix-details>
      </div>
    `;
  };

  private renderCrawlLimits() {
    // Max Pages minimum value cannot be lower than seed count
    const minPages = Math.max(
      1,
      urlListToArray(this.formState.urlList).length +
        (this.jobType === "seed-crawl" ? 1 : 0)
    );
    const onInputMinMax = async (e: CustomEvent) => {
      const inputEl = e.target as SlInput;
      await inputEl.updateComplete;
      let helpText = "";
      if (!inputEl.checkValidity()) {
        const value = +inputEl.value;
        const min = inputEl.min;
        const max = inputEl.max;
        if (min && value < +min) {
          helpText = msg(
            str`Must be more than minimum of ${(+min).toLocaleString()}`
          );
        } else if (max && value > +max) {
          helpText = msg(
            str`Must be less than maximum of ${(+max).toLocaleString()}`
          );
        }
      }
      inputEl.helpText = helpText;
    };
    return html`
      ${this.renderSectionHeading(msg("Per-Crawl Limits"))}
      ${this.renderFormCol(html`
        <sl-mutation-observer
          attr="min"
          @sl-mutation=${async (e: CustomEvent) => {
            // Input `min` attribute changes dynamically in response
            // to number of seed URLs. Watch for changes to `min`
            // and set validity accordingly
            const mutationRecord = e.detail.mutationList[0];
            const inputEl = mutationRecord.target as SlInput;
            await inputEl.updateComplete;
            inputEl.checkValidity();
            await inputEl.updateComplete;
            this.syncTabErrorState(inputEl);
          }}
        >
          <sl-input
            name="pageLimit"
            label=${msg("Max Pages")}
            type="number"
            inputmode="numeric"
            value=${this.formState.pageLimit || ""}
            min=${minPages}
            max=${ifDefined(
              this.orgDefaults?.maxPagesPerCrawl &&
                this.orgDefaults.maxPagesPerCrawl < Infinity
                ? this.orgDefaults.maxPagesPerCrawl
                : undefined
            )}
            placeholder=${this.orgDefaults?.maxPagesPerCrawl
              ? this.orgDefaults.maxPagesPerCrawl === Infinity
                ? msg("Default: Unlimited")
                : msg(
                    str`Default: ${this.orgDefaults.maxPagesPerCrawl.toLocaleString()}`
                  )
              : ""}
            @sl-input=${onInputMinMax}
          >
            <span slot="suffix">${msg("pages")}</span>
          </sl-input>
        </sl-mutation-observer>
      `)}
      ${this.renderHelpTextCol(
        msg(`Adds a hard limit on the number of pages
      that will be crawled.`)
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="crawlTimeoutMinutes"
          label=${msg("Crawl Time Limit")}
          value=${this.formState.crawlTimeoutMinutes || ""}
          placeholder=${msg("Default: Unlimited")}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Gracefully stop the crawler after a specified time limit.`)
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
        msg(`Increasing parallel crawler instances can speed up crawls, but may
        increase the chances of getting rate limited.`)
      )}
      ${this.renderSectionHeading(msg("Per-Page Limits"))}
      ${this.renderFormCol(html`
        <sl-input
          name="pageLoadTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Page Load Timeout")}
          placeholder=${this.orgDefaults?.pageLoadTimeoutSeconds
            ? msg(
                str`Default: ${this.orgDefaults.pageLoadTimeoutSeconds.toLocaleString()}`
              )
            : "Default: Unlimited"}
          value=${ifDefined(this.formState.pageLoadTimeoutSeconds ?? undefined)}
          min="0"
          @sl-input=${onInputMinMax}
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `Limits amount of time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.`
        )
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="behaviorTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Behavior Timeout")}
          placeholder=${this.orgDefaults?.behaviorTimeoutSeconds
            ? msg(
                str`Default: ${this.orgDefaults.behaviorTimeoutSeconds.toLocaleString()}`
              )
            : msg("Unlimited")}
          value=${ifDefined(this.formState.behaviorTimeoutSeconds ?? undefined)}
          min="0"
          @sl-input=${onInputMinMax}
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Limits how long behaviors can run on each page.`)
      )}
      ${this.renderFormCol(html`<sl-checkbox
        name="autoscrollBehavior"
        ?checked=${this.formState.autoscrollBehavior}
      >
        ${msg("Auto-Scroll Behavior")}
      </sl-checkbox>`)}
      ${this.renderHelpTextCol(
        msg(
          `When enabled the browser will automatically scroll to the end of the page.`
        ),
        false
      )}
      ${this.renderFormCol(html`
        <sl-input
          name="pageExtraDelaySeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Delay Before Next Page")}
          placeholder=${"Default: 0"}
          value=${ifDefined(this.formState.pageExtraDelaySeconds ?? undefined)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `Waits on the page after behaviors are complete before moving onto the next page. Can be helpful for rate limiting.`
        )
      )}
    `;
  }

  private renderCrawlBehaviors() {
    return html`
      ${this.renderFormCol(html`
        <btrix-select-browser-profile
          orgId=${this.orgId}
          .profileId=${this.formState.browserProfile?.id}
          .authState=${this.authState}
          @on-change=${(e: any) =>
            this.updateFormState({
              browserProfile: e.detail.value,
            })}
        ></btrix-select-browser-profile>
      `)}
      ${this.renderHelpTextCol(
        msg(`Choose a custom profile to make use of saved cookies and logged-in
        accounts.`)
      )}
      ${this.renderFormCol(html`
        <sl-checkbox name="blockAds" ?checked=${this.formState.blockAds}>
          ${msg("Block Ads by Domain")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(html`Blocks advertising content from being loaded. Uses
          <a
            href="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
            class="text-blue-600 hover:text-blue-500"
            target="_blank"
            rel="noopener noreferrer nofollow"
            >Steven Black’s Hosts file</a
          >.`),
        false
      )}
      ${this.renderFormCol(html`
        <btrix-language-select
          value=${this.formState.lang}
          @on-change=${(e: CustomEvent) => {
            this.updateFormState({
              lang: (e.detail as any).value,
            });
          }}
        >
          <span slot="label">${msg("Language")}</span>
        </btrix-language-select>
      `)}
      ${this.renderHelpTextCol(
        msg(`Websites that observe the browser’s language setting may serve
        content in that language if available.`)
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
          <sl-radio value="none">${this.scheduleTypeLabels["none"]}</sl-radio>
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        msg(`Should a crawl run immediately when setup is complete, on a set
        day, or on a recurring schedule?`)
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
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scheduleFrequency: (e.target as HTMLSelectElement)
                .value as FormState["scheduleFrequency"],
            })}
        >
          <sl-option value="daily"
            >${this.scheduleFrequencyLabels["daily"]}</sl-option
          >
          <sl-option value="weekly"
            >${this.scheduleFrequencyLabels["weekly"]}</sl-option
          >
          <sl-option value="monthly"
            >${this.scheduleFrequencyLabels["monthly"]}</sl-option
          >
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        msg(`Limit the frequency for how often a crawl will run.`)
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
            msg(`What day of the week should a crawl run on?`)
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
              inputmode="numeric"
              min="1"
              max="31"
              value=${this.formState.scheduleDayOfMonth}
              required
            >
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            msg(`What day of the month should a crawl run on?`)
          )}
        `
      )}
      ${this.renderFormCol(html`
        <btrix-time-input
          hour=${ifDefined(this.formState.scheduleTime?.hour)}
          minute=${ifDefined(this.formState.scheduleTime?.minute)}
          period=${ifDefined(this.formState.scheduleTime?.period)}
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
        msg(`A crawl will run at this time in your current timezone.`)
      )}
      ${this.renderFormCol(html`<sl-checkbox
        name="runNow"
        ?checked=${this.formState.runNow}
      >
        ${msg("Also run a crawl immediately on save")}
      </sl-checkbox>`)}
      ${this.renderHelpTextCol(
        msg(`If checked, a crawl will run at the time specified above and also
        once when setup is complete.`),
        false
      )}
    `;
  };

  private renderJobMetadata() {
    return html`
      ${this.renderFormCol(html`
        <sl-input
          class="with-max-help-text"
          name="jobName"
          label=${msg("Name")}
          autocomplete="off"
          placeholder=${msg("Our Website (example.com)")}
          value=${this.formState.jobName}
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Customize this Workflow's name. Workflows are named after
        the first Crawl URL by default.`)
      )}
      ${this.renderFormCol(html`
        <sl-textarea
          class="with-max-help-text"
          name="description"
          label=${msg("Description")}
          autocomplete="off"
          value=${this.formState.description}
          help-text=${this.validateDescriptionMax.helpText}
          @sl-input=${this.validateDescriptionMax.validate}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(msg(`Provide details about this Workflow.`))}
      ${this.renderFormCol(
        html`
          <btrix-tag-input
            .initialTags=${this.formState.tags}
            .tagOptions=${this.tagOptions}
            @tag-input=${this.onTagInput}
            @tags-change=${(e: TagsChangeEvent) =>
              this.updateFormState(
                {
                  tags: e.detail.tags,
                },
                true
              )}
          ></btrix-tag-input>
        `
      )}
      ${this.renderHelpTextCol(
        msg(`Create or assign this crawl (and its outputs) to one or more tags
        to help organize your archived data.`)
      )}
      ${this.renderFormCol(
        html`
          <btrix-collections-add
            .authState=${this.authState}
            .initialCollections=${this.formState.autoAddCollections}
            .orgId=${this.orgId}
            .configId=${this.configId}
            emptyText=${msg("Search for a Collection to auto-add crawls")}
            @collections-change=${(e: CollectionsChangeEvent) =>
              this.updateFormState(
                {
                  autoAddCollections: e.detail.collections,
                },
                true
              )}
          ></btrix-collections-add>
        `
      )}
      ${this.renderHelpTextCol(
        msg(`Automatically add crawls from this workflow to one or more collections
          as soon as they complete.
          Individual crawls can be selected from within the collection later.`)
      )}
    `;
  }

  private renderErrorAlert(errorMessage: string | TemplateResult) {
    return html`
      <div class="col-span-5">
        <btrix-alert variant="danger">${errorMessage}</btrix-alert>
      </div>
    `;
  }

  private renderConfirmSettings = () => {
    const errorAlert = when(this.formHasError, () => {
      const crawlSetupUrl = `${window.location.href.split("#")[0]}#crawlSetup`;
      const errorMessage = this.hasRequiredFields()
        ? msg(
            "There are issues with this Workflow. Please go through previous steps and fix all issues to continue."
          )
        : msg(html`There is an issue with this Workflow:<br /><br />Crawl URL(s)
            required in
            <a href="${crawlSetupUrl}" class="bold underline hover:no-underline"
              >Crawl Setup</a
            >. <br /><br />
            Please fix to continue.`);

      return this.renderErrorAlert(errorMessage);
    });

    return html`
      ${errorAlert}

      <div class="col-span-5">
        ${when(this.progressState.activeTab === "confirmSettings", () => {
          // Prevent parsing and rendering tab when not visible
          const crawlConfig = this.parseConfig();
          const profileName = this.formState.browserProfile?.name;

          return html`<btrix-config-details
            .authState=${this.authState!}
            .crawlConfig=${{ ...crawlConfig, profileName, oid: this.orgId }}
          >
          </btrix-config-details>`;
        })}
      </div>

      ${errorAlert}
    `;
  };

  private hasRequiredFields(): Boolean {
    if (this.jobType === "seed-crawl") {
      return Boolean(this.formState.primarySeedUrl);
    }
    return Boolean(this.formState.urlList);
  }

  private async scrollToPanelTop() {
    const activeTabPanel = (await this.activeTabPanel) as HTMLElement;
    if (activeTabPanel && activeTabPanel.getBoundingClientRect().top < 0) {
      activeTabPanel.scrollIntoView({
        behavior: "smooth",
      });
    }
  }

  private getDefaultJobName() {
    // Set default crawl name based on seed URLs
    if (!this.formState.primarySeedUrl && !this.formState.urlList) {
      return;
    }
    let jobName = "";
    if (this.jobType === "seed-crawl") {
      jobName = this.formState.primarySeedUrl;
    } else {
      const urlList = urlListToArray(this.formState.urlList);

      const firstUrl = urlList[0].trim();
      if (urlList.length > 1) {
        const remainder = urlList.length - 1;
        if (remainder === 1) {
          jobName = msg(str`${firstUrl} + ${remainder} more URL`);
        } else {
          jobName = msg(str`${firstUrl} + ${remainder} more URLs`);
        }
      } else {
        jobName = firstUrl;
      }
    }
    return jobName;
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
    // Check [data-user-invalid] to validate only touched inputs
    if ("userInvalid" in el.dataset) {
      if (this.progressState.tabs[currentTab].error) return;
      this.updateProgressState({
        tabs: {
          [currentTab]: { error: true },
        },
      });
    } else if (this.progressState.tabs[currentTab].error) {
      this.syncTabErrorState(el);
    }
  };

  private syncTabErrorState(el: HTMLElement) {
    const panelEl = el.closest("btrix-tab-panel")!;
    const tabName = panelEl
      .getAttribute("name")!
      .replace("newJobConfig-", "") as StepName;
    const hasInvalid = panelEl.querySelector("[data-user-invalid]");

    if (!hasInvalid && this.progressState.tabs[tabName].error) {
      this.updateProgressState({
        tabs: {
          [tabName]: { error: false },
        },
      });
    } else if (hasInvalid && !this.progressState.tabs[tabName].error) {
      this.updateProgressState({
        tabs: {
          [tabName]: { error: true },
        },
      });
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
          if (elem.value === "") {
            value = null;
          } else {
            value = +elem.value;
          }
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
    window.location.hash = step;
    this.updateProgressState({ activeTab: step });
  };

  private backStep() {
    const targetTabIdx = STEPS.indexOf(this.progressState.activeTab!);
    if (targetTabIdx) {
      this.updateProgressState({
        activeTab: STEPS[targetTabIdx - 1] as StepName,
      });
    }
  }

  private nextStep() {
    const isValid = this.checkCurrentPanelValidity();

    if (isValid) {
      const { activeTab } = this.progressState;
      const nextTab = STEPS[STEPS.indexOf(activeTab!) + 1] as StepName;
      this.updateProgressState({
        activeTab: nextTab,
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
      if (
        !event.metaKey &&
        !event.shiftKey &&
        key.length === 1 &&
        /\D/.test(key)
      ) {
        event.preventDefault();
        return;
      }
    }
    if (
      key === "Enter" &&
      this.progressState.activeTab !== STEPS[STEPS.length - 1]
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
    this.isSubmitting = true;

    try {
      const data = await (this.configId
        ? this.apiFetch(
            `/orgs/${this.orgId}/crawlconfigs/${this.configId}`,
            this.authState!,
            {
              method: "PATCH",
              body: JSON.stringify(config),
            }
          )
        : this.apiFetch(`/orgs/${this.orgId}/crawlconfigs/`, this.authState!, {
            method: "POST",
            body: JSON.stringify(config),
          }));

      const crawlId = data.run_now_job;
      let message = msg("Workflow created.");

      if (crawlId) {
        message = msg("Crawl started with new template.");
      } else if (this.configId) {
        message = msg("Workflow updated.");
      }

      this.notify({
        message,
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      this.navTo(
        `/orgs/${this.orgId}/workflows/crawl/${this.configId || data.id}${
          crawlId ? "#watch" : ""
        }`
      );
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
    this.initializeEditor();
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
        "Couldn't save Workflow. Please fix the following Workflow issues:"
      )}
      <ul class="list-disc w-fit pl-4">
        ${detailsWithoutDictError.map(renderDetail)}
      </ul>
    `;
  }

  private onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse.search(value).map(({ item }) => item);
  };

  private async fetchTags() {
    this.tagOptions = [];
    try {
      const tags = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/tags`,
        this.authState!
      );

      // Update search/filter collection
      this.fuse.setCollection(tags as any);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private parseConfig(): NewCrawlConfigParams {
    const config: NewCrawlConfigParams = {
      jobType: this.jobType || "custom",
      name: this.formState.jobName || "",
      description: this.formState.description,
      scale: this.formState.scale,
      profileid: this.formState.browserProfile?.id || "",
      runNow: this.formState.runNow || this.formState.scheduleType === "now",
      schedule: this.formState.scheduleType === "cron" ? this.utcSchedule : "",
      crawlTimeout: this.formState.crawlTimeoutMinutes
        ? this.formState.crawlTimeoutMinutes * 60
        : null,
      tags: this.formState.tags,
      autoAddCollections: this.formState.autoAddCollections,
      config: {
        ...(this.jobType === "seed-crawl"
          ? this.parseSeededConfig()
          : this.parseUrlListConfig()),
        behaviorTimeout: this.formState.behaviorTimeoutSeconds,
        pageLoadTimeout: this.formState.pageLoadTimeoutSeconds,
        pageExtraDelay: this.formState.pageExtraDelaySeconds,

        limit: this.formState.pageLimit,
        lang: this.formState.lang || "",
        blockAds: this.formState.blockAds,
        exclude: trimArray(this.formState.exclusions),
        behaviors: (this.formState.autoscrollBehavior
          ? DEFAULT_BEHAVIORS
          : DEFAULT_BEHAVIORS.slice(1)
        ).join(","),
      },
    };

    return config;
  }

  private parseUrlListConfig(): Pick<
    NewCrawlConfigParams["config"],
    "seeds" | "scopeType" | "extraHops" | "useSitemap"
  > {
    const config = {
      seeds: urlListToArray(this.formState.urlList).map((seedUrl) => {
        const newSeed: Seed = { url: seedUrl, scopeType: "page" };
        return newSeed;
      }),
      scopeType: "page" as FormState["scopeType"],
      extraHops: this.formState.includeLinkedPages ? 1 : 0,
      useSitemap: false,
    };

    return config;
  }

  private parseSeededConfig(): Pick<
    NewCrawlConfigParams["config"],
    "seeds" | "scopeType" | "useSitemap"
  > {
    const primarySeedUrl = this.formState.primarySeedUrl;
    const includeUrlList = this.formState.customIncludeUrlList
      ? urlListToArray(this.formState.customIncludeUrlList)
      : [];
    const additionalSeedUrlList = this.formState.urlList
      ? urlListToArray(this.formState.urlList).map((seedUrl) => {
          const newSeed: Seed = { url: seedUrl, scopeType: "page" };
          return newSeed;
        })
      : [];
    const primarySeed: Seed = {
      url: primarySeedUrl,
      // the 'custom' scope here indicates we have extra URLs, actually set to 'prefix'
      // scope on backend to ensure seed URL is also added as part of standard prefix scope
      scopeType:
        this.formState.scopeType === "custom"
          ? "prefix"
          : this.formState.scopeType,
      include:
        this.formState.scopeType === "custom"
          ? [...includeUrlList.map((url) => regexEscape(url))]
          : [],
      extraHops: this.formState.includeLinkedPages ? 1 : 0,
    };

    if (DEPTH_SUPPORTED_SCOPES.includes(this.formState.scopeType)) {
      primarySeed.depth = this.formState.maxScopeDepth;
    }

    const config = {
      seeds: [primarySeed, ...additionalSeedUrlList],
      scopeType: this.formState.scopeType,
      useSitemap: this.formState.useSitemap,
    };
    return config;
  }

  private updateProgressState(
    nextState: {
      activeTab?: ProgressState["activeTab"];
      tabs?: {
        [K in StepName]?: Partial<TabState>;
      };
    },
    shallowMerge = false
  ) {
    if (shallowMerge) {
      this.progressState = {
        ...this.progressState,
        ...(nextState as Partial<ProgressState>),
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

  private async fetchAPIDefaults() {
    try {
      const resp = await fetch("/api/settings", {
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        throw new Error(resp.statusText);
      }
      const orgDefaults = {
        ...this.orgDefaults,
      };
      const data = await resp.json();
      if (data.defaultBehaviorTimeSeconds > 0) {
        orgDefaults.behaviorTimeoutSeconds = data.defaultBehaviorTimeSeconds;
      }
      if (data.defaultPageLoadTimeSeconds > 0) {
        orgDefaults.pageLoadTimeoutSeconds = data.defaultPageLoadTimeSeconds;
      }
      if (data.maxPagesPerCrawl > 0) {
        orgDefaults.maxPagesPerCrawl = data.maxPagesPerCrawl;
      }
      this.orgDefaults = orgDefaults;
    } catch (e: any) {
      console.debug(e);
    }
  }
}

customElements.define("btrix-workflow-editor", CrawlConfigEditor);
