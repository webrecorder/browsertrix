import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { ViewState } from "../utils/APIRouter";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class ResetPassword extends LiteElement {
  @property({ type: Object })
  viewState!: ViewState;

  @state()
  private serverError?: string;

  @state()
  private isSubmitting: boolean = false;

  render() {
    let formError;

    if (this.serverError) {
      formError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger">${this.serverError}</bt-alert>
        </div>
      `;
    }

    return html`
      <div class="w-full max-w-sm grid gap-5">
        <div class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          <sl-form @sl-submit="${this.onSubmit}" aria-describedby="formError">
            <div class="mb-5">
              <sl-input
                id="password"
                name="password"
                type="password"
                label="${msg("New password")}"
                required
              >
              </sl-input>
            </div>

            ${formError}

            <sl-button
              class="w-full"
              type="primary"
              ?loading=${this.isSubmitting}
              submit
              >${msg("Change password")}</sl-button
            >
          </sl-form>
        </div>

        <div class="text-center">
          <a
            class="text-sm text-gray-400 hover:text-gray-500"
            href="/log-in/forgot-password"
            @click=${this.navLink}
            >${msg("Resend password reset email?")}</a
          >
        </div>
      </div>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    this.isSubmitting = true;

    console.log(this.viewState.params.token);

    const { formData } = event.detail;
    const password = formData.get("password") as string;

    const resp = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: this.viewState.params.token,
        password,
      }),
    });

    switch (resp.status) {
      case 200:
        // TODO redirect
        break;
      case 400:
      case 422:
        const { detail } = await resp.json();

        if (detail === "RESET_PASSWORD_BAD_TOKEN") {
          // TODO password validation details
          this.serverError = msg(
            "Password reset email is not valid. Request a new password reset email"
          );
        } else {
          // TODO password validation details
          this.serverError = msg("Invalid password");
        }

        break;
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }

    this.isSubmitting = false;
  }
}
