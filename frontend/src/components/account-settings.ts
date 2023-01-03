import { LitElement } from "lit";
import { state, query, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import type { CurrentUser } from "../types/user";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import type { AuthState, Auth } from "../utils/AuthService";
import AuthService from "../utils/AuthService";

@localized()
class RequestVerify extends LitElement {
  @property({ type: String })
  email!: string;

  @state()
  private isRequesting: boolean = false;

  @state()
  private requestSuccess: boolean = false;

  createRenderRoot() {
    return this;
  }

  render() {
    if (this.requestSuccess) {
      return html`
        <div class="text-sm text-gray-400 inline-flex items-center">
          <sl-icon class="mr-1" name="check-lg"></sl-icon> ${msg("Sent", {
            desc: "Status message after sending verification email",
          })}
        </div>
      `;
    }

    return html`
      <span
        class="text-sm text-blue-400 hover:text-blue-500"
        role="button"
        ?disabled=${this.isRequesting}
        @click=${this.requestVerification}
      >
        ${this.isRequesting
          ? msg("Sending...")
          : msg("Resend verification email")}
      </span>
    `;
  }

  private async requestVerification() {
    this.isRequesting = true;

    const resp = await fetch("/api/auth/request-verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.email,
      }),
    });

    switch (resp.status) {
      case 202:
        this.requestSuccess = true;
        break;
      default:
        // TODO generic toast error
        break;
    }

    this.isRequesting = false;
  }
}
customElements.define("btrix-request-verify", RequestVerify);

type FormContext = {
  successMessage?: string;
  serverError?: string;
  fieldErrors: { [fieldName: string]: string };
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
    fieldErrors?: FormContext["fieldErrors"];
  };
};
type FormEvent =
  | { type: "EDIT" }
  | { type: "CANCEL" }
  | { type: "SUBMIT" }
  | FormSuccessEvent
  | FormErrorEvent;

type FormTypestate =
  | {
      value: "readOnly";
      context: FormContext;
    }
  | {
      value: "editingForm";
      context: FormContext;
    }
  | {
      value: "submittingForm";
      context: FormContext;
    };

const initialContext = {
  fieldErrors: {},
};

const machine = createMachine<FormContext, FormEvent, FormTypestate>(
  {
    id: "changePasswordForm",
    initial: "readOnly",
    context: initialContext,
    states: {
      ["readOnly"]: {
        on: {
          EDIT: {
            target: "editingForm",
            actions: "reset",
          },
        },
      },
      ["editingForm"]: {
        on: { CANCEL: "readOnly", SUBMIT: "submittingForm" },
      },
      ["submittingForm"]: {
        on: {
          SUCCESS: {
            target: "readOnly",
            actions: "setSucessMessage",
          },
          ERROR: {
            target: "editingForm",
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

@needLogin
@localized()
export class AccountSettings extends LiteElement {
  private formStateService = interpret(machine);

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  private formState = machine.initialState;

  firstUpdated() {
    // Enable state machine
    this.formStateService.subscribe((state) => {
      this.formState = state;
    });

    this.formStateService.start();
  }

  disconnectedCallback() {
    this.formStateService.stop();
    super.disconnectedCallback();
  }

  render() {
    const showForm =
      this.formState.value === "editingForm" ||
      this.formState.value === "submittingForm";
    let successMessage;
    let verificationMessage;

    if (this.formState.context.successMessage) {
      successMessage = html`
        <div>
          <btrix-alert variant="success"
            >${this.formState.context.successMessage}</btrix-alert
          >
        </div>
      `;
    }

    if (this.userInfo) {
      if (this.userInfo.isVerified) {
        verificationMessage = html`
          <sl-tag variant="success" size="small"
            >${msg("verified", {
              desc: "Status text when user email is verified",
            })}</sl-tag
          >
        `;
      } else {
        verificationMessage = html`
          <sl-tag class="mr-2" variant="warning" size="small"
            >${msg("unverified", {
              desc: "Status text when user email is not yet verified",
            })}</sl-tag
          >

          <btrix-request-verify
            email=${this.userInfo.email}
          ></btrix-request-verify>
        `;
      }
    }

    return html`<div class="grid gap-4">
      <h1 class="text-xl font-semibold">${msg("Account Settings")}</h1>

      ${successMessage}

      <section class="p-4 md:p-8 border rounded-lg grid gap-6">
        <div>
          <div class="mb-1 text-gray-500">${msg("Name")}</div>
          <div class="inline-flex items-center">
            <span class="mr-3">${this.userInfo?.name}</span>
          </div>
        </div>

        <div>
          <div class="mb-1 text-gray-500">${msg("Email")}</div>
          <div class="inline-flex items-center">
            <span class="mr-3">${this.userInfo?.email}</span>
            ${verificationMessage}
          </div>
        </div>

        ${showForm
          ? this.renderChangePasswordForm()
          : html`
              <div>
                <sl-button
                  variant="primary"
                  outline
                  @click=${() => this.formStateService.send("EDIT")}
                  >${msg("Change password")}</sl-button
                >
              </div>
            `}
      </section>
    </div>`;
  }

  renderChangePasswordForm() {
    const passwordFieldError = this.formState.context.fieldErrors.password;
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

    return html` <div class="max-w-sm">
      <h3 class="font-semibold mb-3">${msg("Change password")}</h3>
      <form @submit=${this.onSubmit} aria-describedby="formError">
        <div class="mb-5">
          <sl-input
            id="password"
            class="${passwordFieldError ? "text-danger" : ""}"
            name="password"
            type="password"
            label="${msg("Current password")}"
            aria-describedby="passwordError"
            autocomplete="current-password"
            password-toggle
            required
          >
          </sl-input>
          ${passwordFieldError
            ? html`<div id="passwordError" class="text-danger" role="alert">
                ${passwordFieldError}
              </div>`
            : ""}
        </div>
        <div class="mb-5">
          <sl-input
            id="newPassword"
            name="newPassword"
            type="password"
            label="${msg("New password")}"
            autocomplete="new-password"
            password-toggle
            required
          >
          </sl-input>
        </div>

        ${formError}

        <div>
          <sl-button
            variant="primary"
            ?loading=${this.formState.value === "submittingForm"}
            type="submit"
            >${msg("Update password")}</sl-button
          >
          <sl-button
            variant="text"
            @click=${() => this.formStateService.send("CANCEL")}
            >${msg("Cancel")}</sl-button
          >
        </div>
      </form>
    </div>`;
  }

  async onSubmit(event: any) {
    event.preventDefault();
    if (!this.authState) return;

    this.formStateService.send("SUBMIT");

    const formData = new FormData(event.target);
    let nextAuthState: Auth | null = null;

    try {
      nextAuthState = await AuthService.login({
        email: this.authState.username,
        password: formData.get("password") as string,
      });

      this.dispatchEvent(AuthService.createLoggedInEvent(nextAuthState));
    } catch (e: any) {
      console.debug(e);
    }

    if (!nextAuthState) {
      this.formStateService.send({
        type: "ERROR",
        detail: {
          fieldErrors: {
            password: msg("Wrong password"),
          },
        },
      });
      return;
    }

    const params = {
      password: formData.get("newPassword"),
    };

    try {
      await this.apiFetch("/users/me", nextAuthState, {
        method: "PATCH",
        body: JSON.stringify(params),
      });

      this.formStateService.send({
        type: "SUCCESS",
        detail: {
          successMessage: "Successfully updated password",
        },
      });
    } catch (e) {
      console.error(e);

      this.formStateService.send({
        type: "ERROR",
        detail: {
          serverError: msg("Something went wrong changing password"),
        },
      });
    }
  }
}
