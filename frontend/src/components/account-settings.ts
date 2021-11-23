import { state, query } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";

type FormContext = {
  serverError?: string;
  fieldErrors: { [fieldName: string]: string };
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
  | { type: "SUCCESS" }
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

const machine = createMachine<FormContext, FormEvent, FormTypestate>(
  {
    id: "changePasswordForm",
    initial: "readOnly",
    context: {
      serverError: undefined,
      fieldErrors: {},
    },
    states: {
      ["readOnly"]: { on: { EDIT: "editingForm" } },
      ["editingForm"]: {
        on: { CANCEL: "readOnly", SUBMIT: "submittingForm" },
      },
      ["submittingForm"]: {
        on: {
          SUCCESS: "readOnly",
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
  authState?: AuthState;

  private _stateService = interpret(machine);

  @state()
  private formState = machine.initialState;

  @query("#newPassword")
  private newPasswordInput?: HTMLInputElement;

  @query("#confirmNewPassword")
  private confirmNewPasswordInput?: HTMLInputElement;

  firstUpdated() {
    this._stateService.subscribe((state) => {
      this.formState = state;
    });

    this._stateService.start();
  }

  disconnectedCallback() {
    this._stateService.stop();
  }

  checkPasswordMatch() {
    const newPassword = this.newPasswordInput!.value;
    const confirmNewPassword = this.confirmNewPasswordInput!.value;

    if (newPassword === confirmNewPassword) {
      this.confirmNewPasswordInput!.setCustomValidity("");
    } else {
      this.confirmNewPasswordInput!.setCustomValidity(
        msg("Passwords don't match")
      );
    }
  }

  render() {
    const showForm =
      this.formState.value === "editingForm" ||
      this.formState.value === "submittingForm";

    return html`<div class="grid gap-4">
      <h1 class="text-xl font-bold">${msg("Account settings")}</h1>

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
                  @click=${() => this._stateService.send("EDIT")}
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
            required
            @sl-blur=${this.checkPasswordMatch}
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            id="confirmNewPassword"
            name="confirmNewPassword"
            type="password"
            label="${msg("Confirm new password")}"
            required
            @sl-blur=${this.checkPasswordMatch}
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
            @click=${() => this._stateService.send("CANCEL")}
            >${msg("Cancel")}</sl-button
          >
        </div>
      </sl-form>
    </div>`;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    this._stateService.send("SUBMIT");

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
      this._stateService.send({
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

      this._stateService.send("SUCCESS");
    } catch (e) {
      console.error(e);

      this._stateService.send({
        type: "ERROR",
        detail: {
          serverError: msg("Something went wrong changing password"),
        },
      });
    }
  }
}
