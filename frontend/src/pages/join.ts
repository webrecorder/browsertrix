import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";

type JoinContext = {
  serverError?: string;
};
type JoinErrorEvent = {
  type: "ERROR";
  detail: {
    serverError?: JoinContext["serverError"];
  };
};
type JoinEvent =
  | { type: "SUBMIT_SIGN_UP" }
  | { type: "ACCEPT_INVITE" }
  | { type: "SIGN_UP_SUCCESS" }
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

const initialContext = {};

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
          SIGN_UP_SUCCESS: "acceptInvite",
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

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  private joinState = machine.initialState;

  connectedCallback(): void {
    if (this.token && this.email) {
      super.connectedCallback();
    } else {
      throw new Error("Missing email or token");
    }
  }

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
    return html`
      <btrix-sign-up-form
        email=${this.email!}
        inviteToken=${this.token!}
        @submit=${this.onSignUp}
        @error=${() => this.joinStateService.send("ERROR")}
        @authenticated=${this.onAuthenticated}
      ></btrix-sign-up-form>
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
        <sl-button type="primary" @click=${this.onAccept}
          >Accept invitation</sl-button
        >
      </div>
    `;
  }

  private onSignUp() {
    this.joinStateService.send("SUBMIT_SIGN_UP");
  }

  private onAuthenticated(
    event: CustomEvent<{ auth: string; username: string }>
  ) {
    this.joinStateService.send("SIGN_UP_SUCCESS");

    this.dispatchEvent(
      new CustomEvent("logged-in", {
        detail: {
          ...event.detail,
          api: true,
        },
      })
    );
  }

  private async onAccept() {
    this.joinStateService.send("ACCEPT_INVITE");

    if (!this.authState) {
      this.joinStateService.send({
        type: "ERROR",
        detail: {
          serverError: msg("Something unexpected went wrong"),
        },
      });

      return;
    }

    try {
      await this.apiFetch(`/invite/accept/${this.token}`, this.authState);

      this.navTo("/archives");
    } catch (err: any) {
      if (err.isApiError && err.message === "Invalid Invite Code") {
        this.joinStateService.send({
          type: "ERROR",
          detail: {
            serverError: msg("This invitation is not valid."),
          },
        });
      } else {
        this.joinStateService.send({
          type: "ERROR",
          detail: {
            serverError: msg("Something unexpected went wrong"),
          },
        });
      }
    }
  }
}
