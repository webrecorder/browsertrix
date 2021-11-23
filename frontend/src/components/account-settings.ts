import { state, query } from "lit/decorators.js";
import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";

@needLogin
export class AccountSettings extends LiteElement {
  authState?: AuthState;

  @state()
  isChangingPassword: boolean = false;

  @state()
  isSubmitting: boolean = false;

  @state()
  submitError?: string;

  @query("#newPassword")
  newPasswordInput?: HTMLInputElement;

  @query("#confirmNewPassword")
  confirmNewPasswordInput?: HTMLInputElement;

  render() {
    return html`<div class="grid gap-4">
      <h1 class="text-xl font-bold">Account settings</h1>

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
                  >Change password</sl-button
                >
              </div>
            `}
      </section>
    </div>`;
  }

  renderChangePasswordForm() {
    return html` <div class="max-w-sm">
      <h3 class="font-bold mb-3">Change password</h3>
      <sl-form @sl-submit="${this.onSubmit}">
        <div class="mb-5">
          <sl-input
            name="password"
            type="password"
            label="Current password"
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            id="newPassword"
            name="newPassword"
            type="password"
            label="New password"
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            id="confirmNewPassword"
            name="confirmNewPassword"
            type="password"
            label="Confirm new password"
            required
          >
          </sl-input>
        </div>
        <sl-button type="primary" ?loading=${this.isSubmitting} submit
          >Update</sl-button
        >
      </sl-form>

      <div id="login-error" class="text-red-600">${this.submitError}</div>
    </div>`;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    const { formData } = event.detail;

    const newPassword = formData.get("newPassword");
    const confirmNewPassword = formData.get("confirmNewPassword");

    if (newPassword === confirmNewPassword) {
      this.confirmNewPasswordInput!.setCustomValidity("");
    } else {
      this.confirmNewPasswordInput!.setCustomValidity(
        `Passwords don't match, try again`
      );

      return;
    }

    // TODO verify old password

    const params = {
      password: formData.get("newPassword"),
    };

    try {
      await this.apiFetch("/users/me", this.authState!, {
        method: "PATCH",
        body: JSON.stringify(params),
      });
    } catch (e) {
      console.error(e);

      this.submitError = "Something went wrong changing password";
    }
  }
}
