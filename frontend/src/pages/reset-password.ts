import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class ResetPassword extends LiteElement {
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
      </div>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    this.isSubmitting = true;

    const { formData } = event.detail;
    const password = formData.get("password") as string;

    const resp = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "TODO", password }),
    });

    if (resp.status === 200) {
      // TODO redirect
    } else if (resp.status === 422) {
      // TODO password validation details
      this.serverError = msg("Invalid password");
    } else {
      this.serverError = msg("Something unexpected went wrong");
    }

    this.isSubmitting = false;
  }
}
