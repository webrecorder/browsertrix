import type { TemplateResult } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";
import type { StateMachine } from "@xstate/fsm";

import seededCrawlSvg from "../../assets/images/new-job-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-job-config_URL-List.svg";
import LiteElement, { html } from "../../utils/LiteElement";
import type { AuthState } from "../../utils/AuthService";
import type { Tab } from "../../components/tab-list";

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
type ValidityChangeEvent = {
  type: "VALIDITY_CHANGE";
  valid: boolean;
};
type Context = {
  jobType: JobType;
  currentProgress: State;
  steps: Record<
    State,
    {
      enabled: boolean;
      completed: boolean;
      error: boolean;
    }
  >;
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
        cond: (ctx: Context) => ctx.steps[stateValue].enabled,
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
  currentProgress: "crawlerSetup",
  steps: {
    chooseJobType: { enabled: true, error: false, completed: false },
    crawlerSetup: { enabled: false, error: false, completed: false },
    crawlBehaviors: { enabled: false, error: false, completed: false },
    jobScheduling: { enabled: false, error: false, completed: false },
    jobInformation: { enabled: false, error: false, completed: false },
  },
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

  private get formHasError() {
    return Object.values(this.stateContext.steps).some(({ error }) => error);
  }

  @query('form[name="newJobConfig"]')
  formElem?: HTMLFormElement;

  constructor() {
    super();
    const makeStepEntryActions = (stepState: State) =>
      assign({
        steps: (ctx: Pick<Context, "steps">) => ({
          ...ctx.steps,
          [stepState]: { ...ctx.steps[stepState], enabled: true },
        }),
        currentProgress: (ctx: Pick<Context, "currentProgress">) =>
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
          entry: makeStepEntryActions("crawlerSetup"),
          on: {
            ...tabNavStates,
            BACK: "chooseJobType",
            CONTINUE: [
              {
                cond: this.checkValidity,
                target: "crawlBehaviors",
                actions: assign({
                  steps: (ctx: Pick<Context, "steps">) => ({
                    ...ctx.steps,
                    crawlerSetup: {
                      ...ctx.steps["crawlerSetup"],
                      completed: true,
                    },
                  }),
                }),
              },
            ],
            VALIDITY_CHANGE: {
              actions: assign({
                steps: (ctx: Pick<Context, "steps">, evt: any) => ({
                  ...ctx.steps,
                  crawlerSetup: {
                    ...ctx.steps.crawlerSetup,
                    error: !(evt as ValidityChangeEvent).valid,
                  },
                }),
              }),
            },
          },
        },
        crawlBehaviors: {
          entry: makeStepEntryActions("crawlBehaviors"),
          on: {
            ...tabNavStates,
            BACK: "crawlerSetup",
            CONTINUE: [
              {
                cond: this.checkValidity,
                target: "jobScheduling",
                actions: assign({
                  steps: (ctx: Pick<Context, "steps">) => ({
                    ...ctx.steps,
                    crawlBehaviors: {
                      ...ctx.steps["crawlBehaviors"],
                      completed: true,
                    },
                  }),
                }),
              },
            ],
            VALIDITY_CHANGE: {
              actions: assign({
                steps: (ctx: Pick<Context, "steps">, evt: any) => ({
                  ...ctx.steps,
                  crawlBehaviors: {
                    ...ctx.steps.crawlBehaviors,
                    error: !(evt as ValidityChangeEvent).valid,
                  },
                }),
              }),
            },
          },
        },
        jobScheduling: {
          entry: makeStepEntryActions("jobScheduling"),
          on: {
            ...tabNavStates,
            BACK: "crawlBehaviors",
            CONTINUE: [
              {
                cond: this.checkValidity,
                target: "jobInformation",
                actions: assign({
                  steps: (ctx: Pick<Context, "steps">) => ({
                    ...ctx.steps,
                    jobScheduling: {
                      ...ctx.steps["jobScheduling"],
                      completed: true,
                    },
                  }),
                }),
              },
            ],
            VALIDITY_CHANGE: {
              actions: assign({
                steps: (ctx: Pick<Context, "steps">, evt: any) => ({
                  ...ctx.steps,
                  jobScheduling: {
                    ...ctx.steps.jobScheduling,
                    error: !(evt as ValidityChangeEvent).valid,
                  },
                }),
              }),
            },
          },
        },
        jobInformation: {
          entry: makeStepEntryActions("jobInformation"),
          on: {
            ...tabNavStates,
            BACK: "jobScheduling",
            CONTINUE: [
              {
                cond: this.checkValidity,
                target: "jobInformation",
                actions: assign({
                  steps: (ctx: Pick<Context, "steps">) => ({
                    ...ctx.steps,
                    jobInformation: {
                      ...ctx.steps["jobInformation"],
                      completed: true,
                    },
                  }),
                }),
              },
            ],
            VALIDITY_CHANGE: {
              actions: assign({
                steps: (ctx: Pick<Context, "steps">, evt: any) => ({
                  ...ctx.steps,
                  jobInformation: {
                    ...ctx.steps.jobInformation,
                    error: !(evt as ValidityChangeEvent).valid,
                  },
                }),
              }),
            },
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
      console.log("state change:", state);
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

    const contentClassName = "p-5 grid grid-cols-1 md:grid-cols-5 gap-5";
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
    const isActive = stateValue === this.stateValue;
    const { error: isInvalid, completed } = this.stateContext.steps[stateValue];
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
        name="newJobConfig-${stateValue}"
        ?disabled=${!this.stateContext.steps[stateValue].enabled}
        @click=${(e: MouseEvent) => {
          if (!(e.target as Tab).disabled && !(e.target as Tab).active) {
            this.stateSend(eventName);
          }
        }}
      >
        ${icon}
        <span class="inline-block align-middle">${content}</span>
      </btrix-tab>
    `;
  }

  private renderFooter() {
    return html`
      <div class="px-5 py-4 border-t flex justify-between">
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
          rows="6"
          autocomplete="off"
          ?required=${this.stateContext.jobType === "urlList"}
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
    if (el.invalid) {
      this.stateSend({
        type: "VALIDITY_CHANGE",
        valid: false,
      });
    } else if (this.stateContext.steps[this.stateValue].error) {
      const hasInvalid = el
        .closest("btrix-tab-panel")
        ?.querySelector("[data-invalid]");
      if (!hasInvalid) {
        this.stateSend({
          type: "VALIDITY_CHANGE",
          valid: true,
        });
      }
    }
  };

  private stateSend(
    event:
      | StepEventName
      | JobSelectEvent
      | ValidityChangeEvent
      | "BACK"
      | "CONTINUE"
  ) {
    this.stateService.send(event as any);
  }

  private checkValidity = (): boolean => {
    if (!this.formElem) return false;

    const activePanel = this.formElem.querySelector(
      `btrix-tab-panel[name="newJobConfig-${this.stateValue}"]`
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
