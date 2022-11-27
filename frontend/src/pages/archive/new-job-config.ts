import type { TemplateResult } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import merge from "lodash/fp/merge";

import seededCrawlSvg from "../../assets/images/new-job-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-job-config_URL-List.svg";
import LiteElement, { html } from "../../utils/LiteElement";
import type { AuthState } from "../../utils/AuthService";
import type { Tab } from "../../components/tab-list";
import type {
  ExclusionRemoveEvent,
  ExclusionChangeEvent,
} from "../../components/queue-exclusion-table";
import type { CrawlConfig } from "./types";

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
  exclude: CrawlConfig["exclude"];
};
const initialJobType: JobType = null;
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
const initialFormState: FormState = {
  exclude: [""], // Empty slots for adding exclusions
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

    const contentClassName = "p-5 grid grid-cols-1 md:grid-cols-5 gap-5";
    const formColClassName = "col-span-1 md:col-span-3";

    return html`
      <h3 class="ml-52 text-lg font-medium mb-3">
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
            <div
              class="${contentClassName}${this.jobType === "seeded"
                ? " hidden"
                : ""}"
            >
              ${this.renderUrlListSetup(formColClassName)}
            </div>
            <div
              class="${contentClassName}${this.jobType === "urlList"
                ? " hidden"
                : ""}"
            >
              ${this.renderSeededCrawlSetup(formColClassName)}
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
        ?disabled=${!this.progressState.tabs[tabName].enabled}
        @click=${this.tabClickHandler(tabName)}
      >
        ${icon}
        <span class="inline-block align-middle">${content}</span>
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
      <div class="colspan-1 md:col-span-2 mt-5 flex">
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
          name="urls"
          label=${msg("List of URLs")}
          rows="6"
          autocomplete="off"
          ?required=${this.jobType === "urlList"}
          @sl-change=${this.onFieldChange}
        ></sl-textarea>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">
        <sl-radio-group
          name="scale"
          label=${msg("Crawler Instances")}
          value="1"
        >
          <sl-radio-button value="1" size="small">1</sl-radio-button>
          <sl-radio-button value="2" size="small">2</sl-radio-button>
          <sl-radio-button value="3" size="small">3</sl-radio-button>
        </sl-radio-group>
      </div>
      ${this.renderHelpText(html`TODO`)}

      <div class="${formColClassName}">${this.renderExclusionEditor()}</div>
      ${this.renderHelpText(html`TODO`)}
    `;
  }

  private renderSeededCrawlSetup(formColClassName: string) {
    return html`TODO`;
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

  private renderExclusionEditor() {
    return html`
      <btrix-queue-exclusion-table
        .exclusions=${this.formState.exclude}
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
            exclude: [...(this.formState.exclude || []), ""],
          })}
      >
        <sl-icon slot="prefix" name="plus-lg"></sl-icon>
        <span class="text-neutral-600">${msg("Add More")}</span>
      </sl-button>
    `;
  }

  private handleRemoveRegex(e: ExclusionRemoveEvent) {
    const { index } = e.detail;
    if (!this.formState.exclude) {
      this.updateFormState(
        {
          exclude: initialFormState.exclude,
        },
        true
      );
    } else {
      const { exclude } = this.formState;
      this.updateFormState(
        {
          exclude: [...exclude.slice(0, index), ...exclude.slice(index + 1)],
        },
        true
      );
    }
  }

  private handleChangeRegex(e: ExclusionChangeEvent) {
    const { regex, index } = e.detail;

    const nextExclusions = [...this.formState.exclude!];
    nextExclusions[index] = regex;
    this.updateFormState(
      {
        exclude: nextExclusions,
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
      this.updateProgressState(initialProgressState);
    }
  }

  private nextStep() {
    const isValid = this.checkCurrentPanelValidity();

    if (isValid) {
      const nextTab = stepOrder[
        stepOrder.indexOf(this.progressState.activeTab!) + 1
      ] as TabName;

      const { tabs, currentStep } = this.progressState;
      const isFirstEnabled = !tabs[nextTab].enabled;
      let nextTabs = tabs;
      let nextCurrentStep = currentStep;

      if (isFirstEnabled) {
        nextTabs[nextTab].enabled = true;
        nextCurrentStep = nextTab;
      }

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

    console.log(new FormData(form));
  }

  private updateProgressState(nextState: Partial<ProgressState>) {
    this.progressState = merge(
      <ProgressState>this.progressState,
      <Partial<ProgressState>>nextState
    );
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
