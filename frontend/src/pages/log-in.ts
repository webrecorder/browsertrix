import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import type { ViewState } from "../utils/APIRouter";
import LiteElement, { html } from "../utils/LiteElement";
import type { LoggedInEventDetail } from "../utils/AuthService";
import AuthService from "../utils/AuthService";
import { DASHBOARD_ROUTE } from "../routes";

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
  | { type: "SHOW_SIGN_IN_WITH_PASSWORD" }
  | { type: "SHOW_FORGOT_PASSWORD" }
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
          SHOW_FORGOT_PASSWORD: {
            target: "forgotPassword",
            actions: "reset",
          },
          SUBMIT: {
            target: "signingIn",
            actions: "reset",
          },
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
        on: {
          SHOW_SIGN_IN_WITH_PASSWORD: {
            target: "signIn",
            actions: "reset",
          },
          SUBMIT: {
            target: "submittingForgotPassword",
            actions: "reset",
          },
        },
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
  @property({ type: Object })
  viewState!: ViewState;

  @property({ type: String })
  redirectUrl: string = DASHBOARD_ROUTE;

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

  updated(changedProperties: any) {
    if (changedProperties.get("viewState")) {
      this.syncFormStateView();
    }
  }

  render() {
    let form, link, successMessage;

    if (
      this.formState.value === "forgotPassword" ||
      this.formState.value === "submittingForgotPassword"
    ) {
      form = this.renderForgotPasswordForm();
      link = html`
        <a
          class="text-sm text-gray-400 hover:text-gray-500"
          href="/log-in"
          @click=${this.navLink}
          >${msg("Sign in with password")}</a
        >
      `;
    } else {
      form = this.renderLoginForm();
      link = html`
        <a
          class="text-sm text-gray-400 hover:text-gray-500"
          href="/log-in/forgot-password"
          @click=${this.navLink}
          >${msg("Forgot your password?")}</a
        >
      `;
    }

    if (this.formState.context.successMessage) {
      successMessage = html`
        <div>
          <btrix-alert type="success"
            >${this.formState.context.successMessage}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <article class="w-full max-w-sm grid gap-5">
        ${successMessage}

        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          <div>${form}</div>
        </main>
        <footer class="text-center">${link}</footer>
      </article>
    `;
  }

  private async syncFormStateView() {
    await this.updateComplete;

    const route = this.viewState.route;

    if (route === "login") {
      this.formStateService.send("SHOW_SIGN_IN_WITH_PASSWORD");
    } else if (route === "forgotPassword") {
      this.formStateService.send("SHOW_FORGOT_PASSWORD");
    }
  }

  private renderLoginForm() {
    let formError;

    if (this.formState.context.serverError) {
      formError = html`
        <div class="mb-5">
          <btrix-alert id="formError" type="danger"
            >${this.formState.context.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <style>
        input {
          transition: var(--sl-transition-fast) color,
            var(--sl-transition-fast) border,
            var(--sl-transition-fast) box-shadow,
            var(--sl-transition-fast) background-color;
        }

        input:focus {
          border-color: var(--sl-input-border-color-focus);
          box-shadow: var(--sl-focus-ring);
          outline: 0;
        }
      </style>
      <sl-form @sl-submit="${this.onSubmitLogIn}" aria-describedby="formError">
        <div class="mb-5">
          <btrix-input
            id="email"
            name="username"
            label=${msg("Email")}
            type="email"
            autocomplete="username"
            required
          >
          </btrix-input>
        </div>
        <div class="mb-5">
          <btrix-input
            id="password"
            name="password"
            label=${msg("Password")}
            type="password"
            autocomplete="current-password"
            togglePassword
            required
          >
          </btrix-input>
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
    `;
  }

  private renderForgotPasswordForm() {
    let formError;

    if (this.formState.context.serverError) {
      formError = html`
        <div class="mb-5">
          <btrix-alert id="formError" type="danger"
            >${this.formState.context.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <sl-form
        @sl-submit="${this.onSubmitResetPassword}"
        aria-describedby="formError"
      >
        <div class="mb-5">
          <btrix-input
            id="email"
            name="email"
            type="email"
            label="${msg("Your email address")}"
            autocomplete="username"
            required
          >
          </btrix-input>
        </div>

        ${formError}

        <sl-button
          class="w-full"
          type="primary"
          ?loading=${this.formState.value === "submittingForgotPassword"}
          submit
          >${msg("Request password reset")}</sl-button
        >
      </sl-form>
    `;
  }

  async onSubmitLogIn(event: { detail: { formData: FormData } }) {
    this.formStateService.send("SUBMIT");

    const { formData } = event.detail;
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    try {
      const data = await AuthService.login({ email: username, password });

      (data as LoggedInEventDetail).redirectUrl = this.redirectUrl;

      this.dispatchEvent(AuthService.createLoggedInEvent(data));

      // no state update here, since "logged-in" event
      // will result in a route change
    } catch (e: any) {
      if (e.isApiError) {
        // TODO check error details
        this.formStateService.send({
          type: "ERROR",
          detail: {
            serverError: msg("Sorry, invalid username or password"),
          },
        });
      } else {
        this.formStateService.send({
          type: "ERROR",
          detail: {
            serverError: msg("Something went wrong, couldn't sign you in"),
          },
        });
      }
    }
  }

  async onSubmitResetPassword(event: { detail: { formData: FormData } }) {
    this.formStateService.send("SUBMIT");

    const { formData } = event.detail;
    const email = formData.get("email") as string;

    const resp = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (resp.status === 202) {
      this.formStateService.send({
        type: "SUCCESS",
        detail: {
          successMessage: msg(
            "Successfully received your request. You will receive an email to reset your password if your email is found in our system."
          ),
        },
      });
    } else if (resp.status === 422) {
      this.formStateService.send({
        type: "ERROR",
        detail: {
          serverError: msg("That email is not a valid email address"),
        },
      });
    } else {
      this.formStateService.send({
        type: "ERROR",
        detail: {
          serverError: msg("Something unexpected went wrong"),
        },
      });
    }
  }
}
