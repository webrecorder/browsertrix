import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import LiteElement, { html } from "../utils/LiteElement";

type JoinContext = {
  successMessage?: string;
  serverError?: string;
  fieldErrors: { [fieldName: string]: string };
};
type JoinSuccessEvent = {
  type: "SUCCESS";
  detail: {
    successMessage?: JoinContext["successMessage"];
  };
};
type JoinErrorEvent = {
  type: "ERROR";
  detail: {
    serverError?: JoinContext["serverError"];
    fieldErrors?: JoinContext["fieldErrors"];
  };
};
type JoinEvent =
  | { type: "SUBMIT_SIGN_UP" }
  | { type: "ACCEPT_INVITE" }
  | JoinSuccessEvent
  | JoinErrorEvent;
type JoinTypestate =
  | {
      value: "initial";
      context: JoinContext;
    }
  | {
      value: "submittingForm";
      context: JoinContext;
    }
  | {
      value: "acceptInvite";
      context: JoinContext;
    }
  | {
      value: "acceptingInvite";
      context: JoinContext;
    };

const initialContext = {
  fieldErrors: {},
};

const machine = createMachine<JoinContext, JoinEvent, JoinTypestate>(
  {
    id: "join",
    initial: "initial",
    context: initialContext,
    states: {
      ["initial"]: {
        on: {
          SUBMIT_SIGN_UP: "submittingForm",
        },
      },
      ["submittingForm"]: {
        on: {
          SUCCESS: "acceptInvite",
          ERROR: {
            target: "initial",
            actions: "setError",
          },
        },
      },
      ["acceptInvite"]: {
        on: {
          ACCEPT_INVITE: "acceptingInvite",
        },
      },
      ["acceptingInvite"]: {
        on: {
          SUCCESS: {
            target: "acceptInvite",
            actions: "setSucessMessage",
          },
          ERROR: {
            target: "acceptInvite",
            actions: "setError",
          },
        },
      },
    },
  },
  {
    actions: {
      setSucessMessage: assign((context, event) => ({
        ...context,
        ...(event as JoinSuccessEvent).detail,
      })),
      setError: assign((context, event) => ({
        ...context,
        ...(event as JoinErrorEvent).detail,
      })),
    },
  }
);

@localized()
export class Join extends LiteElement {
  private joinStateService = interpret(machine);

  @property({ type: String })
  token?: string;

  @state()
  private joinState = machine.initialState;

  firstUpdated() {
    // Enable state machine
    this.joinStateService.subscribe((state) => {
      this.joinState = state;
    });

    this.joinStateService.start();
  }

  disconnectedCallback() {
    this.joinStateService.stop();
  }

  render() {
    const isSignUp =
      this.joinState.value === "initial" ||
      this.joinState.value === "submittingForm";
    const isAcceptInvite =
      this.joinState.value === "acceptInvite" ||
      this.joinState.value === "acceptingInvite";

    let content;

    if (isSignUp) {
      content = this.renderSignUp();
    } else if (isAcceptInvite) {
      content = this.renderAccept();
    }

    return html`
      <article class="w-full max-w-sm grid gap-5">
        <h1 class="text-3xl font-semibold mb-3">${msg("Join archive")}</h1>

        <!-- TODO invitation details -->

        <div class="flex items-center text-sm font-medium">
          <div
            class="flex-0 mx-3 ${isSignUp ? "text-primary" : "text-blue-400"}"
          >
            1. Create account
          </div>
          <hr
            class="flex-1 mx-3 ${isSignUp
              ? "border-gray-400"
              : "border-blue-400"}"
          />
          <div
            class="flex-0 mx-3 ${isSignUp ? "text-gray-400" : "text-primary"}"
          >
            2. Accept invite
          </div>
        </div>

        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          ${content}
        </main>
      </article>
    `;
  }

  private renderSignUp() {
    let serverError;

    if (this.joinState.context.serverError) {
      serverError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger"
            >${this.joinState.context.serverError}</bt-alert
          >
        </div>
      `;
    }

    return html`
      <sl-form @sl-submit="${this.onSignUp}" aria-describedby="formError">
        <div class="mb-5">
          <sl-input value=${"TODO@example.com"} readonly> </sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            id="password"
            name="password"
            type="password"
            label=${msg("Enter a password")}
            autocomplete="new-password"
            toggle-password
            required
          >
          </sl-input>
        </div>

        ${serverError}

        <sl-button
          class="w-full"
          type="primary"
          ?loading=${this.joinState.value === "submittingForm"}
          submit
          >${msg("Create account")}</sl-button
        >
      </sl-form>
    `;
  }

  private renderAccept() {
    let serverError;

    if (this.joinState.context.serverError) {
      serverError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger"
            >${this.joinState.context.serverError}</bt-alert
          >
        </div>
      `;
    }

    return html`
      ${serverError}

      <div class="text-center">
        <sl-button type="primary" size="large" @click=${this.onAccept}
          >Accept invitation</sl-button
        >
      </div>
    `;
  }

  private async onSignUp() {
    this.joinStateService.send("SUBMIT_SIGN_UP");

    // TODO
  }

  private async onAccept() {
    this.joinStateService.send("ACCEPT_INVITE");

    const resp = await fetch(`/api/invite/accept/${this.token}`);

    switch (resp.status) {
      case 200:
        // this.joinStateService.send("SUCCESS");

        // TODO automatically log in?
        this.navTo("/log-in");
        break;
      case 401:
        const { detail } = await resp.json();
        if (detail === "Unauthorized") {
          this.joinStateService.send({
            type: "ERROR",
            detail: {
              fieldErrors: {
                password: msg("This invitation is not valid."),
              },
            },
          });
          break;
        }
      default:
        this.joinStateService.send({
          type: "ERROR",
          detail: {
            fieldErrors: {
              password: msg("Something unexpected went wrong"),
            },
          },
        });
        break;
    }
  }
}
