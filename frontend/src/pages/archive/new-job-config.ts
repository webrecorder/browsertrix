import type { TemplateResult } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";
import type { StateMachine } from "@xstate/fsm";

import seededCrawlSvg from "../../assets/images/new-job-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-job-config_URL-List.svg";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type State =
  | "chooseJobType"
  | "crawlerSetup"
  | "crawlBehaviors"
  | "jobScheduling"
  | "jobInformation";
type StepEventName =
  | "CRAWLER_SETUP"
  | "CRAWL_BEHAVIORS"
  | "JOB_SCHEDULING"
  | "JOB_INFORMATION";
type JobType = null | "urlList" | "seeded";
type JobSelectEvent = {
  type: "CRAWLER_SETUP";
  jobType: JobType;
};
type Context = {
  jobType: JobType;
  enabledSteps: Record<State, boolean>;
  currentProgress: State;
};
const tabEventTarget: Record<StepEventName, State> = {
  CRAWLER_SETUP: "crawlerSetup",
  CRAWL_BEHAVIORS: "crawlBehaviors",
  JOB_SCHEDULING: "jobScheduling",
  JOB_INFORMATION: "jobInformation",
};
const tabNavStates = Object.keys(tabEventTarget).reduce((acc, eventName) => {
  const stateValue = tabEventTarget[eventName as StepEventName];
  return {
    ...acc,
    [eventName]: [
      {
        cond: (ctx: Context) => ctx.enabledSteps[stateValue],
        target: stateValue,
      },
    ],
  };
}, {});
const stepOrder = [
  "chooseJobType",
  "crawlerSetup",
  "crawlBehaviors",
  "jobScheduling",
  "jobInformation",
];
const initialState = "crawlerSetup";
const initialContext: Context = {
  jobType: "urlList",
  enabledSteps: {
    chooseJobType: true,
    crawlerSetup: false,
    crawlBehaviors: false,
    jobScheduling: false,
    jobInformation: false,
  },
  currentProgress: "crawlerSetup",
};

@localized()
export class NewJobConfig extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  private stateValue: State = initialState;

  @state()
  private stateContext: Context = initialContext;

  private stateService: StateMachine.Service<any, any, any>;

  @query('form[name="newJobConfig"]')
  formElem?: HTMLFormElement;

  constructor() {
    super();
    const makeStepActions = (stepState: State) =>
      assign({
        enabledSteps: (ctx: Context): any => ({
          ...ctx.enabledSteps,
          [stepState]: true,
        }),
        currentProgress: (ctx: Context): any =>
          stepOrder.indexOf(stepState) > stepOrder.indexOf(ctx.currentProgress)
            ? stepState
            : ctx.currentProgress,
      });
    const stateMachine = createMachine({
      initial: initialState,
      context: initialContext,
      states: {
        chooseJobType: {
          on: {
            CRAWLER_SETUP: {
              target: "crawlerSetup",
              actions: assign({
                jobType: (ctx, evt: any) => evt.jobType,
              }),
            },
          },
        },
        crawlerSetup: {
          entry: makeStepActions("crawlerSetup"),
          on: {
            ...tabNavStates,
            BACK: "chooseJobType",
            CONTINUE: [
              {
                cond: this.formValid,
                target: "crawlBehaviors",
              },
            ],
          },
        },
        crawlBehaviors: {
          entry: makeStepActions("crawlBehaviors"),
          on: {
            ...tabNavStates,
            BACK: "crawlerSetup",
            CONTINUE: [
              {
                cond: this.formValid,
                target: "jobScheduling",
              },
            ],
          },
        },
        jobScheduling: {
          entry: makeStepActions("jobScheduling"),
          on: {
            ...tabNavStates,
            BACK: "crawlBehaviors",
            CONTINUE: [
              {
                cond: this.formValid,
                target: "jobInformation",
              },
            ],
          },
        },
        jobInformation: {
          entry: makeStepActions("jobInformation"),
          on: {
            ...tabNavStates,
            BACK: "jobScheduling",
            CONTINUE: [
              {
                cond: this.formValid,
                target: "jobInformation",
              },
            ],
          },
        },
      },
    });
    this.stateService = interpret(stateMachine);
  }

  connectedCallback() {
    super.connectedCallback();

    this.stateService.start();
    this.stateService.subscribe((state) => {
      this.stateValue = state.value;
      this.stateContext = state.context as Context;
      console.log("enabledSteps:", this.stateContext.enabledSteps);
    });
  }

  disconnectedCallback() {
    this.stateService.stop();
    super.disconnectedCallback();
  }

  render() {
    if (this.stateValue === "chooseJobType") {
      return this.renderChooseJobType();
    }

    let heading: TemplateResult | string;

    switch (this.stateValue) {
      case "crawlerSetup":
        heading = msg("Crawler Setup");
        break;
      case "crawlBehaviors":
        heading = msg("Crawl Behaviors");
        break;
      case "jobScheduling":
        heading = msg("Job Scheduling");
        break;
      case "jobInformation":
        heading = msg("Job Information");
        break;
      default:
        heading = "";
        break;
    }

    const contentClassName = "p-4 grid grid-cols-1 md:grid-cols-5 gap-5";
    const formColClassName = "col-span-1 md:col-span-3";

    return html`
      <h3 class="ml-52 text-lg font-medium mb-3">${heading}</h3>

      <form name="newJobConfig" @submit=${this.onSubmit}>
        <btrix-tab-list
          activePanel="newJobConfig-${this.stateValue}"
          progressPanel="newJobConfig-${this.stateContext.currentProgress}"
        >
          ${this.renderNavItem("CRAWLER_SETUP", msg("Crawler Setup"))}
          ${this.renderNavItem("CRAWL_BEHAVIORS", msg("Crawl Behaviors"))}
          ${this.renderNavItem("JOB_SCHEDULING", msg("Job Scheduling"))}
          ${this.renderNavItem("JOB_INFORMATION", msg("Job Information"))}

          <btrix-tab-panel name="newJobConfig-crawlerSetup">
            <div
              class="${contentClassName}${this.stateContext.jobType === "seeded"
                ? " hidden"
                : ""}"
            >
              ${this.renderUrlListSetup(formColClassName)}
            </div>
            <div
              class="${contentClassName}${this.stateContext.jobType ===
              "urlList"
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
            <div class="p-4 border-t flex justify-between">
              <sl-button size="small" @click=${() => this.stateSend("BACK")}>
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Previous Step")}
              </sl-button>
              <sl-button type="submit" size="small" variant="primary">
                ${msg("Save")}
              </sl-button>
            </div>
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
          @click=${() => {
            this.stateSend({
              type: "CRAWLER_SETUP",
              jobType: "urlList",
            });
          }}
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
          @click=${() => {
            this.stateSend({
              type: "CRAWLER_SETUP",
              jobType: "seeded",
            });
          }}
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

  private renderNavItem(
    eventName: StepEventName,
    content: TemplateResult | string
  ) {
    const stateValue = tabEventTarget[eventName];
    return html`
      <btrix-tab
        slot="nav"
        name="newJobConfig-${stateValue}"
        ?disabled=${!this.stateContext.enabledSteps[stateValue]}
        @click=${() => {
          this.stateSend(eventName);
        }}
        >${content}</btrix-tab
      >
    `;
  }

  private renderFooter() {
    return html`
      <div class="p-4 border-t flex justify-between">
        <sl-button size="small" @click=${() => this.stateSend("BACK")}>
          <sl-icon slot="prefix" name="arrow-left"></sl-icon>
          ${msg("Previous Step")}
        </sl-button>
        <sl-button
          size="small"
          variant="primary"
          @click=${() => this.stateSend("CONTINUE")}
        >
          <sl-icon slot="suffix" name="arrow-right"></sl-icon>
          ${msg("Next Step")}
        </sl-button>
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
          rows="10"
          autocomplete="off"
          ?required=${this.stateContext.jobType === "urlList"}
        ></sl-textarea>
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

  private stateSend(
    event: StepEventName | JobSelectEvent | "BACK" | "CONTINUE"
  ) {
    this.stateService.send(event as any);
  }

  private formValid = (): boolean => {
    if (!this.formElem) return false;

    const invalidElems = [...this.formElem.querySelectorAll("[invalid]")];

    invalidElems.forEach((el) => {
      (el as HTMLInputElement).reportValidity();
    });

    return !invalidElems.length;
  };

  private onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;

    if (!this.formValid()) return;

    console.log(new FormData(form));
  }
}

customElements.define("btrix-new-job-config", NewJobConfig);
