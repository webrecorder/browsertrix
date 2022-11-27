import type { TemplateResult } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type { StateMachine } from "@xstate/fsm";

import seededCrawlSvg from "../../assets/images/new-job-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-job-config_URL-List.svg";
import LiteElement, { html } from "../../utils/LiteElement";
import type { AuthState } from "../../utils/AuthService";
import type { Tab } from "../../components/tab-list";

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
const stepOrder: StepName[] = [
  "chooseJobType",
  "crawlerSetup",
  "crawlBehaviors",
  "jobScheduling",
  "jobInformation",
];
const initialStep: StepName = "chooseJobType";
const initialTabs: Tabs = {
  crawlerSetup: { enabled: false, error: false, completed: false },
  crawlBehaviors: { enabled: false, error: false, completed: false },
  jobScheduling: { enabled: false, error: false, completed: false },
  jobInformation: { enabled: false, error: false, completed: false },
};
const initialJobType: JobType = null;
const orderedTabNames = stepOrder.filter(
  (stepName) => initialTabs[stepName as TabName]
) as TabName[];

@localized()
export class NewJobConfig extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  private activeStep: StepName = initialStep;

  @state()
  private currentProgressStep: StepName = initialStep;

  @state()
  private tabs: Tabs = initialTabs;

  @state()
  private jobType: JobType = initialJobType;

  private get formHasError() {
    return Object.values(this.tabs).some(({ error }) => error);
  }

  @query('form[name="newJobConfig"]')
  formElem?: HTMLFormElement;

  render() {
    if (this.activeStep === "chooseJobType") {
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
        ${tabLabels[this.activeStep]}
      </h3>

      <form name="newJobConfig" @submit=${this.onSubmit}>
        <btrix-tab-list
          activePanel="newJobConfig-${this.activeStep}"
          progressPanel="newJobConfig-${this.currentProgressStep}"
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
            ${this.renderFooter()}
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
            ${this.renderFooter(true)}
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
    const isActive = tabName === this.activeStep;
    const { error: isInvalid, completed } = this.tabs[tabName];
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
        ?disabled=${!this.tabs[tabName].enabled}
        @click=${this.tabClickHandler(tabName)}
      >
        ${icon}
        <span class="inline-block align-middle">${content}</span>
      </btrix-tab>
    `;
  }

  private renderFooter(isLastStep = false) {
    return html`
      <div class="px-5 py-4 border-t flex justify-between">
        <sl-button size="small" @click=${this.backStep}>
          <sl-icon slot="prefix" name="arrow-left"></sl-icon>
          ${msg("Previous Step")}
        </sl-button>
        ${isLastStep
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

  private onFieldChange = (e: Event) => {
    const el = e.target as HTMLInputElement & {
      invalid: boolean;
    };
    const currentTab = this.activeStep as TabName;
    if (el.invalid) {
      this.tabs[currentTab].error = true;
    } else if (this.tabs[currentTab].error) {
      const hasInvalid = el
        .closest("btrix-tab-panel")
        ?.querySelector("[data-invalid]");
      if (!hasInvalid) {
        this.tabs[currentTab].error = false;
      }
    }
  };

  private tabClickHandler = (step: StepName) => (e: MouseEvent) => {
    const tab = e.currentTarget as Tab;
    if (tab.disabled || tab.active) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    this.activeStep = step;
  };

  private selectJobType(jobType: JobType) {
    this.jobType = jobType;
    this.activeStep = "crawlerSetup";
    this.currentProgressStep = this.activeStep;
    this.tabs[this.activeStep].enabled = true;
  }

  private backStep() {
    this.activeStep = stepOrder[stepOrder.indexOf(this.activeStep) - 1];
  }

  private nextStep() {
    const isValid = this.checkCurrentPanelValidity();

    if (isValid) {
      const nextStep = stepOrder[
        stepOrder.indexOf(this.activeStep) + 1
      ] as TabName;
      const isFirstEnabled = !this.tabs[nextStep].enabled;

      if (isFirstEnabled) {
        this.tabs[nextStep].enabled = true;
        this.currentProgressStep = nextStep;
      }
      this.tabs[this.activeStep as TabName].completed = true;
      this.activeStep = nextStep;
    }
  }

  private checkCurrentPanelValidity = (): boolean => {
    if (!this.formElem) return false;

    const activePanel = this.formElem.querySelector(
      `btrix-tab-panel[name="newJobConfig-${this.activeStep}"]`
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
}

customElements.define("btrix-new-job-config", NewJobConfig);
