import type { TemplateResult } from "lit";
import type { SlCheckbox, SlInput } from "@shoelace-style/shoelace";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import compact from "lodash/fp/compact";
import flow from "lodash/fp/flow";
import merge from "lodash/fp/merge";
import pickBy from "lodash/fp/pickBy";

import seededCrawlSvg from "../../assets/images/new-job-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-job-config_URL-List.svg";
import LiteElement, { html } from "../../utils/LiteElement";
import type { AuthState } from "../../utils/AuthService";
import type { Tab } from "../../components/tab-list";
import type {
  ExclusionRemoveEvent,
  ExclusionChangeEvent,
} from "../../components/queue-exclusion-table";
import type { JobConfig } from "./types";

type JobType = null | "urlList" | "seeded";
type TabName =
  | "crawlerSetup"
  | "crawlBehaviors"
  | "jobScheduling"
  | "jobInformation";
type Tabs = Record<
  TabName,
  {
    enabled: boolean;
    completed: boolean;
    error: boolean;
  }
>;
type StepName = "chooseJobType" | TabName;
type ProgressState = {
  currentStep: StepName;
  activeTab: TabName | null;
  tabs: Tabs;
};
type FormState = {
  primarySeedUrl: string;
  urlList: string;
  includeLinkedPages: boolean;
  includeExternalLinks: boolean;
  scopeType: JobConfig["config"]["scopeType"];
  exclusions: JobConfig["config"]["exclude"];
};
const initialJobType: JobType = "seeded";
const initialProgressState: ProgressState = {
  activeTab: "crawlerSetup",
  currentStep: "crawlerSetup",
  tabs: {
    crawlerSetup: { enabled: true, error: false, completed: false },
    crawlBehaviors: { enabled: false, error: false, completed: false },
    jobScheduling: { enabled: false, error: false, completed: false },
    jobInformation: { enabled: false, error: false, completed: false },
  },
};
const defaultFormValues: JobConfig = {
  name: "",
  schedule: "",
  scale: 1,
  profileid: null,
  config: {
    seeds: [],
    scopeType: "domain",
    limit: null,
    extraHops: 0,
    lang: null,
    blockAds: null,
    behaviors: null,
  },
};
const initialFormState: FormState = {
  primarySeedUrl: "",
  urlList: "",
  includeLinkedPages: false,
  includeExternalLinks: false,
  scopeType: defaultFormValues.config.scopeType,
  exclusions: [""], // Empty slots for adding exclusions
};
const stepOrder: StepName[] = [
  "chooseJobType",
  "crawlerSetup",
  "crawlBehaviors",
  "jobScheduling",
  "jobInformation",
];
const orderedTabNames = stepOrder.filter(
  (stepName) => initialProgressState.tabs[stepName as TabName]
) as TabName[];

@localized()
export class NewJobConfig extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  private progressState: ProgressState = initialProgressState;

  @state()
  private formState: FormState = initialFormState;

  @state()
  private jobType: JobType = initialJobType;

  private get formHasError() {
    return Object.values(this.progressState.tabs).some(({ error }) => error);
  }

  @query('form[name="newJobConfig"]')
  formElem?: HTMLFormElement;

  render() {
    if (!this.progressState.activeTab) {
      return this.renderChooseJobType();
    }

    const tabLabels = {
      crawlerSetup: msg("Crawler Setup"),
      crawlBehaviors: msg("Crawl Behaviors"),
      jobScheduling: msg("Job Scheduling"),
      jobInformation: msg("Job Information"),
    };

    const contentClassName =
      "p-5 grid grid-cols-1 md:grid-cols-5 gap-x-6 gap-y-5";
    const formColClassName = "col-span-1 md:col-span-3";

    return html`
      <h3 class="ml-48 text-lg font-medium mb-3">
        ${tabLabels[this.progressState.activeTab]}
      </h3>

      <form name="newJobConfig" @submit=${this.onSubmit}>
        <btrix-tab-list
          activePanel="newJobConfig-${this.progressState.activeTab}"
          progressPanel="newJobConfig-${this.progressState.currentStep}"
        >
          ${orderedTabNames.map((tabName) =>
            this.renderNavItem(tabName, tabLabels[tabName])
          )}

          <btrix-tab-panel name="newJobConfig-crawlerSetup">
            <div class=${contentClassName}>
              ${this.jobType === "urlList"
                ? this.renderUrlListSetup(formColClassName)
                : ""}
              ${this.jobType === "seeded"
                ? this.renderSeededCrawlSetup(formColClassName)
                : ""}
            </div>
            ${this.renderFooter({ isFirst: true })}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-crawlBehaviors">
            <div class=${contentClassName}>
              ${this.renderCrawlBehaviors(formColClassName)}
            </div>
            ${this.renderFooter()}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-jobScheduling">
            <div class=${contentClassName}>
              ${this.renderJobScheduling(formColClassName)}
            </div>
            ${this.renderFooter()}
          </btrix-tab-panel>
          <btrix-tab-panel name="newJobConfig-jobInformation">
            <div class=${contentClassName}>
              ${this.renderJobInformation(formColClassName)}
            </div>
            ${this.renderFooter({ isLast: true })}
          </btrix-tab-panel>
        </btrix-tab-list>
      </form>
    `;
  }

  private renderChooseJobType() {
    return html`
      <h3 class="text-lg font-medium mb-3">${msg("Choose Job Type")}</h3>
      <div
        class="border rounded p-8 md:py-12 flex flex-col md:flex-row items-center justify-evenly"
      >
        <div
          role="button"
          class="block"
          @click=${() => this.selectJobType("urlList")}
        >
          <figure class="w-64 m-4">
            <img src=${urlListSvg} />
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
          class="block"
          @click=${() => this.selectJobType("seeded")}
        >
          <figure class="w-64 m-4">
            <img src=${seededCrawlSvg} />
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

  private renderNavItem(tabName: TabName, content: TemplateResult | string) {
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

  private renderFooter({ isFirst = false, isLast = false } = {}) {
    return html`
      <div class="px-5 py-4 border-t flex justify-between">
        ${isFirst
          ? html`
              <sl-button size="small" @click=${this.backStep}>
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
          ? html`<sl-button type="submit" size="small" variant="primary">
              ${msg("Save")}
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

  private renderHelpText(content: TemplateResult) {
    return html`
      <div class="colspan-1 md:col-span-2 mt-0.5 flex">
        <div class="text-base mr-1">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  private renderUrlListSetup(formColClassName: string) {
    return html`
      <div class="${formColClassName}">
        <sl-textarea
          name="urlList"
          label=${msg("List of URLs")}
          rows="6"
          autocomplete="off"
          defaultValue=${initialFormState.urlList}
          required
          @sl-change=${this.onFieldChange}
        ></sl-textarea>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">
        <sl-radio-group
          name="scale"
          label=${msg("Crawler Instances")}
          value=${defaultFormValues.scale}
        >
          <sl-radio-button value="1" size="small">1</sl-radio-button>
          <sl-radio-button value="2" size="small">2</sl-radio-button>
          <sl-radio-button value="3" size="small">3</sl-radio-button>
        </sl-radio-group>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">
        <sl-checkbox
          name="includeLinkedPages"
          ?defaultChecked=${initialFormState.includeLinkedPages}
          ?checked=${this.formState.includeLinkedPages}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              includeLinkedPages: (e.target as SlCheckbox).checked,
            })}
        >
          ${msg("Include Linked Pages")}
        </sl-checkbox>
      </div>
      ${this.renderHelpText(html`TODO`)}
      ${this.formState.includeLinkedPages
        ? this.renderCrawlLimits(formColClassName)
        : ""}
    `;
  }

  private renderSeededCrawlSetup(formColClassName: string) {
    const urlPlaceholder = "https://example.com";
    let exampleUrl = new URL(urlPlaceholder);
    if (this.formState.primarySeedUrl) {
      try {
        exampleUrl = new URL(this.formState.primarySeedUrl);
      } catch {}
    }
    const exampleDomain = exampleUrl.hostname;

    let helpText: TemplateResult | string;

    switch (this.formState.scopeType) {
      case "prefix":
        helpText = msg(
          html`Will recursively crawl all pages in path: if
            <span class="text-blue-400">${exampleDomain}/path/</span> is the
            Primary Seed URL, the crawler will also crawl
            <span class="text-blue-400">${exampleDomain}/path/subpath/</span>
            and deeper subpaths.`
        );
        break;
      case "host":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-400">${exampleDomain}</span> and ignore pages
            on any subdomains.`
        );
        break;
      case "domain":
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-400">${exampleDomain}</span> and
            <span class="text-blue-400">subdomain.${exampleDomain}</span>.`
        );
        break;
      case "page-spa":
        helpText = msg(
          html`Will only visit
            <span class="text-blue-400">${exampleUrl.href}</span> and links that
            stay within the same URL, e.g. hash anchor links:
            <span class="text-blue-400">${exampleUrl.href}#page</span>`
        );
        break;
      default:
        helpText = "";
        break;
    }

    return html`<div class="${formColClassName}">
        <sl-input
          name="primarySeedUrl"
          label=${msg("Primary Seed URL")}
          autocomplete="off"
          placeholder=${urlPlaceholder}
          defaultValue=${initialFormState.primarySeedUrl}
          required
          @sl-change=${(e: Event) => {
            this.updateFormState({
              primarySeedUrl: (e.target as SlInput).value,
            });
            // TODO validate URL
            this.onFieldChange(e);
          }}
        ></sl-input>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">
        <sl-select
          name="scopeType"
          label=${msg("Crawl Scope")}
          defaultValue=${initialFormState.scopeType}
          value=${this.formState.scopeType}
          @sl-select=${(e: Event) =>
            this.updateFormState({
              scopeType: (e.target as HTMLSelectElement).value,
            })}
        >
          <div slot="help-text">${helpText}</div>
          <sl-menu-item value="prefix">
            ${msg("Pages in This Path")}
          </sl-menu-item>
          <sl-menu-item value="host">
            ${msg("Pages on This Domain")}
          </sl-menu-item>
          <sl-menu-item value="domain">
            ${msg("Pages on This Domain & Subdomains")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-label>${msg("Advanced")}</sl-menu-label>
          <sl-menu-item value="page-spa">
            ${msg("Single Page App (In-Page Links Only)")}
          </sl-menu-item>
        </sl-select>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">
        <sl-radio-group
          name="scale"
          label=${msg("Crawler Instances")}
          value=${defaultFormValues.scale}
        >
          <sl-radio-button value="1" size="small">1</sl-radio-button>
          <sl-radio-button value="2" size="small">2</sl-radio-button>
          <sl-radio-button value="3" size="small">3</sl-radio-button>
        </sl-radio-group>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">
        <sl-checkbox
          name="includeExternalLinks"
          ?defaultChecked=${initialFormState.includeExternalLinks}
          ?checked=${this.formState.includeExternalLinks}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              includeExternalLinks: (e.target as SlCheckbox).checked,
            })}
        >
          ${msg("Include External Links (“one hop out”)")}
        </sl-checkbox>
      </div>
      ${this.renderHelpText(html`TODO`)}
      ${this.renderCrawlLimits(formColClassName)} `;
  }

  private renderCrawlLimits(formColClassName: string) {
    return html`
      <h4
        class="col-span-1 md:col-span-5 text-neutral-500 leading-none py-2 border-b"
      >
        ${msg("Crawl Limits")}
      </h4>
      <div class="${formColClassName}">
        <sl-input
          name="limit"
          label=${msg("Page Limit")}
          type="number"
          defaultValue=${defaultFormValues.config.limit || ""}
          placeholder=${msg("Unlimited")}
        >
          <span slot="suffix">${msg("pages")}</span>
        </sl-input>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">
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
      </div>
      ${this.renderHelpText(html`TODO`)}
    `;
  }

  private renderCrawlBehaviors(formColClassName: string) {
    return html`TODO`;
  }

  private renderJobScheduling(formColClassName: string) {
    return html`TODO`;
  }

  private renderJobInformation(formColClassName: string) {
    return html`TODO`;
  }

  private handleRemoveRegex(e: ExclusionRemoveEvent) {
    const { index } = e.detail;
    if (!this.formState.exclusions) {
      this.updateFormState(
        {
          exclusions: initialFormState.exclusions,
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

  private onFieldChange = (e: Event) => {
    const el = e.target as HTMLInputElement & {
      invalid: boolean;
    };
    const currentTab = this.progressState.activeTab as TabName;
    if (el.invalid) {
      const tabs = this.progressState.tabs;
      tabs[currentTab].error = true;
      this.updateProgressState({ tabs });
    } else if (this.progressState.tabs[currentTab].error) {
      const hasInvalid = el
        .closest("btrix-tab-panel")
        ?.querySelector("[data-invalid]");
      if (!hasInvalid) {
        const tabs = this.progressState.tabs;
        tabs[currentTab].error = false;
        this.updateProgressState({ tabs });
      }
    }
  };

  private tabClickHandler = (step: TabName) => (e: MouseEvent) => {
    const tab = e.currentTarget as Tab;
    if (tab.disabled || tab.active) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.updateProgressState({ activeTab: step });
  };

  private selectJobType(jobType: JobType) {
    this.jobType = jobType;
    const activeTab = "crawlerSetup";
    const tabs = this.progressState.tabs;
    tabs[activeTab].enabled = true;
    this.updateProgressState({
      activeTab,
      currentStep: activeTab,
      tabs,
    });
  }

  private backStep() {
    const targetTabIdx = stepOrder.indexOf(this.progressState.activeTab!) - 1;
    if (targetTabIdx) {
      this.updateProgressState({
        activeTab: stepOrder[
          stepOrder.indexOf(this.progressState.activeTab!) - 1
        ] as TabName,
      });
    } else {
      // Reset to job type selection
      this.updateProgressState(initialProgressState, true);
    }
  }

  private nextStep() {
    const isValid = this.checkCurrentPanelValidity();

    if (isValid) {
      const { activeTab, tabs, currentStep } = this.progressState;
      const nextTab = stepOrder[stepOrder.indexOf(activeTab!) + 1] as TabName;

      const isFirstEnabled = !tabs[nextTab].enabled;
      let nextTabs = tabs;
      let nextCurrentStep = currentStep;

      if (isFirstEnabled) {
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

    const activePanel = this.formElem.querySelector(
      `btrix-tab-panel[name="newJobConfig-${this.progressState.activeTab}"]`
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

  private onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;

    if (this.formHasError) {
      console.log("form has error");
      return;
    }

    const values = this.parseConfig(form);

    console.log(values);
  }

  private parseConfig(form: HTMLFormElement): JobConfig {
    const formValues = flow(
      merge({ ...defaultFormValues }),
      pickBy((v, key) => key in defaultFormValues)
    )(serialize(form)) as JobConfig;

    const params = merge(formValues, {
      scale: +formValues.scale,
      config: {
        exclude: compact(this.formState.exclusions),
      },
    });

    return params;
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
      this.progressState = merge(
        <ProgressState>this.progressState,
        <Partial<ProgressState>>nextState
      );
    }
  }

  private updateFormState(nextState: Partial<FormState>, shallowMerge = false) {
    if (shallowMerge) {
      this.formState = {
        ...this.formState,
        ...nextState,
      };
    } else {
      this.formState = merge(
        <FormState>this.formState,
        <Partial<FormState>>nextState
      );
    }
  }
}

customElements.define("btrix-new-job-config", NewJobConfig);
