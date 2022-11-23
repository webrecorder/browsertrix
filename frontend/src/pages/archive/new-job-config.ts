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
const machineConfig = {
  initial: "chooseJobType",
  states: {
    chooseJobType: {
      on: {
        SELECT_URL_LIST: "urListSetup",
        SELECT_SEEDED_CRAWL: "seededCrawlSetup",
      },
    },
    urListSetup: {
      on: {
        BACK: "chooseJobType",
        CONTINUE: "crawlBehaviors",
      },
    },
    seededCrawlSetup: {
      on: {
        BACK: "chooseJobType",
        CONTINUE: "crawlBehaviors",
      },
    },
    crawlBehaviors: {
      on: {
        // BACK: "",
        CONTINUE: "jobScheduling",
      },
    },
    jobScheduling: {
      on: {
        BACK: "crawlBehaviors",
        CONTINUE: "jobInformation",
      },
    },
    jobInformation: {
      on: {
        BACK: "jobScheduling",
        // CONTINUE: "",
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
        <div class="col-span-5 md:col-span-1">sidebar</div>
        <div class="col-span-5 md:col-span-4">
          <h3 class="text-lg font-medium mb-3">${heading}</h3>
          <div>${this.stateValue}</div>
          <div class="border rounded p-4">
            <div>${content}</div>

            <sl-button @click=${() => stateService.send("BACK")}>
              ${msg("Previous Step")}
            </sl-button>
            <sl-button @click=${() => stateService.send("CONTINUE")}>
              ${msg("Next Step")}
            </sl-button>
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
          @click=${() => stateService.send("SELECT_URL_LIST")}
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
          @click=${() => stateService.send("SELECT_SEEDED_CRAWL")}
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
