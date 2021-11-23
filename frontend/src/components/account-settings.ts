import { state, query } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";

@needLogin
@localized()
export class AccountSettings extends LiteElement {
  authState?: AuthState;

  @state()
  isChangingPassword: boolean = false;

  @state()
  isSubmitting: boolean = false;

  @state()
  submitErrors: {
    _server?: string;
    password?: string;
  } = {};

  @query("#newPassword")
  newPasswordInput?: HTMLInputElement;

  @query("#confirmNewPassword")
  confirmNewPasswordInput?: HTMLInputElement;

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
    return html`<div class="grid gap-4">
      <h1 class="text-xl font-bold">${msg("Account settings")}</h1>

      <section class="p-4 md:p-8 border rounded-lg grid gap-6">
        <div>
          <div class="mb-1 text-gray-500">Email</div>
          <div>${this.authState!.username}</div>
        </div>

        ${this.isChangingPassword
          ? this.renderChangePasswordForm()
          : html`
              <div>
                <sl-button
                  type="primary"
                  outline
                  @click=${() => (this.isChangingPassword = true)}
                  >${msg("Change password")}</sl-button
                >
              </div>
            `}
      </section>
    </div>`;
  }

  renderChangePasswordForm() {
    let formError;

    if (this.submitErrors._server) {
      formError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger"
            >${this.submitErrors._server}</bt-alert
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
            class="${this.submitErrors.password ? "text-danger" : ""}"
            name="password"
            type="password"
            label="${msg("Current password")}"
            aria-describedby="passwordError"
            required
          >
          </sl-input>
          ${this.submitErrors.password
            ? html`<div id="passwordError" class="text-danger" role="alert">
                ${this.submitErrors.password}
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

        <sl-button type="primary" ?loading=${this.isSubmitting} submit
          >${msg("Update password")}</sl-button
        >
      </sl-form>
    </div>`;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    this.submitErrors = {};
    this.isSubmitting = true;

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
      this.submitErrors.password = msg("Wrong password");
      this.isSubmitting = false;
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
    } catch (e) {
      console.error(e);

      this.submitErrors._server = msg("Something went wrong changing password");
    }

    this.isSubmitting = false;
  }
}
