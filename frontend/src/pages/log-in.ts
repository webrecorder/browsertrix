// cSpell:words xstate
import { localized, msg } from "@lit/localize";
import { assign, createMachine, interpret } from "@xstate/fsm";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { isApiError } from "@/utils/api";
import type { ViewState } from "@/utils/APIRouter";
import AuthService from "@/utils/AuthService";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

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
  | { type: "BACKEND_INITIALIZED" }
  | { type: "BACKEND_NOT_INITIALIZED" }
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
      value: "forgotPassword";
      context: FormContext;
    }
  | {
      value: "submittingForgotPassword";
      context: FormContext;
    }
  | {
      value: "backendInitializing";
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
          BACKEND_NOT_INITIALIZED: {
            target: "backendInitializing",
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
            actions: "setSuccessMessage",
          },
          ERROR: {
            target: "forgotPassword",
            actions: "setError",
          },
        },
      },
      ["backendInitializing"]: {
        on: {
          BACKEND_INITIALIZED: {
            target: "signIn",
            actions: "reset",
          },
        },
      },
    },
  },
  {
    actions: {
      reset: assign(() => initialContext),
      setSuccessMessage: assign((context, event) => ({
        ...context,
        ...(event as FormSuccessEvent).detail,
      })),
      setError: assign((context, event) => ({
        ...context,
        ...(event as FormErrorEvent).detail,
      })),
    },
  },
);

@customElement("btrix-log-in")
@localized()
export class LogInPage extends BtrixElement {
  @property({ type: Object })
  viewState!: ViewState;

  @property({ type: String })
  redirectUrl?: string;

  private readonly formStateService = interpret(machine);

  @state()
  private formState = machine.initialState;
  private timerId?: number;

  firstUpdated() {
    this.formStateService.subscribe((state) => {
      this.formState = state;
    });
    this.formStateService.start();
    this.syncFormStateView();
    void this.checkBackendInitialized();
  }

  disconnectedCallback() {
    this.formStateService.stop();
    window.clearTimeout(this.timerId);
    super.disconnectedCallback();
  }

  async updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.get("viewState")) {
      await this.updateComplete;

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
          class="text-cyan-400 transition-colors hover:text-cyan-500"
          href="/log-in"
          @click=${this.navigate.link}
          >${msg("Return to Sign In")}</a
        >
      `;
    } else {
      form = this.renderLoginForm();
      link = html`
        <a
          class="text-cyan-400 transition-colors hover:text-cyan-500"
          href="/log-in/forgot-password"
          @click=${this.navigate.link}
          >${msg("Forgot your password?")}</a
        >
      `;
    }

    if (this.formState.context.successMessage) {
      successMessage = html`
        <div>
          <btrix-alert variant="success"
            >${this.formState.context.successMessage}</btrix-alert
          >
        </div>
      `;
    }

    const { registrationEnabled, signUpUrl } = this.appState.settings || {};

    return html`
      <div class="flex w-full flex-1 items-center justify-center pb-4 pt-16">
        <article class="flex w-full max-w-md flex-col gap-5">
          ${successMessage}

          <main class="p-10 md:rounded-lg md:border md:bg-white md:shadow-lg">
            <div>${form}</div>
          </main>
          <footer class="text-center">${link}</footer>
        </article>
      </div>
      ${registrationEnabled || signUpUrl
        ? html`
            <div
              class="w-full gap-4 border-y bg-white/30 p-6 px-3 text-center text-neutral-500"
            >
              <span>${msg("Need an account?")}</span>
              <btrix-link href=${signUpUrl || "/sign-up"} variant="primary">
                ${msg("Sign Up")}
              </btrix-link>
            </div>
          `
        : nothing}
    `;
  }

  private syncFormStateView() {
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
          <btrix-alert id="formError" variant="danger"
            >${this.formState.context.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <form @submit=${this.onSubmitLogIn} aria-describedby="formError">
        <div class="mb-5">
          <sl-input
            id="email"
            name="username"
            label=${msg("Email")}
            type="email"
            autocomplete="username"
            class="hide-required-content"
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            id="password"
            name="password"
            label=${msg("Password")}
            type="password"
            autocomplete="current-password"
            passwordToggle
            class="hide-required-content"
            required
          >
          </sl-input>
        </div>

        ${formError}

        <sl-button
          class="w-full"
          variant="primary"
          ?loading=${this.formState.value === "signingIn"}
          ?disabled=${this.formState.value === "backendInitializing"}
          type="submit"
          >${msg("Log In")}</sl-button
        >
        ${this.formState.value === "backendInitializing"
          ? html` <div class="mt-3">
              <btrix-alert variant="warning" class="text-center"
                >${msg(
                  "Please wait while Browsertrix is initializing",
                )}</btrix-alert
              >
            </div>`
          : ""}
      </form>
    `;
  }

  private renderForgotPasswordForm() {
    let formError;

    if (this.formState.context.serverError) {
      formError = html`
        <div class="mb-5">
          <btrix-alert id="formError" variant="danger"
            >${this.formState.context.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <form @submit=${this.onSubmitResetPassword} aria-describedby="formError">
        <div class="mb-5">
          <sl-input
            id="email"
            name="email"
            type="email"
            label="${msg("Your email address")}"
            autocomplete="username"
            class="hide-required-content"
            required
          >
          </sl-input>
        </div>

        ${formError}

        <sl-button
          class="w-full"
          variant="primary"
          ?loading=${this.formState.value === "submittingForgotPassword"}
          type="submit"
          >${msg("Request Password Reset")}</sl-button
        >
      </form>
    `;
  }

  async checkBackendInitialized() {
    if (this.appState.settings) {
      this.formStateService.send("BACKEND_INITIALIZED");

      return;
    }

    try {
      const resp = await fetch("/api/settings");
      if (resp.status === 200) {
        this.formStateService.send("BACKEND_INITIALIZED");
        return;
      }
    } catch (e) {
      // assume backend not available if exception thrown
    }

    // mark as not initialized
    this.formStateService.send("BACKEND_NOT_INITIALIZED");
    this.timerId = window.setTimeout(() => {
      void this.checkBackendInitialized();
    }, 5000);
  }

  async onSubmitLogIn(event: SubmitEvent) {
    event.preventDefault();
    this.formStateService.send("SUBMIT");

    const formData = new FormData(event.target as HTMLFormElement);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    try {
      const data = await AuthService.login({ email: username, password });

      // Check if org slug in app state matches newly logged in user
      const slug =
        this.orgSlugState &&
        data.user.orgs.some((org) => org.slug === this.orgSlugState)
          ? this.orgSlugState
          : data.user.orgs.length
            ? data.user.orgs[0].slug
            : "";

      if (slug) {
        AppStateService.updateUser(formatAPIUser(data.user), slug);
      }

      await this.updateComplete;

      this.dispatchEvent(
        AuthService.createLoggedInEvent({
          ...data,
          redirectUrl: this.redirectUrl,
        }),
      );

      // no state update here, since "btrix-logged-in" event
      // will result in a route change
    } catch (e) {
      if (isApiError(e)) {
        let message = msg("Sorry, invalid username or password");
        if (e.statusCode === 429) {
          message = msg(
            "Sorry, too many failed login attempts. If this is a valid email, a reset password link has been sent to your email.",
          );
        }
        this.formStateService.send({
          type: "ERROR",
          detail: {
            serverError: message,
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

  async onSubmitResetPassword(event: SubmitEvent) {
    event.preventDefault();
    this.formStateService.send("SUBMIT");

    const formData = new FormData(event.target as HTMLFormElement);
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
            "Successfully received your request. You will receive an email to reset your password if your email is found in our system.",
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
