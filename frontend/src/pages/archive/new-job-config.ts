import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { createMachine, interpret } from "@xstate/fsm";

import seededCrawlSvg from "../../assets/images/new-job-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-job-config_URL-List.svg";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type State =
  | "chooseJobType"
  | "urListSetup"
  | "seededCrawlSetup"
  | "crawlBehaviors"
  | "jobScheduling"
  | "jobInformation";
type StepEventName =
  | "URL_LIST"
  | "SEEDED_CRAWL"
  | "CRAWL_BEHAVIORS"
  | "JOB_SCHEDULING"
  | "JOB_INFORMATION";

const jobTypeStateConfig = {
  URL_LIST: "urListSetup",
  SEEDED_CRAWL: "seededCrawlSetup",
} as Record<StepEventName, State>;
const stepStateConfig: Record<StepEventName, State> = {
  ...jobTypeStateConfig,
  CRAWL_BEHAVIORS: "crawlBehaviors",
  JOB_SCHEDULING: "jobScheduling",
  JOB_INFORMATION: "jobInformation",
};

const machineConfig = {
  initial: "urListSetup",
  states: {
    chooseJobType: {
      on: {
        ...jobTypeStateConfig,
      },
    },
    urListSetup: {
      on: {
        ...stepStateConfig,
        BACK: "chooseJobType",
        CONTINUE: "crawlBehaviors",
      },
    },
    seededCrawlSetup: {
      on: {
        ...stepStateConfig,
        BACK: "chooseJobType",
        CONTINUE: "crawlBehaviors",
      },
    },
    crawlBehaviors: {
      on: {
        ...stepStateConfig,
        BACK: "urListSetup", // TODO
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
const stateMachine = createMachine(machineConfig);
const stateService = interpret(stateMachine);

@localized()
export class NewJobConfig extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  private stateValue: State = machineConfig.initial as State;

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
    let content: TemplateResult | string;

    switch (this.stateValue) {
      case "urListSetup":
        heading = msg("Crawler Setup");
        content = this.renderUrlListSetup();
        break;
      case "seededCrawlSetup":
        heading = msg("Crawler Setup");
        content = this.renderSeededCrawlSetup();
        break;
      case "crawlBehaviors":
        heading = msg("Crawl Behaviors");
        content = this.renderCrawlBehaviors();
        break;
      case "jobScheduling":
        heading = msg("Job Scheduling");
        content = this.renderJobScheduling();
        break;
      case "jobInformation":
        heading = msg("Job Information");
        content = this.renderJobInformation();
        break;
      default:
        heading = "";
        content = "";
        break;
    }

    return html`
      <div class="grid grid-cols-5">
        <div class="col-start-1 md:col-start-2 col-end-6">
          <h3 class="text-lg font-medium mb-3">${heading}</h3>
        </div>
        <div class="col-start-1 col-end-6 md:col-end-2">
          ${this.renderNav()}
        </div>
        <div class="col-start-1 md:col-start-2 col-end-6">
          <div class="border rounded">
            <div class="p-4">${content}</div>
            <div class="p-4 border-t flex justify-between">
              <sl-button size="small" @click=${() => stateService.send("BACK")}>
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Previous Step")}
              </sl-button>
              <sl-button
                size="small"
                variant="primary"
                @click=${() => stateService.send("CONTINUE")}
              >
                <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                ${msg("Next Step")}
              </sl-button>
            </div>
          </div>
        </div>
      </div>
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
          @click=${() => stateService.send("URL_LIST")}
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
          @click=${() => stateService.send("SEEDED_CRAWL")}
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

  private renderNav() {
    return html`
      <nav class="relative">
        <div
          class="absolute top-0 bottom-0 w-1 bg-neutral-100 rounded-full shadow-inner"
        ></div>
        <ul>
          ${this.renderNavItem("URL_LIST", msg("Crawler Setup (URL)"))}
          ${this.renderNavItem("SEEDED_CRAWL", msg("Crawler Setup (Seed)"))}
          ${this.renderNavItem("CRAWL_BEHAVIORS", msg("Crawl Behaviors"))}
          ${this.renderNavItem("JOB_SCHEDULING", msg("Job Scheduling"))}
          ${this.renderNavItem("JOB_INFORMATION", msg("Job Information"))}
        </ul>
      </nav>
    `;
  }

  private renderNavItem(
    eventName: StepEventName,
    content: TemplateResult | string
  ) {
    const isActive = this.stateValue === stepStateConfig[eventName];
    return html`
      <li
        class="relative cursor-pointer font-medium"
        role="menuitem"
        aria-selected=${isActive}
        @click=${() => {
          stateService.send(eventName);
        }}
      >
        <div
          class="absolute top-0 bottom-0 rounded-full transition-all ${isActive
            ? "w-1 bg-primary"
            : "w-0"}"
          role="presentation"
        ></div>
        <span
          class="inline-block px-4 py-2 ${isActive
            ? "text-primary"
            : "text-neutral-500"}"
          >${content}</span
        >
      </li>
    `;
  }

  private renderUrlListSetup() {
    return html`TODO`;
  }

  private renderSeededCrawlSetup() {
    return html`TODO`;
  }

  private renderCrawlBehaviors() {
    return html`TODO`;
  }

  private renderJobScheduling() {
    return html`TODO`;
  }

  private renderJobInformation() {
    return html`TODO`;
  }
}

customElements.define("btrix-new-job-config", NewJobConfig);
