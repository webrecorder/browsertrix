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
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <div class="w-full max-w-sm grid gap-5">
        <div class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          <form @submit=${this.onSubmit} aria-describedby="formError">
            <div class="mb-5">
              <btrix-input
                id="password"
                name="password"
                type="password"
                label="${msg("New password")}"
                help-text=${msg("Must be between 8-64 characters")}
                minlength="8"
                maxlength="64"
                autocomplete="new-password"
                passwordToggle
                required
              >
              </btrix-input>
            </div>

            ${formError}

            <sl-button
              class="w-full"
              variant="primary"
              ?loading=${this.isSubmitting}
              type="submit"
              >${msg("Change password")}</sl-button
            >
          </form>
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

  async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
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
        // TODO show toast notification
        this.navTo("/log-in");
        break;
      case 400:
      case 422:
        const { detail } = await resp.json();
        if (detail === "RESET_PASSWORD_BAD_TOKEN") {
          // TODO password validation details
          this.serverError = msg(
            "Password reset email is not valid. Request a new password reset email"
          );
        } else if (
          detail.code &&
          detail.code === "RESET_PASSWORD_INVALID_PASSWORD"
        ) {
          this.serverError = msg(
            "Invalid password. Must be between 8 and 64 characters"
          );
        }
        break;
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }

    this.isSubmitting = false;
  }
}
