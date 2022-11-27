import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

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

const stepStateConfig: Record<StepEventName, State> = {
  CRAWLER_SETUP: "crawlerSetup",
  CRAWL_BEHAVIORS: "crawlBehaviors",
  JOB_SCHEDULING: "jobScheduling",
  JOB_INFORMATION: "jobInformation",
};

const machineConfig = {
  initial: "crawlerSetup",
  states: {
    chooseJobType: {
      on: {
        CRAWLER_SETUP: "crawlerSetup",
      },
    },
    crawlerSetup: {
      on: {
        ...stepStateConfig,
        BACK: "chooseJobType",
        CONTINUE: "crawlBehaviors",
      },
    },
    crawlBehaviors: {
      on: {
        ...stepStateConfig,
        BACK: "crawlerSetup",
        CONTINUE: "jobScheduling",
      },
    },
    jobScheduling: {
      on: {
        ...stepStateConfig,
        BACK: "crawlBehaviors",
        CONTINUE: "jobInformation",
      },
    },
    jobInformation: {
      on: {
        ...stepStateConfig,
        BACK: "jobScheduling",
        // CONTINUE: "", TODO
      },
    },
  },
};
const stateMachine = createMachine(<any>machineConfig);
const stateService = interpret(stateMachine);

@localized()
export class NewJobConfig extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  private stateValue: State = machineConfig.initial as State;

  @state()
  private jobType: JobType = "urlList";

  connectedCallback() {
    super.connectedCallback();

    stateService.start();
    stateService.subscribe((state) => {
      this.stateValue = state.value;
      console.log("state change:", state);
    });
  }

  disconnectedCallback() {
    stateService.stop();
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

      <form @submit=${this.onSubmit}>
        <btrix-tab-list
          activePanel="newJobConfig-${this.stateValue}"
          progressPanel="newJobConfig-${this.stateValue}"
        >
          ${this.renderNavItem("CRAWLER_SETUP", msg("Crawler Setup"))}
          ${this.renderNavItem("CRAWL_BEHAVIORS", msg("Crawl Behaviors"))}
          ${this.renderNavItem("JOB_SCHEDULING", msg("Job Scheduling"))}
          ${this.renderNavItem("JOB_INFORMATION", msg("Job Information"))}

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
            this.jobType = "urlList";
            this.stateSend("CRAWLER_SETUP");
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
            this.jobType = "seeded";
            this.stateSend("CRAWLER_SETUP");
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
    return html`
      <btrix-tab
        slot="nav"
        name="newJobConfig-${stepStateConfig[eventName]}"
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
          ?required=${this.jobType === "urlList"}
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

  private stateSend(event: StepEventName | "BACK" | "CONTINUE") {
    stateService.send(event as any);
  }

  private onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;

    if (form.querySelector("[invalid]")) return;

    console.log(new FormData(form));
  }
}

customElements.define("btrix-new-job-config", NewJobConfig);
