import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import LiteElement, { html } from "../utils/LiteElement";
import type { Auth } from "../types/auth";

type FormContext = {
  successMessage?: string;
  serverError?: string;
};
type FormSuccessEvent = {
  type: "SUCCESS";
  detail: {
    successMessage?: FormContext["successMessage"];
  };
};
type FormErrorEvent = {
  type: "ERROR";
  detail: {
    serverError?: FormContext["serverError"];
  };
};
type FormEvent =
  | { type: "CLICK_FORGOT_PASSWORD" }
  | { type: "CANCEL" }
  | { type: "SUBMIT" }
  | FormSuccessEvent
  | FormErrorEvent;

type FormTypestate =
  | {
      value: "signIn";
      context: FormContext;
    }
  | {
      value: "signingIn";
      context: FormContext;
    }
  | {
      value: "signIn";
      context: FormContext;
    }
  | {
      value: "forgotPassword";
      context: FormContext;
    }
  | {
      value: "submittingForgotPassword";
      context: FormContext;
    };

const initialContext = {};

const machine = createMachine<FormContext, FormEvent, FormTypestate>(
  {
    id: "loginForm",
    initial: "signIn",
    context: initialContext,
    states: {
      ["signIn"]: {
        on: {
          CLICK_FORGOT_PASSWORD: {
            target: "forgotPassword",
            actions: "reset",
          },
          SUBMIT: "signingIn",
        },
      },
      ["signingIn"]: {
        on: {
          SUCCESS: "signedIn",
          ERROR: {
            target: "signIn",
            actions: "setError",
          },
        },
      },
      ["forgotPassword"]: {
        on: { CANCEL: "signIn", SUBMIT: "submittingForgotPassword" },
      },
      ["submittingForgotPassword"]: {
        on: {
          SUCCESS: {
            target: "signIn",
            actions: "setSucessMessage",
          },
          ERROR: {
            target: "forgotPassword",
            actions: "setError",
          },
        },
      },
    },
  },
  {
    actions: {
      reset: assign(() => initialContext),
      setSucessMessage: assign((context, event) => ({
        ...context,
        ...(event as FormSuccessEvent).detail,
      })),
      setError: assign((context, event) => ({
        ...context,
        ...(event as FormErrorEvent).detail,
      })),
    },
  }
);

@localized()
export class LogInPage extends LiteElement {
  private formStateService = interpret(machine);

  @state()
  private formState = machine.initialState;

  firstUpdated() {
    this.formStateService.subscribe((state) => {
      this.formState = state;
    });

    this.formStateService.start();
  }

  disconnectedCallback() {
    this.formStateService.stop();
  }

  render() {
    let formError;

    if (this.formState.context.serverError) {
      formError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger"
            >${this.formState.context.serverError}</bt-alert
          >
        </div>
      `;
    }

    return html`
      <div class="md:bg-white md:shadow-2xl md:rounded-lg md:px-12 md:py-12">
        <div class="max-w-md">
          <sl-form @sl-submit="${this.onSubmit}" aria-describedby="formError">
            <div class="mb-5">
              <sl-input
                id="username"
                name="username"
                label="${msg("Username")}"
                required
              >
              </sl-input>
            </div>
            <div class="mb-5">
              <sl-input
                id="password"
                name="password"
                type="password"
                label="${msg("Password")}"
                required
              >
              </sl-input>
            </div>

            ${formError}

            <sl-button
              class="w-full"
              type="primary"
              ?loading=${this.formState.value === "signingIn"}
              submit
              >${msg("Log in")}</sl-button
            >
          </sl-form>
        </div>
      </div>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    this.formStateService.send("SUBMIT");

    const { formData } = event.detail;

    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    const params = new URLSearchParams();
    params.set("grant_type", "password");
    params.set("username", username);
    params.set("password", password);

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };

    const resp = await fetch("/api/auth/jwt/login", {
      headers,
      method: "POST",
      body: params.toString(),
    });
    if (resp.status !== 200) {
      this.formStateService.send({
        type: "ERROR",
        detail: {
          serverError: msg("Sorry, invalid username or password"),
        },
      });
      return;
    }

    try {
      const data = await resp.json();
      if (data.token_type === "bearer" && data.access_token) {
        const auth = "Bearer " + data.access_token;
        const detail = { auth, username };
        this.dispatchEvent(new CustomEvent("logged-in", { detail }));

        this.formStateService.send("SUCCESS");
      } else {
        throw new Error("Unknown auth type");
      }
    } catch (e) {
      console.error(e);

      this.formStateService.send({
        type: "ERROR",
        detail: {
          serverError: msg("Something went wrong, couldn't sign you in"),
        },
      });
    }
  }
}
