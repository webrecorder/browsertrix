import { state, query, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";

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
    const showForm =
      this.formState.value === "editingForm" ||
      this.formState.value === "submittingForm";
    let successMessage;

    if (this.formState.context.successMessage) {
      successMessage = html`
        <div>
          <bt-alert type="success"
            >${this.formState.context.successMessage}</bt-alert
          >
        </div>
      `;
    }

    return html`<div class="grid gap-4">
      <h1 class="text-xl font-bold">${msg("Account settings")}</h1>

      ${successMessage}

      <section class="p-4 md:p-8 border rounded-lg grid gap-6">
        <div>
          <div class="mb-1 text-gray-500">Email</div>
          <div>${this.authState!.username}</div>
        </div>

        ${showForm
          ? this.renderChangePasswordForm()
          : html`
              <div>
                <sl-button
                  type="primary"
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
          <bt-alert id="formError" type="danger"
            >${this.formState.context.serverError}</bt-alert
          >
        </div>
      `;
    }

    return html` <div class="max-w-sm">
      <h3 class="font-bold mb-3">${msg("Change password")}</h3>
      <sl-form @sl-submit="${this.onSubmit}" aria-describedby="formError">
        <div class="mb-5">
          <sl-input
            id="password"
            class="${passwordFieldError ? "text-danger" : ""}"
            name="password"
            type="password"
            label="${msg("Current password")}"
            aria-describedby="passwordError"
            autocomplete="current-password"
            toggle-password
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
            toggle-password
            required
          >
          </sl-input>
        </div>

        ${formError}

        <div>
          <sl-button
            type="primary"
            ?loading=${this.formState.value === "submittingForm"}
            submit
            >${msg("Update password")}</sl-button
          >
          <sl-button
            type="text"
            @click=${() => this.formStateService.send("CANCEL")}
            >${msg("Cancel")}</sl-button
          >
        </div>
      </sl-form>
    </div>`;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    this.formStateService.send("SUBMIT");

    const { formData } = event.detail;
    let nextAuthState: AuthState = null;

    // Validate current password by generating token
    try {
      // TODO consolidate with log-in method
      const resp = await fetch("/api/auth/jwt/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          username: this.authState.username,
          password: formData.get("password") as string,
        }).toString(),
      });

      const data = await resp.json();

      if (data.token_type === "bearer" && data.access_token) {
        const detail = {
          api: true,
          auth: `Bearer ${data.access_token}`,
          username: this.authState.username,
        };
        this.dispatchEvent(new CustomEvent("logged-in", { detail }));

        nextAuthState = {
          username: detail.username,
          headers: {
            Authorization: detail.auth,
          },
        };
      }
    } catch (e) {
      console.error(e);
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
